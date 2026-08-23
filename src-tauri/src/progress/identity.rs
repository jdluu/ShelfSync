//! KOReader partial MD5 book identity.
//!
//! Faithful port of KOReader's `util.partialMD5` (frontend/util.lua): an MD5
//! over up to 1024 byte samples taken at offsets `1024 << (2 * i)` for
//! `i = -1..=10`, stopping at the first read that returns no bytes. The
//! `i = -1` iteration relies on LuaJIT shift semantics (shift counts are
//! masked modulo 32 and results truncate to 32 bits) which places the first
//! sample at offset 0. Grimmory's binary document matching uses the same
//! convention, so this hash is the only accepted book identity for progress
//! sync.

use md5::{Digest, Md5};
use std::io::{Read, Seek, SeekFrom};

const SAMPLE_STEP_BYTES: u64 = 1024;
const SAMPLE_LEN_BYTES: usize = 1024;

/// Byte offset of sample iteration `i`, mirroring LuaJIT `bit.lshift(step, 2*i)`.
pub fn sample_offset(i: i32) -> u64 {
    let shift = ((i as i64) * 2).rem_euclid(32) as u32;
    u32::wrapping_shl(SAMPLE_STEP_BYTES as u32, shift) as u64
}

fn read_up_to(reader: &mut impl Read, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut filled = 0;
    while filled < buf.len() {
        match reader.read(&mut buf[filled..])? {
            0 => break,
            n => filled += n,
        }
    }
    Ok(filled)
}

/// Computes the KOReader partial MD5 hex digest for an open, seekable file.
pub fn koreader_partial_md5_reader(reader: &mut (impl Read + Seek)) -> std::io::Result<String> {
    let mut hasher = Md5::new();
    let mut buf = [0u8; SAMPLE_LEN_BYTES];
    for i in -1..=10 {
        reader.seek(SeekFrom::Start(sample_offset(i)))?;
        let filled = read_up_to(reader, &mut buf)?;
        // An empty read at or past EOF ends sampling, exactly like Lua's
        // io.read returning nil.
        if filled == 0 {
            break;
        }
        hasher.update(&buf[..filled]);
    }
    Ok(to_hex(&hasher.finalize()))
}

/// Computes the KOReader partial MD5 hex digest for a file on disk. Callers
/// must pass a verified local file revision; hashes derived from anything
/// else (titles, paths, provider ids) are rejected by contract upstream.
pub fn koreader_partial_md5_file(path: &std::path::Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    koreader_partial_md5_reader(&mut file)
}

fn to_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Reference digests computed independently with Python's hashlib using
    /// the same sampling algorithm as KOReader's util.partialMD5.
    const VEC_EMPTY: &str = "d41d8cd98f00b204e9800998ecf8427e";
    const VEC_SMALL: &str = "5eb63bbbe01eeed093cb22bb8f5acdc3";
    const VEC_EXACT_1024: &str = "c9a34cfc85d982698c6ac89f76071abd";
    const VEC_1025: &str = "ae187e1febee2a150b64849c32d566ca";
    const VEC_LEN_3000: &str = "65f1bc2c1ae632db4e9dbe701e3d457e";
    const VEC_LEN_5000: &str = "55c2ee4620c8b7b396339adea62dd219";

    fn write_file(contents: &[u8]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("book.epub");
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(contents).unwrap();
        dir
    }

    #[test]
    fn sample_offsets_match_lua_shift_semantics() {
        assert_eq!(sample_offset(-1), 0);
        assert_eq!(sample_offset(0), 1024);
        assert_eq!(sample_offset(1), 4096);
        assert_eq!(sample_offset(2), 16_384);
        assert_eq!(sample_offset(4), 262_144);
        assert_eq!(sample_offset(10), 1_073_741_824);
    }

    #[test]
    fn empty_file_hashes_to_empty_md5() {
        let dir = write_file(b"");
        assert_eq!(
            koreader_partial_md5_file(&dir.path().join("book.epub")).unwrap(),
            VEC_EMPTY
        );
    }

    #[test]
    fn small_file_equals_full_file_md5() {
        let dir = write_file(b"hello world");
        let hash = koreader_partial_md5_file(&dir.path().join("book.epub")).unwrap();
        assert_eq!(hash, VEC_SMALL);

        let mut full = Md5::new();
        full.update(b"hello world");
        assert_eq!(hash, to_hex(&full.finalize()));
    }

    #[test]
    fn exact_sample_boundary_is_covered() {
        let dir = write_file(&vec![b'a'; 1024]);
        assert_eq!(
            koreader_partial_md5_file(&dir.path().join("book.epub")).unwrap(),
            VEC_EXACT_1024
        );
    }

    #[test]
    fn one_byte_past_boundary_includes_short_tail_read() {
        let dir = write_file(&vec![b'a'; 1025]);
        assert_eq!(
            koreader_partial_md5_file(&dir.path().join("book.epub")).unwrap(),
            VEC_1025
        );
    }

    #[test]
    fn three_thousand_bytes_samples_head_region_only() {
        let data: Vec<u8> = (0..3000u32).map(|i| ((i * 7 + 13) % 256) as u8).collect();
        let dir = write_file(&data);
        let hash = koreader_partial_md5_file(&dir.path().join("book.epub")).unwrap();

        // Offsets 0 and 1024 cover bytes 0..2048; offset 4096 is past EOF so
        // the tail beyond 2048 is never sampled.
        let expected = data[..2048].to_vec();
        assert_eq!(hash, VEC_LEN_3000);
        let mut direct = Md5::new();
        direct.update(&expected);
        assert_eq!(hash, to_hex(&direct.finalize()));
    }

    #[test]
    fn five_thousand_byte_vector_matches_reference_composition() {
        let data: Vec<u8> = (0..5000u32).map(|i| (((i * 31) + 5) % 251) as u8).collect();
        let dir = write_file(&data);
        let hash = koreader_partial_md5_file(&dir.path().join("book.epub")).unwrap();

        // Samples land at offsets 0, 1024, and 4096 (short tail read).
        let mut composed = Md5::new();
        composed.update(&data[0..1024]);
        composed.update(&data[1024..2048]);
        composed.update(&data[4096..5000]);

        assert_eq!(hash, VEC_LEN_5000);
        assert_eq!(hash, to_hex(&composed.finalize()));
    }

    #[test]
    fn different_contents_produce_different_identities() {
        let a = write_file(b"contents A");
        let b = write_file(b"contents B");
        assert_ne!(
            koreader_partial_md5_file(&a.path().join("book.epub")).unwrap(),
            koreader_partial_md5_file(&b.path().join("book.epub")).unwrap()
        );
    }
}
