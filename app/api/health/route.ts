import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/lib/db";

/**
 * Liveness + database check for uptime monitors and the deploy script.
 * Returns no internal details: just ok / down.
 */
export async function GET() {
  await connection();
  const headers = { "Cache-Control": "no-store" };
  try {
    await db().execute(sql`select 1`);
    return Response.json({ status: "ok", db: "ok" }, { headers });
  } catch (error) {
    console.error("[health] database check failed", error);
    return Response.json({ status: "degraded", db: "down" }, { status: 503, headers });
  }
}
