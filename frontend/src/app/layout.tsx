import type { Metadata } from "next";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Rohadas CA",
  description: "Rohadas CA - Practice Management System",
};

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
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
