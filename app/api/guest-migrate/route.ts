import { cookies } from "next/headers";
import { connection } from "next/server";
import { isAnonymousUser, isPermanentUser } from "@/lib/auth-user";
import { moveGuestData } from "@/lib/guest-storage";
import { GUEST_TRANSFER_COOKIE } from "@/lib/guest-migrate";
import { createClient } from "@/lib/supabase/server";
import { looksLikeJwt, userFromAccessToken } from "@/lib/supabase/token";

export const preferredRegion = "dub1";

/**
 * Move the guest's private photos (and any sheet rows) onto the account they
 * just signed in to, when linking could not keep the same user id.
 *
 * Both sessions are checked before anything is copied:
 * - cookie session: permanent user, is_anonymous === false
 * - guest token: anonymous user, from the JSON body (email, same page) or the
 *   httpOnly handoff cookie (Google redirect)
 * The two user ids must differ. Same-id linking is a no-op.
 *
 * See lib/guest-storage.ts for why this does not use a service-role key.
 */
async function readGuestToken(request: Request): Promise<string | null> {
  let bodyToken = "";
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as { guestAccessToken?: unknown };
      bodyToken = typeof body.guestAccessToken === "string" ? body.guestAccessToken : "";
    } catch {
      bodyToken = "";
    }
  }
  const store = await cookies();
  const cookieToken = store.get(GUEST_TRANSFER_COOKIE)?.value ?? "";
  const token = looksLikeJwt(bodyToken) ? bodyToken : looksLikeJwt(cookieToken) ? cookieToken : "";
  return token || null;
}

function clearHandoffCookie() {
  return cookies().then((store) => {
    store.set(GUEST_TRANSFER_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  });
}

export async function POST(request: Request) {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!isPermanentUser(user)) {
    return Response.json({ error: "Sign in before moving these photos." }, { status: 401 });
  }
  if (!session?.access_token || session.user.id !== user.id) {
    return Response.json({ error: "Sign in before moving these photos." }, { status: 401 });
  }

  const guestToken = await readGuestToken(request);
  if (!guestToken) {
    return Response.json({ error: "The guest session has expired. The sheet on this page is still here." }, { status: 401 });
  }
  const guest = await userFromAccessToken(guestToken);
  if (!isAnonymousUser(guest)) {
    await clearHandoffCookie();
    return Response.json({ error: "The guest session has expired. The sheet on this page is still here." }, { status: 401 });
  }
  if (guest.id === user.id) {
    await clearHandoffCookie();
    return Response.json({ ok: true, moved: false, fromId: guest.id, toId: user.id, filesCopied: 0, sheetsCopied: 0 });
  }

  try {
    const moved = await moveGuestData({
      guestToken,
      guestId: guest.id,
      permanentToken: session.access_token,
      permanentId: user.id,
    });
    await clearHandoffCookie();
    return Response.json({
      ok: true,
      moved: true,
      fromId: guest.id,
      toId: user.id,
      filesCopied: moved.filesCopied,
      sheetsCopied: moved.sheetsCopied,
      sheetsNote: moved.sheetsNote,
    });
  } catch (error) {
    console.error("guest-migrate: copy failed", error instanceof Error ? error.name : "error");
    return Response.json(
      { error: "We signed you in, but we couldn't move every photo. This download can still use the sheet on this page." },
      { status: 502 },
    );
  }
}
