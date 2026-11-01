import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import { createGzip } from "node:zlib";

import { isGameId } from "./ids.js";
import { ManagerError, type SandboxManager } from "./manager.js";
import { isSnapshotName, sanitizeTar, SnapshotError } from "./snapshots.js";

/**
 * Internal API for the GameSmith app. Never exposed publicly: it listens on
 * the app network only and every call needs the shared bearer token. The
 * app checks game ownership before calling; this service trusts the app.
 *
 *   GET    /healthz
 *   POST   /v1/preview/check                      { gameId, secret } (preview proxy)
 *   GET    /v1/sandboxes/:gameId                  status
 *   POST   /v1/sandboxes/:gameId/start            { restore?: snapshot name }
 *   POST   /v1/sandboxes/:gameId/stop             { snapshot?: boolean }
 *   POST   /v1/sandboxes/:gameId/snapshots        { name }
 *   GET    /v1/sandboxes/:gameId/archive          tar.gz of the source
 *   POST   /v1/snapshots/copy                     { from, to }
 *   GET    /v1/sandboxes/:gameId/files            list
 *   GET    /v1/sandboxes/:gameId/files/<path>     read (bytes)
 *   PUT    /v1/sandboxes/:gameId/files/<path>     write (bytes)
 *   DELETE /v1/sandboxes/:gameId/files/<path>
 */

const JSON_LIMIT = 16 * 1024;

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new ManagerError(413, "Body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req, JSON_LIMIT);
  if (raw.length === 0) return {};
  try {
    const value = JSON.parse(raw.toString("utf8")) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new ManagerError(400, "Invalid JSON");
  }
}

function authorized(req: http.IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function createApiServer(manager: SandboxManager, options: { token: string; maxFileBytes: number }) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://manager");
      const method = req.method ?? "GET";
      if (url.pathname === "/healthz" && method === "GET") return send(res, 200, { ok: true });
      if (!authorized(req, options.token)) return send(res, 401, { error: "Unauthorized" });

      // Called by the preview proxy for every new preview connection (cached there).
      if (url.pathname === "/v1/preview/check" && method === "POST") {
        const body = await readJson(req);
        const ok =
          isGameId(body.gameId) && typeof body.secret === "string" && Boolean(manager.checkPreview(body.gameId, body.secret));
        if (ok) manager.touch(body.gameId as string);
        return send(res, 200, { ok });
      }

      if (url.pathname === "/v1/snapshots/copy" && method === "POST") {
        const body = await readJson(req);
        if (!isGameId(body.from) || !isGameId(body.to)) throw new ManagerError(400, "Invalid game id");
        if (!(await manager.snapshots.exists(body.from))) return send(res, 200, { copied: false });
        await manager.snapshots.copy(body.from, body.to);
        return send(res, 200, { copied: true });
      }

      const m = /^\/v1\/sandboxes\/([^/]+)(\/[a-z]+)?(\/.*)?$/.exec(url.pathname);
      if (!m) return send(res, 404, { error: "Not found" });
      const gameId = m[1]!;
      if (!isGameId(gameId)) throw new ManagerError(400, "Invalid game id");
      const action = m[2] ?? "";
      const rest = m[3] ? decodeURIComponent(m[3].slice(1)) : "";

      if (action === "" && method === "GET") return send(res, 200, manager.status(gameId));
      if (action === "/start" && method === "POST") {
        const body = await readJson(req);
        if (body.restore !== undefined && !isSnapshotName(body.restore)) throw new ManagerError(400, "Invalid snapshot");
        return send(res, 200, await manager.start(gameId, { restore: body.restore as string | undefined }));
      }
      if (action === "/stop" && method === "POST") {
        const body = await readJson(req);
        return send(res, 200, await manager.stop(gameId, { snapshot: body.snapshot !== false }));
      }
      if (action === "/snapshots" && method === "POST") {
        const body = await readJson(req);
        if (!isSnapshotName(body.name)) throw new ManagerError(400, "Invalid snapshot name");
        return send(res, 200, await manager.snapshot(gameId, body.name));
      }
      if (action === "/archive" && method === "GET") {
        const running = manager.status(gameId).running;
        if (!running && !(await manager.snapshots.exists(gameId))) throw new ManagerError(404, "No files yet");
        res.writeHead(200, { "content-type": "application/gzip", "cache-control": "no-store" });
        if (running) {
          // Live workspace, sanitized like a snapshot.
          const tar = sanitizeTar(await manager.exportLive(gameId), "workspace");
          tar.pipe(createGzip()).pipe(res);
        } else {
          manager.snapshots.openCompressed(gameId).pipe(res);
        }
        return;
      }
      if (action === "/files") {
        if (!rest) {
          if (method !== "GET") return send(res, 405, { error: "Method not allowed" });
          return send(res, 200, { files: await manager.listFiles(gameId) });
        }
        if (method === "GET") {
          const data = await manager.readFile(gameId, rest);
          res.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store" });
          return res.end(data);
        }
        if (method === "PUT") {
          await manager.writeFile(gameId, rest, await readBody(req, options.maxFileBytes));
          return send(res, 200, { ok: true });
        }
        if (method === "DELETE") {
          await manager.deleteFile(gameId, rest);
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 404, { error: "Not found" });
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (error instanceof ManagerError) return send(res, error.status, { error: error.message });
      if (error instanceof SnapshotError) return send(res, 422, { error: error.message });
      console.error("[api]", error);
      return send(res, 500, { error: "Internal error" });
    }
  });
}
