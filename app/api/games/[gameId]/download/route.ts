import { requireApiUser } from "@/lib/auth";
import { noStore, sandboxErrorResponse } from "@/lib/server/sandbox/http";
import { downloadGameZip } from "@/lib/server/sandbox/service";

/**
 * The game's source as a zip (no dependencies or build output). Owner only.
 * Built from the live workspace, or the last snapshot when the sandbox sleeps.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  try {
    const { userId } = await requireApiUser();
    const { filename, data } = await downloadGameZip(userId, (await params).gameId);
    return new Response(new Uint8Array(data), {
      headers: {
        ...noStore,
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${filename}"`,
        "content-length": String(data.length),
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
