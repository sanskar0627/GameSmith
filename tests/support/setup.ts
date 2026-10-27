import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";

import { db } from "@/lib/db";

// Every test starts from empty tables.
beforeEach(async () => {
  await db().execute(sql`truncate table users, games, game_versions, messages, webhook_events, provider_keys cascade`);
});

afterAll(async () => {
  await db().$client.end();
});
