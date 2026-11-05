import { cookies } from "next/headers";
import { connection } from "next/server";
import { isAnonymousUser } from "@/lib/auth-user";
import { GUEST_TRANSFER_COOKIE } from "@/lib/guest-migrate";
import { looksLikeJwt, userFromAccessToken } from "@/lib/supabase/token";

export const preferredRegion = "dub1";

const TEN_MINUTES = 60 * 10;

/**
 * Stash the anonymous access token in an httpOnly cookie before Google redirects
 * away. The sheet snapshot in sessionStorage stores paths only, never this token.
 * The cookie is short-lived and is cleared by /api/guest-migrate.
 */
export async function POST(request: Request) {
  await connection();
  let token = "";
  try {
    const body = (await request.json()) as { guestAccessToken?: unknown };
    token = typeof body.guestAccessToken === "string" ? body.guestAccessToken : "";
  } catch {
    token = "";
  }
  if (!looksLikeJwt(token)) {
    return Response.json({ error: "That guest session isn't usable." }, { status: 400 });
  }

  const user = await userFromAccessToken(token);
  if (!isAnonymousUser(user)) {
    return Response.json({ error: "That guest session isn't usable." }, { status: 401 });
  }

  const store = await cookies();
  store.set(GUEST_TRANSFER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TEN_MINUTES,
  });
  return Response.json({ ok: true });
}
