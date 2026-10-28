import type { Metadata } from "next";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Rohadas CA",
  description: "Rohadas CA - Practice Management System",
};

/**
 * Inline script that runs before React hydrates.
 *
 * Reads the saved theme preference from localStorage and applies the `dark`
 * class to <html> before the first paint, so there is no flash of light mode
 * for a dark-mode user. The ThemeProvider takes over afterwards and keeps the
 * class in sync on subsequent navigations or preference changes.
 */
const themeScript = `
  (function() {
    try {
      var stored = localStorage.getItem('rohadas-theme');
      var theme = stored || 'system';
      var resolved = theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme;
      if (resolved === 'dark') document.documentElement.classList.add('dark');
    } catch (e) {}
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` on the two root elements only, and for one specific
    // reason: browser extensions (ClickUp, Grammarly, password managers, dark-mode
    // switchers) add attributes to <html> or <body> before React hydrates, so the
    // server's markup and the client's cannot match. React reports that as a hydration
    // mismatch even though nothing in this application is wrong.
    //
    // This is deliberately not a blanket suppression. React scopes it to the element's
    // own attributes and **one level deep** — it does not cover descendants, so a real
    // mismatch anywhere in this application's own tree still fails loudly. Putting it
    // here rather than debugging a phantom is the difference between a warning that
    // means something and one the team learns to ignore.
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
