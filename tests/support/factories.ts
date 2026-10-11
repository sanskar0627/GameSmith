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

/** Asserts the billing invariant: ledger sums equal wallet balances. */
export async function ledgerMatchesWallet(userId: string) {
  const { sql } = await import("drizzle-orm");
  const rows = await db().execute<{ granted: number; purchased: number; wg: number; wp: number }>(sql`
    select coalesce(sum(l.granted_delta), 0)::int as granted, coalesce(sum(l.purchased_delta), 0)::int as purchased,
           w.granted as wg, w.purchased as wp
    from wallets w left join spark_ledger l on l.user_id = w.user_id
    where w.user_id = ${userId} group by w.granted, w.purchased`);
  const row = rows[0];
  return row ? row.granted === row.wg && row.purchased === row.wp : false;
}
