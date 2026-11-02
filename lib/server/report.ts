import "server-only";

import { randomUUID } from "node:crypto";

/**
 * Error reports. Always logged; also sent to Sentry when SENTRY_DSN is set
 * (envelope API, no SDK). Never throws and never blocks the caller for
 * long. Context values are short strings only: no request bodies, headers
 * or keys ever go out.
 */

type Context = Record<string, string | number | boolean | null | undefined>;

function dsnParts(dsn: string) {
  try {
    const url = new URL(dsn);
    const project = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!url.username || !project) return null;
    return { endpoint: `${url.protocol}//${url.host}/api/${project}/envelope/`, key: url.username };
  } catch {
    return null;
  }
}

function clean(context: Context): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(context)) if (v !== undefined && v !== null) out[k.slice(0, 32)] = String(v).slice(0, 200);
  return out;
}

export async function reportError(error: unknown, context: Context = {}): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const parts = dsnParts(dsn);
  if (!parts) return;
  const eventId = randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.GAMESMITH_RELEASE || undefined,
    tags: clean(context),
    exception: { values: [{ type: err.name, value: err.message.slice(0, 1000) }] },
    extra: { stack: err.stack?.slice(0, 8000) },
  };
  const body = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
  try {
    await fetch(parts.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${parts.key}, sentry_client=gamesmith/1.0`,
      },
      body,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* reporting must never break the app */
  }
}
