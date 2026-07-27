import type { Metadata } from "next";

import "./global.css";

export const metadata: Metadata = {
  title: "Page not found | Lyntty Docs",
  description: "The requested Lyntty documentation page does not exist.",
};

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="min-h-screen bg-fd-background text-fd-foreground">
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
          <p className="mb-4 font-sans text-sm font-semibold uppercase tracking-[0.16em] text-fd-muted-foreground">
            404
          </p>
          <h1 className="font-sans text-4xl font-semibold tracking-tight sm:text-5xl">
            Page not found
          </h1>
          <p className="mt-3 font-sans text-xl text-fd-muted-foreground">页面不存在</p>
          <p className="mt-8 max-w-xl text-lg leading-8 text-fd-muted-foreground">
            This address is not part of the current Lyntty documentation. Return to the
            task-oriented index to continue.
          </p>
          <a
            className="mt-10 w-fit rounded-md bg-fd-primary px-4 py-2.5 font-sans font-medium text-fd-primary-foreground no-underline"
            href="/lyntty/"
          >
            Open Lyntty Docs
          </a>
        </main>
      </body>
    </html>
  );
}
