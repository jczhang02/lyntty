import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const pages = [
  ["AGENTS.md", "AGENTS.mdx"],
  ["CONTEXT-MAP.md", "CONTEXT-MAP.mdx"],
  ["docs/AGENTS.md", "docs/AGENTS.mdx"],
  ["docs/README.md", "docs/README.mdx"],
  ["docs/agents/domain.md", "docs/agents/domain.mdx"],
  ["docs/agents/domain.zh.md", "docs/agents/zh/domain.mdx"],
  ["docs/agents/issue-tracker.md", "docs/agents/issue-tracker.mdx"],
  ["docs/agents/issue-tracker.zh.md", "docs/agents/zh/issue-tracker.mdx"],
  ["docs/agents/triage-labels.md", "docs/agents/triage-labels.mdx"],
  ["docs/agents/triage-labels.zh.md", "docs/agents/zh/triage-labels.mdx"],
  ["docs/contexts/product/CONTEXT.md", "docs/contexts/product/CONTEXT.mdx"],
  ["docs/contexts/product/CONTEXT.zh.md", "docs/contexts/product/zh/CONTEXT.mdx"],
  ["docs/prds/lyntty-product.md", "docs/prds/lyntty-product.mdx"],
  ["docs/prds/lyntty-product.zh.md", "docs/prds/zh/lyntty-product.mdx"],
  ["docs/recovered/previous-lyntty-decisions.md", "docs/recovered/previous-lyntty-decisions.mdx"],
  ["docs/recovered/previous-lyntty-decisions.zh.md", "docs/recovered/zh/previous-lyntty-decisions.mdx"],
];

const generatedPaths = [
  "AGENTS.mdx",
  "CONTEXT-MAP.mdx",
  "docs/AGENTS.mdx",
  "docs/README.mdx",
  "docs/agents/domain.mdx",
  "docs/agents/domain.zh.mdx",
  "docs/agents/issue-tracker.mdx",
  "docs/agents/issue-tracker.zh.mdx",
  "docs/agents/triage-labels.mdx",
  "docs/agents/triage-labels.zh.mdx",
  "docs/agents/zh",
  "docs/contexts/product/CONTEXT.mdx",
  "docs/contexts/product/CONTEXT.zh.mdx",
  "docs/contexts/product/zh",
  "docs/prds/lyntty-product.mdx",
  "docs/prds/lyntty-product.zh.mdx",
  "docs/prds/zh",
  "docs/recovered/previous-lyntty-decisions.mdx",
  "docs/recovered/previous-lyntty-decisions.zh.mdx",
  "docs/recovered/zh",
  "tangly-site",
];

for (const generatedPath of generatedPaths) {
  rmSync(generatedPath, { force: true, recursive: true });
}

for (const [source, target] of pages) {
  if (!existsSync(source)) {
    throw new Error(`Tangly source page missing: ${source}`);
  }

  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

console.log(`Prepared ${pages.length} Tangly MDX mirror pages.`);
