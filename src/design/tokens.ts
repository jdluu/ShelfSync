/*
 * Brand v2 semantic design tokens.
 *
 * Single, typed source of truth for the ShelfSync design language, derived from
 * docs/design-system.md and mirrored by the DaisyUI themes in src/App.css
 * (`paper`, `lamplight`) plus the `e-ink` fallback. Every value here must stay
 * in sync with src/App.css; the DaisyUI class names those themes power
 * (`bg-base-100`, `border-base-300`, `text-base-content`, ...) are the
 * migration-compatible surface for components.
 *
 * Reading room: calm, owned, warm. One low-chroma lamplight-amber accent on
 * paper-and-ink surfaces; Source Serif 4 only for book titles and the wordmark.
 */

export const brandTokens = {
  color: {
    /** Warm daylight reading room (DaisyUI theme "paper", base-100 page). */
    paper: {
      /** Theme surfaces: page, cards, and wells/borders. */
      surface: {
        /** base-100 — page */
        page: "#faf7f2",
        /** base-200 — cards */
        card: "#f2ede4",
        /** base-300 — wells and borders */
        well: "#e4dccc",
      },
      /** Foregrounds paired with their surfaces or accent. */
      content: {
        /** base-content — ink */
        ink: "#2b2620",
        /** primary-content — text on the accent */
        onAccent: "#1c1712",
        /** accent-content — text on the active accent */
        onAccentActive: "#1c1712",
      },
      /** The single lamplight-amber accent (interactive elements only). */
      accent: {
        /** primary — lamplight amber */
        primary: "#c88a3d",
        /** accent — deeper amber for small interactive elements */
        active: "#a87838",
      },
      /** Status and secondary roles. */
      status: {
        /** secondary — leather */
        secondary: "#7a6a54",
        /** neutral */
        neutral: "#57503f",
        /** info */
        info: "#5b7d9e",
        /** success */
        success: "#6a8f5f",
        /** warning */
        warning: "#b08a3e",
        /** error */
        error: "#b0563f",
      },
    },
    /** Warm night reading room (DaisyUI theme "lamplight"). */
    lamplight: {
      surface: {
        /** base-100 — page */
        page: "#191714",
        /** base-200 — cards */
        card: "#211e1a",
        /** base-300 — wells and borders */
        well: "#2b2722",
      },
      content: {
        /** base-content — cream ink */
        ink: "#ece5d8",
        /** primary-content — text on the accent */
        onAccent: "#1c1712",
        /** accent-content — text on the active accent */
        onAccentActive: "#1c1712",
      },
      accent: {
        /** primary — brighter lamplight amber */
        primary: "#e0a458",
        /** accent */
        active: "#e0a458",
      },
      status: {
        /** secondary */
        secondary: "#b3a184",
        /** neutral */
        neutral: "#3a352c",
        /** info */
        info: "#8fb0cc",
        /** success */
        success: "#93b886",
        /** warning */
        warning: "#d4b06a",
        /** error */
        error: "#d98a72",
      },
    },
    /** Monochrome fallback when the `e-ink` class is on <html>. */
    eink: {
      surface: {
        page: "#ffffff",
        card: "#ffffff",
        well: "#e0e0e0",
      },
      content: {
        ink: "#000000",
        onAccent: "#ffffff",
        onAccentActive: "#ffffff",
      },
      accent: {
        primary: "#000000",
        active: "#000000",
      },
      status: {
        secondary: "#000000",
        neutral: "#000000",
        info: "#000000",
        success: "#000000",
        warning: "#000000",
        error: "#000000",
      },
    },
  },
  typography: {
    /** UI and body chrome. */
    ui: '"Outfit", system-ui, -apple-system, sans-serif',
    /** Book titles and the wordmark only — never UI chrome. */
    display: '"Source Serif 4", Georgia, serif',
    weights: {
      ui: [400, 500, 600, 700],
      display: [600, 700],
    },
  },
  radius: {
    /** 12px card corners. */
    box: "0.75rem",
    /** 8px field corners. */
    field: "0.5rem",
    /** Status badges/pills only. */
    pill: "999px",
  },
  spacing: {
    /** Book-grid gutter. */
    gutter: "24px",
    /** Minimum cover width in the grid. */
    coverMinWidth: "140px",
  },
  motion: {
    /** Fade-slide page transitions. */
    pageTransitionMs: 200,
    /** Toast slide-up. */
    toastMs: 150,
    /** Purpose-only motion; e-ink and reduced-motion guarantee zero motion. */
    zeroMotion: {
      eink: true,
      reducedMotion: true,
    },
  },
} as const;

export type BrandTokens = typeof brandTokens;
