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

pub(super) fn clean_html_description(text: &str) -> String {
    let clean = text
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("<p>", "\n")
        .replace("</p>", "\n")
        .replace("<div>", "\n")
        .replace("</div>", "\n")
        .replace("<li>", "\n- ")
        .replace("</li>", "");

    let mut result = String::new();
    let mut inside_tag = false;
    for ch in clean.chars() {
        if ch == '<' {
            inside_tag = true;
        } else if ch == '>' {
            inside_tag = false;
        } else if !inside_tag {
            result.push(ch);
        }
    }

    // Collapse multiple newlines and trim
    let decoded = decode_html_entities(&result);
    let mut final_res = String::new();
    let mut last_was_newline = false;
    for c in decoded.trim().chars() {
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
}
