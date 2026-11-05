import { fal } from "@fal-ai/client";
import { connection } from "next/server";
import { resolveGuestIp } from "@/lib/client-ip";
import { isGuestDailyCap, interpretQuotaResult, quotaLimitsFromEnv, quotaMessage, quotaRpcArgs, GUEST_LIMIT_CODE } from "@/lib/generation-quota";
import { generateSourceFor, isFalMediaHost, type StorageRef } from "@/lib/image-source";
import { isStickerStyle, STYLE_PROMPTS } from "@/lib/sticker-styles";
import { createClient } from "@/lib/supabase/server";
import { supabaseUrl } from "@/lib/supabase/env";

export const maxDuration = 60;

// Dublin, next to Supabase. Next.js 16 still forwards this export and warns that it is deprecated.
// vercel.json also sets this route's region, which is what Vercel uses for Node.js functions.
export const preferredRegion = "dub1";

/** fal fetches the photo through this signed URL, so it only needs to live for one generation. */
const SIGNED_URL_SECONDS = 600;

const GENERIC_ERROR = "We couldn't style this photo. Please try again.";
const UNAVAILABLE_ERROR = "AI styles aren't available right now. Please try again later, or use the Photo style.";

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

  // 1. A session is required. Anonymous guests count: they are authenticated users
  // with is_anonymous true, and the quota function gives them the guest caps.
  // A visitor with no session at all still has to sign in.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return json({ error: "Sign in to use AI styles.", code: "auth_required" }, 401);
  }
  const anonymous = user.is_anonymous === true;

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return json({ error: "Pick an uploaded photo and a sticker style." }, 400);
  }

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const style = typeof body.style === "string" ? body.style : "";

  // 2. Only this project's storage: the caller's own private upload, or a legacy public upload.
  const source = imageUrl ? generateSourceFor(imageUrl, supabaseUrl(), user.id) : null;
  if (!source || !isStickerStyle(style)) {
    return json({ error: "Pick an uploaded photo and a sticker style." }, 400);
  }

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    console.error("generate: FAL_KEY is not set");
    return json({ error: UNAVAILABLE_ERROR }, 503);
  }

  // 3. Sign a short-lived URL and check the quota together. The URL is not saved.
  // The quota function runs once. If it says no, we stop before fal.
  // A missing photo is still a 400, checked before the quota result.
  // Because these run together, a missing photo can use one quota slot. It does not call fal.
  const limits = quotaLimitsFromEnv(process.env);
  // Signed-in calls pass a null IP. The SQL function also ignores IP caps unless
  // the JWT says is_anonymous, so a guest cannot be given the signed-in daily cap
  // by omitting the guest argument, and a missing IP fails closed for guests.
  const guestIp = anonymous ? resolveGuestIp(request.headers, process.env.NODE_ENV) : null;
  const [falImageUrl, quotaResult] = await Promise.all([
    urlForFal(supabase, source),
    supabase.rpc("consume_generation_quota", quotaRpcArgs(anonymous, limits, guestIp)),
  ]);
  if (!falImageUrl) {
    return json({ error: "We can't find that photo. Remove it and add it again." }, 400);
  }

  // 4. Quota (rolling minute + rolling 24 h), counted in the database.
  // Guests also hit per-IP caps. Signed-in limits are the same numbers as before.
  const { data: quotaData, error: quotaError } = quotaResult;
  if (quotaError) {
    console.error("generate: quota check failed", quotaError.message);
  }
  const decision = quotaError ? ({ allowed: false, reason: "unavailable" } as const) : interpretQuotaResult(quotaData);
  if (!decision.allowed) {
    if (decision.reason === "unavailable") {
      return json({ error: UNAVAILABLE_ERROR }, 503);
    }
    const code = isGuestDailyCap(decision.reason)
      ? GUEST_LIMIT_CODE
      : decision.reason === "daily"
        ? "daily_limit"
        : "rate_limited";
    return json(
      { error: quotaMessage(decision), code },
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
      // Poll the queue every 200 ms instead of the client default of 500 ms, so a finished
      // image is picked up sooner (about 150 ms saved on average, same model and inputs).
      pollInterval: 200,
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
