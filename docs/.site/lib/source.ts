import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";

import { i18n } from "./i18n";

function pageUrl(slugs: string[], locale?: string): string {
  const path = slugs.join("/");

  if (locale === "zh") {
    return path ? `/zh/${path}` : "/zh";
  }

  return path ? `/${path}` : "/";
}

export const source = loader(docs.toFumadocsSource(), {
  i18n,
  baseUrl: "",
  url: pageUrl,
});
