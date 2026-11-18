import type { MetadataRoute } from "next";
import { isPrelaunch, robotsFile, siteOrigin } from "@/lib/launch";

export default function robots(): MetadataRoute.Robots {
  return robotsFile(isPrelaunch(), siteOrigin());
}
