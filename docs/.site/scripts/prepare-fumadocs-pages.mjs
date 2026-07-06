import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CONTENT_ROOT = "content/docs";
const REPO_ROOT = "../..";

const sourcePages = [
  {
    source: "docs/README.md",
    target: "index.mdx",
    title: "Lyntty Docs",
    description: "Human and agent entry point for Lyntty documentation.",
    replacements: [["(AGENTS.md)", "(agent-rules/docs)"]],
  },
  {
    source: "CONTEXT-MAP.md",
    target: "context-map.mdx",
    title: "Context Map",
    description: "Map of Lyntty domain documentation contexts.",
  },
  {
    source: "docs/prds/lyntty-product.md",
    target: "prds/lyntty-product.mdx",
    title: "Lyntty Product PRD",
    description: "Product requirements and framing for Lyntty.",
  },
  {
    source: "docs/prds/lyntty-product.zh.md",
    target: "prds/lyntty-product.zh.mdx",
    title: "Lyntty 产品 PRD",
    description: "Lyntty 的产品需求和产品框架。",
  },
  {
    source: "docs/roadmap.md",
    target: "roadmap.mdx",
    title: "Lyntty Roadmap",
    description: "Implementation roadmap for Lyntty.",
  },
  {
    source: "docs/roadmap.zh.md",
    target: "roadmap.zh.mdx",
    title: "Lyntty Roadmap",
    description: "Lyntty 的实现路线图。",
  },
  {
    source: "docs/recovered/previous-lyntty-decisions.md",
    target: "recovered/previous-lyntty-decisions.mdx",
    title: "Previous Lyntty Decisions",
    description: "Recovered historical decisions for Lyntty.",
  },
  {
    source: "docs/recovered/previous-lyntty-decisions.zh.md",
    target: "recovered/previous-lyntty-decisions.zh.mdx",
    title: "历史 Lyntty 决策",
    description: "恢复的 Lyntty 历史决策。",
  },
  {
    source: "docs/contexts/product/CONTEXT.md",
    target: "contexts/product.mdx",
    title: "Product Context",
    description: "Product domain context for Lyntty.",
  },
  {
    source: "docs/contexts/product/CONTEXT.zh.md",
    target: "contexts/product.zh.mdx",
    title: "产品上下文",
    description: "Lyntty 的产品领域上下文。",
  },
  {
    source: "docs/agents/issue-tracker.md",
    target: "agents/issue-tracker.mdx",
    title: "Issue Tracker",
    description: "GitHub Issues and Beads conventions for Lyntty.",
  },
  {
    source: "docs/agents/issue-tracker.zh.md",
    target: "agents/issue-tracker.zh.mdx",
    title: "Issue 跟踪",
    description: "Lyntty 的 GitHub Issues 与 Beads 约定。",
  },
  {
    source: "docs/agents/triage-labels.md",
    target: "agents/triage-labels.mdx",
    title: "Triage Labels",
    description: "Canonical triage labels for Lyntty.",
  },
  {
    source: "docs/agents/triage-labels.zh.md",
    target: "agents/triage-labels.zh.mdx",
    title: "分诊标签",
    description: "Lyntty 的标准分诊标签。",
  },
  {
    source: "docs/agents/domain.md",
    target: "agents/domain.mdx",
    title: "Domain Docs",
    description: "Domain documentation conventions for Lyntty.",
  },
  {
    source: "docs/agents/domain.zh.md",
    target: "agents/domain.zh.mdx",
    title: "领域文档",
    description: "Lyntty 的领域文档约定。",
  },
  {
    source: "AGENTS.md",
    target: "agent-rules/root.mdx",
    title: "Root Agent Rules",
    description: "Repository-wide agent instructions for Lyntty.",
  },
  {
    source: "docs/AGENTS.md",
    target: "agent-rules/docs.mdx",
    title: "Docs Agent Rules",
    description: "Documentation editing rules for Lyntty.",
  },
];

const generatedPages = [
  {
    target: "index.zh.mdx",
    title: "Lyntty 文档",
    description: "Lyntty 中文文档入口。",
    body: `# Lyntty 文档\n\n这里是 Lyntty 文档的中文入口。\n\n## 中文文档\n\n- [产品 PRD](prds/lyntty-product)\n- [路线图](roadmap)\n- [历史决策](recovered/previous-lyntty-decisions)\n- [产品上下文](contexts/product)\n- [Issue 跟踪](agents/issue-tracker)\n- [分诊标签](agents/triage-labels)\n- [领域文档](agents/domain)\n`,
  },
];

const rootMeta = {
  title: "Lyntty Docs",
  pages: [
    "index",
    "context-map",
    "---Product---",
    "prds/lyntty-product",
    "roadmap",
    "recovered/previous-lyntty-decisions",
    "---Domain---",
    "contexts/product",
    "---Agents---",
    "agents/issue-tracker",
    "agents/triage-labels",
    "agents/domain",
    "agent-rules/root",
    "agent-rules/docs",
  ],
};

const zhMeta = {
  title: "Lyntty 文档",
  pages: [
    "index",
    "context-map",
    "---产品---",
    "prds/lyntty-product",
    "roadmap",
    "recovered/previous-lyntty-decisions",
    "---领域---",
    "contexts/product",
    "---Agent---",
    "agents/issue-tracker",
    "agents/triage-labels",
    "agents/domain",
    "agent-rules/root",
    "agent-rules/docs",
  ],
};

function jsonString(value) {
  return JSON.stringify(value);
}

function withFrontmatter({ title, description, body }) {
  return [
    "---",
    `title: ${jsonString(title)}`,
    `description: ${jsonString(description)}`,
    "---",
    "",
    body.trimStart(),
  ].join("\n");
}

function writePage(target, content) {
  const outputPath = `${CONTENT_ROOT}/${target}`;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
}

rmSync(CONTENT_ROOT, { force: true, recursive: true });

for (const page of sourcePages) {
  let body = readFileSync(join(REPO_ROOT, page.source), "utf8");
  for (const [oldText, newText] of page.replacements ?? []) {
    body = body.replaceAll(oldText, newText);
  }

  writePage(page.target, withFrontmatter({ ...page, body }));
}

for (const page of generatedPages) {
  writePage(page.target, withFrontmatter(page));
}

writePage("meta.json", `${JSON.stringify(rootMeta, null, 2)}\n`);
writePage("meta.zh.json", `${JSON.stringify(zhMeta, null, 2)}\n`);

console.log(`Prepared ${sourcePages.length + generatedPages.length} Fumadocs pages.`);
