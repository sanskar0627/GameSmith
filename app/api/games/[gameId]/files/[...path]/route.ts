import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { noStore, sandboxErrorResponse } from "@/lib/server/sandbox/http";
import { deleteGameFile, MAX_FILE_BYTES, readGameFile, renameGameFile, writeGameFile } from "@/lib/server/sandbox/service";

type Ctx = { params: Promise<{ gameId: string; path: string[] }> };

async function target(ctx: Ctx) {
  const { gameId, path } = await ctx.params;
  // Path checks happen inside the sandbox too (sandbox/template/fsop.mjs).
  return { gameId, path: path.join("/") };
}

/** Reads one file. Sent as an attachment so a browser never renders it on this origin. */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { userId } = await requireApiUser();
    const { gameId, path } = await target(ctx);
    const data = await readGameFile(userId, gameId, path);
    return new Response(data as BodyInit, {
      headers: {
        ...noStore,
        "content-type": "application/octet-stream",
        "content-disposition": "attachment",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}

/** Writes one file (raw body, up to 2 MB). The preview hot-reloads. */
export async function PUT(request: Request, ctx: Ctx) {
  try {
    const { userId } = await requireApiUser();
    const { gameId, path } = await target(ctx);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_FILE_BYTES) return Response.json({ error: "File too large" }, { status: 413 });
    const data = new Uint8Array(await request.arrayBuffer());
    await writeGameFile(userId, gameId, path, data);
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { userId } = await requireApiUser();
    const { gameId, path } = await target(ctx);
    await deleteGameFile(userId, gameId, path);
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}

const renameBody = z.object({ to: z.string().min(1).max(512) });

/** Renames (moves) one file: `{ "to": "src/new-name.ts" }`. */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { userId } = await requireApiUser();
    const { gameId, path } = await target(ctx);
    const body = renameBody.safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: "Send the new path as { to }." }, { status: 400 });
    const moved = await renameGameFile(userId, gameId, path, body.data.to);
    return Response.json({ ok: true, path: moved }, { headers: noStore });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
