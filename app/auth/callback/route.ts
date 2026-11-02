import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function publicOrigin(request: Request) {
  const url = new URL(request.url);
  if (process.env.NODE_ENV !== "production") {
    return url.origin;
  }

  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (host && /^[A-Za-z0-9.-]+(?::\d+)?$/.test(host)) {
    return `${proto === "http" ? "http" : "https"}://${host}`;
  }

  return url.origin;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const origin = publicOrigin(request);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, origin));
    }
  }

  return NextResponse.redirect(new URL("/?auth=error", origin));
}
