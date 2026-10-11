import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { serverEnv } from "@/lib/env";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql };

/** A transaction handle, as passed to `db().transaction(async (tx) => ...)`. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Anything that can run queries: the pool or an open transaction. */
export type Executor = Database | Transaction;

/** Creates a Drizzle client over its own connection pool. */
export function createDb(url: string, options: { max?: number } = {}): Database {
  const client = postgres(url, {
    max: options.max ?? 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // Keep Postgres NOTICE messages (e.g. "relation already exists") out of app logs.
    onnotice: () => {},
  });
  return drizzle(client, { schema });
}

// One pool per server process. In development, Next re-evaluates modules on
// every edit, so the pool lives on globalThis to avoid leaking connections.
const globalForDb = globalThis as unknown as { __gamesmithDb?: Database };

/** The app's database client. Connects lazily on first query. */
export function db(): Database {
  if (!globalForDb.__gamesmithDb) {
    globalForDb.__gamesmithDb = createDb(serverEnv().DATABASE_URL);
  }
  return globalForDb.__gamesmithDb;
}

export { schema };
