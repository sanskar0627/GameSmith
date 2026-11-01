import { serverEnv } from "@/lib/env";
import { publishedOrigin, readPublishedFile } from "@/lib/server/publish/service";

/**
 * Published game files, served ONLY on the content origin (PUBLISHED_ORIGIN).
 * On any other host this answers 404, so untrusted game code never runs on
 * the app's origin. The host check uses `host` (set by the browser and kept
 * by the reverse proxy), never X-Forwarded-Host, which a client can forge.
 */

type Ctx = { params: Promise<{ buildId: string; access: string; path?: string[] }> };

export const dynamic = "force-dynamic";

function notFound() {
  return new Response("Not found", { status: 404, headers: { "cache-control": "no-store", "content-type": "text/plain" } });
}

function csp(): string {
  const app = new URL(serverEnv().NEXT_PUBLIC_APP_URL).origin;
  return [
    "default-src 'self' data: blob:",
    // Bundled games use inline styles, eval-free modules and blob workers; no remote code.
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    `frame-ancestors 'self' ${app}`,
  ].join("; ");
}

export async function GET(request: Request, { params }: Ctx) {
  const origin = publishedOrigin();
  if (!origin || request.headers.get("host") !== new URL(origin).host) return notFound();

  const { buildId, access, path } = await params;
  if (!path || path.length === 0) {
    // Relative asset URLs need the page to sit inside the build folder.
    return Response.redirect(`${origin}/b/${buildId}/${access}/index.html`, 308);
  }
  const file = await readPublishedFile(buildId, access, path.join("/"));
  if (!file) return notFound();

  return new Response(new Uint8Array(file.data), {
    headers: {
      "content-type": file.contentType,
      "content-length": String(file.data.length),
      // Short: unpublishing or making the game private must take effect soon.
      "cache-control": `${file.access === "public" ? "public" : "private"}, max-age=300`,
      "content-security-policy": csp(),
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cross-origin-resource-policy": "cross-origin",
      "access-control-allow-origin": "*",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
  });
}
