import { fal } from "@fal-ai/client";
import { connection } from "next/server";
import { interpretQuotaResult, quotaLimitsFromEnv, quotaMessage } from "@/lib/generation-quota";
import { generateSourceFor, isFalMediaHost, type StorageRef } from "@/lib/image-source";
import { isStickerStyle, STYLE_PROMPTS } from "@/lib/sticker-styles";
import { createClient } from "@/lib/supabase/server";
import { supabaseUrl } from "@/lib/supabase/env";

export const maxDuration = 60;

/** fal fetches the photo through this signed URL, so it only needs to live for one generation. */
const SIGNED_URL_SECONDS = 600;

const GENERIC_ERROR = "Could not style this photo. Please try again.";
const UNAVAILABLE_ERROR = "AI styles are unavailable right now. Please try again later, or use the Photo style.";

type GenerateBody = {
  imageUrl?: unknown;
  style?: unknown;
};

function json(body: Record<string, unknown>, status: number, headers?: Record<string, string>) {
  return Response.json(body, { status, headers });
}

function isFalOutputUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && isFalMediaHost(url.hostname);
  } catch {
    return false;
  }
}

async function urlForFal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  source: StorageRef,
): Promise<string | null> {
  if (source.kind === "legacy-public") {
    // Uploaded before PR1 to the public bucket; the object is already publicly readable.
    return supabase.storage.from(source.bucket).getPublicUrl(source.path).data.publicUrl;
  }
  // Signed with the caller's session, so the storage policy also checks ownership.
  const { data, error } = await supabase.storage.from(source.bucket).createSignedUrl(source.path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("generate: could not sign upload", error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function POST(request: Request) {
  await connection();

  // 1. Signed-in users only. Guests can preview with the Photo style, which never calls this route.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return json({ error: "Sign in to use AI styles.", code: "auth_required" }, 401);
  }

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return json({ error: "Choose an uploaded photo and a sticker style." }, 400);
  }

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const style = typeof body.style === "string" ? body.style : "";

  // 2. Only this project's storage: the caller's own private upload, or a legacy public upload.
  const source = imageUrl ? generateSourceFor(imageUrl, supabaseUrl(), user.id) : null;
  if (!source || !isStickerStyle(style)) {
    return json({ error: "Choose an uploaded photo and a sticker style." }, 400);
  }

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    console.error("generate: FAL_KEY is not set");
    return json({ error: UNAVAILABLE_ERROR }, 503);
  }

  // 3. Short-lived URL fal can fetch (signed before the quota so a missing photo costs nothing).
  const falImageUrl = await urlForFal(supabase, source);
  if (!falImageUrl) {
    return json({ error: "That photo could not be found. Remove it and add it again." }, 400);
  }

  // 4. Per-user quota (rolling minute + rolling 24 h), counted in the database.
  const limits = quotaLimitsFromEnv(process.env);
  const { data: quotaData, error: quotaError } = await supabase.rpc("consume_generation_quota", {
    p_daily_limit: limits.perDay,
    p_minute_limit: limits.perMinute,
  });
  if (quotaError) {
    console.error("generate: quota check failed", quotaError.message);
  }
  const decision = quotaError ? ({ allowed: false, reason: "unavailable" } as const) : interpretQuotaResult(quotaData);
  if (!decision.allowed) {
    if (decision.reason === "unavailable") {
      return json({ error: UNAVAILABLE_ERROR }, 503);
    }
    return json(
      { error: quotaMessage(decision), code: decision.reason === "minute" ? "rate_limited" : "daily_limit" },
      429,
      { "Retry-After": String(decision.retryAfterSeconds) },
    );
  }

  fal.config({ credentials: falKey });

  try {
    const result = await fal.subscribe("fal-ai/flux-pro/kontext", {
      input: {
        prompt: STYLE_PROMPTS[style],
        image_url: falImageUrl,
        num_images: 1,
        output_format: "png",
        enhance_prompt: false,
        guidance_scale: 4,
      },
      // Do not keep inputs/outputs in fal's request history (default is 90 days).
      // https://fal.ai/docs/documentation/model-apis/media-expiration
      // X-Fal-Object-Lifecycle-Preference is intentionally NOT set yet: saved sheets still point at the
      // fal CDN URL, so a short expiry would break them. Set it once results are copied to our own bucket.
      headers: { "X-Fal-Store-IO": "0" },
    });

    const generatedUrl = result.data.images[0]?.url;
    if (!isFalOutputUrl(generatedUrl)) {
      console.error("generate: fal returned no image or an unexpected host");
      return json({ error: GENERIC_ERROR }, 502);
    }

    return json({ imageUrl: generatedUrl }, 200);
  } catch (error) {
    // Log the provider detail on the server only; users get a neutral message.
    const status = error && typeof error === "object" && "status" in error ? (error as { status?: unknown }).status : undefined;
    const detail =
      error && typeof error === "object" && "body" in error
        ? (error as { body?: { detail?: unknown } }).body?.detail
        : undefined;
    console.error("generate: fal request failed", { status, detail });

    if (typeof detail === "string" && /exhausted balance|insufficient|billing/i.test(detail)) {
      return json({ error: UNAVAILABLE_ERROR }, 503);
    }
    return json({ error: GENERIC_ERROR }, 502);
  }
}
