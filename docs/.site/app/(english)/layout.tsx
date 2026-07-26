import type { ReactNode } from "react";

import { RootDocument, siteMetadata } from "../root-layout.shared";
import "../global.css";

export const metadata = siteMetadata;

export default function EnglishRootLayout({ children }: { children: ReactNode }) {
  return <RootDocument language="en">{children}</RootDocument>;
}
