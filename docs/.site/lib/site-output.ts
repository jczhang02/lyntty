import { realpathSync } from "node:fs";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";

export function resolveContainedPath(root: string, candidate: string, label: string): string {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(resolvedRoot, candidate);
  const pathFromRoot = relative(resolvedRoot, resolvedCandidate);

  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error(`${label} escapes site-root: ${candidate}`);
  }

  return resolvedCandidate;
}

export function resolveExistingContainedPath(
  root: string,
  candidate: string,
  label: string,
): string {
  const realRoot = realpathSync(resolve(root));
  const lexicalCandidate = resolveContainedPath(realRoot, candidate, label);
  const realCandidate = realpathSync(lexicalCandidate);
  return resolveContainedPath(realRoot, realCandidate, label);
}

export function resolveMarkdownSourcePath(source: string, candidate: string): string {
  let decodedCandidate: string;
  try {
    decodedCandidate = decodeURIComponent(candidate);
  } catch {
    throw new Error(`Markdown link escapes repository: ${candidate}`);
  }

  if (
    decodedCandidate.includes("\\") ||
    decodedCandidate.includes("\0") ||
    posix.isAbsolute(decodedCandidate)
  ) {
    throw new Error(`Markdown link escapes repository: ${candidate}`);
  }

  const resolvedSource = posix.normalize(
    posix.join(posix.dirname(source), decodedCandidate),
  );
  if (
    resolvedSource === ".." ||
    resolvedSource.startsWith("../") ||
    posix.isAbsolute(resolvedSource)
  ) {
    throw new Error(`Markdown link escapes repository: ${candidate}`);
  }

  return resolvedSource;
}

export function splitLeadingMarkdownH1(
  markdown: string,
  label: string,
): { heading: string; body: string } {
  const normalized = markdown.startsWith("\uFEFF") ? markdown.slice(1) : markdown;
  const match = normalized.match(/^#[ \t]+([^\r\n]*?)[ \t]*(?:\r?\n|$)/);
  const heading = match?.[1] ?? "";
  if (!match || heading.trim() === "") {
    throw new Error(`${label} must start with a non-empty H1`);
  }

  let body = normalized.slice(match[0].length);
  const separator = body.match(/^[ \t]*\r?\n/);
  if (separator) body = body.slice(separator[0].length);

  return { heading, body };
}

export function absolutizeSiteMarkdownLinks(markdown: string, siteUrl: string): string {
  const baseUrl = siteUrl.replace(/\/$/, "");
  return markdown
    .replace(/(\]\()\/(?!\/)/g, `$1${baseUrl}/`)
    .replace(/(href=["'])\/(?!\/)/g, `$1${baseUrl}/`);
}
