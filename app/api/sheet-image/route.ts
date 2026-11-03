import { connection } from "next/server";
import { classifyProxyImageUrl } from "@/lib/image-source";
import { BodyTooLargeError, readBodyWithLimit } from "@/lib/read-limited";
import { createClient } from "@/lib/supabase/server";
import { supabaseUrl } from "@/lib/supabase/env";

const MAX_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

function imageResponse(bytes: Uint8Array | ArrayBuffer, contentType: string) {
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function baseContentType(value: string | null | undefined) {
  return (value ?? "").split(";")[0].trim().toLowerCase();
}

/**
 * Same-origin image loader for the sheet canvas (avoids CORS taint) and for private uploads.
 * Signed-in users only: guests' photos stay in the browser as blob: URLs and never need this route.
 */
export async function GET(request: Request) {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Sign in to load saved images." }, { status: 401 });
  }

  const imageUrl = new URL(request.url).searchParams.get("url");
  if (!imageUrl) {
    return Response.json({ error: "Missing image URL." }, { status: 400 });
  }

  const source = classifyProxyImageUrl(imageUrl, supabaseUrl());
  if (!source) {
    return Response.json({ error: "This image cannot be added to a sheet." }, { status: 400 });
  }

  // Private uploads: download with the caller's session, so the storage policy only allows their own folder.
  if (source.kind === "private") {
    const { data, error } = await supabase.storage.from(source.bucket).download(source.path);
    if (error || !data) {
      return Response.json({ error: "Could not load the sticker image." }, { status: 404 });
    }
    const contentType = baseContentType(data.type);
    if (!contentType.startsWith("image/")) {
      return Response.json({ error: "Could not load the sticker image." }, { status: 415 });
    }
    if (data.size > MAX_BYTES) {
      return Response.json({ error: "That image is too large for a sheet." }, { status: 413 });
    }
    return imageResponse(await data.arrayBuffer(), contentType);
  }

  // Legacy public uploads (rebuilt from our own base URL) and fal CDN results.
  const target =
    source.kind === "legacy-public"
      ? supabase.storage.from(source.bucket).getPublicUrl(source.path).data.publicUrl
      : source.url.toString();

  try {
    const upstream = await fetch(target, {
      redirect: "manual", // never follow redirects to hosts we did not check
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel().catch(() => undefined);
      console.error("sheet-image: upstream redirect refused", new URL(target).hostname, upstream.status);
      return Response.json({ error: "Could not load the sticker image." }, { status: 502 });
    }
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => undefined);
      return Response.json({ error: "Could not load the sticker image." }, { status: 502 });
    }

    const contentType = baseContentType(upstream.headers.get("content-type"));
    if (!contentType.startsWith("image/") || contentType === "image/svg+xml") {
      await upstream.body?.cancel().catch(() => undefined);
      return Response.json({ error: "Could not load the sticker image." }, { status: 415 });
    }

    const bytes = await readBodyWithLimit(upstream.body, MAX_BYTES, upstream.headers.get("content-length"));
    return imageResponse(bytes, contentType);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return Response.json({ error: "That image is too large for a sheet." }, { status: 413 });
    }
    return Response.json({ error: "Could not load the sticker image." }, { status: 502 });
  }
}
