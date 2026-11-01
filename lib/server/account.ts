import "server-only";

import { eq } from "drizzle-orm";

import { db, type Database } from "@/lib/db";
import { games } from "@/lib/db/schema";
import { softDeleteUser } from "@/lib/server/users";

import { cancelSubscriptions, destroySandboxes, stopRuns } from "./account-cleanup";

export { AccountDeletionError } from "./account-cleanup";

/**
 * Account deletion, in the order that keeps a half-finished attempt safe:
 * 1. Cancel paid subscriptions (stop charging first; abort if Polar fails).
 * 2. Stop running agents; clear personal fields and keys, take games off
 *    /play and hide them (softDeleteUser, one transaction).
 * 3. Destroy sandboxes, workspaces and snapshots (best effort; the
 *    housekeeping job retries what's left).
 * The caller then deletes the Clerk user. Games rows are purged later by
 * housekeeping (lib/server/housekeeping.ts).
 */

export async function deleteAccountData(userId: string, database: Database = db()) {
  await cancelSubscriptions(userId, database);
  await stopRuns(userId, database);
  // Hides the games and takes them off /play in one go.
  await database.transaction((tx) => softDeleteUser(userId, tx));
  const owned = await database.select({ id: games.id }).from(games).where(eq(games.ownerId, userId));
  const failed = await destroySandboxes(owned.map((g) => g.id));
  return { games: owned.length, sandboxesLeft: failed.length };
}
