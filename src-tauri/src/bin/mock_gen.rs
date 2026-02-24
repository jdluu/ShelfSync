use rusqlite::Connection;
use std::path::Path;

fn main() {
    let path = Path::new("../mock_library");
    std::fs::create_dir_all(path).unwrap();

    let db_path = path.join("metadata.db");
    if db_path.exists() {
        std::fs::remove_file(&db_path).unwrap();
    }

    let conn = Connection::open(&db_path).unwrap();

    conn.execute(
        "CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, path TEXT, series INTEGER, series_index REAL)",
        [],
    ).unwrap();

    conn.execute(
        "CREATE TABLE series (id INTEGER PRIMARY KEY, name TEXT)",
        [],
    )
    .unwrap();
    conn.execute("CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT)", [])
        .unwrap();
    conn.execute(
        "CREATE TABLE books_tags_link (id INTEGER PRIMARY KEY, book INTEGER, tag INTEGER)",
        [],
    )
    .unwrap();
    conn.execute(
        "CREATE TABLE publishers (id INTEGER PRIMARY KEY, name TEXT)",
        [],
    )
    .unwrap();
    conn.execute("CREATE TABLE books_publishers_link (id INTEGER PRIMARY KEY, book INTEGER, publisher INTEGER)", []).unwrap();
    conn.execute(
        "CREATE TABLE data (id INTEGER PRIMARY KEY, book INTEGER, format TEXT)",
        [],
    )
    .unwrap();

    conn.execute(
        "CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT)",
        [],
    )
    .unwrap();

    conn.execute(
        "CREATE TABLE books_authors_link (id INTEGER PRIMARY KEY, book INTEGER, author INTEGER)",
        [],
    )
    .unwrap();

    // Insert mock data
    conn.execute(
        "INSERT INTO books (id, title, path) VALUES (1, 'The Great Gatsby', 'fitzgerald/gatsby')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO authors (id, name) VALUES (1, 'F. Scott Fitzgerald')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO books_authors_link (book, author) VALUES (1, 1)",
        [],
    )
    .unwrap();

    conn.execute(
        "INSERT INTO books (id, title, path) VALUES (2, '1984', 'orwell/1984')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO authors (id, name) VALUES (2, 'George Orwell')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO books_authors_link (book, author) VALUES (2, 2)",
        [],
    )
    .unwrap();

    println!("Mock Calibre library created at {:?}", db_path.display());
}
