import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(locale: "en" | "zh"): BaseLayoutProps {
  return {
    nav: {
      title: "Lyntty Docs",
    },
    githubUrl: "https://github.com/jczhang02/lyntty",
    links: [
      {
        text: locale === "zh" ? "English" : "中文",
        url: locale === "zh" ? "/" : "/zh",
        active: "none",
      },
    ],
  };
}
