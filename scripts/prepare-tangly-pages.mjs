import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const pages = [
  "AGENTS.md",
  "CONTEXT-MAP.md",
  "docs/AGENTS.md",
  "docs/README.md",
  "docs/agents/domain.md",
  "docs/agents/domain.zh.md",
  "docs/agents/issue-tracker.md",
  "docs/agents/issue-tracker.zh.md",
  "docs/agents/triage-labels.md",
  "docs/agents/triage-labels.zh.md",
  "docs/contexts/product/CONTEXT.md",
  "docs/contexts/product/CONTEXT.zh.md",
  "docs/prds/lyntty-product.md",
  "docs/prds/lyntty-product.zh.md",
  "docs/recovered/previous-lyntty-decisions.md",
  "docs/recovered/previous-lyntty-decisions.zh.md",
];

for (const source of pages) {
  if (!existsSync(source)) {
    throw new Error(`Tangly source page missing: ${source}`);
  }

  const target = source.replace(/\.md$/, ".mdx");
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

console.log(`Prepared ${pages.length} Tangly MDX mirror pages.`);
