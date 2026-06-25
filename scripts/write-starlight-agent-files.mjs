import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const CONTENT_ROOT = "src/content/docs";
const OUTPUT_ROOT = "dist";
const SITE_URL = "https://jczhang02.github.io/lyntty";
const DESCRIPTION =
  "Lyntty is an Android-first, pi-first remote-control surface for local pi coding sessions.";

function listMarkdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(path);
    if (entry.isFile() && entry.name.endsWith(".md")) return [path];
    return [];
  });
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

const pages = listMarkdownFiles(CONTENT_ROOT)
  .map((path) => {
    const id = relative(CONTENT_ROOT, path).replace(/\\/g, "/").replace(/\.md$/, "");
    const content = readFileSync(path, "utf8");
    const { data, body } = parseFrontmatter(content);
    return { id, title: data.title ?? id, description: data.description ?? "", content, body };
  })
  .filter((page) => page.id !== "404")
  .sort((left, right) => left.id.localeCompare(right.id));

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

writeFileSync(
  join(OUTPUT_ROOT, "llms.txt"),
  [`# Lyntty Docs`, "", `> ${DESCRIPTION}`, "", "## Docs", "", ...llmsLines, ""].join("\n"),
);

writeFileSync(
  join(OUTPUT_ROOT, "llms-full.txt"),
  `${pages.map((page) => [`# ${page.title}`, "", page.body.trim()].join("\n")).join("\n\n---\n\n")}\n`,
);

console.log(`Wrote ${pages.length} raw Markdown pages, llms.txt, and llms-full.txt.`);
