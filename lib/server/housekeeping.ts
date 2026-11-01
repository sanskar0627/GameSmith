import "server-only";

import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";

import { db, type Database } from "@/lib/db";
import { games, subscriptions, users } from "@/lib/db/schema";
import { cancelSubscriptions, destroySandboxes } from "@/lib/server/account-cleanup";
import { sweepStaleRuns } from "@/lib/server/agent/service";
import { pruneOrphanBuilds } from "@/lib/server/publish/service";

/**
 * Periodic cleanup, run by the worker (worker/main.mts) every few minutes:
 * - fail agent runs whose worker died, releasing their sparks;
 * - purge games deleted more than GAME_RETENTION_DAYS ago (the library
 *   offers "restore" until then), and at once for deleted accounts:
 *   sandbox, workspace and snapshots first, then the rows (cascades);
 * - cancel subscriptions of accounts deleted from the Clerk dashboard;
 * - drop published builds nothing points at.
 * Every step is idempotent and bounded per pass.
 */

export const GAME_RETENTION_DAYS = 30;
const BATCH = 25;

export type HousekeepingReport = { staleRuns: number; purgedGames: number; canceledSubscriptions: number; prunedBuilds: number };

export async function purgeDeletedGames(database: Database = db(), now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - GAME_RETENTION_DAYS * 24 * 3600_000);
  const due = await database
    .select({ id: games.id })
    .from(games)
    .innerJoin(users, eq(users.id, games.ownerId))
    .where(and(isNotNull(games.deletedAt), or(lt(games.deletedAt, cutoff), isNotNull(users.deletedAt))))
    .limit(BATCH);
  if (due.length === 0) return 0;
  const failed = new Set(await destroySandboxes(due.map((g) => g.id)));
  const done = due.map((g) => g.id).filter((id) => !failed.has(id));
  if (done.length > 0) await database.delete(games).where(inArray(games.id, done));
  return done.length;
}

async function cancelDeletedUsersSubscriptions(database: Database): Promise<number> {
  const rows = await database
    .selectDistinct({ userId: subscriptions.userId })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(and(isNotNull(users.deletedAt), inArray(subscriptions.status, ["active", "trialing", "past_due", "incomplete"])))
    .limit(BATCH);
  let n = 0;
  for (const { userId } of rows) {
    try {
      n += await cancelSubscriptions(userId, database);
    } catch (error) {
      console.error("[housekeeping] canceling subscriptions failed", userId, (error as Error)?.message ?? error);
    }
  }
  return n;
}

export async function runHousekeeping(database: Database = db()): Promise<HousekeepingReport> {
  const step = async (name: string, fn: () => Promise<number>) => {
    try {
      return await fn();
    } catch (error) {
      console.error(`[housekeeping] ${name} failed`, (error as Error)?.message ?? error);
      return 0;
    }
  };
  return {
    staleRuns: await step("stale runs", () => sweepStaleRuns({}, database)),
    purgedGames: await step("purge games", () => purgeDeletedGames(database)),
    canceledSubscriptions: await step("subscriptions", () => cancelDeletedUsersSubscriptions(database)),
    prunedBuilds: await step("builds", () => pruneOrphanBuilds(database)),
  };
}

/** For the runbook: how much is waiting to be purged. */
export async function pendingPurge(database: Database = db()) {
  const [row] = await database.execute<{ n: number }>(sql`select count(*)::int as n from games where deleted_at is not null`);
  return row?.n ?? 0;
}
