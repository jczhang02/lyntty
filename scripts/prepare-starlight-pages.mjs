import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const CONTENT_ROOT = "src/content/docs";

const sourcePages = [
  {
    source: "docs/README.md",
    target: "index.md",
    title: "Lyntty Docs",
    description: "Human and agent entry point for Lyntty documentation.",
    replacements: [["(AGENTS.md)", "(agent-rules/docs/)"]],
  },
  {
    source: "CONTEXT-MAP.md",
    target: "context-map.md",
    title: "Context Map",
    description: "Map of Lyntty domain documentation contexts.",
  },
  {
    source: "docs/prds/lyntty-product.md",
    target: "prds/lyntty-product.md",
    title: "Lyntty Product PRD",
    description: "Product requirements and framing for Lyntty.",
  },
  {
    source: "docs/prds/lyntty-product.zh.md",
    target: "zh/prds/lyntty-product.md",
    title: "Lyntty 产品 PRD",
    description: "Lyntty 的产品需求和产品框架。",
  },
  {
    source: "docs/recovered/previous-lyntty-decisions.md",
    target: "recovered/previous-lyntty-decisions.md",
    title: "Previous Lyntty Decisions",
    description: "Recovered historical decisions for Lyntty.",
  },
  {
    source: "docs/recovered/previous-lyntty-decisions.zh.md",
    target: "zh/recovered/previous-lyntty-decisions.md",
    title: "历史 Lyntty 决策",
    description: "恢复的 Lyntty 历史决策。",
  },
  {
    source: "docs/contexts/product/CONTEXT.md",
    target: "contexts/product.md",
    title: "Product Context",
    description: "Product domain context for Lyntty.",
  },
  {
    source: "docs/contexts/product/CONTEXT.zh.md",
    target: "zh/contexts/product.md",
    title: "产品上下文",
    description: "Lyntty 的产品领域上下文。",
  },
  {
    source: "docs/agents/issue-tracker.md",
    target: "agents/issue-tracker.md",
    title: "Issue Tracker",
    description: "GitHub Issues and Beads conventions for Lyntty.",
  },
  {
    source: "docs/agents/issue-tracker.zh.md",
    target: "zh/agents/issue-tracker.md",
    title: "Issue 跟踪",
    description: "Lyntty 的 GitHub Issues 与 Beads 约定。",
  },
  {
    source: "docs/agents/triage-labels.md",
    target: "agents/triage-labels.md",
    title: "Triage Labels",
    description: "Canonical triage labels for Lyntty.",
  },
  {
    source: "docs/agents/triage-labels.zh.md",
    target: "zh/agents/triage-labels.md",
    title: "分诊标签",
    description: "Lyntty 的标准分诊标签。",
  },
  {
    source: "docs/agents/domain.md",
    target: "agents/domain.md",
    title: "Domain Docs",
    description: "Domain documentation conventions for Lyntty.",
  },
  {
    source: "docs/agents/domain.zh.md",
    target: "zh/agents/domain.md",
    title: "领域文档",
    description: "Lyntty 的领域文档约定。",
  },
  {
    source: "AGENTS.md",
    target: "agent-rules/root.md",
    title: "Root Agent Rules",
    description: "Repository-wide agent instructions for Lyntty.",
  },
  {
    source: "docs/AGENTS.md",
    target: "agent-rules/docs.md",
    title: "Docs Agent Rules",
    description: "Documentation editing rules for Lyntty.",
  },
];

const generatedPages = [
  {
    target: "zh/index.md",
    title: "Lyntty 文档",
    description: "Lyntty 中文文档入口。",
    body: `# Lyntty 文档\n\n这里是 Lyntty 文档的中文入口。\n\n## 中文文档\n\n- [产品 PRD](prds/lyntty-product/)\n- [历史决策](recovered/previous-lyntty-decisions/)\n- [产品上下文](contexts/product/)\n- [Issue 跟踪](agents/issue-tracker/)\n- [分诊标签](agents/triage-labels/)\n- [领域文档](agents/domain/)\n`,
  },
];

function yamlString(value) {
  return JSON.stringify(value);
}

function withFrontmatter({ title, description, body }) {
  return [
    "---",
    `title: ${yamlString(title)}`,
    `description: ${yamlString(description)}`,
    "---",
    "",
    body.trimStart(),
  ].join("\n");
}

async function writePage(target, content) {
  const outputPath = `${CONTENT_ROOT}/${target}`;
  await mkdir(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
}

rmSync(CONTENT_ROOT, { force: true, recursive: true });

for (const page of sourcePages) {
  let body = readFileSync(page.source, "utf8");
  for (const [oldText, newText] of page.replacements ?? []) {
    body = body.replaceAll(oldText, newText);
  }

  await writePage(page.target, withFrontmatter({ ...page, body }));
}

for (const page of generatedPages) {
  await writePage(page.target, withFrontmatter(page));
}

console.log(`Prepared ${sourcePages.length + generatedPages.length} Starlight pages.`);
