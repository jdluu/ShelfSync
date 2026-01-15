import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

// Nord Color Palette
// https://www.nordtheme.com/docs/colors-and-palettes

// Polar Night - Dark backgrounds
const nord0 = "#2E3440";
const nord1 = "#3B4252";
const nord2 = "#434C5E";
const nord3 = "#4C566A";

// Snow Storm - Light backgrounds/text
const nord4 = "#D8DEE9";
const nord5 = "#E5E9F0";
const nord6 = "#ECEFF4";

// Frost - Blue accent colors
const nord7 = "#8FBCBB";  // Teal/cyan
const nord8 = "#88C0D0";  // Primary accent - bright cyan
const nord9 = "#81A1C1";  // Secondary - muted blue
const nord10 = "#5E81AC"; // Tertiary - deep blue

// Aurora - Semantic colors
const nord11 = "#BF616A"; // Red - errors
const nord12 = "#D08770"; // Orange - warnings
const nord13 = "#EBCB8B"; // Yellow - caution
const nord14 = "#A3BE8C"; // Green - success
const nord15 = "#B48EAD"; // Purple - special

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        // Nord raw colors as tokens
        nord: {
          0: { value: nord0 },
          1: { value: nord1 },
          2: { value: nord2 },
          3: { value: nord3 },
          4: { value: nord4 },
          5: { value: nord5 },
          6: { value: nord6 },
          7: { value: nord7 },
          8: { value: nord8 },
          9: { value: nord9 },
          10: { value: nord10 },
          11: { value: nord11 },
          12: { value: nord12 },
          13: { value: nord13 },
          14: { value: nord14 },
          15: { value: nord15 },
        },
        // Override color palettes with Nord colors
        gray: {
          50: { value: nord6 },
          100: { value: nord5 },
          200: { value: nord4 },
          300: { value: "#B8C5D4" }, // Interpolated
          400: { value: "#8B9CB3" }, // Interpolated
          500: { value: nord3 },
          600: { value: nord2 },
          700: { value: nord1 },
          800: { value: nord0 },
          900: { value: "#242933" },
          950: { value: "#1E222A" },
        },
        blue: {
          50: { value: "#E8F4F6" },
          100: { value: "#C8E4E9" },
          200: { value: "#A8D4DC" },
          300: { value: nord8 },
          400: { value: nord8 },
          500: { value: nord9 },
          600: { value: nord10 },
          700: { value: "#4B6A8C" },
          800: { value: "#3A536D" },
          900: { value: "#2A3C4E" },
          950: { value: "#1A252F" },
        },
        teal: {
          50: { value: "#EDF5F5" },
          100: { value: "#D3E8E7" },
          200: { value: "#B9DBD9" },
          300: { value: nord7 },
          400: { value: nord7 },
          500: { value: "#7AABA9" },
          600: { value: "#659A97" },
          700: { value: "#4F8985" },
          800: { value: "#3A6763" },
          900: { value: "#254541" },
          950: { value: "#10231F" },
        },
        green: {
          50: { value: "#F0F5ED" },
          100: { value: "#D8E6D0" },
          200: { value: "#C0D7B3" },
          300: { value: nord14 },
          400: { value: nord14 },
          500: { value: "#8CAA75" },
          600: { value: "#6B8A5A" },
          700: { value: "#4A6A3F" },
          800: { value: "#294A24" },
          900: { value: "#0F2A0F" },
          950: { value: "#051505" },
        },
        red: {
          50: { value: "#FAE8EA" },
          100: { value: "#F2C5C9" },
          200: { value: "#E9A2A8" },
          300: { value: "#D47F87" },
          400: { value: nord11 },
          500: { value: nord11 },
          600: { value: "#A64F57" },
          700: { value: "#8D3F47" },
          800: { value: "#742F37" },
          900: { value: "#5B1F27" },
          950: { value: "#420F17" },
        },
        orange: {
          50: { value: "#FCF0EB" },
          100: { value: "#F6D9CD" },
          200: { value: "#EFC2AF" },
          300: { value: "#E3AB91" },
          400: { value: nord12 },
          500: { value: nord12 },
          600: { value: "#B76F5A" },
          700: { value: "#9E5847" },
          800: { value: "#854134" },
          900: { value: "#6C2A21" },
          950: { value: "#53130E" },
        },
        yellow: {
          50: { value: "#FDF8ED" },
          100: { value: "#F9EDD1" },
          200: { value: "#F5E2B5" },
          300: { value: nord13 },
          400: { value: nord13 },
          500: { value: "#D4B56B" },
          600: { value: "#BD9F4B" },
          700: { value: "#9A7F3A" },
          800: { value: "#775F29" },
          900: { value: "#543F18" },
          950: { value: "#311F07" },
        },
        purple: {
          50: { value: "#F5EDF4" },
          100: { value: "#E5D1E2" },
          200: { value: "#D5B5D0" },
          300: { value: nord15 },
          400: { value: nord15 },
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
        // Background semantic tokens with light/dark mode support
        bg: {
          DEFAULT: {
            value: { _light: "{colors.gray.50}", _dark: "{colors.gray.800}" },
          },
          subtle: {
            value: { _light: "{colors.gray.100}", _dark: "{colors.gray.700}" },
          },
          muted: {
            value: { _light: "{colors.gray.200}", _dark: "{colors.gray.600}" },
          },
          emphasized: {
            value: { _light: "{colors.gray.300}", _dark: "{colors.gray.500}" },
          },
          inverted: {
            value: { _light: "{colors.gray.800}", _dark: "{colors.gray.50}" },
          },
          panel: {
            value: { _light: "{colors.white}", _dark: "{colors.gray.700}" },
          },
          canvas: {
            value: { _light: "{colors.gray.50}", _dark: "{colors.gray.900}" },
          },
        },
        // Foreground/text semantic tokens
        fg: {
          DEFAULT: {
            value: { _light: "{colors.gray.800}", _dark: "{colors.gray.50}" },
          },
          muted: {
            value: { _light: "{colors.gray.600}", _dark: "{colors.gray.200}" },
          },
          subtle: {
            value: { _light: "{colors.gray.500}", _dark: "{colors.gray.300}" },
          },
          inverted: {
            value: { _light: "{colors.gray.50}", _dark: "{colors.gray.800}" },
          },
        },
        // Border semantic tokens
        border: {
          DEFAULT: {
            value: { _light: "{colors.gray.300}", _dark: "{colors.gray.600}" },
          },
          muted: {
            value: { _light: "{colors.gray.200}", _dark: "{colors.gray.700}" },
          },
          subtle: {
            value: { _light: "{colors.gray.100}", _dark: "{colors.gray.800}" },
          },
          emphasized: {
            value: { _light: "{colors.gray.400}", _dark: "{colors.gray.500}" },
          },
        },
        // Accent colors (Frost-based)
        accent: {
          DEFAULT: {
            value: { _light: "{colors.blue.600}", _dark: "{colors.blue.400}" },
          },
          muted: {
            value: { _light: "{colors.blue.100}", _dark: "{colors.blue.900}" },
          },
          subtle: {
            value: { _light: "{colors.blue.50}", _dark: "{colors.blue.950}" },
          },
          emphasized: {
            value: { _light: "{colors.blue.700}", _dark: "{colors.blue.300}" },
          },
          fg: {
            value: { _light: "{colors.white}", _dark: "{colors.gray.900}" },
          },
        },
        // Success colors (Aurora green)
        success: {
          DEFAULT: {
            value: { _light: "{colors.green.500}", _dark: "{colors.green.400}" },
          },
          muted: {
            value: { _light: "{colors.green.100}", _dark: "{colors.green.900}" },
          },
          fg: {
            value: { _light: "{colors.green.700}", _dark: "{colors.green.300}" },
          },
        },
        // Error colors (Aurora red)
        error: {
          DEFAULT: {
            value: { _light: "{colors.red.500}", _dark: "{colors.red.400}" },
          },
          muted: {
            value: { _light: "{colors.red.100}", _dark: "{colors.red.900}" },
          },
          fg: {
            value: { _light: "{colors.red.700}", _dark: "{colors.red.300}" },
          },
        },
        // Warning colors (Aurora orange)
        warning: {
          DEFAULT: {
            value: { _light: "{colors.orange.500}", _dark: "{colors.orange.400}" },
          },
          muted: {
            value: { _light: "{colors.orange.100}", _dark: "{colors.orange.900}" },
          },
          fg: {
            value: { _light: "{colors.orange.700}", _dark: "{colors.orange.300}" },
          },
        },
        // Info colors (Frost blue)
        info: {
          DEFAULT: {
            value: { _light: "{colors.blue.500}", _dark: "{colors.blue.400}" },
          },
          muted: {
            value: { _light: "{colors.blue.100}", _dark: "{colors.blue.900}" },
          },
          fg: {
            value: { _light: "{colors.blue.700}", _dark: "{colors.blue.300}" },
          },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);

// Export raw Nord colors for direct usage when needed
export const nord = {
  nord0, nord1, nord2, nord3,
  nord4, nord5, nord6,
  nord7, nord8, nord9, nord10,
  nord11, nord12, nord13, nord14, nord15,
};
