import { createHmac, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/polar/route";
import { db } from "@/lib/db";
import { purchases, sparkLedger, subscriptions, users, wallets } from "@/lib/db/schema";
import { getWallet } from "@/lib/server/billing/wallet";

import { createUser, ledgerMatchesWallet } from "./support/factories";

// Signed exactly as Polar signs (Standard Webhooks), so the SDK's real
// verification runs. The secret is the test one from vitest.config.mts.
const SECRET = process.env.POLAR_WEBHOOK_SECRET!;

function deliver(event: object, opts: { id?: string; secret?: string; tamper?: boolean; age?: number } = {}) {
  const id = opts.id ?? `msg_${randomBytes(8).toString("hex")}`;
  const timestamp = Math.floor(Date.now() / 1000 - (opts.age ?? 0)).toString();
  const body = JSON.stringify(event);
  const key = Buffer.from((opts.secret ?? SECRET).replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return POST(
    new Request("http://localhost/api/webhooks/polar", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": `v1,${signature}`,
      },
      body: opts.tamper ? body.replace("prod_pack_5k", "prod_pack_25k") : body,
    }),
  );
}

const order = (fields: Record<string, unknown> = {}) => ({
  type: "order.paid",
  timestamp: new Date().toISOString(),
  api_version: "2026-10",
  data: {
    id: `ord_${randomBytes(6).toString("hex")}`,
    status: "paid",
    paid: true,
    billing_reason: "purchase",
    total_amount: 500,
    refunded_amount: 0,
    currency: "usd",
    product_id: "prod_pack_5k",
    customer: { id: "cus_1", external_id: "user_a" },
    subscription: null,
    ...fields,
  },
});

const sub = (type: string, fields: Record<string, unknown> = {}) => ({
  type,
  timestamp: new Date().toISOString(),
  api_version: "2026-10",
  data: {
    id: "sub_1",
    status: "active",
    product_id: "prod_forge",
    current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    cancel_at_period_end: false,
    customer: { id: "cus_1", external_id: "user_a" },
    ...fields,
  },
});

async function walletOf(userId: string) {
  const [w] = await db().select().from(wallets).where(eq(wallets.userId, userId));
  return w;
}

async function planOf(userId: string) {
  const [u] = await db().select({ plan: users.plan }).from(users).where(eq(users.id, userId));
  return u.plan;
}

describe("Polar webhook", () => {
  it("rejects bad, tampered and stale signatures without touching anything", async () => {
    await createUser("user_a");
    expect((await deliver(order(), { secret: `whsec_${randomBytes(24).toString("base64")}` })).status).toBe(403);
    expect((await deliver(order(), { tamper: true })).status).toBe(403);
    expect((await deliver(order(), { age: 3600 })).status).toBe(403);
    expect(await db().select().from(purchases)).toHaveLength(0);
  });

  it("a first-time payer who never used the free plan just gets the paid allowance", async () => {
    await createUser("user_a");
    await deliver(sub("subscription.active"));
    await deliver(order({ billing_reason: "subscription_create", product_id: "prod_forge", total_amount: 2000 }));
    expect(await walletOf("user_a")).toMatchObject({ granted: 20_000, purchased: 0 });
    expect(await ledgerMatchesWallet("user_a")).toBe(true);
  });

  it("credits a pack once, however often it is delivered", async () => {
    await createUser("user_a");
    const event = order();
    const first = await deliver(event, { id: "msg_same" });
    expect(first.status).toBe(202);
    expect(await first.json()).toMatchObject({ result: "processed" });
    // Same delivery retried, and the same order sent as a new delivery.
    expect(await (await deliver(event, { id: "msg_same" })).json()).toMatchObject({ result: "duplicate" });
    expect(await (await deliver(event, { id: "msg_other" })).json()).toMatchObject({ result: "duplicate" });

    expect(await walletOf("user_a")).toMatchObject({ purchased: 5000, granted: 2000 });
    expect(await db().select().from(purchases)).toHaveLength(1);
    expect(await ledgerMatchesWallet("user_a")).toBe(true);
  });

  it("starts a paid plan from the subscription's first order", async () => {
    await createUser("user_a");
    await getWallet("user_a"); // had been using the free plan
    const end = new Date(Date.now() + 30 * 86_400_000).toISOString();
    await deliver(sub("subscription.active"));
    expect(await planOf("user_a")).toBe("forge");
    await deliver(
      order({
        billing_reason: "subscription_create",
        product_id: "prod_forge",
        total_amount: 2000,
        subscription: { id: "sub_1", current_period_end: end },
      }),
    );
    const wallet = await walletOf("user_a");
    expect(wallet).toMatchObject({ granted: 20_000, allowance: 20_000 });
    expect(wallet.periodEnd.toISOString()).toBe(end);
    // The free allowance it replaced was expired, not stacked.
    const expired = await db().select().from(sparkLedger).where(eq(sparkLedger.reason, "expire"));
    expect(expired.map((r) => r.grantedDelta)).toEqual([-2000]);
    expect(await ledgerMatchesWallet("user_a")).toBe(true);
  });

  it("goes back to the free plan when the subscription is revoked", async () => {
    await createUser("user_a");
    await getWallet("user_a");
    await deliver(sub("subscription.active"));
    await deliver(order({ billing_reason: "subscription_create", product_id: "prod_forge", total_amount: 2000 }));
    await deliver(sub("subscription.canceled", { cancel_at_period_end: true }));
    const [row] = await db().select().from(subscriptions);
    expect(row.cancelAtPeriodEnd).toBe(true);
    expect(await planOf("user_a")).toBe("forge");

    await deliver(sub("subscription.revoked", { status: "canceled" }));
    expect(await planOf("user_a")).toBe("free");
    // Free allowance was already granted this month, so not again; the plan allowance expired.
    expect(await walletOf("user_a")).toMatchObject({ granted: 0, allowance: 2000 });
    expect(await ledgerMatchesWallet("user_a")).toBe(true);
  });

  it("takes back refunded pack sparks, never below zero", async () => {
    await createUser("user_a");
    const paid = order();
    await deliver(paid);
    await db().update(wallets).set({ purchased: 1000 }).where(eq(wallets.userId, "user_a"));
    await db().insert(sparkLedger).values({
      userId: "user_a",
      reason: "adjust",
      purchasedDelta: -4000,
      idempotencyKey: "test:spent",
    });
    await deliver({ ...paid, type: "order.refunded", data: { ...paid.data, refunded_amount: 500 } });
    expect((await walletOf("user_a")).purchased).toBe(0);
    const [purchase] = await db().select().from(purchases);
    expect(purchase.status).toBe("refunded");
    expect(await ledgerMatchesWallet("user_a")).toBe(true);
  });

  it("ignores products it doesn't sell and customers it doesn't know", async () => {
    await createUser("user_a");
    expect(await (await deliver(order({ product_id: "prod_other" }))).json()).toMatchObject({ result: "ignored" });
    expect(
      await (await deliver(order({ customer: { id: "cus_x", external_id: "user_nobody" } }))).json(),
    ).toMatchObject({ result: "ignored" });
    expect(await (await deliver({ type: "customer.updated", timestamp: "", api_version: "", data: {} })).json()).toMatchObject({
      result: "ignored",
    });
    expect(await db().select().from(purchases)).toHaveLength(0);
  });

  it("fails loudly (500, so Polar retries) when a payload is missing fields it needs", async () => {
    await createUser("user_a");
    const res = await deliver({ type: "order.paid", timestamp: "", api_version: "", data: { id: "ord_broken" } });
    expect(res.status).toBe(500);
    // Nothing half-written: the delivery can be retried.
    expect(await db().select().from(purchases)).toHaveLength(0);
  });
});
