import "server-only";

import type { WebhookEvent } from "@clerk/nextjs/server";

import { db, type Database } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";
import { profileFromUserJSON, softDeleteUser, upsertUser } from "@/lib/server/users";

export type ClerkWebhookResult = "processed" | "duplicate" | "ignored";

/**
 * Applies a verified Clerk event exactly once. The delivery id and the
 * change are written in one transaction, so a failure leaves nothing
 * recorded and Clerk's retry processes the event again.
 */
export async function handleClerkEvent(
  deliveryId: string,
  event: WebhookEvent,
  database: Database = db(),
): Promise<ClerkWebhookResult> {
  if (event.type !== "user.created" && event.type !== "user.updated" && event.type !== "user.deleted") {
    return "ignored";
  }

  return database.transaction(async (tx) => {
    const inserted = await tx
      .insert(webhookEvents)
      .values({ id: deliveryId, source: "clerk", type: event.type })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    if (inserted.length === 0) return "duplicate";

    if (event.type === "user.deleted") {
      if (event.data.id) await softDeleteUser(event.data.id, tx);
    } else {
      await upsertUser(profileFromUserJSON(event.data), tx);
    }
    return "processed";
  });
}
