import type { Config } from "tailwindcss";

/**
 * Tailwind v4 config.
 *
 * `darkMode: "class"` — the `dark:` variant activates when the `.dark` class is
 * present on a parent element (the ThemeProvider toggles it on <html>).
 *
 * Custom color classes map to CSS variables defined in globals.css. Light-mode
 * values are in `:root`, dark-mode overrides are in `html.dark`.
 */
export default {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "var(--color-surface)",
          2: "var(--color-surface-elevated)",
          3: "var(--color-bg-elevated)",
        },
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          tertiary: "var(--color-text-tertiary)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          light: "var(--color-border-strong)",
        },
      },
    },
  },
} satisfies Config;
