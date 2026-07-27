import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();
const siteRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  trailingSlash: true,
  basePath: "/lyntty",
  assetPrefix: "/lyntty/",
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: siteRoot,
  },
  experimental: {
    globalNotFound: true,
  },
  reactStrictMode: true,
};

export default withMDX(config);
