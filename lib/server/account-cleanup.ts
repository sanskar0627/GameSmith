import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db, type Database } from "@/lib/db";
import { agentRuns, subscriptions } from "@/lib/db/schema";
import { runBus } from "@/lib/server/agent/queue";
import { PaymentsNotConfiguredError, polar } from "@/lib/server/billing/polar";
import { runSandbox, sandboxesConfigured } from "@/lib/server/sandbox/service";

/**
 * Cleanup steps shared by account deletion (lib/server/account.ts) and
 * housekeeping. Kept free of request-only imports (Clerk, next/navigation)
 * so the worker can load it.
 */

export class AccountDeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountDeletionError";
  }
}

const LIVE_SUBSCRIPTION = ["active", "trialing", "past_due", "incomplete"];

export async function cancelSubscriptions(userId: string, database: Database = db()) {
  const live = await database
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, LIVE_SUBSCRIPTION)));
  if (live.length === 0) return 0;
  let client;
  try {
    client = polar();
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError) return 0;
    throw error;
  }
  for (const sub of live) {
    try {
      await client.subscriptions.revoke(sub.id);
    } catch (error) {
      console.error("[account] revoking subscription failed", sub.id, (error as Error)?.message ?? error);
      throw new AccountDeletionError("We couldn't cancel your subscription. Nothing was deleted. Try again in a minute.");
    }
    await database.update(subscriptions).set({ status: "canceled" }).where(eq(subscriptions.id, sub.id));
  }
  return live.length;
}

/** Stops a user's running agents (each settles its sparks as it stops). */
export async function stopRuns(userId: string, database: Database) {
  const running = await database
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), eq(agentRuns.status, "running")));
  await Promise.all(running.map((r) => runBus().cancel(r.id).catch(() => {})));
}

/** Removes sandboxes, workspaces and snapshots. Returns the ids it could not remove. */
export async function destroySandboxes(gameIds: string[]): Promise<string[]> {
  if (!sandboxesConfigured() || gameIds.length === 0) return [];
  const sandbox = runSandbox();
  const failed: string[] = [];
  for (const id of gameIds) {
    try {
      await sandbox.destroy(id);
    } catch (error) {
      console.error("[account] destroying sandbox failed", id, (error as Error)?.message ?? error);
      failed.push(id);
    }
  }
  return failed;
}

