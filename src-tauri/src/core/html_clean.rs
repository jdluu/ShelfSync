/// Decodes HTML character entities in a string.
pub(super) fn decode_html_entities(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '&' {
            let mut entity = String::new();
            let mut found_semi = false;
            for ec in chars.by_ref() {
                if ec == ';' {
                    found_semi = true;
                    break;
                }
                entity.push(ec);
                if entity.len() > 10 {
                    break;
                }
            }
            if !found_semi {
                result.push('&');
                result.push_str(&entity);
                continue;
            }
            if let Some(stripped) = entity.strip_prefix('#') {
                let code = if let Some(hex) = stripped
                    .strip_prefix('x')
                    .or_else(|| stripped.strip_prefix('X'))
                {
                    u32::from_str_radix(hex, 16).ok()
                } else {
                    stripped.parse::<u32>().ok()
                };
                if let Some(c) = code.and_then(char::from_u32) {
                    result.push(c);
                } else {
                    result.push('&');
                    result.push_str(&entity);
                    result.push(';');
                }
            } else {
                match entity.as_str() {
                    "amp" => result.push('&'),
                    "lt" => result.push('<'),
                    "gt" => result.push('>'),
                    "quot" => result.push('"'),
                    "apos" => result.push('\''),
                    "nbsp" => result.push('\u{00A0}'),
                    "mdash" => result.push('\u{2014}'),
                    "ndash" => result.push('\u{2013}'),
                    "hellip" => result.push('\u{2026}'),
                    "lsquo" => result.push('\u{2018}'),
                    "rsquo" => result.push('\u{2019}'),
                    "ldquo" => result.push('\u{201C}'),
                    "rdquo" => result.push('\u{201D}'),
                    "trade" => result.push('\u{2122}'),
                    "copy" => result.push('\u{00A9}'),
                    "reg" => result.push('\u{00AE}'),
                    _ => {
                        result.push('&');
                        result.push_str(&entity);
                        result.push(';');
                    }
                }
            }
        } else {
            result.push(ch);
        }
    }
    result
}

/// What [`scan_tag`] found at a `<`.
enum TagScan {
    /// Not a real tag (stray `<`, or an unterminated tag at EOF); the caller
    /// must emit the `<` as literal text instead of consuming it.
    Literal,
    /// A well-formed tag ending at the given byte offset (relative to the
    /// start of the `<`), with an optional textual replacement.
    Tag {
        end: usize,
        replacement: Option<&'static str>,
    },
}

/// Maps a parsed tag to its textual replacement, mirroring the original
/// `.replace()` conventions: `br` becomes a newline, block containers
/// (`p`/`div`) become newlines, and list items become `- ` bullets.
fn tag_replacement(closing: bool, name: &str) -> Option<&'static str> {
    match (name, closing) {
        ("br", _) => Some("\n"),
        ("p", _) | ("div", _) => Some("\n"),
        ("li", false) => Some("\n- "),
        _ => None,
    }
}

/// Scans a candidate tag starting with `<` and returns how much of the input
/// it consumes. The scan is case-insensitive, tolerates attributes and
/// self-closing slashes, ignores `>` characters inside quoted attribute
/// values, and degrades to literal text on malformed input so nothing is
/// silently swallowed.
fn scan_tag(tag: &str) -> TagScan {
    let bytes = tag.as_bytes();
    let mut pos = 1;
    let closing = bytes.get(1) == Some(&b'/');
    if closing {
        pos += 1;
    }

    match bytes.get(pos) {
        Some(c) if c.is_ascii_alphabetic() => {}
        _ => return TagScan::Literal,
    }

    let name_start = pos;
    while pos < bytes.len()
        && (bytes[pos].is_ascii_alphanumeric() || bytes[pos] == b'-' || bytes[pos] == b':')
    {
        pos += 1;
    }
    let name = tag[name_start..pos].to_ascii_lowercase();

    let mut quote: Option<u8> = None;
    while pos < bytes.len() {
        let c = bytes[pos];
        match quote {
            Some(q) if c == q => quote = None,
            Some(_) => {}
            None if c == b'"' || c == b'\'' => quote = Some(c),
            None if c == b'>' => {
                return TagScan::Tag {
                    end: pos + 1,
                    replacement: tag_replacement(closing, &name),
                };
            }
            None => {}
        }
        pos += 1;
    }

    // No closing `>` before EOF: treat as literal text rather than eating
    // the remainder of the description.
    TagScan::Literal
}

pub(super) fn clean_html_description(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut raw = String::with_capacity(text.len());
    let mut i = 0;

    while i < text.len() {
        if bytes[i] != b'<' {
            let end = text[i..]
                .find('<')
                .map_or(text.len(), |offset| i + offset);
            raw.push_str(&text[i..end]);
            i = end;
            continue;
        }

        // Comments are dropped entirely; an unterminated comment consumes
        // the rest of the input (matching HTML5 semantics).
        if text[i..].starts_with("<!--") {
            match text[i + 4..].find("-->") {
                Some(offset) => i += 4 + offset + 3,
                None => break,
            }
            continue;
        }

        match scan_tag(&text[i..]) {
            TagScan::Literal => {
                raw.push('<');
                i += 1;
            }
            TagScan::Tag { end, replacement } => {
                if let Some(replacement) = replacement {
                    raw.push_str(replacement);
                }
                i += end;
            }
        }
    }

    // Collapse multiple newlines and trim
    let decoded = decode_html_entities(raw.trim());
    let mut final_res = String::with_capacity(decoded.len());
    let mut last_was_newline = false;
    for c in decoded.chars() {
        if c == '\n' {
            if !last_was_newline {
                final_res.push(c);
                last_was_newline = true;
            }
        } else {
            final_res.push(c);
            last_was_newline = false;
        }
    }
    final_res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_named_entities() {
        assert_eq!(decode_html_entities("Tom &amp; Jerry"), "Tom & Jerry");
        assert_eq!(decode_html_entities("a &lt; b &gt; c"), "a < b > c");
        assert_eq!(decode_html_entities("&quot;quoted&quot;"), "\"quoted\"");
        assert_eq!(decode_html_entities("it&#x27;s fine"), "it's fine");
        assert_eq!(decode_html_entities("&apos;single&apos;"), "'single'");
        assert_eq!(decode_html_entities("a&nbsp;b"), "a\u{00A0}b");
        assert_eq!(decode_html_entities("a&mdash;b"), "a\u{2014}b");
        assert_eq!(decode_html_entities("a&hellip;b"), "a\u{2026}b");
        assert_eq!(
            decode_html_entities("&copy; &reg; &trade;"),
            "\u{00A9} \u{00AE} \u{2122}"
        );
    }

    #[test]
    fn decodes_numeric_entities_decimal_and_hex() {
        assert_eq!(decode_html_entities("&#65;&#x41;"), "AA");
        assert_eq!(decode_html_entities("&#x1F600;"), "\u{1F600}");
        assert_eq!(decode_html_entities("&#39;"), "'");
    }

    #[test]
    fn leaves_unknown_and_malformed_entities_untouched() {
        assert_eq!(decode_html_entities("&unknown;"), "&unknown;");
        assert_eq!(decode_html_entities("100 & 200"), "100 & 200");
        assert_eq!(
            decode_html_entities("&amp no semicolon"),
            "&amp no semicolon"
        );
        assert_eq!(decode_html_entities("&#zz;"), "&#zz;");
        assert_eq!(decode_html_entities("&#9999999999;"), "&#9999999999;");
    }

    #[test]
    fn decodes_empty_string() {
        assert_eq!(decode_html_entities(""), "");
    }

    #[test]
    fn strips_tags_from_description() {
        assert_eq!(clean_html_description("<b>bold</b> text"), "bold text");
        assert_eq!(clean_html_description(""), "");
        assert_eq!(clean_html_description("<p></p>"), "");
    }

    #[test]
    fn converts_br_to_newlines() {
        assert_eq!(clean_html_description("line1<br>line2"), "line1\nline2");
        assert_eq!(clean_html_description("line1<br/>line2"), "line1\nline2");
        assert_eq!(clean_html_description("line1<br />line2"), "line1\nline2");
    }

    #[test]
    fn converts_p_and_div_to_newlines() {
        assert_eq!(
            clean_html_description("<p>A great book.</p>"),
            "A great book."
        );
        assert_eq!(clean_html_description("<div>a</div><div>b</div>"), "a\nb");
    }

    #[test]
    fn converts_li_to_dash_items() {
        assert_eq!(
            clean_html_description("<li>one</li><li>two</li>"),
            "- one\n- two"
        );
    }

    #[test]
    fn collapses_consecutive_newlines() {
        assert_eq!(
            clean_html_description("<p>a</p><p>b</p><p>c</p>"),
            "a\nb\nc"
        );
    }

    #[test]
    fn decodes_entities_after_stripping_tags() {
        assert_eq!(
            clean_html_description("<p>&amp; more &#x27;quotes&#x27;</p>"),
            "& more 'quotes'"
        );
        assert_eq!(
            clean_html_description("<p>First&nbsp;line</p>"),
            "First\u{00A0}line"
        );
    }

    #[test]
    fn handles_nested_and_mixed_markup() {
        assert_eq!(
            clean_html_description(
                "<div><p>Intro &amp; summary</p><ul><li>one</li><li>two</li></ul></div>"
            ),
            "Intro & summary\n- one\n- two"
        );
    }

    #[test]
    fn handles_nested_inline_tags() {
        assert_eq!(clean_html_description("<p><b>bold</b></p>"), "bold");
        assert_eq!(
            clean_html_description("<ul><li><em>big</em> item</li></ul>"),
            "- big item"
        );
    }

    #[test]
    fn handles_br_variants() {
        assert_eq!(clean_html_description("a<br>b"), "a\nb");
        assert_eq!(clean_html_description("a<br/>b"), "a\nb");
        assert_eq!(clean_html_description("a<br />b"), "a\nb");
        assert_eq!(clean_html_description("a<br\nclear=\"all\"/>b"), "a\nb");
        assert_eq!(clean_html_description("a<BR>b"), "a\nb");
        assert_eq!(clean_html_description("a<Br/>b"), "a\nb");
    }

    #[test]
    fn handles_uppercase_block_tags() {
        assert_eq!(clean_html_description("<P>x</P>"), "x");
        assert_eq!(clean_html_description("<DIV>y</DIV>"), "y");
        assert_eq!(clean_html_description("<LI>one</LI>"), "- one");
    }

    #[test]
    fn handles_tags_with_attributes() {
        assert_eq!(
            clean_html_description("<p class=\"lead\">styled</p>"),
            "styled"
        );
        assert_eq!(
            clean_html_description("<li class=\"i\">one</li><li data-x='2'>two</li>"),
            "- one\n- two"
        );
    }

    #[test]
    fn keeps_gt_inside_quoted_attributes() {
        assert_eq!(
            clean_html_description("<a title=\"a>b\">link</a>"),
            "link"
        );
        assert_eq!(
            clean_html_description("<span data-s='x>y'>z</span>"),
            "z"
        );
    }

    #[test]
    fn removes_comments_including_angle_brackets_inside() {
        assert_eq!(clean_html_description("A<!-- hidden > note -->B"), "AB");
        assert_eq!(
            clean_html_description("keep<!-- <p>not a para</p> -->me"),
            "keepme"
        );
    }

    #[test]
    fn unterminated_comment_drops_remainder() {
        assert_eq!(clean_html_description("A<!-- never closed"), "A");
    }

    #[test]
    fn keeps_stray_less_than_as_text() {
        assert_eq!(clean_html_description("5 < 6"), "5 < 6");
        assert_eq!(
            clean_html_description("rated <3 by readers <b>x</b>"),
            "rated <3 by readers x"
        );
    }

    #[test]
    fn unterminated_tag_at_eof_is_kept_as_text() {
        assert_eq!(clean_html_description("<b>bold text"), "bold text");
        assert_eq!(clean_html_description("ends with <"), "ends with <");
    }

    #[test]
    fn decodes_hex_entities_with_uppercase_marker() {
        assert_eq!(decode_html_entities("&#X27;quote&#x27;"), "'quote'");
    }

    #[test]
    fn leaves_surrogate_code_points_untouched() {
        assert_eq!(decode_html_entities("bad &#xD800; ref"), "bad &#xD800; ref");
    }
}
