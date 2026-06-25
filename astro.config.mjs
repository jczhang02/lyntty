import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://jczhang02.github.io",
  base: "/lyntty",
  outDir: "./dist",
  integrations: [
    starlight({
      title: "Lyntty Docs",
      description: "Product, architecture, agent, and recovery documentation for Lyntty.",
      customCss: ["/src/styles/anthropic.css"],
      defaultLocale: "root",
      disable404Route: true,
      locales: {
        root: {
          label: "English",
          lang: "en",
        },
        zh: {
          label: "中文",
          lang: "zh-CN",
        },
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/jczhang02/lyntty",
        },
      ],
      sidebar: [
        {
          label: "Start",
          translations: { zh: "开始" },
          items: [
            { slug: "index", label: "Overview", translations: { zh: "概览" } },
            { slug: "context-map", label: "Context Map", translations: { zh: "上下文地图" } },
          ],
        },
        {
          label: "Product",
          translations: { zh: "产品" },
          items: [
            { slug: "prds/lyntty-product", label: "Product PRD", translations: { zh: "产品 PRD" } },
            {
              slug: "recovered/previous-lyntty-decisions",
              label: "Recovered Decisions",
              translations: { zh: "恢复的决策" },
            },
          ],
        },
        {
          label: "Domain",
          translations: { zh: "领域" },
          items: [{ slug: "contexts/product", label: "Product Context", translations: { zh: "产品上下文" } }],
        },
        {
          label: "Agents",
          translations: { zh: "Agent" },
          items: [
            { slug: "agents/issue-tracker", label: "Issue Tracker", translations: { zh: "Issue 跟踪" } },
            { slug: "agents/triage-labels", label: "Triage Labels", translations: { zh: "分诊标签" } },
            { slug: "agents/domain", label: "Domain Docs", translations: { zh: "领域文档" } },
            { slug: "agent-rules/root", label: "Root Agent Rules", translations: { zh: "根 Agent 规则" } },
            { slug: "agent-rules/docs", label: "Docs Agent Rules", translations: { zh: "文档 Agent 规则" } },
          ],
        },
      ],
    }),
  ],
});
