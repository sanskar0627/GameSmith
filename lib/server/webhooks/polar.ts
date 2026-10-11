import "server-only";

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import { db, type Database, type Transaction } from "@/lib/db";
import { purchases, subscriptions, users, webhookEvents } from "@/lib/db/schema";
import { applyLedger, endPaidPlan, lockWallet, startPaidPeriod } from "@/lib/server/billing/wallet";
import { offerForProduct } from "@/lib/server/billing/polar";

/**
 * Applies a verified Polar webhook. Runs in one transaction with the
 * webhook_events insert, so a redelivered event changes nothing. Orders are
 * also unique in `purchases`, and every ledger write has its own key.
 *
 * Events for unknown users or products are acknowledged and ignored.
 */

export type PolarWebhookResult = "processed" | "duplicate" | "ignored";

// Only the fields GameSmith relies on. The SDK types are not runtime checks.
const customer = z.object({ external_id: z.string().nullish() });
const order = z.object({
  id: z.string(),
  product_id: z.string().nullish(),
  billing_reason: z.string(),
  total_amount: z.number().int(),
  refunded_amount: z.number().int().default(0),
  currency: z.string(),
  customer,
  subscription: z.object({ current_period_end: z.string().nullish() }).nullish(),
});
const subscription = z.object({
  id: z.string(),
  status: z.string(),
  product_id: z.string(),
  current_period_end: z.string().nullish(),
  cancel_at_period_end: z.boolean().default(false),
  customer,
});

const ACTIVE = ["active", "trialing", "past_due"];

export async function handlePolarEvent(
  deliveryId: string,
  event: { type: string; data: unknown },
  database: Database = db(),
): Promise<PolarWebhookResult> {
  return database.transaction(async (tx) => {
    const inserted = await tx
      .insert(webhookEvents)
      .values({ id: `polar:${deliveryId}`, source: "polar", type: event.type })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    if (inserted.length === 0) return "duplicate";

    switch (event.type) {
      case "order.paid":
        return onOrderPaid(tx, order.parse(event.data));
      case "order.refunded":
        return onOrderRefunded(tx, order.parse(event.data));
      case "subscription.created":
      case "subscription.active":
      case "subscription.updated":
      case "subscription.canceled":
      case "subscription.uncanceled":
      case "subscription.past_due":
        return onSubscriptionChanged(tx, subscription.parse(event.data));
      case "subscription.revoked":
        return onSubscriptionRevoked(tx, subscription.parse(event.data));
      default:
        return "ignored";
    }
  });
}

async function liveUser(tx: Transaction, externalId: string | null | undefined): Promise<string | null> {
  if (!externalId) return null;
  const [row] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, externalId), isNull(users.deletedAt)))
    .limit(1);
  return row?.id ?? null;
}

async function onOrderPaid(tx: Transaction, data: z.infer<typeof order>): Promise<PolarWebhookResult> {
  const userId = await liveUser(tx, data.customer.external_id);
  const offer = offerForProduct(data.product_id);
  if (!userId || !offer) return "ignored";

  const [purchase] = await tx
    .insert(purchases)
    .values({
      userId,
      externalId: data.id,
      kind: offer.kind,
      offer: offer.id,
      amount: data.total_amount,
      currency: data.currency,
      sparks: offer.sparks,
    })
    .onConflictDoNothing()
    .returning();
  if (!purchase) return "duplicate";

  if (offer.kind === "pack") {
    await lockWallet(tx, userId);
    await applyLedger(tx, {
      userId,
      reason: "purchase",
      purchased: offer.sparks,
      key: `order:${data.id}`,
      purchaseId: purchase.id,
    });
  } else {
    const end = data.subscription?.current_period_end;
    await startPaidPeriod(tx, {
      userId,
      plan: offer.id,
      orderId: data.id,
      periodEnd: end ? new Date(end) : new Date(Date.now() + 31 * 86_400_000),
    });
  }
  return "processed";
}

/**
 * A pack refund takes back the refunded share of its sparks, as far as the
 * pack balance allows (sparks already spent can't be taken back). Plan
 * refunds only mark the payment; Polar revokes the subscription separately.
 */
async function onOrderRefunded(tx: Transaction, data: z.infer<typeof order>): Promise<PolarWebhookResult> {
  const [purchase] = await tx
    .select()
    .from(purchases)
    .where(and(eq(purchases.provider, "polar"), eq(purchases.externalId, data.id)))
    .limit(1);
  if (!purchase) return "ignored";

  const fully = data.refunded_amount >= data.total_amount;
  if (purchase.kind === "pack" && data.total_amount > 0) {
    const wallet = await lockWallet(tx, purchase.userId);
    const share = Math.min(1, data.refunded_amount / data.total_amount);
    const back = Math.min(wallet.purchased, Math.floor(purchase.sparks * share));
    await applyLedger(tx, {
      userId: purchase.userId,
      reason: "refund",
      purchased: -back,
      key: `refund:${data.id}:${data.refunded_amount}`,
      purchaseId: purchase.id,
    });
  }
  if (fully) await tx.update(purchases).set({ status: "refunded" }).where(eq(purchases.id, purchase.id));
  return "processed";
}

async function onSubscriptionChanged(
  tx: Transaction,
  data: z.infer<typeof subscription>,
): Promise<PolarWebhookResult> {
  const userId = await liveUser(tx, data.customer.external_id);
  const offer = offerForProduct(data.product_id);
  if (!userId || !offer || offer.kind !== "subscription") return "ignored";

  const fields = {
    plan: offer.id,
    status: data.status,
    currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end) : null,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  };
  await tx
    .insert(subscriptions)
    .values({ id: data.id, userId, ...fields })
    .onConflictDoUpdate({ target: subscriptions.id, set: fields });
  // Plan changes take effect here; sparks arrive with the paid order.
  if (ACTIVE.includes(data.status)) await tx.update(users).set({ plan: offer.id }).where(eq(users.id, userId));
  return "processed";
}

async function onSubscriptionRevoked(
  tx: Transaction,
  data: z.infer<typeof subscription>,
): Promise<PolarWebhookResult> {
  const userId = await liveUser(tx, data.customer.external_id);
  if (!userId) return "ignored";
  await tx
    .update(subscriptions)
    .set({ status: data.status, cancelAtPeriodEnd: false })
    .where(eq(subscriptions.id, data.id));
  const [other] = await tx
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), ne(subscriptions.id, data.id), inArray(subscriptions.status, ACTIVE)))
    .limit(1);
  if (!other) await endPaidPlan(tx, userId, `revoke:${data.id}`);
  return "processed";
}
