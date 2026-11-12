import { randomUUID } from "node:crypto";
import type { CheckoutProduct } from "./config.ts";
import type { NormalizedEventType, NormalizedWebhookEvent, PaymentProvider } from "./provider.ts";

export const ORDER_STATUSES = ["pending", "paid", "failed", "refunded", "expired", "cancelled"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderRecord = {
  id: string;
  userId: string;
  sheetId: string | null;
  sku: string;
  amountCents: number;
  currency: string;
  status: OrderStatus;
  provider: string;
  providerSessionId: string | null;
  providerPaymentId: string | null;
  customerEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaidOrderQuery = {
  userId: string;
  sheetId: string;
  sku: string;
  provider: string;
};

export type ApplyEventResult =
  | { kind: "duplicate" }
  | { kind: "unmatched" }
  | { kind: "unavailable" }
  | { kind: "applied"; order: OrderRecord; previousStatus: OrderStatus };

export interface OrderStore {
  insertPending(order: OrderRecord): Promise<void>;
  findByIdForUser(orderId: string, userId: string): Promise<OrderRecord | null>;
  findPaid(query: PaidOrderQuery): Promise<OrderRecord | null>;
  applyEvent(event: NormalizedWebhookEvent, payload: unknown, providerName: string): Promise<ApplyEventResult>;
}

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Status changes that cannot undo a later state. A second paid event stays paid. */
export function applyStatusTransition(current: OrderStatus, eventType: NormalizedEventType): OrderStatus {
  if (eventType === "paid") {
    return current === "refunded" ? current : "paid";
  }
  if (eventType === "refunded") {
    return current === "paid" || current === "refunded" ? "refunded" : current;
  }
  if (eventType === "failed" || eventType === "expired") {
    return current === "pending" ? eventType : current;
  }
  return current;
}

export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case "pending":
      return "Waiting for payment";
    case "paid":
      return "Paid";
    case "failed":
      return "Payment failed";
    case "refunded":
      return "Refunded";
    case "expired":
      return "Checkout expired";
    case "cancelled":
      return "Cancelled";
  }
}

export class MemoryOrderStore implements OrderStore {
  readonly orders: OrderRecord[] = [];
  readonly events: { key: string; orderId: string; type: string; payload: unknown }[] = [];

  async insertPending(order: OrderRecord): Promise<void> {
    if (this.orders.some((row) => row.id === order.id)) {
      throw new Error("order_exists");
    }
    if (
      order.providerSessionId &&
      this.orders.some((row) => row.provider === order.provider && row.providerSessionId === order.providerSessionId)
    ) {
      throw new Error("session_exists");
    }
    this.orders.push({ ...order });
  }

  async findByIdForUser(orderId: string, userId: string): Promise<OrderRecord | null> {
    const order = this.orders.find((row) => row.id === orderId && row.userId === userId);
    return order ? { ...order } : null;
  }

  async findPaid(query: PaidOrderQuery): Promise<OrderRecord | null> {
    const order = this.orders.find(
      (row) =>
        row.userId === query.userId &&
        row.sheetId === query.sheetId &&
        row.sku === query.sku &&
        row.provider === query.provider &&
        row.status === "paid",
    );
    return order ? { ...order } : null;
  }

  async applyEvent(event: NormalizedWebhookEvent, payload: unknown, providerName: string): Promise<ApplyEventResult> {
    if (this.events.some((row) => row.key === event.id)) {
      return { kind: "duplicate" };
    }
    const order = this.orders.find((row) => row.provider === providerName && row.providerSessionId === event.sessionId);
    if (!order) {
      return { kind: "unmatched" };
    }
    const previousStatus = order.status;
    order.status = applyStatusTransition(order.status, event.type);
    if (event.paymentId) {
      order.providerPaymentId = event.paymentId;
    }
    order.updatedAt = new Date().toISOString();
    this.events.push({ key: event.id, orderId: order.id, type: event.type, payload });
    return { kind: "applied", order: { ...order }, previousStatus };
  }
}

export function newPendingOrder(input: {
  id?: string;
  userId: string;
  sheetId: string;
  product: CheckoutProduct;
  provider: string;
  providerSessionId: string;
  customerEmail: string | null;
  now?: Date;
}): OrderRecord {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: input.id ?? randomUUID(),
    userId: input.userId,
    sheetId: input.sheetId,
    sku: input.product.sku,
    amountCents: input.product.amountCents,
    currency: input.product.currency,
    status: "pending",
    provider: input.provider,
    providerSessionId: input.providerSessionId,
    providerPaymentId: null,
    customerEmail: input.customerEmail,
    createdAt: now,
    updatedAt: now,
  };
}

export async function openProviderSession(input: {
  orderId: string;
  sheetId: string;
  product: CheckoutProduct;
  customerEmail: string | null;
  origin: string;
  provider: PaymentProvider;
}): Promise<{ sessionId: string; redirectUrl: string }> {
  const successUrl = `${input.origin}/checkout/success?order=${encodeURIComponent(input.orderId)}`;
  const cancelUrl = `${input.origin}/checkout/cancel?order=${encodeURIComponent(input.orderId)}&sheet=${encodeURIComponent(input.sheetId)}`;
  return input.provider.createCheckoutSession({
    orderId: input.orderId,
    sku: input.product.sku,
    productName: input.product.name,
    amountCents: input.product.amountCents,
    currency: input.product.currency,
    customerEmail: input.customerEmail,
    successUrl,
    cancelUrl,
  });
}
