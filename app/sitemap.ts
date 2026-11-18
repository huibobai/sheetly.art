import fs from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { sitemapEntries, siteOrigin } from "@/lib/launch";

function pageExists(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }
  const segment = pathname.slice(1);
  if (!/^[a-z0-9-]+$/.test(segment)) {
    return false;
  }
  const dir = path.join(process.cwd(), "app", segment);
  return fs.existsSync(path.join(dir, "page.tsx")) || fs.existsSync(path.join(dir, "page.ts"));
}

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(siteOrigin(), pageExists);
}
