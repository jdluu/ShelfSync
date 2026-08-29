import { describe, expect, it } from "vitest";
import { brandTokens } from "@/design/tokens";

const paper = brandTokens.color.paper;
const lamplight = brandTokens.color.lamplight;
const eink = brandTokens.color.eink;

function rgbChannels(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = rgbChannels(hex);
  const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function hue(hex: string): number {
  const [r, g, b] = rgbChannels(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let value = 0;
  if (max === r) value = 60 * (((g - b) / delta) % 6);
  else if (max === g) value = 60 * ((b - r) / delta + 2);
  else value = 60 * ((r - g) / delta + 4);
  return value < 0 ? value + 360 : value;
}

describe("brandTokens — Brand v2 semantic token contract", () => {
  it("defines both themes with an identical semantic role shape", () => {
    expect(Object.keys(paper).sort()).toEqual(Object.keys(lamplight).sort());
    expect(Object.keys(paper.surface).sort()).toEqual(Object.keys(lamplight.surface).sort());
    expect(Object.keys(paper.content).sort()).toEqual(Object.keys(lamplight.content).sort());
    expect(Object.keys(paper.accent).sort()).toEqual(Object.keys(lamplight.accent).sort());
    expect(Object.keys(paper.status).sort()).toEqual(Object.keys(lamplight.status).sort());
  });

  it("pins the paper palette to the DaisyUI theme in App.css", () => {
    expect(paper).toEqual({
      surface: { page: "#faf7f2", card: "#f2ede4", well: "#e4dccc" },
      content: { ink: "#2b2620", onAccent: "#fffdf9", onAccentActive: "#fffdf9" },
      accent: { primary: "#c88a3d", active: "#a87838" },
      status: {
        secondary: "#7a6a54",
        neutral: "#57503f",
        info: "#5b7d9e",
        success: "#6a8f5f",
        warning: "#b08a3e",
        error: "#b0563f",
      },
    });
  });

  it("pins the lamplight palette to the DaisyUI theme in App.css", () => {
    expect(lamplight).toEqual({
      surface: { page: "#191714", card: "#211e1a", well: "#2b2722" },
      content: { ink: "#ece5d8", onAccent: "#1c1712", onAccentActive: "#1c1712" },
      accent: { primary: "#e0a458", active: "#e0a458" },
      status: {
        secondary: "#b3a184",
        neutral: "#3a352c",
        info: "#8fb0cc",
        success: "#93b886",
        warning: "#d4b06a",
        error: "#d98a72",
      },
    });
  });

  it.each(["paper", "lamplight"] as const)("keeps %s ink readable on its page surface", (theme) => {
    const tokens = theme === "paper" ? paper : lamplight;
    expect(contrastRatio(tokens.content.ink, tokens.surface.page)).toBeGreaterThan(7);
  });

  it("keeps e-ink a monochrome, zero-accent fallback", () => {
    expect(eink.surface).toEqual({ page: "#ffffff", card: "#ffffff", well: "#e0e0e0" });
    expect(eink.content.ink).toBe("#000000");
    expect(eink.accent).toEqual({ primary: "#000000", active: "#000000" });
    expect(eink.status.error).toBe("#000000");
  });

  it("keeps the single warm lamplight-amber accent in both themes", () => {
    for (const tokens of [paper, lamplight]) {
      expect(hue(tokens.accent.primary)).toBeGreaterThanOrEqual(30);
      expect(hue(tokens.accent.primary)).toBeLessThan(45);
      expect(hue(tokens.accent.active)).toBeGreaterThanOrEqual(30);
      expect(hue(tokens.accent.active)).toBeLessThan(45);
    }
  });

  it("documents the typography roles from BRAND.md", () => {
    expect(brandTokens.typography.ui).toContain("Outfit");
    expect(brandTokens.typography.display).toContain("Source Serif 4");
    expect(brandTokens.typography.ui).not.toBe(brandTokens.typography.display);
    expect(brandTokens.typography.weights.display).toEqual([600, 700]);
  });

  it("keeps the soft corner system with pill radius reserved for status", () => {
    expect(brandTokens.radius).toEqual({
      box: "0.75rem",
      field: "0.5rem",
      pill: "999px",
    });
  });

  it("documents the reading-room density and purpose-only motion", () => {
    expect(brandTokens.spacing).toEqual({ gutter: "24px", coverMinWidth: "140px" });
    expect(brandTokens.motion.pageTransitionMs).toBe(200);
    expect(brandTokens.motion.toastMs).toBe(150);
  });

  it("guarantees zero motion for e-ink and reduced-motion preferences", () => {
    expect(brandTokens.motion.zeroMotion).toEqual({ eink: true, reducedMotion: true });
  });
});
