import "server-only";

import { sandboxErrorResponse } from "@/lib/server/sandbox/http";

import { PublishError, PublishNotConfiguredError } from "./service";

export function publishErrorResponse(error: unknown): Response {
  if (error instanceof PublishNotConfiguredError) return Response.json({ error: error.message }, { status: 503 });
  if (error instanceof PublishError) {
    return Response.json({ error: error.message, ...(error.detail ? { detail: error.detail } : {}) }, { status: error.status });
  }
  return sandboxErrorResponse(error);
}
