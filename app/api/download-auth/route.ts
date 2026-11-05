import { connection } from "next/server";
import { isPermanentUser } from "@/lib/auth-user";
import { createClient } from "@/lib/supabase/server";

export const preferredRegion = "dub1";

/**
 * The print file is built in the browser. This route is the server-side gate:
 * the download proceeds only when Auth says the session is a permanent user
 * (`is_anonymous === false`). An anonymous guest gets 401.
 */
export async function POST() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isPermanentUser(user)) {
    return Response.json({ error: "Sign in to download this sheet.", code: "auth_required" }, { status: 401 });
  }
  return Response.json({ ok: true });
}
