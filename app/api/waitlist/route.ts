import { connection } from "next/server";
import { resolveGuestIp } from "@/lib/client-ip";
import { isPrelaunch } from "@/lib/launch";
import { createClient } from "@/lib/supabase/server";
import {
  WAITLIST_BAD_REQUEST,
  WAITLIST_CLOSED,
  WAITLIST_DUPLICATE,
  WAITLIST_INVALID_EMAIL,
  WAITLIST_MISSING,
  WAITLIST_NEED_CONSENT,
  WAITLIST_RATE_LIMIT,
  WAITLIST_SAVED,
  WAITLIST_UNAVAILABLE,
  classifyWaitlistQuotaError,
  classifyWaitlistWriteError,
  createWaitlistLimiter,
  honeypotTripped,
  interpretWaitlistQuota,
  normalizeWaitlistEmail,
  parseWaitlistSource,
  waitlistLimitsFromEnv,
  type WaitlistLimitDecision,
} from "@/lib/waitlist";

export const maxDuration = 15;

const MAX_BODY_CHARS = 4_000;
const limiter = createWaitlistLimiter();

function json(body: Record<string, unknown>, status: number, headers?: Record<string, string>) {
  return Response.json(body, { status, headers });
}

function rateLimited(decision: Extract<WaitlistLimitDecision, { allowed: false }>) {
  return json({ ok: false, message: WAITLIST_RATE_LIMIT }, 429, {
    "Retry-After": String(decision.retryAfterSeconds),
  });
}

function saved() {
  return json({ ok: true, message: WAITLIST_SAVED }, 200);
}

async function readRecord(request: Request): Promise<Record<string, unknown> | "too-large" | "bad"> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_CHARS) {
    return "too-large";
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return "bad";
  }
  if (text.length > MAX_BODY_CHARS) {
    return "too-large";
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return "bad";
    }
    return parsed as Record<string, unknown>;
  } catch {
    return "bad";
  }
}

// Stores the address. This route does not send email.
export async function POST(request: Request) {
  await connection();

  if (!isPrelaunch()) {
    return json({ ok: false, message: WAITLIST_CLOSED }, 404);
  }

  const record = await readRecord(request);
  if (record === "too-large") {
    return json({ ok: false, message: WAITLIST_BAD_REQUEST }, 413);
  }
  if (record === "bad") {
    return json({ ok: false, message: WAITLIST_INVALID_EMAIL }, 400);
  }

  const trapped = honeypotTripped(record.fax_number);
  let email = "";
  let source: "homepage" | "waitlist" = "homepage";
  if (!trapped) {
    const normalized = normalizeWaitlistEmail(record.email);
    if (!normalized) {
      return json({ ok: false, message: WAITLIST_INVALID_EMAIL }, 400);
    }
    if (record.consent !== true) {
      return json({ ok: false, message: WAITLIST_NEED_CONSENT }, 400);
    }
    const parsedSource = parseWaitlistSource(record.source);
    if (!parsedSource) {
      return json({ ok: false, message: WAITLIST_BAD_REQUEST }, 400);
    }
    email = normalized;
    source = parsedSource;
  }

  const ip = resolveGuestIp(request.headers, process.env.NODE_ENV);
  if (!ip) {
    return trapped ? saved() : json({ ok: false, message: WAITLIST_UNAVAILABLE }, 503);
  }

  const limits = waitlistLimitsFromEnv(process.env);
  const local = limiter.consume(ip, Date.now(), limits);
  if (!local.allowed) {
    return trapped ? saved() : rateLimited(local);
  }

  const supabase = await createClient();
  const quota = await supabase.rpc("consume_waitlist_ip_quota", {
    p_ip: ip,
    p_minute_limit: limits.perMinute,
    p_daily_limit: limits.perDay,
  });

  if (quota.error) {
    if (classifyWaitlistQuotaError(quota.error) === "unavailable") {
      console.error("waitlist: quota check failed", quota.error.message);
      return trapped ? saved() : json({ ok: false, message: WAITLIST_UNAVAILABLE }, 503);
    }
    // Function not installed yet. The in-process limiter above still applies.
  } else {
    const decision = interpretWaitlistQuota(quota.data);
    if (!decision.allowed) {
      if (decision.reason === "unavailable") {
        return trapped ? saved() : json({ ok: false, message: WAITLIST_UNAVAILABLE }, 503);
      }
      return trapped ? saved() : rateLimited(decision);
    }
  }

  if (trapped) {
    return saved();
  }

  const { error } = await supabase.from("waitlist").insert({
    email,
    source,
    consent: true,
  });

  if (!error) {
    return saved();
  }

  const kind = classifyWaitlistWriteError(error);
  if (kind === "duplicate") {
    return json({ ok: true, message: WAITLIST_DUPLICATE }, 200);
  }
  if (kind === "missing") {
    console.error("waitlist: table is not installed", error.message);
    return json({ ok: false, message: WAITLIST_MISSING }, 503);
  }
  console.error("waitlist: insert failed", error.message);
  return json({ ok: false, message: WAITLIST_UNAVAILABLE }, 503);
}
