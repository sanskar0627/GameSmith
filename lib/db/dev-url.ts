/**
 * The local database started by `npm run db:up` (see compose.yml), built
 * from POSTGRES_PASSWORD in .env.local. No password lives in the repo.
 *
 * Used only outside production when DATABASE_URL is not set. Production must
 * always set DATABASE_URL explicitly. Returns undefined when there is no
 * password to build it from.
 */
export function devDatabaseUrl(
  database = "gamesmith",
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const password = env.POSTGRES_PASSWORD?.trim();
  if (!password) return undefined;
  return `postgres://gamesmith:${encodeURIComponent(password)}@localhost:5432/${database}`;
}
