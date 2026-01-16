use rusqlite::{Connection, OpenFlags};
use crate::models::Book;
use crate::error::AppError;
use std::path::Path;

pub fn get_calibre_metadata(library_path: &str) -> Result<Vec<Book>, AppError> {
    let lib_path = Path::new(library_path);
    let db_path = lib_path.join("metadata.db");

    if !db_path.exists() {
        return Err(AppError::LibraryNotFound(library_path.to_string()));
    }

    // Open the DB in Read-Only mode directly
    let conn = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;

    // Query: Books joined with Authors
    // Calibre schema:
    // books (id, title, path, ...)
    // authors (id, name, ...)
    // books_authors_link (id, book, author, ...)
    
    let mut stmt = conn.prepare(
        "SELECT 
            b.id, 
            b.title, 
            b.path, 
            (SELECT GROUP_CONCAT(a.name, ', ') 
             FROM books_authors_link bal 
             JOIN authors a ON bal.author = a.id 
             WHERE bal.book = b.id) as authors
         FROM books b"
    )?;

    let book_iter = stmt.query_map([], |row| {
        Ok(Book {
            id: row.get(0)?,
            title: row.get(1)?,
            path: row.get(2)?,
            authors: row.get(3).unwrap_or_default(), // Some books might lose authors if integrity bad, default to empty
            cover_url: None, // Logic for cover URL comes later in backend server phase
        })
    })?;

    let mut books = Vec::new();
    for book in book_iter {
        books.push(book?);
    }

    Ok(books)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use rusqlite::Connection;

    fn create_mock_calibre_db(path: &Path) {
        let conn = Connection::open(path.join("metadata.db")).unwrap();
        
        conn.execute(
            "CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, path TEXT)",
            [],
        ).unwrap();
        
        conn.execute(
            "CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT)",
            [],
        ).unwrap();
        
        conn.execute(
            "CREATE TABLE books_authors_link (id INTEGER PRIMARY KEY, book INTEGER, author INTEGER)",
            [],
        ).unwrap();

        // Insert mock data
        conn.execute("INSERT INTO books (id, title, path) VALUES (1, 'The Great Gatsby', 'fitzgerald/gatsby')", []).unwrap();
        conn.execute("INSERT INTO authors (id, name) VALUES (1, 'F. Scott Fitzgerald')", []).unwrap();
        conn.execute("INSERT INTO books_authors_link (book, author) VALUES (1, 1)", []).unwrap();

        conn.execute("INSERT INTO books (id, title, path) VALUES (2, '1984', 'orwell/1984')", []).unwrap();
        conn.execute("INSERT INTO authors (id, name) VALUES (2, 'George Orwell')", []).unwrap();
        conn.execute("INSERT INTO books_authors_link (book, author) VALUES (2, 2)", []).unwrap();
    }

    #[test]
    fn test_get_calibre_metadata() {
        let dir = tempdir().unwrap();
        create_mock_calibre_db(dir.path());
        
        let books = get_calibre_metadata(dir.path().to_str().unwrap()).unwrap();
        
        assert_eq!(books.len(), 2);
        assert_eq!(books[0].title, "The Great Gatsby");
        assert_eq!(books[0].authors, "F. Scott Fitzgerald");
        assert_eq!(books[1].title, "1984");
        assert_eq!(books[1].authors, "George Orwell");
    }

    #[test]
    fn test_get_calibre_metadata_missing_db() {
        let dir = tempdir().unwrap();
        let result = get_calibre_metadata(dir.path().to_str().unwrap());
        match result {
            Err(AppError::LibraryNotFound(_)) => assert!(true),
            _ => assert!(false, "Expected LibraryNotFound error"),
        }
    }
}
