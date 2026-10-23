/**
 * The local database started by `npm run db:up` (see compose.yml).
 * Used only outside production when DATABASE_URL is not set, so a fresh
 * checkout works without editing .env.local first. Production must always
 * set DATABASE_URL explicitly.
 */
export const DEV_DATABASE_URL = "postgres://gamesmith:gamesmith@localhost:5432/gamesmith";
