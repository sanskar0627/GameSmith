import { requireApiUser } from "@/lib/auth";
import { sandboxErrorResponse, noStore } from "@/lib/server/sandbox/http";
import { getSandbox, startSandbox, stopSandbox } from "@/lib/server/sandbox/service";

type Ctx = { params: Promise<{ gameId: string }> };

/** Sandbox status for the owner: running or not, and the private preview URL. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { userId } = await requireApiUser();
    return Response.json(await getSandbox(userId, (await params).gameId), { headers: noStore });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}

/** Starts (or wakes) the game's sandbox. */
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { userId } = await requireApiUser();
    return Response.json(await startSandbox(userId, (await params).gameId), { headers: noStore });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}

/** Stops the sandbox after saving a snapshot. */
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { userId } = await requireApiUser();
    return Response.json(await stopSandbox(userId, (await params).gameId), { headers: noStore });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
