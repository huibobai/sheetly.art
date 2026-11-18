/**
 * Pre-launch mode. On until launch day.
 *
 * The switch is `NEXT_PUBLIC_PRELAUNCH_MODE`. A server-only `PRELAUNCH_MODE`
 * is used when the public variable is unset or blank. Unset means ON.
 * Set either value to `false`, `0`, `off`, or `no`, then redeploy. Anything
 * else (including `true`) leaves pre-launch on, so a typo cannot open orders
 * or indexing by accident.
 *
 * `NEXT_PUBLIC_` values are read when the site is built. Changing the flag
 * in the host dashboard does nothing until the next deployment.
 */

export type Env = Record<string, string | undefined>;

export const ROBOTS_TAG = "noindex, nofollow";
export const ORDER_CLOSED_MESSAGE = "Opening soon. Sheetly isn't taking orders yet.";
export const DEFAULT_SITE_ORIGIN = "https://sheetly.art";

const OFF_VALUES = new Set(["false", "0", "off", "no"]);

/** First path segment, or the segment after `/api`, that must not take payment. */
const ORDER_SEGMENTS = new Set([
  "order",
  "orders",
  "checkout",
  "buy",
  "cart",
  "pay",
  "payment",
  "payments",
]);

/** Public URLs a sitemap may list. Included only when that page file exists, except `/`. */
export const SITEMAP_CANDIDATES = ["/terms", "/privacy", "/copyright", "/contact", "/waitlist"] as const;

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function isPrelaunch(env: Env = process.env): boolean {
  const raw = nonEmpty(env.NEXT_PUBLIC_PRELAUNCH_MODE) ?? nonEmpty(env.PRELAUNCH_MODE);
  if (raw === undefined) {
    return true;
  }
  return !OFF_VALUES.has(raw.toLowerCase());
}

/**
 * Call at the start of any future order or checkout handler.
 * Throws while pre-launch is on. There is no payment code yet.
 */
export function assertNotPrelaunch(env: Env = process.env): void {
  if (isPrelaunch(env)) {
    const error = new Error(ORDER_CLOSED_MESSAGE);
    error.name = "PrelaunchBlockedError";
    throw error;
  }
}

export function layoutRobots(prelaunch: boolean): { index: false; follow: false } | undefined {
  if (!prelaunch) {
    return undefined;
  }
  return { index: false, follow: false };
}

export type RobotsFile = {
  rules: { userAgent: string; allow?: string; disallow?: string };
  sitemap?: string;
};

export function robotsFile(prelaunch: boolean, origin: string): RobotsFile {
  if (prelaunch) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${origin}/sitemap.xml`,
  };
}

/** Plain robots.txt body. Tests check this; `app/robots.ts` returns `robotsFile`. */
export function robotsTxt(prelaunch: boolean, origin: string): string {
  const file = robotsFile(prelaunch, origin);
  const lines = [`User-Agent: ${file.rules.userAgent}`];
  if (file.rules.disallow !== undefined) {
    lines.push(`Disallow: ${file.rules.disallow}`);
  }
  if (file.rules.allow !== undefined) {
    lines.push(`Allow: ${file.rules.allow}`);
  }
  if (file.sitemap) {
    lines.push("", `Sitemap: ${file.sitemap}`);
  }
  return `${lines.join("\n")}\n`;
}

export function prelaunchResponseHeaders(prelaunch: boolean): { key: string; value: string }[] {
  if (!prelaunch) {
    return [];
  }
  return [{ key: "X-Robots-Tag", value: ROBOTS_TAG }];
}

export function siteOrigin(env: Env = process.env): string {
  const explicit = nonEmpty(env.NEXT_PUBLIC_SITE_URL) ?? nonEmpty(env.SITE_URL);
  if (explicit) {
    try {
      const url = new URL(explicit);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.origin;
      }
    } catch {
      // A bad site URL falls through to the production host, then the default.
    }
  }
  const production = nonEmpty(env.VERCEL_PROJECT_PRODUCTION_URL);
  if (production) {
    return `https://${production.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }
  const preview = nonEmpty(env.VERCEL_URL);
  if (preview) {
    return `https://${preview.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }
  return DEFAULT_SITE_ORIGIN;
}

export function publicPagePaths(pageExists: (pathname: string) => boolean): string[] {
  const paths = ["/"];
  for (const pathname of SITEMAP_CANDIDATES) {
    if (pageExists(pathname)) {
      paths.push(pathname);
    }
  }
  return paths;
}

export function sitemapEntries(origin: string, pageExists: (pathname: string) => boolean) {
  return publicPagePaths(pageExists).map((pathname) => ({
    url: pathname === "/" ? origin : `${origin}${pathname}`,
    changeFrequency: "monthly" as const,
    priority: pathname === "/" ? 1 : 0.4,
  }));
}

export function isBlockedOrderPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? "";
  const parts = path.split("/").filter(Boolean);
  const head = (parts[0] ?? "").toLowerCase();
  if (head === "api") {
    return ORDER_SEGMENTS.has((parts[1] ?? "").toLowerCase());
  }
  return ORDER_SEGMENTS.has(head);
}
