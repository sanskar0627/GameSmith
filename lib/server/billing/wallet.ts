import "server-only";

import { and, eq, gt, inArray, sql } from "drizzle-orm";

import { planAllowance } from "@/lib/billing/pricing";
import type { PlanId } from "@/lib/billing/types";
import { db, type Database, type Executor, type Transaction } from "@/lib/db";
import { sparkLedger, subscriptions, users, wallets, type Wallet } from "@/lib/db/schema";

/**
 * Wallet and ledger primitives. Every balance change goes through
 * `applyLedger`, which writes the ledger row and the wallet update together
 * and does nothing if the idempotency key was already used. Callers hold the
 * wallet row lock (`lockWallet`) for the whole transaction, so concurrent
 * spends are serialized per user and can never overdraw (the table's
 * `>= 0` checks are the last line of defence).
 */

type LedgerReason = (typeof sparkLedger.$inferInsert)["reason"];

export class InsufficientSparksError extends Error {
  constructor(public readonly available: number) {
    super("Not enough sparks");
    this.name = "InsufficientSparksError";
  }
}

/** Calendar month (UTC) containing `now`: the free plan's allowance period. */
export function monthBounds(now: Date): { start: Date; end: Date; key: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end, key: start.toISOString().slice(0, 7) };
}

export async function applyLedger(
  tx: Transaction,
  entry: {
    userId: string;
    reason: LedgerReason;
    granted?: number;
    purchased?: number;
    key: string;
    runId?: string;
    purchaseId?: string;
    note?: string;
  },
): Promise<boolean> {
  const granted = entry.granted ?? 0;
  const purchased = entry.purchased ?? 0;
  const inserted = await tx
    .insert(sparkLedger)
    .values({
      userId: entry.userId,
      reason: entry.reason,
      grantedDelta: granted,
      purchasedDelta: purchased,
      idempotencyKey: entry.key,
      runId: entry.runId,
      purchaseId: entry.purchaseId,
      note: entry.note,
    })
    .onConflictDoNothing({ target: sparkLedger.idempotencyKey })
    .returning({ id: sparkLedger.id });
  if (inserted.length === 0) return false;
  if (granted !== 0 || purchased !== 0) {
    await tx
      .update(wallets)
      .set({
        granted: sql`${wallets.granted} + ${granted}`,
        purchased: sql`${wallets.purchased} + ${purchased}`,
      })
      .where(eq(wallets.userId, entry.userId));
  }
  return true;
}

async function planOf(tx: Transaction, userId: string): Promise<PlanId> {
  const [row] = await tx.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.plan ?? "free";
}

/** Gives the free allowance for the month containing `now`, at most once per month. */
async function startFreePeriod(tx: Transaction, userId: string, now: Date) {
  const month = monthBounds(now);
  const allowance = planAllowance("free");
  await tx
    .update(wallets)
    .set({ allowance, periodStart: month.start, periodEnd: month.end })
    .where(eq(wallets.userId, userId));
  await applyLedger(tx, { userId, reason: "grant", granted: allowance, key: `grant:free:${userId}:${month.key}` });
}

/** Expires what is left of the current allowance. */
export async function expireAllowance(tx: Transaction, wallet: Wallet, key: string) {
  if (wallet.granted > 0) {
    await applyLedger(tx, { userId: wallet.userId, reason: "expire", granted: -wallet.granted, key });
  }
}

/**
 * Locks the user's wallet row for this transaction, creating it (with the
 * free allowance) on first use and rolling it into a new period when the
 * old one has ended.
 */
export async function lockWallet(tx: Transaction, userId: string, now = new Date()): Promise<Wallet> {
  let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).for("update").limit(1);
  if (!wallet) {
    const month = monthBounds(now);
    await tx
      .insert(wallets)
      .values({ userId, allowance: 0, periodStart: month.start, periodEnd: month.end })
      .onConflictDoNothing();
    [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).for("update").limit(1);
    await startFreePeriodOrPaid(tx, wallet, now);
    [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    return wallet;
  }
  if (now >= wallet.periodEnd) {
    await expireAllowance(tx, wallet, `expire:${userId}:${wallet.periodEnd.toISOString()}`);
    await startFreePeriodOrPaid(tx, wallet, now);
    [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  }
  return wallet;
}

/**
 * New period after the old one ended. Paid plans are granted by the renewal
 * order webhook, so here they only move the period to the subscription's
 * current one; without an active subscription the user is on the free plan.
 */
async function startFreePeriodOrPaid(tx: Transaction, wallet: Wallet, now: Date) {
  const plan = await planOf(tx, wallet.userId);
  if (plan !== "free") {
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, wallet.userId),
          inArray(subscriptions.status, ["active", "trialing", "past_due"]),
          gt(subscriptions.currentPeriodEnd, now),
        ),
      )
      .limit(1);
    if (sub?.currentPeriodEnd) {
      await tx
        .update(wallets)
        .set({ periodStart: now, periodEnd: sub.currentPeriodEnd })
        .where(eq(wallets.userId, wallet.userId));
      return;
    }
    await tx.update(users).set({ plan: "free" }).where(eq(users.id, wallet.userId));
  }
  await startFreePeriod(tx, wallet.userId, now);
}

/**
 * A paid plan's period starts (first payment or renewal): leftover allowance
 * expires and the plan's full allowance is granted. Idempotent per order.
 */
export async function startPaidPeriod(
  tx: Transaction,
  input: { userId: string; plan: Exclude<PlanId, "free">; orderId: string; periodEnd: Date; now?: Date },
) {
  const now = input.now ?? new Date();
  const key = `grant:order:${input.orderId}`;
  const wallet = await lockWallet(tx, input.userId, now);
  // The wallet lock serializes this check with any other change for the user.
  if (await ledgerKeyExists(tx, key)) return;

  await tx.update(users).set({ plan: input.plan }).where(eq(users.id, input.userId));
  await expireAllowance(tx, wallet, `expire:order:${input.orderId}`);
  const allowance = planAllowance(input.plan);
  await tx
    .update(wallets)
    .set({ allowance, periodStart: now, periodEnd: input.periodEnd > now ? input.periodEnd : addMonth(now) })
    .where(eq(wallets.userId, input.userId));
  await applyLedger(tx, { userId: input.userId, reason: "grant", granted: allowance, key });
}

async function ledgerKeyExists(tx: Transaction, key: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: sparkLedger.id })
    .from(sparkLedger)
    .where(eq(sparkLedger.idempotencyKey, key))
    .limit(1);
  return !!row;
}

/** The paid plan ended: back to the free plan, starting now. */
export async function endPaidPlan(tx: Transaction, userId: string, key: string, now = new Date()) {
  const wallet = await lockWallet(tx, userId, now);
  await tx.update(users).set({ plan: "free" }).where(eq(users.id, userId));
  await expireAllowance(tx, wallet, `expire:${key}`);
  await startFreePeriod(tx, userId, now);
}

function addMonth(date: Date): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

/** Current wallet (rolled into the current period if needed). */
export async function getWallet(userId: string, database: Executor = db(), now = new Date()): Promise<Wallet> {
  return runInTransaction(database, (tx) => lockWallet(tx, userId, now));
}

/** Runs `fn` in a transaction (a savepoint when `database` is already one). */
export function runInTransaction<T>(database: Executor, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return (database as Database).transaction(fn);
}
