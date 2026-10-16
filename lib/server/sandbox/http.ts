import "server-only";

import { UnauthorizedError } from "@/lib/auth";
import { GameNotFoundError } from "@/lib/server/games/access";

import { ArchiveError } from "./archive";
import { SandboxError } from "./client";
import { SandboxNotConfiguredError } from "./service";

/** Maps sandbox errors to JSON responses. Unknown errors are logged, never leaked. */
export function sandboxErrorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (error instanceof GameNotFoundError) return Response.json({ error: "Not found" }, { status: 404 });
  if (error instanceof SandboxNotConfiguredError) return Response.json({ error: error.message }, { status: 503 });
  if (error instanceof SandboxError) {
    // Server-side failures (including a misconfigured manager token) stay
    // vague for the user and are logged; request errors pass through.
    const serverSide = error.status >= 500 || error.status === 401 || error.status === 403;
    if (serverSide) {
      console.error("[sandbox]", error.status, error.message);
      const status = error.status === 503 ? 503 : 502;
      return Response.json({ error: "The sandbox had a problem. Try again." }, { status });
    }
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ArchiveError) {
    console.error("[sandbox] archive", error.message);
    return Response.json({ error: error.message }, { status: 422 });
  }
  console.error("[sandbox] unexpected error", error);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}

export const noStore = { "cache-control": "no-store" };
