use serde::{Serialize, Deserialize};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tauri::{AppHandle, Emitter, Runtime};
use crate::models::Book;
use std::path::PathBuf;
use std::fs;
use futures_util::StreamExt;
use reqwest::Client;

#[derive(Serialize, Clone, Debug)]
pub struct SyncProgress {
    pub book_id: i64,
    pub title: String,
    pub progress: f64, // 0.0 to 1.0
    pub status: String, // "downloading", "completed", "error"
    pub error: Option<String>,
    pub queue_position: usize,
    pub queue_total: usize,
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

        tokio::spawn(async move {
            let client = Client::new();
            while let Some(task) = rx.recv().await {
                // Process one task at a time
                if let Err(e) = process_task::<R>(&app, &client, &task, &active_queue_clone).await {
                    eprintln!("Sync error: {}", e);
                }
                
                // Remove from active queue
                let mut queue = active_queue_clone.lock().unwrap();
                if !queue.is_empty() {
                    queue.remove(0);
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
            let mut queue = self.active_queue.lock().unwrap();
            tasks.into_iter().map(|task| {
                queue.push(task.book.clone());
                task
            }).collect()
        }; // Lock is dropped here
        
        for task in tasks_to_send {
            self.sender.send(task).await.map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

async fn process_task<R: Runtime>(
    app: &AppHandle<R>,
    client: &Client,
    task: &SyncTask,
    queue: &Arc<Mutex<Vec<Book>>>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let book = &task.book;
    let url = format!("http://{}:{}/api/download/{}/best", task.host_ip, task.host_port, book.id);
    
    // Create destination dir
    let dest_path = task.destination_root.join(&book.path);
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let response = client.get(url)
        .header("Authorization", format!("Bearer {}", task.token))
        .send()
        .await?;

    if !response.status().is_success() {
        emit_progress(app, book, 0.0, "error", Some("Server returned error".to_string()), queue);
        return Err("Download failed".into());
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut file = fs::File::create(&dest_path)?;

    emit_progress(app, book, 0.0, "downloading", None, queue);

    while let Some(item) = stream.next().await {
        let chunk = item?;
        std::io::copy(&mut &*chunk, &mut file)?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let progress = downloaded as f64 / total_size as f64;
            emit_progress(app, book, progress, "downloading", None, queue);
        }
    }

    emit_progress(app, book, 1.0, "completed", None, queue);
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
    let (pos, total) = {
        let q = queue.lock().unwrap();
        (0, q.len()) // Simplified: active task is always at 0
    };

    let _ = app.emit("sync-progress", SyncProgress {
        book_id: book.id,
        title: book.title.clone(),
        progress,
        status: status.to_string(),
        error,
        queue_position: pos,
        queue_total: total,
    });
}
