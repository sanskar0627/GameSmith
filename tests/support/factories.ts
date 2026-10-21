import { db } from "@/lib/db";
import { games, users, type NewGame } from "@/lib/db/schema";

export async function createUser(id: string, fields: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await db()
    .insert(users)
    .values({ id, email: `${id}@example.com`, name: id, ...fields })
    .returning();
  return row;
}

export async function createGame(ownerId: string, fields: Partial<NewGame> = {}) {
  const [row] = await db()
    .insert(games)
    .values({ ownerId, title: "Floating Islands", ...fields })
    .returning();
  return row;
}
