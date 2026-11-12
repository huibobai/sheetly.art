import { isSheetId } from "../legal.ts";
import { checkoutProduct, isCheckoutOpen, type CheckoutEnv, type CheckoutGateInput } from "./config.ts";
import type { PaidOrderQuery } from "./orders.ts";

export function downloadAuthDecision(input: {
  permanent: boolean;
  checkoutOpen: boolean;
  paid: boolean;
}):
  | { status: 200; body: { ok: true } }
  | { status: 401; body: { error: string; code: "auth_required" } }
  | { status: 402; body: { error: string; code: "payment_required" } } {
  if (!input.permanent) {
    return { status: 401, body: { error: "Sign in to download this sheet.", code: "auth_required" } };
  }
  // Flag off (and a later pre-launch close) keeps today's free download.
  if (!input.checkoutOpen) {
    return { status: 200, body: { ok: true } };
  }
  if (!input.paid) {
    return { status: 402, body: { error: "Buy this download to unlock the file.", code: "payment_required" } };
  }
  return { status: 200, body: { ok: true } };
}

/**
 * True only when checkout is open and this user has a paid order for the
 * sheet, the configured sku, and the active provider. Returns false without
 * a lookup while checkout is closed, so a closed flag cannot block downloads.
 */
export async function hasPaidForSheet(input: {
  userId: string;
  sheetId: string;
  env?: CheckoutEnv;
  prelaunch?: boolean;
  lookup: (query: PaidOrderQuery) => Promise<boolean>;
}): Promise<boolean> {
  const gate: CheckoutGateInput = { env: input.env, prelaunch: input.prelaunch };
  if (!isCheckoutOpen(gate)) {
    return false;
  }
  if (!isSheetId(input.sheetId)) {
    return false;
  }
  const env = input.env ?? process.env;
  const provider = (env.PAYMENT_PROVIDER ?? "").trim().toLowerCase();
  if (!provider) {
    return false;
  }
  const product = checkoutProduct();
  return input.lookup({
    userId: input.userId,
    sheetId: input.sheetId,
    sku: product.sku,
    provider,
  });
}
