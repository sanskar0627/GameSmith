/**
 * The content origin for published games, from the environment. Pure (no
 * server-only), so proxy.ts can use it too. Mirrors lib/env.ts: outside
 * production, a localhost app gets 127.0.0.1 on the same port, which the
 * browser treats as another site.
 */
export function publishedOriginFrom(env: Record<string, string | undefined>): string | null {
  if (env.PUBLISHED_ORIGIN) return env.PUBLISHED_ORIGIN.replace(/\/$/, "");
  if (env.NODE_ENV === "production") return null;
  try {
    const app = new URL(env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
    if (app.hostname !== "localhost") return null;
    return `${app.protocol}//127.0.0.1${app.port ? `:${app.port}` : ""}`;
  } catch {
    return null;
  }
}

/** `host` (name and port) of the content origin, or null. */
export function publishedHostFrom(env: Record<string, string | undefined>): string | null {
  const origin = publishedOriginFrom(env);
  try {
    return origin ? new URL(origin).host : null;
  } catch {
    return null;
  }
}
