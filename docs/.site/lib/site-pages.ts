export type SiteLocale = "en" | "zh";

type LocalizedPage = {
  source: string;
  title: string;
  description: string;
};

export type SitePage = {
  route: string;
  locales: Partial<Record<SiteLocale, LocalizedPage>>;
};

export type SiteSection = {
  id: string;
  label: Record<SiteLocale, string>;
  pages: SitePage[];
};

function pairedPage(
  route: string,
  english: LocalizedPage,
  chinese: LocalizedPage,
): SitePage {
  return { route, locales: { en: english, zh: chinese } };
}

export const siteSections: SiteSection[] = [
  {
    id: "start",
    label: { en: "Start", zh: "开始" },
    pages: [
      pairedPage(
        "index",
        {
          source: "docs/README.md",
          title: "Lyntty Docs",
          description: "Install, operate, troubleshoot, and contribute to Lyntty.",
        },
        {
          source: "docs/README.zh.md",
          title: "Lyntty 文档",
          description: "安装、运行、排查问题并参与 Lyntty 开发。",
        },
      ),
      pairedPage(
        "getting-started",
        {
          source: "docs/getting-started.md",
          title: "Getting started",
          description: "Install one compatible Stable set, deploy a relay, and pair a node.",
        },
        {
          source: "docs/getting-started.zh.md",
          title: "开始使用",
          description: "安装同一组兼容 Stable、部署 relay 并配对节点。",
        },
      ),
      pairedPage(
        "faq",
        {
          source: "docs/faq.md",
          title: "FAQ",
          description: "Product scope, trust boundaries, build channels, and support answers.",
        },
        {
          source: "docs/faq.zh.md",
          title: "常见问题",
          description: "产品范围、信任边界、构建通道和支持说明。",
        },
      ),
    ],
  },
  {
    id: "product",
    label: { en: "Product", zh: "产品" },
    pages: [
      pairedPage(
        "prds/lyntty-product",
        {
          source: "docs/prds/lyntty-product.md",
          title: "Lyntty product PRD",
          description: "Current product requirements and acceptance boundaries.",
        },
        {
          source: "docs/prds/lyntty-product.zh.md",
          title: "Lyntty 产品 PRD",
          description: "当前产品需求与验收边界。",
        },
      ),
      pairedPage(
        "contexts/product",
        {
          source: "docs/contexts/product/CONTEXT.md",
          title: "Product context",
          description: "Current product objects, surfaces, vocabulary, and invariants.",
        },
        {
          source: "docs/contexts/product/CONTEXT.zh.md",
          title: "产品上下文",
          description: "当前产品对象、界面、术语和不变量。",
        },
      ),
    ],
  },
  {
    id: "architecture",
    label: { en: "Architecture", zh: "架构" },
    pages: [
      pairedPage(
        "architecture/pi-shared-control",
        {
          source: "docs/architecture/pi-shared-control.md",
          title: "Pi shared-control architecture",
          description: "Runtime ownership, event ordering, history, and recovery contracts.",
        },
        {
          source: "docs/architecture/pi-shared-control.zh.md",
          title: "Pi shared-control 架构",
          description: "Runtime ownership、event ordering、history 与 recovery 契约摘要。",
        },
      ),
    ],
  },
  {
    id: "operate",
    label: { en: "Self-host", zh: "自托管" },
    pages: [
      pairedPage(
        "deploy/relay-vps",
        {
          source: "docs/deploy/relay-vps.md",
          title: "Deploy the relay",
          description: "Run the signed Stable relay on a VPS and recover it safely.",
        },
        {
          source: "docs/deploy/relay-vps.zh.md",
          title: "部署 relay",
          description: "在 VPS 上运行签名 Stable relay，并安全完成恢复。",
        },
      ),
    ],
  },
  {
    id: "release",
    label: { en: "Install and update", zh: "安装与更新" },
    pages: [
      pairedPage(
        "release/android-apk",
        {
          source: "docs/release/android-apk.md",
          title: "Android APK release and update",
          description: "Android package identities, installation, signing, and self-update.",
        },
        {
          source: "docs/release/android-apk.zh.md",
          title: "Android APK Release 与 update",
          description: "Android package identity、安装、签名和 self-update。",
        },
      ),
      pairedPage(
        "release/cli",
        {
          source: "docs/release/cli.md",
          title: "CLI and daemon artifacts",
          description: "Install, verify, update, and roll back lyntty and lynttyd.",
        },
        {
          source: "docs/release/cli.zh.md",
          title: "CLI 与 daemon artifact",
          description: "安装、验证、更新和回滚 lyntty 与 lynttyd。",
        },
      ),
      pairedPage(
        "release/compatibility-bom",
        {
          source: "docs/release/compatibility-bom.md",
          title: "Compatibility release policy",
          description: "Signed BOM selection, support windows, promotion, and rollback.",
        },
        {
          source: "docs/release/compatibility-bom.zh.md",
          title: "Compatibility Release 政策",
          description: "签名 BOM 选择、支持窗口、promotion 和 rollback。",
        },
      ),
    ],
  },
  {
    id: "troubleshoot",
    label: { en: "Troubleshoot", zh: "故障排查" },
    pages: [
      pairedPage(
        "troubleshooting",
        {
          source: "docs/troubleshooting.md",
          title: "Troubleshooting",
          description: "Resolve relay, daemon, extension, history, APK, and version problems.",
        },
        {
          source: "docs/troubleshooting.zh.md",
          title: "故障排查",
          description: "处理 relay、daemon、extension、history、APK 和版本问题。",
        },
      ),
    ],
  },
  {
    id: "develop",
    label: { en: "Develop", zh: "开发" },
    pages: [
      pairedPage(
        "development",
        {
          source: "docs/development.md",
          title: "Local development",
          description: "Run isolated relay, daemon, App, Preview, and cleanup paths.",
        },
        {
          source: "docs/development.zh.md",
          title: "本地开发",
          description: "运行隔离的 relay、daemon、App、Preview 和清理路径。",
        },
      ),
      pairedPage(
        "quality/ci",
        {
          source: "docs/quality/ci.md",
          title: "CI matrix",
          description: "Required pull-request checks and manual release tiers.",
        },
        {
          source: "docs/quality/ci.zh.md",
          title: "CI matrix",
          description: "Required PR checks 与手动发布层级。",
        },
      ),
    ],
  },
  {
    id: "project",
    label: { en: "Project", zh: "项目" },
    pages: [
      pairedPage(
        "project/privacy",
        {
          source: "PRIVACY.md",
          title: "Privacy policy",
          description: "Data handled by the App, paired node, relay, and push services.",
        },
        {
          source: "PRIVACY.zh.md",
          title: "隐私政策",
          description: "App、配对节点、relay 和 push service 处理的数据。",
        },
      ),
      pairedPage(
        "project/security",
        {
          source: "SECURITY.md",
          title: "Security policy",
          description: "Supported releases, private reporting, redaction, and response expectations.",
        },
        {
          source: "SECURITY.zh.md",
          title: "安全政策",
          description: "支持版本、私密报告、脱敏和响应预期。",
        },
      ),
      pairedPage(
        "project/contributing",
        {
          source: "CONTRIBUTING.md",
          title: "Contributing",
          description: "Fork, develop, verify, and open a focused pull request.",
        },
        {
          source: "CONTRIBUTING.zh.md",
          title: "参与贡献",
          description: "Fork、开发、验证并创建范围清晰的 pull request。",
        },
      ),
    ],
  },
  {
    id: "historical",
    label: { en: "Historical records", zh: "历史记录" },
    pages: [
      pairedPage(
        "roadmap",
        {
          source: "docs/roadmap.md",
          title: "Historical migration roadmap",
          description: "Completed migration roadmap retained for repository history.",
        },
        {
          source: "docs/roadmap.zh.md",
          title: "历史迁移路线图",
          description: "为仓库历史保留的已完成 migration roadmap。",
        },
      ),
      pairedPage(
        "recovered/previous-lyntty-decisions",
        {
          source: "docs/recovered/previous-lyntty-decisions.md",
          title: "Previous Lyntty decisions",
          description: "Recovered historical decisions that do not override current policy.",
        },
        {
          source: "docs/recovered/previous-lyntty-decisions.zh.md",
          title: "历史 Lyntty 决策",
          description: "恢复的历史决策，不覆盖当前政策。",
        },
      ),
    ],
  },
  {
    id: "agents",
    label: { en: "Repository workflow", zh: "仓库工作流" },
    pages: [
      pairedPage(
        "agents/issue-tracker",
        {
          source: "docs/agents/issue-tracker.md",
          title: "Issue tracker",
          description: "GitHub Issues and Beads conventions for maintainers and agents.",
        },
        {
          source: "docs/agents/issue-tracker.zh.md",
          title: "Issue tracker",
          description: "维护者和 agent 使用 GitHub Issues 与 Beads 的约定。",
        },
      ),
      pairedPage(
        "agents/triage-labels",
        {
          source: "docs/agents/triage-labels.md",
          title: "Triage labels",
          description: "Canonical issue labels and routing rules.",
        },
        {
          source: "docs/agents/triage-labels.zh.md",
          title: "Triage labels",
          description: "标准 issue labels 与分流规则。",
        },
      ),
      pairedPage(
        "agents/domain",
        {
          source: "docs/agents/domain.md",
          title: "Domain docs",
          description: "Domain documentation ownership and conventions.",
        },
        {
          source: "docs/agents/domain.zh.md",
          title: "领域文档",
          description: "Domain documentation 的归属和约定。",
        },
      ),
    ],
  },
];

export const sitePages = siteSections.flatMap((section) => section.pages);

function targetForRoute(route: string, locale: SiteLocale): string {
  const suffix = locale === "zh" ? ".zh" : "";
  return route === "index" ? `index${suffix}.mdx` : `${route}${suffix}.mdx`;
}

export function sourcePageRecords() {
  return sitePages.flatMap((page) =>
    (Object.entries(page.locales) as [SiteLocale, LocalizedPage][]).map(
      ([locale, localized]) => ({
        ...localized,
        locale,
        route: page.route,
        target: targetForRoute(page.route, locale),
      }),
    ),
  );
}

export function hasLocalizedRoute(route: string, locale: SiteLocale): boolean {
  const page = sitePages.find((candidate) => candidate.route === route);
  return page?.locales[locale] !== undefined;
}

function localizedRouteUrl(route: string, locale: SiteLocale): string {
  const prefix = locale === "zh" ? "/zh" : "";
  if (route === "index") return prefix || "/";
  return `${prefix}/${route}`;
}

export function alternateLocaleLink(route: string, locale: SiteLocale) {
  const targetLocale: SiteLocale = locale === "en" ? "zh" : "en";
  const hasCounterpart = hasLocalizedRoute(route, targetLocale);
  const targetRoute = hasCounterpart ? route : "index";

  return {
    text:
      targetLocale === "zh"
        ? hasCounterpart
          ? "中文"
          : "中文首页"
        : hasCounterpart
          ? "English"
          : "English home",
    url: localizedRouteUrl(targetRoute, targetLocale),
  };
}

export function staticParamsForLocale(locale: SiteLocale) {
  return sitePages
    .filter((page) => page.locales[locale] !== undefined)
    .map((page) => ({ slug: page.route === "index" ? [] : page.route.split("/") }));
}

export function navigationForLocale(locale: SiteLocale): string[] {
  return siteSections.flatMap((section) => {
    const routes = section.pages
      .filter((page) => page.locales[locale] !== undefined)
      .map((page) => page.route);

    if (routes.length === 0) return [];
    if (section.id === "start") return routes;
    return [`---${section.label[locale]}---`, ...routes];
  });
}
