# ShelfSync Design System

Canonical, maintained reference for the ShelfSync visual language. This is the
single source of truth for brand tokens; implementations should mirror it:

- `src/design/tokens.ts` — typed semantic tokens (paper, lamplight, e-ink)
- `src/App.css` — DaisyUI themes (`paper`, `lamplight`) plus `e-ink` fallback

## Brand direction

ShelfSync serves the **self-hoster reader**: someone who runs
Grimmory/Calibre-Web/Kavita on their own hardware, reads on a phone or tablet,
downloads a few books a week over their LAN or tailnet, and cares that:

1. Their books are theirs (no cloud, no account, no tracking)
2. The download-and-read loop takes seconds, not clicks
3. The app feels calm. They open it tired, before bed.

**A well-lit reading room at night.** Quiet confidence, not excitement. A
favorite chair, a warm lamp, a shelf that's exactly where you left it.

Three words: **calm, owned, warm.**

- Calm: low-chroma surfaces, generous whitespace, no badges or gradients shouting
- Owned: your server, your library, your files. The UI should feel like
  furniture, not a SaaS dashboard
- Warm: paper-toned light theme, lamplight amber dark theme. Reading is an
  evening activity; the app should feel like it

## Design tokens

### Typography

| Role | Font | Notes |
|------|------|-------|
| Display / book titles | **Source Serif 4** | The only serif. Book titles are content, and books are set in serif. UI chrome never uses it |
| UI / body | **Outfit** | Geometric, friendly, not Inter |

Weights: Outfit 400/500/600/700. Source Serif 4 600/700 (titles only).

### Color

One accent, low saturation, high utility. The accent is a **lamplight amber**
(`#c88a3d` light / `#e0a458` dark): the color of a reading lamp. It signals
interactive elements only. Everything else is paper and ink.

| Token | Light (Paper) | Dark (Lamplight) |
|-------|--------------|------------------|
| base-100 (page) | `#faf7f2` | `#191714` |
| base-200 (cards) | `#f2ede4` | `#211e1a` |
| base-300 (borders/wells) | `#e4dccc` | `#2b2722` |
| base-content (ink) | `#2b2620` | `#ece5d8` |
| primary (accent) | `#c88a3d` | `#e0a458` |
| primary-content | `#fffdf9` | `#1c1712` |
| secondary | `#7a6a54` (leather) | `#b3a184` |
| neutral | `#57503f` | `#3a352c` |
| info | `#5b7d9e` | `#8fb0cc` |
| success | `#6a8f5f` | `#93b886` |
| warning | `#b08a3e` | `#d4b06a` |
| error | `#b0563f` | `#d98a72` |

Keep accent-adjacent colors under 45% saturation: no more than one accent,
with strict saturation discipline. No purple, no gradients, no glow.

### Shape

**One corner system: soft.** 12px cards, 8px fields, 999px pills for status
badges only. No mixed square/pill buttons.

### Spacing & density

The book grid is the hero: covers are large (min 140px wide), gutters generous
(24px). Chrome (header, footer, forms) is compact. Density lives in the
content, not the UI.

### Motion

Purpose-only animation: page transitions fade-slide 200ms, downloads show a
progress fill on the card cover, toasts slide up 150ms. Nothing decorative.
E-ink mode keeps its zero-motion guarantee.

## Logo

Concept: **an open book seen from the spine, forming the silhouette of a lit
lamp** (positive space). Alternatively: a book whose pages curve into a lamp
shade. Flat, two-tone: ink + amber. No gradients, no arrows. This app no
longer "syncs", it shelves.

## Iconography

Lucide, 1.5px stroke, rounded caps.

## Anti-patterns (banned)

- AI-purple/blue glow accents
- Gradient buttons or banners
- Centered hero dashboards
- More than one accent color
- Serif anywhere except book titles and the wordmark
