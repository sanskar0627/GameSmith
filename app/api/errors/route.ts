import { z } from "zod";

import { RateLimiter } from "@/lib/server/rate-limit";
import { reportError } from "@/lib/server/report";

/**
 * Browser crash reports from the error boundaries (lib/client/report.ts).
 * Public, so it is small, rate-limited and only ever logs what it's sent.
 */
const reports = new RateLimiter(20, 60_000);

const body = z.object({
  where: z.string().max(40),
  digest: z.string().max(80).optional(),
  name: z.string().max(80).optional(),
  message: z.string().max(500).optional(),
  stack: z.string().max(4000).optional(),
  path: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!reports.take(ip)) return new Response(null, { status: 429 });
  const raw = await request.text();
  if (raw.length > 8000) return new Response(null, { status: 413 });
  let parsed;
  try {
    parsed = body.parse(JSON.parse(raw));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (parsed.digest && !parsed.message) {
    // Already reported on the server under this digest.
    return new Response(null, { status: 204 });
  }
  const error = new Error(parsed.message ?? "Client error");
  error.name = parsed.name ?? "ClientError";
  error.stack = parsed.stack;
  console.error("[client error]", parsed.where, parsed.path, error.name, error.message);
  await reportError(error, { where: `client:${parsed.where}`, path: parsed.path });
  return new Response(null, { status: 204 });
}
