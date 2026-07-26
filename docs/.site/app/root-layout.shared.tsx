import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";

export const siteMetadata: Metadata = {
  metadataBase: new URL("https://jczhang02.github.io/lyntty"),
  title: {
    default: "Lyntty Docs",
    template: "%s | Lyntty Docs",
  },
  description: "Product, architecture, operation, release, and recovery documentation for Lyntty.",
};

export function RootDocument({
  children,
  language,
}: {
  children: ReactNode;
  language: "en" | "zh-CN";
}) {
  return (
    <html lang={language} suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
