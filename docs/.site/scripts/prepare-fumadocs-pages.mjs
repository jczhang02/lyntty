import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

import {
  resolveContainedPath,
  resolveExistingContainedPath,
  resolveMarkdownSourcePath,
  splitLeadingMarkdownH1,
} from "../lib/site-output.ts";
import {
  navigationForLocale,
  sourcePageRecords,
} from "../lib/site-pages.ts";

const CONTENT_ROOT = resolve("content/docs");
const REPO_ROOT = realpathSync(resolve("../.."));
const GITHUB_BLOB_ROOT = "https://github.com/jczhang02/lyntty/blob/main";

const sourcePages = sourcePageRecords();
const pageBySource = new Map(sourcePages.map((page) => [page.source, page]));

function jsonString(value) {
  return JSON.stringify(value);
}

function withFrontmatter({ title, description, sourceHeading, body }) {
  return [
    "---",
    `title: ${jsonString(title)}`,
    `description: ${jsonString(description)}`,
    `sourceHeading: ${jsonString(sourceHeading)}`,
    "---",
    "",
    body,
  ].join("\n");
}

function writePage(target, content) {
  const outputPath = resolveContainedPath(CONTENT_ROOT, target, "Fumadocs target");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
}

function siteUrl(page) {
  const localePrefix = page.locale === "zh" ? "/zh" : "";
  if (page.route === "index") return localePrefix || "/";
  return `${localePrefix}/${page.route}`;
}

function splitDestination(destination) {
  const match = destination.match(/^(\S+?)(\s+["'][^"']*["'])?$/);
  if (!match) return null;
  return { href: match[1], title: match[2] ?? "" };
}

function normalizeCodeFenceLanguages(body) {
  return body.replace(/^```caddyfile$/gm, "```text");
}

function rewriteMarkdownLinks(body, page) {
  return body.replace(/(\]\()([^)]+)(\))/g, (complete, open, destination, close) => {
    const parsed = splitDestination(destination.trim());
    if (!parsed) return complete;

    const { href, title } = parsed;
    if (
      href.startsWith("#") ||
      href.startsWith("/") ||
      /^[a-z][a-z0-9+.-]*:/i.test(href)
    ) {
      return complete;
    }

    const hashIndex = href.indexOf("#");
    const rawPath = hashIndex === -1 ? href : href.slice(0, hashIndex);
    const hash = hashIndex === -1 ? "" : href.slice(hashIndex);
    if (!/\.mdx?$/i.test(rawPath)) return complete;

    const resolvedSource = resolveMarkdownSourcePath(page.source, rawPath);
    const publishedPage = pageBySource.get(resolvedSource);
    if (publishedPage) {
      return `${open}${siteUrl(publishedPage)}${hash}${title}${close}`;
    }

    const repositoryPath = resolveContainedPath(REPO_ROOT, resolvedSource, "Markdown link");
    if (!existsSync(repositoryPath)) {
      throw new Error(`Broken Markdown link in ${page.source}: ${href}`);
    }
    resolveExistingContainedPath(REPO_ROOT, resolvedSource, "Markdown link symlink");
    return `${open}${GITHUB_BLOB_ROOT}/${resolvedSource}${hash}${title}${close}`;
  });
}

rmSync(CONTENT_ROOT, { force: true, recursive: true });
rmSync(resolve(".next"), { force: true, recursive: true });

for (const page of sourcePages) {
  const lexicalSourcePath = resolveContainedPath(REPO_ROOT, page.source, "Fumadocs source");
  if (!existsSync(lexicalSourcePath)) {
    throw new Error(`Missing Fumadocs source: ${page.source}`);
  }
  const sourcePath = resolveExistingContainedPath(REPO_ROOT, page.source, "Fumadocs source");
  const source = readFileSync(sourcePath, "utf8");
  const { heading: sourceHeading, body: sourceBody } = splitLeadingMarkdownH1(
    source,
    page.source,
  );
  const body = normalizeCodeFenceLanguages(rewriteMarkdownLinks(sourceBody, page));

  writePage(page.target, withFrontmatter({ ...page, sourceHeading, body }));
}

writePage(
  "meta.json",
  `${JSON.stringify({ title: "Lyntty Docs", pages: navigationForLocale("en") }, null, 2)}\n`,
);
writePage(
  "meta.zh.json",
  `${JSON.stringify({ title: "Lyntty 文档", pages: navigationForLocale("zh") }, null, 2)}\n`,
);

console.log(`Prepared ${sourcePages.length} Fumadocs pages.`);
