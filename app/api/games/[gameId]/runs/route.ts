import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { runErrorResponse } from "@/lib/server/agent/http";
import { activeRun, createRun, type RunInput } from "@/lib/server/agent/service";

type Ctx = { params: Promise<{ gameId: string }> };

const body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("prompt"),
    text: z.string().trim().min(1, "Write something first").max(4000, "That message is too long"),
    attachments: z
      .array(z.object({ kind: z.literal("runtime-error"), message: z.string().max(8000) }))
      .max(3)
      .optional(),
  }),
  z.object({ kind: z.literal("answer"), askId: z.string().min(1).max(200), value: z.string().trim().min(1).max(1000) }),
  z.object({ kind: z.literal("approve") }),
  z.object({ kind: z.literal("resume") }),
]);

/** The game's running run, if any (the workspace reattaches to it). */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { userId } = await requireApiUser();
    return Response.json({ runId: await activeRun(userId, (await params).gameId) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return runErrorResponse(error);
  }
}

/** Starts the agent: a prompt, an answer, approving the brief, or answering the saved first prompt. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { userId } = await requireApiUser();
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }
    const result = await createRun(userId, (await params).gameId, parsed.data as RunInput);
    return Response.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return runErrorResponse(error);
  }
}
