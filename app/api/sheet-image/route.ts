import { connection } from "next/server";

const MAX_BYTES = 20 * 1024 * 1024;

function isAllowedImageHost(hostname: string) {
  return (
    hostname === "fal.media" ||
    hostname.endsWith(".fal.media") ||
    hostname.endsWith(".fal.ai") ||
    hostname.endsWith(".supabase.co")
  );
}

export async function GET(request: Request) {
  await connection();

  const imageUrl = new URL(request.url).searchParams.get("url");
  if (!imageUrl) {
    return Response.json({ error: "Missing image URL." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return Response.json({ error: "Invalid image URL." }, { status: 400 });
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !isAllowedImageHost(parsed.hostname)) {
    return Response.json({ error: "This image cannot be added to a sheet." }, { status: 400 });
  }

  parsed.hash = "";

  try {
    const upstream = await fetch(parsed);
    if (!upstream.ok) {
      return Response.json({ error: "Could not load the sticker image." }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type")?.split(";")[0] ?? "";
    if (!contentType.startsWith("image/")) {
      return Response.json({ error: "Could not load the sticker image." }, { status: 415 });
    }

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return Response.json({ error: "That image is too large for a sheet." }, { status: 413 });
    }

    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "Could not load the sticker image." }, { status: 502 });
  }
}
