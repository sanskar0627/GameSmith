import { requireApiUser } from "@/lib/auth";
import { publishErrorResponse } from "@/lib/server/publish/http";
import { getPublishState, publishGame, unpublishGame } from "@/lib/server/publish/service";
import { noStore } from "@/lib/server/sandbox/http";

type Ctx = { params: Promise<{ gameId: string }> };

// A build can take a while (vite build inside the sandbox).
export const maxDuration = 300;

/** Owner only: what's published and where. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { userId } = await requireApiUser();
    return Response.json(await getPublishState(userId, (await params).gameId), { headers: noStore });
  } catch (error) {
    return publishErrorResponse(error);
  }
}

/** Builds what's live in the sandbox and makes it the game's published build. */
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { userId } = await requireApiUser();
    return Response.json(await publishGame(userId, (await params).gameId), { headers: noStore });
  } catch (error) {
    return publishErrorResponse(error);
  }
}

/** Takes the game down from /play. */
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { userId } = await requireApiUser();
    return Response.json(await unpublishGame(userId, (await params).gameId), { headers: noStore });
  } catch (error) {
    return publishErrorResponse(error);
  }
}
