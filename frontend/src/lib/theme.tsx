"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "rohadas-theme";

/**
 * Reads the saved theme preference from localStorage.
 * Returns "system" if nothing is stored.
 */
function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

/**
 * Resolves a system preference to "light" or "dark" by querying
 * `prefers-color-scheme`.
 */
function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Resolves the *actual* theme (light/dark) from the preference:
 * "system" defers to the OS, the others are literal.
 */
function resolveTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? getSystemTheme() : theme;
}

/**
 * Theme provider.
 *
 * Manages the light / dark / system preference, persists it to localStorage,
 * and applies the `dark` class to `<html>`. The class strategy is used so the
 * server never sends markup that disagrees with the client's choice — every
 * `dark:` variant in the stylesheet is opt-in via this class.
 *
 * Persisted preference wins over the OS default so a user who explicitly picks
 * light on a dark-mode machine is not surprised. "System" follows the OS
 * preference and updates live when it changes.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The server can only ever render "system" (it has no `localStorage`), so the
  // client's first render starts there too. That is what keeps the ThemeToggle's
  // aria-label/title from mismatching the server markup. Reading the stored
  // preference during render would diverge from the server and throw a hydration
  // mismatch for anyone who has explicitly chosen light or dark.
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  const applied = useRef(false);

  useEffect(() => {
    if (!applied.current) {
      // First paint: the inlined theme script already applied the right `.dark`
      // class, so just sync React's state to match it. Resolving "system" via
      // the OS would be fine here, but for an explicit light/dark choice we must
      // NOT re-derive from the OS — that would flash the wrong theme when the
      // stored choice differs from the OS preference. `resolveTheme` returns the
      // literal for light/dark, so this is a no-op against the theme script.
      applied.current = true;
      const stored = getStoredTheme();
      setThemeState(stored);
      const r = resolveTheme(stored);
      setResolved(r);
      document.documentElement.classList.toggle("dark", r === "dark");
      return;
    }

    // Every subsequent run: the user toggled the theme. Recompute the resolved
    // value and keep the `.dark` class in lock-step.
    const r = resolveTheme(theme);
    setResolved(r);
    document.documentElement.classList.toggle("dark", r === "dark");
  }, [theme]);

  // Follow the OS preference live while the user is on "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const push = () => {
      const system = mediaQuery.matches ? "dark" : "light";
      setResolved(system);
      document.documentElement.classList.toggle("dark", system === "dark");
    };
    mediaQuery.addEventListener("change", push);
    return () => mediaQuery.removeEventListener("change", push);
  }, [theme]);

  const setTheme = (next: Theme) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme: resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook for reading and changing the theme. Must be used inside a ThemeProvider.
 */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/**
 * A toggle button that cycles through light → dark → system.
 *
 * The icon reflects the *resolved* mode (dark shows a moon, light shows a sun),
 * so when "system" is active it follows the OS choice. The title attribute
 * names the preference mode so a keyboard user knows whether the next click
 * will toggle preference or re-cycle the whole sequence.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  function cycle() {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  }

  const title =
    theme === "system"
      ? "Following system — click for light"
      : theme === "dark"
        ? "Dark mode — click for system"
        : "Light mode — click for dark";

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={title}
      title={title}
      className="btn-ghost btn-icon"
    >
      {isDark ? (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          <path d="M9.5 12c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M5.64 5.64l1.42 1.42M17.64 17.64l1.42 1.42" />
        </svg>
      )}
    </button>
  );
}
