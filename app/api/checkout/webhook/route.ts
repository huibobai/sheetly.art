import { connection } from "next/server";
import { checkoutRuntimeGate, isCheckoutOpen } from "@/lib/checkout/config";
import { checkoutClosedResponse, handlePostWebhook } from "@/lib/checkout/handlers";
import { createCheckoutOrderStore } from "@/lib/checkout/store";
import { createClient } from "@/lib/supabase/server";

export const preferredRegion = "dub1";

export async function POST(request: Request) {
  await connection();
  const gate = checkoutRuntimeGate();
  if (!isCheckoutOpen(gate)) {
    return checkoutClosedResponse();
  }

  const supabase = await createClient();
  return handlePostWebhook(request, {
    env: gate.env,
    prelaunch: gate.prelaunch,
    store: createCheckoutOrderStore(supabase, gate.env),
  });
}
