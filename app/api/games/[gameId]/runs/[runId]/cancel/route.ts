import { requireApiUser } from "@/lib/auth";
import { runErrorResponse } from "@/lib/server/agent/http";
import { cancelRun } from "@/lib/server/agent/service";

/** Asks the run to stop. It finishes the current step, saves what it has and settles. */
export async function POST(_request: Request, { params }: { params: Promise<{ gameId: string; runId: string }> }) {
  try {
    const { userId } = await requireApiUser();
    const { gameId, runId } = await params;
    await cancelRun(userId, gameId, runId);
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    return runErrorResponse(error);
  }
}
