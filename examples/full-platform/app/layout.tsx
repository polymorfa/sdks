import type { ReactNode } from "react";

import { Providers } from "./providers.js";

export const metadata = {
  title: "Acme Support",
  description: "Polymorfa full-platform example",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav aria-label="Main">
          <a href="/">Acme Support</a> · <a href="/inbox">Inbox</a> ·{" "}
          <a href="/templates">Templates</a> · <a href="/calls">Calls</a> ·{" "}
          <a href="/elements">Web Components</a> · <a href="/admin">Admin</a>
        </nav>
        <Providers>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
