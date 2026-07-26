import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { alternateLocaleLink } from "./site-pages";

export function baseOptions(locale: "en" | "zh", route: string): BaseLayoutProps {
  const localeLink = alternateLocaleLink(route, locale);

  return {
    nav: {
      title: "Lyntty Docs",
    },
    githubUrl: "https://github.com/jczhang02/lyntty",
    links: [
      {
        ...localeLink,
        active: "none",
      },
    ],
  };
}
