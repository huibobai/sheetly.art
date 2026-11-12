import { isPermanentUser } from "@/lib/auth-user";
import { checkoutRuntimeGate } from "@/lib/checkout/config";
import { hasPaidForSheet } from "@/lib/checkout/entitlement";
import type { OrderRecord } from "@/lib/checkout/orders";
import { createCheckoutOrderStore } from "@/lib/checkout/store";
import { isSheetId } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";

export async function ownOrder(orderId: string): Promise<OrderRecord | null> {
  if (!isSheetId(orderId)) {
    return null;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }
  const store = createCheckoutOrderStore(supabase);
  return store.findByIdForUser(orderId, user.id);
}

/** The sheet id when this signed-in user has a paid order for it. Otherwise null. */
export async function paidSheetIdForCurrentUser(sheetId: string): Promise<string | null> {
  if (!isSheetId(sheetId)) {
    return null;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isPermanentUser(user)) {
    return null;
  }
  const store = createCheckoutOrderStore(supabase);
  const gate = checkoutRuntimeGate();
  const paid = await hasPaidForSheet({
    userId: user.id,
    sheetId,
    env: gate.env,
    prelaunch: gate.prelaunch,
    lookup: async (query) => (await store.findPaid(query)) !== null,
  });
  return paid ? sheetId : null;
}
