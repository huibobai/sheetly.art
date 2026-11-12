import { connection } from "next/server";
import { isPermanentUser } from "@/lib/auth-user";
import { checkoutRuntimeGate, isCheckoutOpen } from "@/lib/checkout/config";
import { downloadAuthDecision, hasPaidForSheet } from "@/lib/checkout/entitlement";
import { createCheckoutOrderStore } from "@/lib/checkout/store";
import { createClient } from "@/lib/supabase/server";

export const preferredRegion = "dub1";

/**
 * The print file is built in the browser. This route is the server-side gate:
 * the download proceeds only when Auth says the session is a permanent user
 * (`is_anonymous === false`). An anonymous guest gets 401.
 *
 * While checkout is closed, that is the whole check. While it is open, a paid
 * order for the sheet is also required.
 */
export async function POST(request: Request) {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const gate = checkoutRuntimeGate();
  const checkoutOpen = isCheckoutOpen(gate);
  const permanent = isPermanentUser(user);

  if (!checkoutOpen || !permanent) {
    const decision = downloadAuthDecision({ permanent, checkoutOpen, paid: false });
    return Response.json(decision.body, { status: decision.status });
  }

  let sheetId = "";
  try {
    const body = (await request.json()) as { sheetId?: unknown };
    if (typeof body.sheetId === "string") {
      sheetId = body.sheetId;
    }
  } catch {
    sheetId = "";
  }

  const store = createCheckoutOrderStore(supabase, gate.env);
  let paid = false;
  try {
    paid = await hasPaidForSheet({
      userId: user.id,
      sheetId,
      env: gate.env,
      prelaunch: gate.prelaunch,
      lookup: async (query) => (await store.findPaid(query)) !== null,
    });
  } catch (error) {
    console.error("[checkout] download entitlement", error);
    paid = false;
  }

  const decision = downloadAuthDecision({ permanent: true, checkoutOpen: true, paid });
  return Response.json(decision.body, { status: decision.status });
}
