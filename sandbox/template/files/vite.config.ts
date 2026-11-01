import { defineConfig } from "vite";

/**
 * Runs inside the GameSmith sandbox. The sandbox manager sets:
 *   GS_BASE             the private preview path, e.g. /p/<game>-<secret>/
 *   GS_HMR_CLIENT_PORT  the port browsers reach the preview proxy on
 * Files are written from outside the sandbox, so the watcher polls.
 */
const hmrPort = Number(process.env.GS_HMR_CLIENT_PORT) || undefined;

export default defineConfig({
  base: process.env.GS_BASE ?? "/",
  // node_modules comes read-only from the image; keep Vite's cache in the workspace.
  cacheDir: ".vite",
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // The preview proxy forwards the public host name.
    allowedHosts: true,
    watch: { usePolling: true, interval: 250 },
    hmr: hmrPort ? { clientPort: hmrPort } : undefined,
  },
  // three.js alone is ~700 kB; that's expected for a 3D game.
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
