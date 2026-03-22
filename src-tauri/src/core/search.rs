use std::path::{Path, PathBuf};
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::{Value, Schema, TEXT, STORED, IndexRecordOption, TextOptions, TextFieldIndexing};
use tantivy::{doc, Index, IndexReader};
use std::fs;
use log::info;

#[derive(Clone)]
pub struct SearchEngine {
    index: Index,
    reader: IndexReader,
}

impl SearchEngine {
    pub fn new(index_dir: PathBuf) -> Result<Self, String> {
        let mut schema_builder = Schema::builder();
        let text_options = TextOptions::default()
            .set_indexing_options(TextFieldIndexing::default().set_index_option(IndexRecordOption::WithFreqsAndPositions))
            .set_stored();
            
        schema_builder.add_text_field("book_id", TEXT | STORED);
        schema_builder.add_text_field("title", TEXT | STORED);
        schema_builder.add_text_field("content", text_options);
        let schema = schema_builder.build();

        if !index_dir.exists() {
            fs::create_dir_all(&index_dir).map_err(|e| e.to_string())?;
        }

        let index = Index::open_or_create(tantivy::directory::MmapDirectory::open(&index_dir).map_err(|e| e.to_string())?, schema.clone())
            .map_err(|e| e.to_string())?;
        
        let reader = index
            .reader_builder()
            .try_into()
            .map_err(|e| e.to_string())?;

        Ok(Self { index, reader })
    }

    pub fn index_epub_content(&self, book_id: &str, title: &str, file_path: &Path) -> Result<(), String> {
        let mut epub = epub::doc::EpubDoc::new(file_path).map_err(|e| e.to_string())?;
        let mut full_text = String::new();
        
        for i in 0..epub.get_num_chapters() {
            if epub.set_current_chapter(i) {
                if let Some((content_bytes, _mime)) = epub.get_current() {
                    if let Ok(content_str) = String::from_utf8(content_bytes) {
                        let text = content_str.replace("<", " <").replace(">", "> ");
                        let clean_text = text.split('<')
                            .filter_map(|s| s.split('>').nth(1))
                            .collect::<Vec<_>>()
                            .join(" ");
                        full_text.push_str(&clean_text);
                        full_text.push_str(" ");
                    }
                }
            }
        }

        let mut index_writer = self.index.writer(50_000_000).map_err(|e| e.to_string())?;
        let schema = self.index.schema();
        let book_id_field = schema.get_field("book_id").unwrap();
        let title_field = schema.get_field("title").unwrap();
        let content_field = schema.get_field("content").unwrap();

        index_writer.add_document(doc!(
            book_id_field => book_id,
            title_field => title,
            content_field => full_text
        )).map_err(|e| e.to_string())?;

        index_writer.commit().map_err(|e| e.to_string())?;
        info!("Successfully indexed full text for book: {}", title);
        Ok(())
    }

    pub fn search(&self, query_str: &str, limit: usize) -> Result<Vec<SearchResult>, String> {
        let searcher = self.reader.searcher();
        let schema = self.index.schema();
        let content_field = schema.get_field("content").unwrap();
        let book_id_field = schema.get_field("book_id").unwrap();
        let title_field = schema.get_field("title").unwrap();

        let query_parser = QueryParser::for_index(&self.index, vec![content_field]);
        let query = query_parser.parse_query(query_str).map_err(|e| e.to_string())?;

        let top_docs = searcher.search(&query, &TopDocs::with_limit(limit)).map_err(|e| e.to_string())?;
        
        let mut results = Vec::new();
        for (_score, doc_address) in top_docs {
            let retrieved_doc: tantivy::TantivyDocument = searcher.doc(doc_address).map_err(|e| e.to_string())?;
            let book_id = retrieved_doc.get_first(book_id_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let title = retrieved_doc.get_first(title_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            
            results.push(SearchResult {
                book_id,
                title,
                snippet: "Snippet extraction requires more logic, currently returns title.".to_string(),
            });
        }

        Ok(results)
    }
}

#[derive(serde::Serialize, Clone)]
pub struct SearchResult {
    pub book_id: String,
    pub title: String,
    pub snippet: String,
}
