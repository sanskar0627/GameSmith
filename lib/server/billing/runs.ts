import "server-only";

import { eq } from "drizzle-orm";

import type { ModelSpec } from "@/lib/ai/models";
import { costMicroUsd, MIN_RUN_SPARKS, runBudgetSparks, sparksForCost, type TokenUsage } from "@/lib/billing/pricing";
import { db, type Executor } from "@/lib/db";
import { agentRuns, type AgentRun } from "@/lib/db/schema";
import { resolveRunCredentials } from "@/lib/server/ai/access";
import { requireGameAccessFor } from "@/lib/server/games/access";

import { applyLedger, InsufficientSparksError, lockWallet, runInTransaction } from "./wallet";

/**
 * Reserve, then settle (docs/architecture.md 2.5).
 *
 * `startRun` decides who pays (lib/server/ai/access.ts). For sparks it holds
 * up to one run's budget from the wallet (granted first, then purchased).
 * The worker asks `runAllowance` between agent steps and stops when it is
 * used up. `finishRun` charges what was actually used, at list price, and
 * returns the rest. BYOK runs are recorded with their usage and cost 0 sparks.
 */

export class ModelUnavailableError extends Error {
  constructor(public readonly reason: "needs-key" | "platform-unavailable" | "unknown-model") {
    super("Model unavailable");
    this.name = "ModelUnavailableError";
  }
}

export type StartedRun = { run: AgentRun; apiKey: string; spec: ModelSpec };

export async function startRun(
  input: { userId: string; gameId: string; modelId: string; budgetSparks?: number; now?: Date },
  database: Executor = db(),
): Promise<StartedRun> {
  await requireGameAccessFor(input.gameId, input.userId, "write", database);
  const creds = await resolveRunCredentials(input.userId, input.modelId, database);
  if (creds.mode === "unknown-model") throw new ModelUnavailableError("unknown-model");
  if (creds.mode === "locked") throw new ModelUnavailableError(creds.reason);
  const { spec } = creds;

  if (creds.mode === "byok") {
    const [run] = await database
      .insert(agentRuns)
      .values({
        gameId: input.gameId,
        userId: input.userId,
        modelId: spec.id,
        provider: spec.provider,
        billingMode: "byok",
      })
      .returning();
    return { run, apiKey: creds.apiKey, spec };
  }

  const run = await runInTransaction(database, async (tx) => {
    const wallet = await lockWallet(tx, input.userId, input.now);
    const available = wallet.granted + wallet.purchased;
    const budget = input.budgetSparks ?? runBudgetSparks(spec);
    const hold = Math.min(available, budget);
    if (hold < MIN_RUN_SPARKS) throw new InsufficientSparksError(available);

    const fromGranted = Math.min(wallet.granted, hold);
    const fromPurchased = hold - fromGranted;
    const [created] = await tx
      .insert(agentRuns)
      .values({
        gameId: input.gameId,
        userId: input.userId,
        modelId: spec.id,
        provider: spec.provider,
        billingMode: "credits",
        reservedGranted: fromGranted,
        reservedPurchased: fromPurchased,
      })
      .returning();
    await applyLedger(tx, {
      userId: input.userId,
      reason: "reserve",
      granted: -fromGranted,
      purchased: -fromPurchased,
      key: `run:${created.id}:reserve`,
      runId: created.id,
    });
    return created;
  });
  return { run, apiKey: creds.apiKey, spec };
}

/** Sparks the run may still spend given its usage so far. Infinity for BYOK. */
export function runAllowance(run: AgentRun, spec: ModelSpec, usageSoFar: TokenUsage): number {
  if (run.billingMode === "byok") return Number.POSITIVE_INFINITY;
  const held = run.reservedGranted + run.reservedPurchased;
  return Math.max(0, held - sparksForCost(costMicroUsd(spec, usageSoFar)));
}

/**
 * Ends a run: records usage, charges sparks (never more than the hold) and
 * releases the rest. Safe to call twice: the second call changes nothing.
 */
export async function finishRun(
  input: {
    runId: string;
    spec: ModelSpec;
    usage: TokenUsage;
    outcome: "settled" | "failed" | "canceled";
    error?: string;
    now?: Date;
  },
  database: Executor = db(),
): Promise<AgentRun> {
  return runInTransaction(database, async (tx) => {
    const [current] = await tx.select().from(agentRuns).where(eq(agentRuns.id, input.runId)).for("update").limit(1);
    if (!current) throw new Error("Run not found");
    if (current.status !== "running") return current;

    const cost = costMicroUsd(input.spec, input.usage);
    const fields = {
      status: input.outcome,
      inputTokens: Math.max(0, Math.floor(input.usage.inputTokens)),
      outputTokens: Math.max(0, Math.floor(input.usage.outputTokens)),
      costMicroUsd: cost,
      error: input.error?.slice(0, 2000) ?? null,
      settledAt: input.now ?? new Date(),
    };

    if (current.billingMode === "byok") {
      const [done] = await tx.update(agentRuns).set(fields).where(eq(agentRuns.id, current.id)).returning();
      return done;
    }

    const wallet = await lockWallet(tx, current.userId, input.now);
    const held = current.reservedGranted + current.reservedPurchased;
    const owed = sparksForCost(cost);
    const charge = Math.min(owed, held);
    // Charges come out of the granted part of the hold first.
    const chargedGranted = Math.min(current.reservedGranted, charge);
    const chargedPurchased = charge - chargedGranted;
    let releaseGranted = current.reservedGranted - chargedGranted;
    const releasePurchased = current.reservedPurchased - chargedPurchased;
    // Allowance held from a period that has since ended expires instead of coming back.
    if (current.createdAt < wallet.periodStart) releaseGranted = 0;

    const [done] = await tx
      .update(agentRuns)
      .set({ ...fields, sparksCharged: charge, sparksOverage: owed - charge })
      .where(eq(agentRuns.id, current.id))
      .returning();
    await applyLedger(tx, {
      userId: current.userId,
      reason: "release",
      granted: releaseGranted,
      purchased: releasePurchased,
      key: `run:${current.id}:release`,
      runId: current.id,
      note: `charged ${charge}`,
    });
    return done;
  });
}
