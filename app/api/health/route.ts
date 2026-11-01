import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/lib/db";
import { explainDbError } from "@/lib/db/errors";

/**
 * Liveness + dependency check for uptime monitors and the deploy script.
 * Returns no internal details: just ok / down per dependency. Redis is
 * only checked when agent runs go through it (AGENT_QUEUE=redis).
 */
export async function GET() {
  await connection();
  const headers = { "Cache-Control": "no-store" };
  const result: { status: "ok" | "degraded"; db: "ok" | "down"; redis?: "ok" | "down" } = { status: "ok", db: "ok" };
  try {
    await db().execute(sql`select 1`);
  } catch (error) {
    console.error("[health] database check failed", explainDbError(error));
    result.db = "down";
  }
  try {
    const { agentMode, redis } = await import("@/lib/server/agent/queue");
    if (agentMode() === "redis") {
      const pong = await Promise.race([redis().ping(), new Promise<string>((_, no) => setTimeout(() => no(new Error("timeout")), 2000))]);
      result.redis = pong === "PONG" ? "ok" : "down";
    }
  } catch (error) {
    console.error("[health] redis check failed", (error as Error)?.message ?? error);
    result.redis = "down";
  }
  if (result.db === "down" || result.redis === "down") result.status = "degraded";
  return Response.json(result, { status: result.status === "ok" ? 200 : 503, headers });
}
