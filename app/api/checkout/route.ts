import { connection } from "next/server";
import { checkoutClosedResponse } from "@/lib/checkout/handlers";
import { handlePostCheckout } from "@/lib/checkout/handlers";
import { checkoutRuntimeGate, isCheckoutOpen } from "@/lib/checkout/config";
import { createCheckoutOrderStore } from "@/lib/checkout/store";
import { isSheetId } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";

export const preferredRegion = "dub1";

function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost?.split(",")[0]?.trim() || request.headers.get("host") || url.host;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = forwardedProto?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  await connection();
  const gate = checkoutRuntimeGate();
  if (!isCheckoutOpen(gate)) {
    return checkoutClosedResponse();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let sheetId = "";
  try {
    const body = (await request.clone().json()) as { sheetId?: unknown };
    if (typeof body.sheetId === "string") {
      sheetId = body.sheetId;
    }
  } catch {
    sheetId = "";
  }

  let sheetOwned = false;
  if (user && isSheetId(sheetId)) {
    const { data, error } = await supabase.from("sheets").select("id").eq("id", sheetId).maybeSingle();
    if (error) {
      console.error("[checkout] sheet lookup", error.message);
    }
    sheetOwned = Boolean(data?.id);
  }

  return handlePostCheckout(request, {
    env: gate.env,
    prelaunch: gate.prelaunch,
    user: user ? { id: user.id, email: user.email ?? null, is_anonymous: user.is_anonymous } : null,
    sheetOwned,
    origin: requestOrigin(request),
    store: createCheckoutOrderStore(supabase, gate.env),
  });
}
