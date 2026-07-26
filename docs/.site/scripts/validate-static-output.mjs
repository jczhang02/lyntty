import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

import {
  resolveContainedPath,
  resolveExistingContainedPath,
  splitLeadingMarkdownH1,
} from "../lib/site-output.ts";
import { sourcePageRecords } from "../lib/site-pages.ts";

const OUTPUT_ROOT = realpathSync(resolve("out"));
const REPO_ROOT = realpathSync(resolve("../.."));
const SITE_ORIGIN = "https://jczhang02.github.io";
const BASE_PATH = "/lyntty";
const SITE_URL = `${SITE_ORIGIN}${BASE_PATH}`;

function fail(message) {
  throw new Error(`Static docs validation failed: ${message}`);
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) fail(`generated output contains a symlink: ${path}`);
    if (entry.isDirectory()) return listFiles(path);
    return entry.isFile() ? [path] : [];
  });
}

function outputRelative(path) {
  return relative(OUTPUT_ROOT, path).split(sep).join("/");
}

function outputPageId(page) {
  const id = page.target.replace(/\\/g, "/").replace(/\.mdx$/, "").replace(/\.zh$/, "");
  return page.locale === "zh" ? `zh/${id}` : id;
}

function pageUrl(page) {
  const id = outputPageId(page);
  if (id === "index") return `${SITE_URL}/`;
  if (id === "zh/index") return `${SITE_URL}/zh/`;
  return `${SITE_URL}/${id}/`;
}

function htmlPathForPage(page) {
  const id = outputPageId(page);
  if (id === "index") return resolveContainedPath(OUTPUT_ROOT, "index.html", "HTML page");
  if (id === "zh/index") {
    return resolveContainedPath(OUTPUT_ROOT, "zh/index.html", "HTML page");
  }
  return resolveContainedPath(OUTPUT_ROOT, `${id}/index.html`, "HTML page");
}

function markdownPathForPage(page) {
  return resolveContainedPath(OUTPUT_ROOT, `${outputPageId(page)}.md`, "Markdown page");
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#([0-9]+);/g, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)));
}

function hrefsFromHtml(html) {
  return [...html.matchAll(/<(?:a|link)\b[^>]*>/gi)].flatMap((match) => {
    const tag = match[0];
    const href = tag.match(/\bhref=(['"])(.*?)\1/i);
    if (!href) return [];
    const rel = tag.match(/\brel=(['"])(.*?)\1/i)?.[2]?.toLowerCase() ?? "";
    return [{ href: decodeHtml(href[2]), rel }];
  });
}

function idsFromHtml(html) {
  return new Set(
    [...html.matchAll(/\b(?:id|name)=(['"])(.*?)\1/gi)].map((match) => decodeHtml(match[2])),
  );
}

function renderedElementCount(html, element) {
  const renderedMarkup = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  return [...renderedMarkup.matchAll(new RegExp(`<${element}(?=[\\s/>])`, "gi"))].length;
}

function publishedMarkdownDocument(markdown, label) {
  try {
    return splitLeadingMarkdownH1(markdown, label);
  } catch (error) {
    fail(error instanceof Error ? error.message : `${label} has an invalid leading H1`);
  }
}

function markdownDestinations(markdown) {
  return [...markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].flatMap((match) => {
    const destination = match[1].trim();
    const parsed = destination.match(/^(\S+?)(?:\s+["'][^"']*["'])?$/);
    return parsed ? [parsed[1]] : [];
  });
}

function documentUrlForHtml(path) {
  const id = outputRelative(path);
  if (id === "index.html") return `${SITE_URL}/`;
  if (id === "404.html") return `${SITE_URL}/404.html`;
  if (id.endsWith("/index.html")) {
    return `${SITE_URL}/${id.slice(0, -"index.html".length)}`;
  }
  return `${SITE_URL}/${id}`;
}

function outputTargetForUrl(url) {
  if (url.origin !== SITE_ORIGIN) return null;
  if (url.pathname !== BASE_PATH && !url.pathname.startsWith(`${BASE_PATH}/`)) {
    fail(`same-origin URL escapes ${BASE_PATH}: ${url.href}`);
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(url.pathname.slice(BASE_PATH.length)).replace(/^\/+/, "");
  } catch {
    fail(`URL contains invalid percent encoding: ${url.href}`);
  }

  if (relativePath.includes("\\") || relativePath.split("/").includes("..")) {
    fail(`URL path is unsafe: ${url.href}`);
  }

  if (relativePath === "") {
    return resolveContainedPath(OUTPUT_ROOT, "index.html", "site link");
  }

  const direct = resolveContainedPath(OUTPUT_ROOT, relativePath, "site link");
  if (existsSync(direct) && lstatSync(direct).isFile()) return direct;

  if (url.pathname.endsWith("/") || extname(relativePath) === "") {
    return resolveContainedPath(OUTPUT_ROOT, join(relativePath, "index.html"), "site route");
  }

  return direct;
}

const htmlCache = new Map();

function readHtml(path) {
  const cached = htmlCache.get(path);
  if (cached !== undefined) return cached;
  const content = readFileSync(path, "utf8");
  htmlCache.set(path, content);
  return content;
}

function validateInternalHref(href, documentUrl, sourceLabel) {
  if (href === "" || href === "#") return;
  if (/^(?:mailto|tel|data):/i.test(href)) return;
  if (/^javascript:/i.test(href)) fail(`unsafe href in ${sourceLabel}: ${href}`);

  let url;
  try {
    url = new URL(href, documentUrl);
  } catch {
    fail(`invalid href in ${sourceLabel}: ${href}`);
  }
  if (!/^https?:$/.test(url.protocol) || url.origin !== SITE_ORIGIN) return;

  const target = outputTargetForUrl(url);
  if (!target || !existsSync(target) || !lstatSync(target).isFile()) {
    fail(`broken internal link in ${sourceLabel}: ${href} -> ${target ?? "unknown"}`);
  }

  if (url.hash && target.endsWith(".html")) {
    let anchor;
    try {
      anchor = decodeURIComponent(url.hash.slice(1));
    } catch {
      fail(`invalid anchor encoding in ${sourceLabel}: ${href}`);
    }
    if (anchor && !idsFromHtml(readHtml(target)).has(anchor)) {
      fail(`missing anchor in ${sourceLabel}: ${href} -> ${outputRelative(target)}#${anchor}`);
    }
  }
}

const pages = sourcePageRecords();
const expectedHtml = new Set(pages.map(htmlPathForPage));
const expectedMarkdown = new Set(pages.map(markdownPathForPage));
const expectedLlmsFullSections = [];

for (const path of [...expectedHtml, ...expectedMarkdown]) {
  if (!existsSync(path) || !lstatSync(path).isFile()) {
    fail(`missing expected page: ${outputRelative(path)}`);
  }
}

const allFiles = listFiles(OUTPUT_ROOT);
const actualMarkdown = new Set(allFiles.filter((path) => path.endsWith(".md")));
if (actualMarkdown.size !== expectedMarkdown.size) {
  fail(`unexpected raw Markdown count: ${actualMarkdown.size} != ${expectedMarkdown.size}`);
}
for (const path of actualMarkdown) {
  if (!expectedMarkdown.has(path)) fail(`stale raw Markdown page: ${outputRelative(path)}`);
}

for (const page of pages) {
  const htmlPath = htmlPathForPage(page);
  const html = readHtml(htmlPath);
  const expectedLanguage = page.locale === "zh" ? "zh-CN" : "en";
  if (!html.includes(`<html lang="${expectedLanguage}">`)) {
    fail(`wrong or missing language on ${outputRelative(htmlPath)}`);
  }
  if (!html.includes(`<link rel="canonical" href="${pageUrl(page)}"/>`)) {
    fail(`wrong or missing canonical URL on ${outputRelative(htmlPath)}`);
  }

  const renderedH1Count = renderedElementCount(html, "h1");
  if (renderedH1Count !== 1) {
    fail(`expected one rendered H1 on ${outputRelative(htmlPath)}, found ${renderedH1Count}`);
  }

  const markdownPath = markdownPathForPage(page);
  const markdown = readFileSync(markdownPath, "utf8");
  const markdownBody = markdown.match(/^---\n[\s\S]*?\n---\n\n([\s\S]*)$/)?.[1];
  if (markdownBody === undefined) {
    fail(`raw Markdown has invalid frontmatter: ${outputRelative(markdownPath)}`);
  }

  const rawDocument = publishedMarkdownDocument(markdownBody, outputRelative(markdownPath));
  const sourcePath = resolveExistingContainedPath(REPO_ROOT, page.source, "published source");
  const sourceDocument = publishedMarkdownDocument(readFileSync(sourcePath, "utf8"), page.source);
  if (rawDocument.heading !== sourceDocument.heading) {
    fail(
      `raw Markdown changed the source H1: ${outputRelative(markdownPath)} ` +
        `(${JSON.stringify(rawDocument.heading)} != ${JSON.stringify(sourceDocument.heading)})`,
    );
  }

  expectedLlmsFullSections.push(
    [`# ${page.title}`, "", rawDocument.body.trimEnd()].join("\n"),
  );
}

const notFoundPath = resolveContainedPath(OUTPUT_ROOT, "404.html", "404 page");
if (!existsSync(notFoundPath)) fail("missing 404.html");
const notFound = readHtml(notFoundPath);
for (const required of [
  '<html lang="en">',
  "Page not found | Lyntty Docs",
  "The requested Lyntty documentation page does not exist.",
  "页面不存在",
  'href="/lyntty/"',
]) {
  if (!notFound.includes(required)) fail(`404.html is missing ${JSON.stringify(required)}`);
}

for (const htmlPath of allFiles.filter((path) => path.endsWith(".html"))) {
  const html = readHtml(htmlPath);
  const documentUrl = documentUrlForHtml(htmlPath);
  for (const { href, rel } of hrefsFromHtml(html)) {
    if (rel.split(/\s+/).some((value) => value === "preconnect" || value === "dns-prefetch")) {
      continue;
    }
    validateInternalHref(href, documentUrl, outputRelative(htmlPath));
  }
}

for (const markdownPath of actualMarkdown) {
  const markdown = readFileSync(markdownPath, "utf8");
  const id = outputRelative(markdownPath).replace(/\.md$/, "");
  const documentUrl = id === "index" ? `${SITE_URL}/` : `${SITE_URL}/${id}/`;
  for (const href of markdownDestinations(markdown)) {
    if (href.startsWith("#")) continue;
    if (href.startsWith("/") && !href.startsWith("//")) {
      fail(`raw Markdown link omits ${BASE_PATH}: ${outputRelative(markdownPath)} -> ${href}`);
    }
    validateInternalHref(href, documentUrl, outputRelative(markdownPath));
  }
}

const llmsPath = resolveContainedPath(OUTPUT_ROOT, "llms.txt", "llms index");
const llmsFullPath = resolveContainedPath(OUTPUT_ROOT, "llms-full.txt", "llms full index");
for (const path of [llmsPath, llmsFullPath]) {
  if (!existsSync(path)) fail(`missing ${outputRelative(path)}`);
}
const llmsFull = readFileSync(llmsFullPath, "utf8");
const expectedLlmsFull = `${expectedLlmsFullSections.join("\n\n---\n\n")}\n`;
if (llmsFull !== expectedLlmsFull) {
  fail("llms-full.txt does not exactly match the ordered published page bodies");
}
for (const href of markdownDestinations(readFileSync(llmsPath, "utf8"))) {
  validateInternalHref(href, `${SITE_URL}/llms.txt`, "llms.txt");
}
if (!existsSync(resolveContainedPath(OUTPUT_ROOT, ".nojekyll", "Pages marker"))) {
  fail("missing .nojekyll");
}

console.log(
  `Validated ${expectedHtml.size} localized HTML pages, ${expectedMarkdown.size} raw Markdown pages, 404 metadata, basePath links, and anchors.`,
);
