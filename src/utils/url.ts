/**
 * URL validation and normalization utilities for OPDS catalogs.
 */

/**
 * Validates that an OPDS catalog URL is non-empty and uses an http or https scheme.
 */
export function isValidOpdsCatalogUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed);
}

/**
 * Normalizes an OPDS catalog URL by trimming and removing trailing slashes.
 */
export function normalizeCatalogUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.replace(/\/+$/, "");
}
