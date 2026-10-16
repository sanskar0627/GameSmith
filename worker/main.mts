/**
 * GameSmith agent worker: runs agent jobs from the BullMQ queue.
 *
 *   npm run worker        (needs AGENT_QUEUE=redis and Redis: npm run redis:up)
 *
 * Runs with the `react-server` export condition so server-only modules load
 * outside Next. One process handles AGENT_CONCURRENCY runs at a time; start
 * more processes to scale out.
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { Worker } = await import("bullmq");
const { serverEnv } = await import("@/lib/env");
const { QUEUE_NAME, redisOptions, runBus } = await import("@/lib/server/agent/queue");
const { executeRun } = await import("@/lib/server/agent/runner");
const { sweepStaleRuns } = await import("@/lib/server/agent/service");

const env = serverEnv();
if (env.AGENT_QUEUE !== "redis") {
  console.error("[worker] AGENT_QUEUE is not redis: runs execute inside the web app. Set AGENT_QUEUE=redis to use this worker.");
  process.exit(1);
}

const active = new Set<string>();
const worker = new Worker<{ runId: string }>(
  QUEUE_NAME,
  async (job) => {
    active.add(job.data.runId);
    try {
      await executeRun(job.data.runId, { bus: runBus() });
    } finally {
      active.delete(job.data.runId);
    }
  },
  {
    connection: redisOptions(),
    concurrency: env.AGENT_CONCURRENCY,
    // A job whose worker died is not retried: the sweeper fails the run and releases its sparks.
    maxStalledCount: 0,
  },
);

worker.on("failed", (job, error) => console.error(`[worker] run ${job?.data.runId} crashed`, error));
worker.on("ready", () => console.log(`[worker] waiting for runs (concurrency ${env.AGENT_CONCURRENCY})`));

const sweep = () =>
  sweepStaleRuns().then(
    (n) => n && console.log(`[worker] failed ${n} stale run(s)`),
    (error) => console.error("[worker] sweep failed", error),
  );
await sweep();
const sweeper = setInterval(sweep, 60_000);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`[worker] ${signal}: stopping ${active.size} run(s)`);
  clearInterval(sweeper);
  // Ask running agents to stop; each saves what it has and settles its sparks.
  await Promise.all([...active].map((runId) => runBus().cancel(runId)));
  await worker.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
