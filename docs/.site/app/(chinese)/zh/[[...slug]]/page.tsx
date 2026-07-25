import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";

import { getMDXComponents } from "@/mdx-components";
import { baseOptions } from "@/lib/layout.shared";
import { staticParamsForLocale } from "@/lib/site-pages";
import { source } from "@/lib/source";

type PageProps = {
  params: Promise<{ slug?: string[] }>;
};

async function getChinesePage(props: PageProps) {
  const { slug = [] } = await props.params;
  return source.getPage(slug, "zh");
}

export default async function Page(props: PageProps) {
  const page = await getChinesePage(props);
  if (!page) notFound();

  const MDX = page.data.body;
  const route = page.slugs.join("/") || "index";

  return (
    <DocsLayout {...baseOptions("zh", route)} tree={source.getPageTree("zh")}>
      <DocsPage toc={page.data.toc}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        <DocsBody>
          <MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  );
}

export function generateStaticParams() {
  return staticParamsForLocale("zh");
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const page = await getChinesePage(props);
  if (!page) notFound();

  const englishUrl = page.url.startsWith("/zh") ? page.url.slice(3) || "/" : page.url;

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      canonical: page.url,
      languages: {
        en: englishUrl,
        "zh-CN": page.url,
      },
    },
  };
}
