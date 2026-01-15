// Nord Color Palette
// https://www.nordtheme.com/docs/colors-and-palettes

export const nord = {
  // Polar Night - Dark backgrounds
  nord0: "#2E3440",
  nord1: "#3B4252",
  nord2: "#434C5E", 
  nord3: "#4C566A",
  
  // Snow Storm - Light text/backgrounds
  nord4: "#D8DEE9",
  nord5: "#E5E9F0",
  nord6: "#ECEFF4",
  
  // Frost - Blue accent colors
  nord7: "#8FBCBB",  // Teal/cyan - classes, types
  nord8: "#88C0D0",  // Primary accent - bright cyan
  nord9: "#81A1C1",  // Secondary - muted blue
  nord10: "#5E81AC", // Tertiary - deep blue
  
  // Aurora - Semantic colors
  nord11: "#BF616A", // Red - errors, danger
  nord12: "#D08770", // Orange - warnings, advanced
  nord13: "#EBCB8B", // Yellow - warnings, caution
  nord14: "#A3BE8C", // Green - success
  nord15: "#B48EAD", // Purple - special
};

// Semantic color mapping for easier use
export const colors = {
  // Backgrounds (dark to light)
  bg: {
    darkest: nord.nord0,
    dark: nord.nord1,
    default: nord.nord2,
    light: nord.nord3,
  },
  // Text (light to dark)
  text: {
    primary: nord.nord6,
    secondary: nord.nord5,
    muted: nord.nord4,
    subtle: nord.nord3,
  },
  // Accents
  accent: {
    primary: nord.nord8,   // Cyan - main accent
    secondary: nord.nord9, // Muted blue
    tertiary: nord.nord10, // Deep blue
    teal: nord.nord7,      // Teal
  },
  // Semantic
  success: nord.nord14,
  warning: nord.nord13,
  error: nord.nord11,
  info: nord.nord9,
  special: nord.nord15,
};
