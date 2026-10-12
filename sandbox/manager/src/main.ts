import { mkdir } from "node:fs/promises";

import { createApiServer } from "./api.js";
import { loadConfig } from "./config.js";
import { DockerDriver } from "./driver.js";
import { SandboxManager } from "./manager.js";

const config = loadConfig();
await mkdir(config.snapshotsDir, { recursive: true });

const driver = new DockerDriver(config);
const manager = new SandboxManager(config, driver);
await manager.recover();

const api = createApiServer(manager, { token: config.token, maxFileBytes: config.maxFileBytes });
api.listen(config.apiPort, () => console.log(`[manager] api on :${config.apiPort}`));

const reaper = setInterval(() => {
  manager.reap().then(
    (stopped) => stopped.length && console.log(`[reaper] stopped idle sandboxes: ${stopped.join(", ")}`),
    (error) => console.error("[reaper]", error),
  );
}, 60_000);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`[manager] ${signal}: snapshotting and stopping sandboxes`);
  clearInterval(reaper);
  api.close();
  await manager.stopAll();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
