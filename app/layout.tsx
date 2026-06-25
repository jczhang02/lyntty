import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";

import "./global.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://jczhang02.github.io/lyntty"),
  title: {
    default: "Lyntty Docs",
    template: "%s | Lyntty Docs",
  },
  description: "Product, architecture, agent, and recovery documentation for Lyntty.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
