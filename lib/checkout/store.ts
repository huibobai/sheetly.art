/**
 * Order persistence.
 *
 * Creating a pending order uses the signed-in user's session. RLS allows
 * that insert and a select of the caller's own rows. It does not allow
 * status changes.
 *
 * A provider webhook has no user session, so status updates need
 * SUPABASE_SERVICE_ROLE_KEY. Until that key exists, PAYMENT_PROVIDER=mock
 * can record the caller's own mock order through record_mock_checkout_event.
 * That function refuses every row whose provider is not mock.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CheckoutEnv } from "./config.ts";
import {
  applyStatusTransition,
  isOrderStatus,
  type ApplyEventResult,
  type OrderRecord,
  type OrderStore,
  type PaidOrderQuery,
} from "./orders.ts";
import type { NormalizedWebhookEvent } from "./provider.ts";

const ORDER_COLUMNS =
  "id, user_id, sheet_id, sku, amount_cents, currency, status, provider, provider_session_id, provider_payment_id, customer_email, created_at, updated_at";

export function createServiceRoleClient(env: CheckoutEnv = process.env): SupabaseClient | null {
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!key || !url) {
    return null;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function orderFromRow(row: unknown): OrderRecord | null {
  if (!row || typeof row !== "object") {
    return null;
  }
  const value = row as Record<string, unknown>;
  const status = asString(value.status);
  const id = asString(value.id);
  const userId = asString(value.user_id);
  const sku = asString(value.sku);
  const currency = asString(value.currency);
  const provider = asString(value.provider);
  if (!id || !userId || !sku || !currency || !provider || !status || !isOrderStatus(status)) {
    return null;
  }
  const amount = value.amount_cents;
  if (typeof amount !== "number" || !Number.isInteger(amount)) {
    return null;
  }
  return {
    id,
    userId,
    sheetId: asString(value.sheet_id),
    sku,
    amountCents: amount,
    currency,
    status,
    provider,
    providerSessionId: asString(value.provider_session_id),
    providerPaymentId: asString(value.provider_payment_id),
    customerEmail: asString(value.customer_email),
    createdAt: asString(value.created_at) ?? "",
    updatedAt: asString(value.updated_at) ?? "",
  };
}

export function createCheckoutOrderStore(userClient: SupabaseClient, env: CheckoutEnv = process.env): OrderStore {
  const service = createServiceRoleClient(env);

  return {
    async insertPending(order: OrderRecord): Promise<void> {
      const { error } = await userClient.from("orders").insert({
        id: order.id,
        user_id: order.userId,
        sheet_id: order.sheetId,
        sku: order.sku,
        amount_cents: order.amountCents,
        currency: order.currency,
        provider: order.provider,
        provider_session_id: order.providerSessionId,
        customer_email: order.customerEmail,
      });
      if (error) {
        throw new Error(error.message);
      }
    },

    async findByIdForUser(orderId: string, userId: string): Promise<OrderRecord | null> {
      const { data, error } = await userClient
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("id", orderId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      return orderFromRow(data);
    },

    async findPaid(query: PaidOrderQuery): Promise<OrderRecord | null> {
      const { data, error } = await userClient
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("user_id", query.userId)
        .eq("sheet_id", query.sheetId)
        .eq("sku", query.sku)
        .eq("provider", query.provider)
        .eq("status", "paid")
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      return orderFromRow(data);
    },

    applyEvent(event, payload, providerName) {
      if (service) {
        return applyWithService(service, event, payload, providerName);
      }
      if (providerName === "mock") {
        return applyWithMockRpc(userClient, event, payload);
      }
      return Promise.resolve({ kind: "unavailable" });
    },
  };
}

async function applyWithService(
  service: SupabaseClient,
  event: NormalizedWebhookEvent,
  payload: unknown,
  providerName: string,
): Promise<ApplyEventResult> {
  const existing = await service.from("order_events").select("id").eq("idempotency_key", event.id).maybeSingle();
  if (existing.error) {
    console.error("[checkout] order event lookup", existing.error.message);
    return { kind: "unavailable" };
  }
  if (existing.data) {
    return { kind: "duplicate" };
  }

  const found = await service
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("provider", providerName)
    .eq("provider_session_id", event.sessionId)
    .maybeSingle();
  if (found.error) {
    console.error("[checkout] order lookup", found.error.message);
    return { kind: "unavailable" };
  }
  const order = orderFromRow(found.data);
  if (!order) {
    return { kind: "unmatched" };
  }

  const previousStatus = order.status;
  const status = applyStatusTransition(order.status, event.type);
  const inserted = await service.from("order_events").insert({
    order_id: order.id,
    provider: providerName,
    event_type: event.type,
    idempotency_key: event.id,
    payload,
  });
  if (inserted.error?.code === "23505") {
    return { kind: "duplicate" };
  }
  if (inserted.error) {
    console.error("[checkout] order event", inserted.error.message);
    return { kind: "unavailable" };
  }

  const updated = await service
    .from("orders")
    .update({
      status,
      provider_payment_id: event.paymentId ?? order.providerPaymentId,
    })
    .eq("id", order.id)
    .select(ORDER_COLUMNS)
    .maybeSingle();
  if (updated.error || !updated.data) {
    console.error("[checkout] order update", updated.error?.message ?? "missing row");
    return { kind: "unavailable" };
  }
  const next = orderFromRow(updated.data);
  if (!next) {
    return { kind: "unavailable" };
  }
  return { kind: "applied", order: next, previousStatus };
}

async function applyWithMockRpc(
  userClient: SupabaseClient,
  event: NormalizedWebhookEvent,
  payload: unknown,
): Promise<ApplyEventResult> {
  const found = await userClient
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("provider", "mock")
    .eq("provider_session_id", event.sessionId)
    .maybeSingle();
  if (found.error) {
    console.error("[checkout] mock order lookup", found.error.message);
    return { kind: "unavailable" };
  }
  const order = orderFromRow(found.data);
  if (!order) {
    const {
      data: { user },
    } = await userClient.auth.getUser();
    // No session means this is a provider webhook. Status writes then need
    // the service-role key; do not pretend the order is missing.
    if (!user) {
      return { kind: "unavailable" };
    }
    return { kind: "unmatched" };
  }

  const { data, error } = await userClient.rpc("record_mock_checkout_event", {
    p_order_id: order.id,
    p_event_id: event.id,
    p_event_type: event.type,
    p_payment_id: event.paymentId,
    p_payload: payload ?? {},
  });
  if (error) {
    console.error("[checkout] mock event", error.message);
    if (error.message.includes("order_not_found")) {
      return { kind: "unmatched" };
    }
    return { kind: "unavailable" };
  }

  const body = data as { duplicate?: boolean } | null;
  if (body?.duplicate) {
    return { kind: "duplicate" };
  }

  const reread = await userClient
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", order.id)
    .eq("user_id", order.userId)
    .maybeSingle();
  if (reread.error || !reread.data) {
    console.error("[checkout] mock reread", reread.error?.message ?? "missing row");
    return { kind: "unavailable" };
  }
  const updated = orderFromRow(reread.data);
  if (!updated) {
    return { kind: "unavailable" };
  }
  return { kind: "applied", order: updated, previousStatus: order.status };
}
