import http from "node:http";
import net from "node:net";

/** Who may see a preview. The manager in tests; a remote check in production. */
export interface PreviewAuth {
  check(gameId: string, secret: string): Promise<boolean>;
  touch(gameId: string): void;
}

/**
 * Preview proxy: `/p/<gameId>-<secret>/...` -> that game's Vite dev server.
 *
 * The URL itself is the capability (an unguessable secret, new on every
 * sandbox start), so previews work inside the app's iframe without
 * third-party cookies, which browsers block. Unknown or stale links get a
 * plain 404. WebSocket upgrades (Vite HMR) are proxied the same way.
 */

const PREFIX = /^\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([A-Za-z0-9_-]{16,64})\//;

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export type Upstream = (gameId: string) => { host: string; port: number };

async function match(auth: PreviewAuth, url: string | undefined) {
  const m = url ? PREFIX.exec(url) : null;
  if (!m) return null;
  return (await auth.check(m[1]!, m[2]!)) ? { gameId: m[1]! } : null;
}

function forwardHeaders(req: http.IncomingMessage, keepUpgrade = false): http.OutgoingHttpHeaders {
  const headers: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (!keepUpgrade && HOP_BY_HOP.has(key)) continue;
    // Previews never need the visitor's cookies or credentials.
    if (key === "cookie" || key === "authorization") continue;
    headers[key] = value;
  }
  headers["x-forwarded-for"] = req.socket.remoteAddress ?? "";
  return headers;
}

function notFound(res: http.ServerResponse) {
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  res.end("Preview not found. It may have gone to sleep: reopen it from the GameSmith workspace.");
}

export function createPreviewServer(
  auth: PreviewAuth,
  upstream: Upstream,
  options: { frameAncestors?: string } = {},
): http.Server {
  // Only the GameSmith app may embed previews.
  const csp = `frame-ancestors ${options.frameAncestors ?? "'self'"}`;
  const server = http.createServer(async (req, res) => {
    const hit = await match(auth, req.url).catch(() => null);
    if (!hit) return notFound(res);
    auth.touch(hit.gameId);
    const target = upstream(hit.gameId);
    const proxied = http.request(
      { host: target.host, port: target.port, method: req.method, path: req.url, headers: forwardHeaders(req) },
      (upstreamRes) => {
        const headers = { ...upstreamRes.headers };
        for (const key of Object.keys(headers)) if (HOP_BY_HOP.has(key)) delete headers[key];
        headers["content-security-policy"] = csp;
        headers["x-content-type-options"] = "nosniff";
        headers["referrer-policy"] = "no-referrer";
        res.writeHead(upstreamRes.statusCode ?? 502, headers);
        upstreamRes.pipe(res);
      },
    );
    proxied.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        res.end("The game's dev server isn't answering yet.");
      } else res.destroy();
    });
    req.pipe(proxied);
  });

  server.on("upgrade", async (req, socket, head) => {
    const hit = await match(auth, req.url).catch(() => null);
    if (!hit) {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    auth.touch(hit.gameId);
    const target = upstream(hit.gameId);
    const upstreamSocket = net.connect(target.port, target.host, () => {
      const headers = forwardHeaders(req, true);
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [key, value] of Object.entries(headers)) {
        for (const v of Array.isArray(value) ? value : [value]) lines.push(`${key}: ${v}`);
      }
      upstreamSocket.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head.length) upstreamSocket.write(head);
      upstreamSocket.pipe(socket);
      socket.pipe(upstreamSocket);
    });
    const close = () => {
      upstreamSocket.destroy();
      socket.destroy();
    };
    upstreamSocket.on("error", close);
    socket.on("error", close);
    // HMR traffic counts as activity too.
    socket.on("data", () => auth.touch(hit.gameId));
  });

  return server;
}
