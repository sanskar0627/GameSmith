import { defineConfig, type Plugin } from "vite";

/**
 * Runs inside the GameSmith sandbox. The sandbox manager sets:
 *   GS_BASE             the private preview path, e.g. /p/<game>-<secret>/
 *   GS_HMR_CLIENT_PORT  the port browsers reach the preview proxy on
 * Files are written from outside the sandbox, so the watcher polls.
 */
const hmrPort = Number(process.env.GS_HMR_CLIENT_PORT) || undefined;

/**
 * Reports crashes to the GameSmith workspace (the parent window) so it can
 * show "Ask Smith to fix it": uncaught errors, rejected promises and Vite
 * build errors, plus an all-clear after the next successful hot update.
 */
const RUNTIME = "virtual:gamesmith-runtime";
let previewBase = "/";
const runtimeReporter: Plugin = {
  name: "gamesmith-runtime",
  apply: "serve",
  configResolved: (config) => {
    previewBase = config.base;
  },
  resolveId: (id) => (id === RUNTIME ? `\0${RUNTIME}` : undefined),
  load: (id) =>
    id === `\0${RUNTIME}`
      ? `
const post = (type, extra) => { try { parent.postMessage({ type, ...extra }, "*"); } catch {} };
const report = (message, stack) =>
  post("gamesmith:error", { message: String(message || "Unknown error").slice(0, 2000), stack: stack ? String(stack).slice(0, 4000) : undefined });
addEventListener("error", (e) => { if (e.error || e.message) report(e.message || e.error?.message, e.error?.stack); });
addEventListener("unhandledrejection", (e) => report(e.reason?.message ?? e.reason, e.reason?.stack));
if (import.meta.hot) {
  import.meta.hot.on("vite:error", (p) => report(p.err?.message, p.err?.frame || p.err?.stack));
  import.meta.hot.on("vite:afterUpdate", () => post("gamesmith:ok"));
}
`
      : undefined,
  // Served by Vite at <base>@id/__x00__<id>; first in <head> so it sees errors from the game.
  transformIndexHtml: () => [
    { tag: "script", attrs: { type: "module", src: `${previewBase}@id/__x00__${RUNTIME}` }, injectTo: "head-prepend" },
  ],
};

export default defineConfig({
  plugins: [runtimeReporter],
  base: process.env.GS_BASE ?? "/",
  // node_modules comes read-only from the image; keep Vite's cache in the workspace.
  cacheDir: ".vite",
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // The preview proxy forwards the public host name.
    allowedHosts: true,
    // The app embeds the preview in a sandboxed iframe (no allow-same-origin),
    // so the page has an opaque origin and the browser sends `Origin: null`
    // for its module scripts and the HMR socket. Vite only allows localhost
    // origins by default, which blocks both. The preview URL itself is the
    // secret, and the sandbox has no network or credentials to protect.
    cors: true,
    watch: { usePolling: true, interval: 250 },
    hmr: hmrPort ? { clientPort: hmrPort } : undefined,
  },
  // three.js alone is ~700 kB; that's expected for a 3D game.
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
