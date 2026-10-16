import "server-only";

import { UnauthorizedError } from "@/lib/auth";
import { InsufficientSparksError } from "@/lib/server/billing/wallet";
import { ModelUnavailableError } from "@/lib/server/billing/runs";
import { GameNotFoundError } from "@/lib/server/games/access";

import { RunInProgressError, RunInputError, RunsRateLimitedError } from "./service";

const MODEL_REASON: Record<ModelUnavailableError["reason"], string> = {
  "needs-key": "This model needs your own API key. Add one in Settings > API keys, or pick another model.",
  "platform-unavailable": "This model isn't available on sparks right now. Pick another model or add your own key.",
  "unknown-model": "That model isn't available any more. Pick another one.",
};

/** Maps agent-run errors to JSON responses; anything unexpected is logged, never leaked. */
export function runErrorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (error instanceof GameNotFoundError) return Response.json({ error: "Not found" }, { status: 404 });
  if (error instanceof RunInProgressError) {
    return Response.json({ error: error.message, runId: error.runId || undefined }, { status: 409 });
  }
  if (error instanceof InsufficientSparksError) {
    return Response.json(
      { error: "You're out of sparks. Top up, or add your own API key to keep building.", code: "no-sparks" },
      { status: 402 },
    );
  }
  if (error instanceof ModelUnavailableError) {
    return Response.json({ error: MODEL_REASON[error.reason], code: error.reason }, { status: 400 });
  }
  if (error instanceof RunsRateLimitedError) return Response.json({ error: error.message }, { status: 429 });
  if (error instanceof RunInputError) {
    return Response.json({ error: error.message }, { status: error.message === "Run not found" ? 404 : 400 });
  }
  console.error("[agent] request failed", error);
  return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
}
