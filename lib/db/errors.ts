/**
 * Turns the two most common local-setup database failures into errors that
 * say what to do. Anything else is returned unchanged.
 */
const SETUP_HINTS: Record<string, string> = {
  // Connection refused / host not found: Postgres is not running or the URL is wrong.
  ECONNREFUSED: "Cannot reach the database. Start it with `npm run db:up`, and check DATABASE_URL in .env.local.",
  ENOTFOUND: "Cannot resolve the database host. Check DATABASE_URL in .env.local.",
  // undefined_table: migrations have not been applied.
  "42P01": "The database has no GameSmith tables yet. Run `npm run db:migrate`.",
  // invalid_password / invalid_authorization_specification
  "28P01": "The database rejected the username or password in DATABASE_URL.",
  "3D000": "The database named in DATABASE_URL does not exist. Run `npm run db:up` (it creates it) or fix the URL.",
};

function codeOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const candidate = current as { code?: unknown; errors?: unknown[]; cause?: unknown };
    if (typeof candidate.code === "string" && candidate.code in SETUP_HINTS) return candidate.code;
    // Node reports a refused localhost connection as an AggregateError (IPv4 + IPv6).
    if (Array.isArray(candidate.errors)) {
      const inner = candidate.errors.map(codeOf).find(Boolean);
      if (inner) return inner;
    }
    current = candidate.cause;
  }
  return undefined;
}

export function explainDbError(error: unknown): unknown {
  const code = codeOf(error);
  if (!code) return error;
  return new Error(`${SETUP_HINTS[code]} (${code})`, { cause: error });
}
