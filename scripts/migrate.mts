/**
 * Applies pending SQL migrations from ./drizzle (production and CI).
 *
 *   node --import tsx scripts/migrate.mts
 *
 * Same migrations and bookkeeping table as `npm run db:migrate`
 * (drizzle-kit), without needing drizzle-kit at runtime. Takes an advisory
 * lock so two deploys can't migrate at once.
 */
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await client`select pg_advisory_lock(727274)`;
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("[migrate] database is up to date");
} catch (error) {
  console.error("[migrate] failed", error);
  process.exitCode = 1;
} finally {
  await client`select pg_advisory_unlock(727274)`.catch(() => {});
  await client.end();
}
