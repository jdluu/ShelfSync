import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

// Nord Color Palette
// https://www.nordtheme.com/docs/colors-and-palettes
const nordColors = {
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

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        // Map Nord to semantic color scales
        nord: {
          0: { value: nordColors.nord0 },
          1: { value: nordColors.nord1 },
          2: { value: nordColors.nord2 },
          3: { value: nordColors.nord3 },
          4: { value: nordColors.nord4 },
          5: { value: nordColors.nord5 },
          6: { value: nordColors.nord6 },
          7: { value: nordColors.nord7 },
          8: { value: nordColors.nord8 },
          9: { value: nordColors.nord9 },
          10: { value: nordColors.nord10 },
          11: { value: nordColors.nord11 },
          12: { value: nordColors.nord12 },
          13: { value: nordColors.nord13 },
          14: { value: nordColors.nord14 },
          15: { value: nordColors.nord15 },
        },
        // Override gray scale with Polar Night + Snow Storm
        gray: {
          50: { value: nordColors.nord6 },
          100: { value: nordColors.nord5 },
          200: { value: nordColors.nord4 },
          300: { value: nordColors.nord3 },
          400: { value: nordColors.nord3 },
          500: { value: nordColors.nord2 },
          600: { value: nordColors.nord2 },
          700: { value: nordColors.nord1 },
          800: { value: nordColors.nord1 },
          900: { value: nordColors.nord0 },
          950: { value: "#242933" }, // Even darker than nord0
        },
        // Blue scale - Frost colors
        blue: {
          50: { value: "#E8F4F6" },
          100: { value: "#C8E4E9" },
          200: { value: "#A8D4DC" },
          300: { value: nordColors.nord8 },
          400: { value: nordColors.nord8 },
          500: { value: nordColors.nord9 },
          600: { value: nordColors.nord10 },
          700: { value: "#4B6A8C" },
          800: { value: "#3A536D" },
          900: { value: "#2A3C4E" },
          950: { value: "#1A252F" },
        },
        // Green scale - Aurora green
        green: {
          50: { value: "#F0F5ED" },
          100: { value: "#D8E6D0" },
          200: { value: "#C0D7B3" },
          300: { value: "#A3BE8C" },
          400: { value: nordColors.nord14 },
          500: { value: nordColors.nord14 },
          600: { value: "#8CAA75" },
          700: { value: "#6B8A5A" },
          800: { value: "#4A6A3F" },
          900: { value: "#294A24" },
          950: { value: "#0F2A0F" },
        },
        // Teal/Cyan scale - Frost teal
        teal: {
          50: { value: "#EDF5F5" },
          100: { value: "#D3E8E7" },
          200: { value: "#B9DBD9" },
          300: { value: nordColors.nord7 },
          400: { value: nordColors.nord7 },
          500: { value: "#7AABA9" },
          600: { value: "#659A97" },
          700: { value: "#4F8985" },
          800: { value: "#3A6763" },
          900: { value: "#254541" },
          950: { value: "#10231F" },
        },
        // Red scale - Aurora red
        red: {
          50: { value: "#FAE8EA" },
          100: { value: "#F2C5C9" },
          200: { value: "#E9A2A8" },
          300: { value: "#D47F87" },
          400: { value: nordColors.nord11 },
          500: { value: nordColors.nord11 },
          600: { value: "#A64F57" },
          700: { value: "#8D3F47" },
          800: { value: "#742F37" },
          900: { value: "#5B1F27" },
          950: { value: "#420F17" },
        },
        // Orange scale - Aurora orange
        orange: {
          50: { value: "#FCF0EB" },
          100: { value: "#F6D9CD" },
          200: { value: "#EFC2AF" },
          300: { value: "#E3AB91" },
          400: { value: nordColors.nord12 },
          500: { value: nordColors.nord12 },
          600: { value: "#B76F5A" },
          700: { value: "#9E5847" },
          800: { value: "#854134" },
          900: { value: "#6C2A21" },
          950: { value: "#53130E" },
        },
        // Yellow scale - Aurora yellow
        yellow: {
          50: { value: "#FDF8ED" },
          100: { value: "#F9EDD1" },
          200: { value: "#F5E2B5" },
          300: { value: nordColors.nord13 },
          400: { value: nordColors.nord13 },
          500: { value: "#D4B56B" },
          600: { value: "#BD9F4B" },
          700: { value: "#9A7F3A" },
          800: { value: "#775F29" },
          900: { value: "#543F18" },
          950: { value: "#311F07" },
        },
        // Purple scale - Aurora purple
        purple: {
          50: { value: "#F5EDF4" },
          100: { value: "#E5D1E2" },
          200: { value: "#D5B5D0" },
          300: { value: nordColors.nord15 },
          400: { value: nordColors.nord15 },
          500: { value: "#9D7896" },
          600: { value: "#86627F" },
          700: { value: "#6F4C68" },
          800: { value: "#583651" },
          900: { value: "#41203A" },
          950: { value: "#2A0A23" },
        },
      },
    },
    semanticTokens: {
      colors: {
        // Background colors
        "bg.canvas": { value: "{colors.gray.900}" },
        "bg.default": { value: "{colors.gray.800}" },
        "bg.subtle": { value: "{colors.gray.700}" },
        "bg.muted": { value: "{colors.gray.600}" },
        
        // Foreground/text colors
        "fg.default": { value: "{colors.gray.50}" },
        "fg.muted": { value: "{colors.gray.200}" },
        "fg.subtle": { value: "{colors.gray.300}" },
        
        // Border colors
        "border.default": { value: "{colors.gray.500}" },
        "border.muted": { value: "{colors.gray.600}" },
        
        // Accent colors
        "accent.default": { value: "{colors.blue.400}" },
        "accent.emphasized": { value: "{colors.blue.500}" },
        "accent.fg": { value: "{colors.gray.900}" },
      },
    },
  },
});

export const nordSystem = createSystem(defaultConfig, config);
