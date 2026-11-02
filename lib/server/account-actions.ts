"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { AccountDeletionError, deleteAccountData } from "@/lib/server/account";
import { reportError } from "@/lib/server/report";

/** Server actions for the signed-in user's account. */

export type AccountActionResult = { ok: true } | { ok: false; error: string };

export async function deleteAccountAction(confirm: string): Promise<AccountActionResult> {
  const { userId } = await requireApiUser();
  if (confirm.trim().toLowerCase() !== "delete my account") return { ok: false, error: "Type the confirmation exactly." };
  try {
    await deleteAccountData(userId);
  } catch (error) {
    if (error instanceof AccountDeletionError) return { ok: false, error: error.message };
    console.error("[account] deletion failed", error);
    void reportError(error, { where: "deleteAccount" });
    return { ok: false, error: "Something went wrong. Nothing more was deleted. Try again." };
  }
  try {
    // Signs the user out everywhere; the user.deleted webhook is then a no-op.
    await (await clerkClient()).users.deleteUser(userId);
  } catch (error) {
    // The data is already gone; the login is what's left. Log it for a manual cleanup.
    console.error("[account] deleting the Clerk user failed", userId, error);
    void reportError(error, { where: "deleteClerkUser" });
  }
  return { ok: true };
}

/** The first-run welcome was seen: never show it again on any device. */
export async function markWelcomedAction(): Promise<void> {
  const { userId } = await requireApiUser();
  await db().update(users).set({ welcomedAt: new Date() }).where(eq(users.id, userId));
}
