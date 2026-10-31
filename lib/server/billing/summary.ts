import "server-only";

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import type { PaymentRow, UsageSummary } from "@/lib/billing/types";
import { PACKS, PLANS } from "@/lib/billing/pricing";
import { db, type Executor } from "@/lib/db";
import { agentRuns, games, purchases, subscriptions, users } from "@/lib/db/schema";

import { getWallet } from "./wallet";

/** The billing page and sidebar meter, from the wallet and this period's runs. */
export async function getUsageSummary(userId: string, database: Executor = db(), now = new Date()): Promise<UsageSummary> {
  const wallet = await getWallet(userId, database, now);
  const [[user], held, byGame, [sub]] = await Promise.all([
    database.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1),
    database
      .select({
        granted: sql<number>`coalesce(sum(${agentRuns.reservedGranted}), 0)::int`,
        purchased: sql<number>`coalesce(sum(${agentRuns.reservedPurchased}), 0)::int`,
      })
      .from(agentRuns)
      .where(and(eq(agentRuns.userId, userId), eq(agentRuns.status, "running"))),
    database
      .select({
        gameId: agentRuns.gameId,
        title: games.title,
        sparks: sql<number>`sum(${agentRuns.sparksCharged})::int`,
      })
      .from(agentRuns)
      .innerJoin(games, eq(games.id, agentRuns.gameId))
      .where(and(eq(agentRuns.userId, userId), gte(agentRuns.createdAt, wallet.periodStart)))
      .groupBy(agentRuns.gameId, games.title)
      .having(sql`sum(${agentRuns.sparksCharged}) > 0`)
      .orderBy(desc(sql`sum(${agentRuns.sparksCharged})`))
      .limit(8),
    database
      .select({ cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ["active", "trialing", "past_due"])))
      .limit(1),
  ]);
  const heldGranted = held[0]?.granted ?? 0;
  const heldPurchased = held[0]?.purchased ?? 0;
  return {
    plan: user?.plan ?? "free",
    used: Math.max(0, wallet.allowance - wallet.granted - heldGranted),
    allowance: wallet.allowance,
    granted: wallet.granted,
    purchased: wallet.purchased,
    reserved: heldGranted + heldPurchased,
    resetsAt: wallet.periodEnd.toISOString(),
    cancelsAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    byGame,
  };
}

const OFFER_NAMES = new Map<string, string>([
  ...PLANS.map((p) => [p.id, `${p.name} plan`] as const),
  ...PACKS.map((p) => [p.id, p.name] as const),
]);

export async function listPayments(userId: string, database: Executor = db()): Promise<PaymentRow[]> {
  const rows = await database
    .select()
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .orderBy(desc(purchases.createdAt))
    .limit(20);
  return rows.map((p) => ({
    id: p.id,
    description: OFFER_NAMES.get(p.offer) ?? p.offer,
    amount: p.amount,
    currency: p.currency,
    sparks: p.sparks,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  }));
}
