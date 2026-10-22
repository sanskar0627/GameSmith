import postgres from "postgres";
import { describe, expect, it } from "vitest";

import { createDb } from "@/lib/db";
import { explainDbError } from "@/lib/db/errors";
import { sql } from "drizzle-orm";

describe("explainDbError", () => {
  it("explains a refused connection", async () => {
    // Port 1 is never a Postgres server.
    const db = createDb("postgres://u:p@127.0.0.1:1/none", { max: 1 });
    const error = await db.execute(sql`select 1`).catch((e: unknown) => e);
    await db.$client.end();
    expect(String(explainDbError(error))).toMatch(/npm run db:up/);
  });

  it("explains missing tables (migrations not run)", async () => {
    const client = postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
    const error = await client`select * from table_that_does_not_exist`.catch((e: unknown) => e);
    await client.end();
    expect(String(explainDbError(error))).toMatch(/npm run db:migrate/);
  });

  it("passes other errors through unchanged", () => {
    const original = new Error("boom");
    expect(explainDbError(original)).toBe(original);
  });
});
