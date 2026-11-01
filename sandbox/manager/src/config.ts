/** Sandbox manager settings, from the environment. */
export type Config = {
  /** Shared secret the app sends as `Authorization: Bearer <token>`. */
  token: string;
  apiPort: number;
  /** Port browsers use to reach the preview proxy (Vite HMR connects here). */
  previewPublicPort: number;
  image: string;
  /** `runsc` (gVisor) in production. `runc` only for local development. */
  runtime: string;
  memoryMb: number;
  cpus: number;
  pids: number;
  idleMinutes: number;
  maxSandboxes: number;
  /**
   * The preview proxy container. It joins each sandbox's private network;
   * this manager (which holds the Docker socket) never does, so game code
   * can't reach the manager API at all.
   */
  proxyContainer: string;
  snapshotsDir: string;
  maxFileBytes: number;
  /** Origin allowed to frame previews (the GameSmith app). */
  appOrigin: string;
};

function int(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${key} must be a positive number`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = env.SANDBOX_MANAGER_TOKEN ?? "";
  if (token.length < 32) throw new Error("SANDBOX_MANAGER_TOKEN must be at least 32 characters");
  const runtime = env.SANDBOX_RUNTIME || "runsc";
  if (runtime !== "runsc" && env.SANDBOX_REQUIRE_GVISOR === "true") {
    throw new Error("Production sandboxes must run under gVisor (SANDBOX_RUNTIME=runsc)");
  }
  return {
    token,
    apiPort: int(env, "MANAGER_PORT", 4100),
    previewPublicPort: int(env, "PREVIEW_PUBLIC_PORT", 4101),
    image: env.SANDBOX_IMAGE || "gamesmith-sandbox:latest",
    runtime,
    memoryMb: int(env, "SANDBOX_MEMORY_MB", 1024),
    cpus: int(env, "SANDBOX_CPUS", 1),
    pids: int(env, "SANDBOX_PIDS", 256),
    idleMinutes: int(env, "SANDBOX_IDLE_MINUTES", 15),
    maxSandboxes: int(env, "SANDBOX_MAX_RUNNING", 20),
    proxyContainer: env.PROXY_CONTAINER || "gamesmith-sandbox-proxy",
    snapshotsDir: env.SNAPSHOTS_DIR || "/data/snapshots",
    maxFileBytes: int(env, "SANDBOX_MAX_FILE_BYTES", 2 * 1024 * 1024),
    appOrigin: env.APP_ORIGIN || "http://localhost:3000",
  };
}
