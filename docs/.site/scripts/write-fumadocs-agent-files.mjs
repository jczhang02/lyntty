import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { absolutizeSiteMarkdownLinks } from "../lib/site-output.ts";
import { sourcePageRecords } from "../lib/site-pages.ts";

const CONTENT_ROOT = "content/docs";
const OUTPUT_ROOT = "out";
const SITE_URL = "https://jczhang02.github.io/lyntty";
const DESCRIPTION =
  "Lyntty is an Android-first, self-hosted control surface for local pi sessions.";

function listMdxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listMdxFiles(path);
    if (entry.isFile() && entry.name.endsWith(".mdx")) return [path];
    return [];
  });
}

function removeGeneratedMarkdownOutputs(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      removeGeneratedMarkdownOutputs(path);
      continue;
    }

    if (
      entry.isFile() &&
      (entry.name.endsWith(".md") ||
        entry.name === "llms.txt" ||
        entry.name === "llms-full.txt" ||
        entry.name === ".nojekyll")
    ) {
      rmSync(path);
    }
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, body: content };

  const data = Object.fromEntries(
    match[1].split("\n").flatMap((line) => {
      const separator = line.indexOf(":");
      if (separator === -1) return [];

      const key = line.slice(0, separator).trim();
      const rawValue = line.slice(separator + 1).trim();
      try {
        return [[key, JSON.parse(rawValue)]];
      } catch {
        return [[key, rawValue]];
      }
    }),
  );

  return { data, body: match[2] };
}

function pageId(path) {
  const relativePath = relative(CONTENT_ROOT, path).replace(/\\/g, "/").replace(/\.mdx$/, "");
  if (relativePath.endsWith(".zh")) return `zh/${relativePath.slice(0, -3)}`;
  return relativePath;
}

removeGeneratedMarkdownOutputs(OUTPUT_ROOT);

const pageById = new Map(
  listMdxFiles(CONTENT_ROOT).map((path) => {
    const id = pageId(path);
    const content = absolutizeSiteMarkdownLinks(readFileSync(path, "utf8"), SITE_URL);
    const { data, body } = parseFrontmatter(content);
    return [id, { id, title: data.title ?? id, description: data.description ?? "", content, body }];
  }),
);

function outputPageId(page) {
  const id = page.target.replace(/\\/g, "/").replace(/\.mdx$/, "").replace(/\.zh$/, "");
  return page.locale === "zh" ? `zh/${id}` : id;
}

const orderedIds = sourcePageRecords().map(outputPageId);

const pages = orderedIds.map((id) => {
  const page = pageById.get(id);
  if (!page) throw new Error(`Missing generated Markdown page: ${id}`);
  return page;
});

if (pageById.size !== pages.length) {
  throw new Error(`Unexpected generated Markdown page count: ${pageById.size} != ${pages.length}`);
}

for (const page of pages) {
  const outputPath = join(OUTPUT_ROOT, `${page.id}.md`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, page.content);
}

const llmsLines = pages.map((page) => {
  const url = `${SITE_URL}/${page.id}.md`;
  const description = page.description ? `: ${page.description}` : "";
  return `- [${page.title}](${url})${description}`;
});

writeFileSync(join(OUTPUT_ROOT, ".nojekyll"), "# GitHub Pages: do not run Jekyll.\n");

writeFileSync(
  join(OUTPUT_ROOT, "llms.txt"),
  [`# Lyntty Docs`, "", `> ${DESCRIPTION}`, "", "## Docs", "", ...llmsLines, ""].join("\n"),
);

writeFileSync(
  join(OUTPUT_ROOT, "llms-full.txt"),
  `${pages.map((page) => [`# ${page.title}`, "", page.body.trim()].join("\n")).join("\n\n---\n\n")}\n`,
);

console.log(`Wrote ${pages.length} raw Markdown pages, llms.txt, and llms-full.txt.`);
