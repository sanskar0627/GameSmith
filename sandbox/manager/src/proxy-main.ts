import { createPreviewServer } from "./proxy.js";
import { RemotePreviewAuth } from "./remote-auth.js";

/**
 * Preview proxy process (its own container). Joins each sandbox's private
 * network so it can reach the dev servers; holds no Docker access.
 */
const token = process.env.SANDBOX_MANAGER_TOKEN ?? "";
if (token.length < 32) throw new Error("SANDBOX_MANAGER_TOKEN must be at least 32 characters");
const managerUrl = process.env.MANAGER_URL || "http://sandbox-manager:4100";
const port = Number(process.env.PREVIEW_PORT || 4101);

const server = createPreviewServer(
  new RemotePreviewAuth(managerUrl, token),
  (gameId) => ({ host: `gs-sbx-${gameId}`, port: 5173 }),
  { frameAncestors: process.env.APP_ORIGIN || "http://localhost:3000" },
);
server.listen(port, () => console.log(`[preview] listening on :${port}, manager ${managerUrl}`));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
