use rusqlite::Connection;
use std::fs;
use std::path::Path;

fn main() {
    let mock_path = Path::new("/tmp/shelf_sync_mock");
    if mock_path.exists() {
        fs::remove_dir_all(mock_path).unwrap();
    }
    fs::create_dir_all(mock_path).unwrap();

    let db_path = mock_path.join("metadata.db");
    let conn = Connection::open(&db_path).unwrap();

    println!("Generating mock Calibre library at {:?}...", mock_path);

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
    let books = [
        ("Foundation", "Isaac Asimov", "asimov/foundation"),
        ("Neuromancer", "William Gibson", "gibson/neuromancer"),
        ("Snow Crash", "Neal Stephenson", "stephenson/snow_crash"),
        ("The Martian", "Andy Weir", "weir/the_martian"),
        ("Project Hail Mary", "Andy Weir", "weir/hail_mary"),
    ];

    for (i, (title, author, path)) in books.iter().enumerate() {
        let id = i + 1;
        conn.execute("INSERT INTO books (id, title, path) VALUES (?, ?, ?)", [id.to_string(), title.to_string(), path.to_string()]).unwrap();
        
        // Find or insert author
        conn.execute("INSERT OR IGNORE INTO authors (name) VALUES (?)", [author.to_string()]).unwrap();
        let author_id: i64 = conn.query_row("SELECT id FROM authors WHERE name = ?", [author.to_string()], |row| row.get(0)).unwrap();
        
        conn.execute("INSERT INTO books_authors_link (book, author) VALUES (?, ?)", [id as i64, author_id]).unwrap();
    }

    // Create dummy files to mimic Calibre structure
    for (_, _, path) in books {
        let full_path = mock_path.join(path);
        fs::create_dir_all(&full_path).unwrap();
        fs::write(full_path.join("cover.jpg"), "fake cover").unwrap();
    }

    println!("Mock library generated successfully.");
}
