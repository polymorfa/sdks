import type { ReactNode } from "react";

import { THEME_BOOTSTRAP_SCRIPT } from "../ui/context.js";

export const metadata = {
  title: "Acme Support",
  description: "A WhatsApp help desk built on the Polymorfa SDKs",
  icons: { icon: "/favicon.svg" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111b21" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <link rel="stylesheet" href="/desk.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
