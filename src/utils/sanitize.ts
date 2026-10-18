/**
 * Utilities for cleaning and sanitizing text/HTML content.
 */

const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Strips HTML tags and decodes common HTML entities from a string.
 * Collapses redundant whitespace while preserving paragraph breaks.
 */
export function cleanHtml(html: string | null | undefined): string {
  if (!html) return "";

  // Replace br and paragraph tags with newlines before stripping
  let text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text.replace(
    /&(?:amp|lt|gt|quot|#39|apos|nbsp);/g,
    (entity) => HTML_ENTITY_MAP[entity] ?? entity,
  );

  // Normalize excessive newlines and whitespace
  return text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
