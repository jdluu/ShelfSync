use crate::models::Book;
use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::mpsc;

#[derive(Serialize, Clone, Debug)]
pub struct SyncProgress {
    pub book_id: i64,
    pub title: String,
    pub progress: f64,  // 0.0 to 1.0
    pub status: String, // "downloading", "completed", "error"
    pub error: Option<String>,
    pub queue_position: usize,
    pub queue_total: usize,
    pub path: Option<String>,
}

#[derive(Clone, Debug)]
pub struct SyncTask {
    pub book: Book,
    pub host_ip: String,
    pub host_port: u16,
    pub token: String,
    pub destination_root: PathBuf,
}

#[derive(Clone)]
pub struct SyncManager {
    sender: mpsc::Sender<SyncTask>,
    pub active_queue: Arc<Mutex<Vec<Book>>>,
}

impl SyncManager {
    pub fn new<R: Runtime>(app: AppHandle<R>) -> Self {
        let (tx, mut rx) = mpsc::channel::<SyncTask>(100);
        let active_queue = Arc::new(Mutex::new(Vec::new()));
        let active_queue_clone = active_queue.clone();

        tauri::async_runtime::spawn(async move {
            let client = Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(300))
                .build()
                .unwrap_or_else(|_| Client::new());
            while let Some(task) = rx.recv().await {
                // Process one task at a time
                if let Err(e) = process_task::<R>(&app, &client, &task, &active_queue_clone).await {
                    log::error!("Sync error: {}", e);
                }

                // Remove from active queue
                match active_queue_clone.lock() {
                    Ok(mut queue) => {
                        if !queue.is_empty() {
                            queue.remove(0);
                        }
                    }
                    Err(e) => log::warn!("Could not update sync queue: {}", e),
                }
            }
        });

        Self {
            sender: tx,
            active_queue,
        }
    }

    pub async fn add_tasks(&self, tasks: Vec<SyncTask>) -> Result<(), String> {
        // Add books to queue and collect tasks, then drop lock before sending
        let tasks_to_send: Vec<_> = {
            let mut queue = match self.active_queue.lock() {
                Ok(q) => q,
                Err(_) => return Err("Failed to lock sync queue".to_string()),
            };
            tasks
                .into_iter()
                .inspect(|task| {
                    queue.push(task.book.clone());
                })
                .collect()
        }; // Lock is dropped here

        for task in tasks_to_send {
            self.sender.send(task).await.map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

fn sanitize_filename(name: &str) -> String {
    name.replace(&['<', '>', ':', '\"', '/', '\\', '|', '?', '*'][..], "_")
        .trim()
        .to_string()
}

fn write_metadata_opf(book: &Book, opf_path: &std::path::Path) {
    let mut opf = String::from("<?xml version='1.0' encoding='utf-8'?>\n");
    opf.push_str("<package xmlns=\"http://www.idpf.org/2007/opf\" unique-identifier=\"uuid_id\" version=\"2.0\">\n");
    opf.push_str("  <metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:opf=\"http://www.idpf.org/2007/opf\">\n");
    
    // Process basic metadata escaping XML where necessary
    let title = book.title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    opf.push_str(&format!("    <dc:title>{}</dc:title>\n", title));
    
    for author in book.authors.split(',') {
        let clean_author = author.trim().replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
        opf.push_str(&format!("    <dc:creator opf:role=\"aut\">{}</dc:creator>\n", clean_author));
    }
    
    if let Some(desc) = &book.description {
        let clean_desc = desc.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
        opf.push_str(&format!("    <dc:description>{}</dc:description>\n", clean_desc));
    }
    
    if let Some(pub_val) = &book.publisher {
        let clean_pub = pub_val.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
        opf.push_str(&format!("    <dc:publisher>{}</dc:publisher>\n", clean_pub));
    }
    
    for tag in &book.tags {
        let clean_tag = tag.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
        opf.push_str(&format!("    <dc:subject>{}</dc:subject>\n", clean_tag));
    }
    
    if let Some(lang) = &book.language {
        let clean_lang = lang.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
        opf.push_str(&format!("    <dc:language>{}</dc:language>\n", clean_lang));
    }

    opf.push_str("    <meta name=\"calibre:timestamp\" content=\"\"/>\n");
    if let Some(series) = &book.series {
        let clean_series = series.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
        opf.push_str(&format!("    <meta name=\"calibre:series\" content=\"{}\"/>\n", clean_series));
        opf.push_str(&format!("    <meta name=\"calibre:series_index\" content=\"{}\"/>\n", book.series_index));
    }
    
    if let Some(rating) = book.rating {
        opf.push_str(&format!("    <meta name=\"calibre:rating\" content=\"{}\"/>\n", rating));
    }
    
    opf.push_str("  </metadata>\n");
    opf.push_str("</package>\n");

    let _ = fs::write(opf_path, opf);
}

async fn process_task<R: Runtime>(
    app: &AppHandle<R>,
    client: &Client,
    task: &SyncTask,
    queue: &Arc<Mutex<Vec<Book>>>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut book = task.book.clone();
    let url = format!(
        "http://{}:{}/api/download/{}/best",
        task.host_ip, task.host_port, book.id
    );

    // Determine primary author (first author in comma-separated list)
    let primary_author = book.authors.split(',').next().unwrap_or("Unknown").trim();
    
    // Sanitize author and title for filesystem
    let safe_author = sanitize_filename(primary_author);
    let safe_title = sanitize_filename(&book.title);
    
    // Construct Calibre format: Author/Title/Title - Author.epub
    let folder_path = std::path::PathBuf::from(&safe_author).join(&safe_title);
    
    // Try to get original extension from the host's path to preserve it, fallback to epub
    let ext = std::path::Path::new(&task.book.path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("epub");
        
    let file_name = format!("{} - {}.{}", safe_title, safe_author, ext);
    let relative_path = folder_path.join(&file_name);
    
    // Override the book path with the new local path so the frontend receives it
    book.path = relative_path.to_string_lossy().to_string();

    // Create destination dir
    let dest_path = task.destination_root.join(&book.path);
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)?;

        // Try to fetch cover proactively
        let cover_url = format!(
            "http://{}:{}/api/cover/{}?token={}",
            task.host_ip, task.host_port, book.id, task.token
        );
        let local_cover_path = parent.join("cover.jpg");
        match client.get(&cover_url).send().await {
            Ok(cover_resp) if cover_resp.status().is_success() => {
                match cover_resp.bytes().await {
                    Ok(bytes) => {
                        if let Err(e) = fs::write(&local_cover_path, bytes) {
                            log::error!("[SYNC] Failed to write cover.jpg for {}: {:?}", book.title, e);
                        } else {
                            log::info!("[SYNC] Successfully saved cover.jpg for {}", book.title);
                        }
                    }
                    Err(e) => log::error!("[SYNC] Failed to get cover bytes for {}: {:?}", book.title, e),
                }
            }
            Ok(resp) => log::warn!("[SYNC] Host returned {} for cover of {}", resp.status(), book.title),
            Err(e) => log::error!("[SYNC] Failed to fetch cover for {}: {:?}", book.title, e),
        }
        
        // Write basic metadata.opf
        let opf_path = parent.join("metadata.opf");
        write_metadata_opf(&book, &opf_path);
    }

    let response = client
        .get(url)
        .header("Authorization", format!("Bearer {}", task.token))
        .send()
        .await?;

    if !response.status().is_success() {
        emit_progress(
            app,
            &book,
            0.0,
            "error",
            Some("Server returned error".to_string()),
            queue,
        );
        return Err("Download failed".into());
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut file = fs::File::create(&dest_path)?;

    emit_progress(app, &book, 0.0, "downloading", None, queue);

    while let Some(item) = stream.next().await {
        let chunk = item?;
        std::io::copy(&mut &*chunk, &mut file)?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let progress = downloaded as f64 / total_size as f64;
            emit_progress(app, &book, progress, "downloading", None, queue);
        }
    }

    emit_progress(app, &book, 1.0, "completed", None, queue);
    Ok(())
}

fn emit_progress<R: Runtime>(
    app: &AppHandle<R>,
    book: &Book,
    progress: f64,
    status: &str,
    error: Option<String>,
    queue: &Arc<Mutex<Vec<Book>>>,
) {
    let (pos, total) = match queue.lock() {
        Ok(q) => (0, q.len()),
        Err(_) => (0, 0),
    };

    let _ = app.emit(
        "sync-progress",
        SyncProgress {
            book_id: book.id,
            title: book.title.clone(),
            progress,
            status: status.to_string(),
            error,
            queue_position: pos,
            queue_total: total,
            path: Some(book.path.clone()),
        },
    );
}
