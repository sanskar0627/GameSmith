import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Applies ./drizzle migrations to the test database once per run. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  if (!/_test\b|\/test\b/.test(new URL(url).pathname)) {
    // Tests truncate tables. Refuse anything that does not look like a test database.
    throw new Error(`Refusing to run tests against "${new URL(url).pathname}". Use a database whose name ends in _test.`);
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client`select 1`;
  } catch (error) {
    await client.end();
    throw new Error(
      `Cannot reach the test database (${url.replace(/:[^:@/]+@/, ":***@")}). Start it with \`npm run db:up\`.\n${String(error)}`,
    );
  }
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
}
