"use client";

import { ThemeProvider, useTheme } from "next-themes";
import type { ThemeProviderProps } from "next-themes";
import { IconButton, ClientOnly, Skeleton } from "@chakra-ui/react";
import { Moon, Sun } from "lucide-react";

export interface ColorModeProviderProps extends ThemeProviderProps {}

export function ColorModeProvider(props: ColorModeProviderProps) {
  return (
    <ThemeProvider
      attribute="class"
      disableTransitionOnChange
      defaultTheme="dark"
      enableSystem
      {...props}
    />
  );
}

export function useColorMode() {
  const { setTheme, resolvedTheme } = useTheme();
  
  const toggleColorMode = () => {
    setTheme(resolvedTheme === "light" ? "dark" : "light");
  };

  return {
    colorMode: resolvedTheme as "light" | "dark" | undefined,
    setColorMode: setTheme,
    toggleColorMode,
  };
}

export function useColorModeValue<TLight, TDark>(
  light: TLight,
  dark: TDark
): TLight | TDark {
  const { colorMode } = useColorMode();
  return colorMode === "light" ? light : dark;
}

export function ColorModeButton() {
  const { colorMode, toggleColorMode } = useColorMode();
  
  return (
    <ClientOnly fallback={<Skeleton boxSize="8" borderRadius="md" />}>
      <IconButton
        onClick={toggleColorMode}
        variant="ghost"
        size="sm"
        aria-label="Toggle color mode"
      >
        {colorMode === "light" ? <Moon size={18} /> : <Sun size={18} />}
      </IconButton>
    </ClientOnly>
  );
}

export function LightMode({ children }: { children: React.ReactNode }) {
  return <div className="light" style={{ colorScheme: "light" }}>{children}</div>;
}

export function DarkMode({ children }: { children: React.ReactNode }) {
  return <div className="dark" style={{ colorScheme: "dark" }}>{children}</div>;
}
