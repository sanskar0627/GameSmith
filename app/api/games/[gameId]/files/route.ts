import { requireApiUser } from "@/lib/auth";
import { noStore, sandboxErrorResponse } from "@/lib/server/sandbox/http";
import { listGameFiles } from "@/lib/server/sandbox/service";

/** The game's source files (no dependencies or build output). Owner only. */
export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  try {
    const { userId } = await requireApiUser();
    return Response.json({ files: await listGameFiles(userId, (await params).gameId) }, { headers: noStore });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
