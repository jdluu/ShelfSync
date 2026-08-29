import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { brandTokens } from "@/design/tokens";

/*
 * Operational CSS semantic-token contract.
 *
 * `src/design/tokens.ts` is the single typed source of truth (Brand v2). This
 * test makes sure the value is actually reachable at runtime by asserting the
 * matching `--token-*` custom properties are emitted into src/App.css inside
 * each DaisyUI theme block ("paper", "lamplight") and the theme-independent
 * `:root` block. The `--token-*` names are the migration-compatible surface for
 * components; the DaisyUI `--color-*` variables remain untouched so existing
 * class-based theming keeps working.
 */

const CSS_PATH = resolve(process.cwd(), "src/App.css");
const css = readFileSync(CSS_PATH, "utf8");

type ThemeName = "paper" | "lamplight";

function themeBlock(theme: ThemeName): string {
  const blocks = css.split(/@plugin "daisyui\/theme"\s*\{/);
  const block = blocks.slice(1).find((b) => new RegExp(`name:\\s*"${theme}"`).test(b));
  if (!block) throw new Error(`App.css is missing the "${theme}" DaisyUI theme block`);
  return block;
}

function themeTokens(theme: ThemeName): Record<string, string> {
  const block = themeBlock(theme);
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/--token-([\w-]+):\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      tokens[name] = value.trim();
    }
  }
  return tokens;
}

const EXPECTED_COLOR_TOKENS: Record<string, string> = {
  "surface-page": "surface.page",
  "surface-card": "surface.card",
  "surface-well": "surface.well",
  "content-ink": "content.ink",
  "content-on-accent": "content.onAccent",
  "content-on-accent-active": "content.onAccentActive",
  "accent-primary": "accent.primary",
  "accent-active": "accent.active",
  "status-secondary": "status.secondary",
  "status-neutral": "status.neutral",
  "status-info": "status.info",
  "status-success": "status.success",
  "status-warning": "status.warning",
  "status-error": "status.error",
};

describe("brandTokens — operational CSS semantic-token contract", () => {
  it.each(["paper", "lamplight"] as const)(
    "mirrors the %s semantic color roles as --token-* custom properties",
    (theme) => {
      const tokens = themeTokens(theme);
      const source = brandTokens.color[theme];
      for (const [cssName, sourcePath] of Object.entries(EXPECTED_COLOR_TOKENS)) {
        const expected = sourcePath
          .split(".")
          .reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], source);
        expect(tokens[cssName], `expected --token-${cssName} in the "${theme}" theme`).toBe(
          String(expected),
        );
      }
    },
  );

  it("exposes the e-ink fallback as scoped --token-* overrides", () => {
    const einkSelector = css.match(/html\.e-ink\s*\{/)?.[0];
    expect(einkSelector).toBeDefined();
    expect(css).toMatch(/html\.e-ink\s*\{[^}]*--token-surface-page:\s*#ffffff/i);
    expect(css).toMatch(/html\.e-ink\s*\{[^}]*--token-content-ink:\s*#000000/i);
  });

  it("keeps the theme-independent token groups in :root", () => {
    const root = css.match(/:root\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(root).toMatch(/--token-font-ui:\s*"Outfit"/);
    expect(root).toMatch(/--token-font-display:\s*"Source Serif 4"/);
    expect(root).toMatch(/--token-radius-box:\s*0\.75rem/);
    expect(root).toMatch(/--token-radius-field:\s*0\.5rem/);
    expect(root).toMatch(/--token-radius-pill:\s*999px/);
    expect(root).toMatch(/--token-spacing-gutter:\s*24px/);
    expect(root).toMatch(/--token-spacing-cover-min-width:\s*140px/);
    expect(root).toMatch(/--token-motion-page:\s*200ms/);
    expect(root).toMatch(/--token-motion-toast:\s*150ms/);
  });
});
