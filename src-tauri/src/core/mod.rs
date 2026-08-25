pub mod calibre;
pub mod db;
mod html_clean;
pub mod search;
pub mod sync;

#[cfg(target_os = "android")]
pub mod android;
