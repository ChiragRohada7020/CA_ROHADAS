import type { Config } from "tailwindcss";

/**
 * Tailwind v4 config.
 *
 * `darkMode: "class"` — the `dark:` variant activates when the `.dark` class is
 * present on a parent element (the ThemeProvider toggles it on <html>). This
 * keeps the server's first render free of a flash (no class = light) while
 * letting the client opt into dark as soon as the ThemeProvider mounts.
 */
export default {
  darkMode: "class",
} satisfies Config;
