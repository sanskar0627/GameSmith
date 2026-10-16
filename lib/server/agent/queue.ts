import "server-only";

import { Queue, type ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";

import { serverEnv } from "@/lib/env";

import { MemoryBus, RedisBus, type RunBus } from "./bus";

/**
 * How runs get executed.
 *
 * - "redis" (production): the app puts a job on the BullMQ queue
 *   `agent-runs`; the worker (worker/main.ts) runs it and streams events
 *   through Redis. The web process never calls a model.
 * - "inline" (local development default): the run executes inside the Next
 *   server process with an in-memory bus, so `npm run dev` is enough.
 */
export const QUEUE_NAME = "agent-runs";

export type RunJob = { runId: string };

const globalForAgent = globalThis as unknown as {
  __gsRedis?: Redis;
  __gsBus?: RunBus;
  __gsQueue?: Queue<RunJob>;
  __gsInline?: (runId: string) => Promise<void>;
};

export function agentMode(): "redis" | "inline" {
  return serverEnv().AGENT_QUEUE;
}

/** BullMQ wants connection options; built from REDIS_URL. */
export function redisOptions(): ConnectionOptions & { host: string; port: number } {
  const url = serverEnv().REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set (AGENT_QUEUE=redis needs Redis).");
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
    tls: u.protocol === "rediss:" ? {} : undefined,
    // Required by BullMQ for blocking commands.
    maxRetriesPerRequest: null,
  };
}

export function redis(): Redis {
  globalForAgent.__gsRedis ??= new Redis({ ...redisOptions(), lazyConnect: false });
  return globalForAgent.__gsRedis;
}

export function runBus(): RunBus {
  if (!globalForAgent.__gsBus) {
    globalForAgent.__gsBus = agentMode() === "redis" ? new RedisBus(redis()) : new MemoryBus();
  }
  return globalForAgent.__gsBus;
}

/** Tests swap the bus (and the inline executor) in. */
export function setAgentRuntimeForTests(runtime: { bus?: RunBus; inline?: (runId: string) => Promise<void> } | null) {
  globalForAgent.__gsBus = runtime?.bus;
  globalForAgent.__gsInline = runtime?.inline;
}

function queue(): Queue<RunJob> {
  globalForAgent.__gsQueue ??= new Queue<RunJob>(QUEUE_NAME, { connection: redisOptions() });
  return globalForAgent.__gsQueue;
}

/** Hands a run to whoever executes runs in this deployment. */
export async function dispatchRun(runId: string): Promise<void> {
  if (agentMode() === "redis") {
    await queue().add("run", { runId }, { jobId: runId, attempts: 1, removeOnComplete: 1000, removeOnFail: 1000 });
    return;
  }
  const execute =
    globalForAgent.__gsInline ??
    (async (id: string) => {
      const { executeRun } = await import("./runner");
      await executeRun(id, { bus: runBus() });
    });
  // Fire and forget: the browser follows along over SSE.
  void execute(runId).catch((error) => console.error("[agent] inline run crashed", error));
}

/** Closes the queue and Redis connections (worker shutdown, tests). */
export async function closeAgentConnections() {
  await globalForAgent.__gsQueue?.close();
  globalForAgent.__gsQueue = undefined;
  globalForAgent.__gsRedis?.disconnect();
  globalForAgent.__gsRedis = undefined;
  globalForAgent.__gsBus = undefined;
}
