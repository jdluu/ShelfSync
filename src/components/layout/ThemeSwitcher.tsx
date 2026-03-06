import { Monitor, Moon, Sun } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

/**
 * Applies the selected theme to the document and persists the preference.
 *
 * Handles "system" by reading the OS preference via `prefers-color-scheme`.
 * Updates the `data-theme` attribute on `<html>` and the `theme-color` meta tag
 * for mobile status bar integration.
 */
const applyTheme = (t: "light" | "dark" | "system") => {
  let effectiveTheme: "light" | "dark";
  if (t === "system") {
    effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } else {
    effectiveTheme = t;
  }
  const documentElement = document.documentElement;
  documentElement.setAttribute("data-theme", effectiveTheme);
  localStorage.setItem("theme-preference", t);

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", effectiveTheme === "dark" ? "#1d232a" : "#ffffff");
  }
};

/**
 * Three-button theme switcher (Light / Dark / System).
 *
 * Reads the initial preference from `localStorage` and syncs with the OS
 * media query when "System" is selected.
 */
export const ThemeSwitcher: React.FC = () => {
  const [theme, setTheme] = useState<"light" | "dark" | "system">(
    (localStorage.getItem("theme-preference") as "light" | "dark" | "system") || "system",
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "system") {
        applyTheme("system");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute("data-theme") as "light" | "dark";
      if (theme !== "system" && currentTheme && currentTheme !== theme) {
        setTheme(currentTheme);
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [theme]);

  const options = [
    { value: "light" as const, icon: Sun, label: "Light" },
    { value: "dark" as const, icon: Moon, label: "Dark" },
    { value: "system" as const, icon: Monitor, label: "System" },
  ];

  return (
    <section>
      <h3 className="text-[10px] font-bold text-base-content/50 uppercase tracking-widest mb-3">
        Appearance
      </h3>
      <div className="flex flex-col gap-3 p-1 bg-base-200/50 rounded-xl border border-base-300">
        <div className="grid grid-cols-3 gap-1">
          {options.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-label={`Switch to ${label} theme`}
              className={`flex flex-col items-center gap-2 py-3 px-2 rounded-lg transition-all ${
                theme === value
                  ? "bg-base-100 shadow-sm text-primary"
                  : "hover:bg-base-200 text-base-content/70"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
