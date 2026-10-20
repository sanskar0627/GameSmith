import "server-only";

import { currentUser, type UserJSON } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { cache } from "react";

import { requireUser } from "@/lib/auth";
import { db, type Executor } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";

/** The subset of a Clerk user that GameSmith stores. */
export type UserProfile = {
  id: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
};

function joinName(first: string | null | undefined, last: string | null | undefined) {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || null;
}

/** Maps a Clerk webhook payload (`user.created` / `user.updated`). */
export function profileFromUserJSON(data: UserJSON): UserProfile {
  const primary =
    data.email_addresses.find((e) => e.id === data.primary_email_address_id) ?? data.email_addresses[0];
  return {
    id: data.id,
    email: primary?.email_address ?? null,
    name: joinName(data.first_name, data.last_name) ?? data.username ?? null,
    imageUrl: data.image_url || null,
  };
}

type ClerkBackendUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

/** Maps the Clerk backend `User` object returned by `currentUser()`. */
export function profileFromClerkUser(user: ClerkBackendUser): UserProfile {
  const primary = user.primaryEmailAddress ?? user.emailAddresses[0];
  return {
    id: user.id,
    email: primary?.emailAddress ?? null,
    name: joinName(user.firstName, user.lastName) ?? user.username ?? null,
    imageUrl: user.imageUrl || null,
  };
}

/**
 * Creates or refreshes a user row. Never revives a deleted user: a late
 * `user.updated` delivery after `user.deleted` is ignored.
 */
export async function upsertUser(profile: UserProfile, database: Executor = db()): Promise<void> {
  const fields = { email: profile.email, name: profile.name, imageUrl: profile.imageUrl };
  await database
    .insert(users)
    .values({ id: profile.id, ...fields })
    .onConflictDoUpdate({
      target: users.id,
      set: { ...fields, updatedAt: new Date() },
      setWhere: isNull(users.deletedAt),
    });
}

/** Marks a user deleted and clears personal fields. Their games are kept for now. */
export async function softDeleteUser(id: string, database: Executor = db()): Promise<void> {
  await database
    .update(users)
    .set({ email: null, name: null, imageUrl: null, deletedAt: new Date() })
    .where(and(eq(users.id, id), isNull(users.deletedAt)));
}

export async function getUserById(id: string, database: Executor = db()): Promise<User | null> {
  const [row] = await database.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

/**
 * The signed-in user's row, created on first visit if the Clerk webhook has
 * not delivered yet (or cannot reach this machine, as in local development).
 * Cached per request.
 */
export const ensureUser = cache(async (): Promise<User> => {
  const { userId } = await requireUser();
  const existing = await getUserById(userId);
  if (existing) return existing;

  const clerkUser = await currentUser();
  if (!clerkUser || clerkUser.id !== userId) {
    throw new Error("Signed-in user could not be loaded from Clerk");
  }
  await upsertUser(profileFromClerkUser(clerkUser));
  const created = await getUserById(userId);
  if (!created) throw new Error("User row was not created");
  return created;
});
