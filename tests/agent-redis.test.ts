import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The production path against a real Redis: BullMQ queue, a worker, and
 * Redis Streams for events. Runs only when TEST_REDIS_URL is set, e.g.
 *   TEST_REDIS_URL=redis://:<password>@127.0.0.1:6379/15 npm test
 */
const redisUrl = vi.hoisted(() => {
  const url = process.env.TEST_REDIS_URL;
  if (url) {
    process.env.AGENT_QUEUE = "redis";
    process.env.REDIS_URL = url;
    process.env.PLATFORM_ANTHROPIC_API_KEY = "sk-platform-test";
  }
  return url;
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: null, orgId: null, redirectToSignIn: () => {} }),
  currentUser: async () => null,
}));

import { db } from "@/lib/db";
import { agentRuns } from "@/lib/db/schema";
import { RedisBus } from "@/lib/server/agent/bus";
import { closeAgentConnections, QUEUE_NAME, redisOptions, runBus } from "@/lib/server/agent/queue";
import { executeRun } from "@/lib/server/agent/runner";
import { createRun } from "@/lib/server/agent/service";
import { getWallet } from "@/lib/server/billing/wallet";
import { setSandboxClientForTests } from "@/lib/server/sandbox/service";
import type { RunEvent } from "@/lib/workspace/events";

import { call, fakeSandbox, finish, scriptedModel, text } from "./support/agent";
import { createGame, createUser } from "./support/factories";

describe.skipIf(!redisUrl)("agent over Redis", () => {
  let worker: Worker<{ runId: string }>;
  let raw: Redis;
  const sandbox = fakeSandbox();

  beforeAll(async () => {
    raw = new Redis(redisUrl!);
    await raw.flushdb();
    setSandboxClientForTests(sandbox.client);
    const { model } = scriptedModel([
      [...text("t", "Building."), call("c1", "write_file", { path: "src/main.ts", content: "ok" }), finish("tool-calls")],
      [call("c2", "checkpoint", { label: "First" }), finish("tool-calls")],
      [...text("t2", "Done."), finish("stop")],
    ]);
    worker = new Worker<{ runId: string }>(
      QUEUE_NAME,
      (job) => executeRun(job.data.runId, { bus: runBus(), modelFor: () => model, sandbox: () => sandbox.client }),
      { connection: redisOptions(), maxStalledCount: 0 },
    );
    await worker.waitUntilReady();
  });

  afterAll(async () => {
    await worker?.close();
    await closeAgentConnections();
    raw?.disconnect();
    setSandboxClientForTests(null);
  });

  it("queues the run, the worker executes it and events stream through Redis", async () => {
    await createUser("user_a");
    await getWallet("user_a");
    const game = await createGame("user_a");
    const { runId } = await createRun("user_a", game.id, { kind: "prompt", text: "go" });

    const events: { id: string; event: RunEvent }[] = [];
    for await (const envelope of runBus().read(runId, null, AbortSignal.timeout(15_000))) events.push(envelope);
    expect(events[0]!.event).toMatchObject({ type: "start", runId });
    expect(events.at(-1)!.event).toEqual({ type: "done", status: "settled" });
    expect(events.map((e) => e.event)).toContainEqual({ type: "build", build: { status: "ready", version: 1 } });

    // A reconnect resumes after the last id it saw.
    const middle = events[Math.floor(events.length / 2)]!;
    const rest: RunEvent[] = [];
    for await (const { event } of runBus().read(runId, middle.id, AbortSignal.timeout(5_000))) rest.push(event);
    expect(rest).toEqual(events.slice(events.indexOf(middle) + 1).map((e) => e.event));

    const [run] = await db().select().from(agentRuns).where(eq(agentRuns.id, runId));
    expect(run.status).toBe("settled");
    expect(sandbox.files.get("src/main.ts")).toBe("ok");
  });

  it("cancel flags are shared through Redis", async () => {
    const bus = new RedisBus(raw);
    expect(await bus.isCanceled("00000000-0000-4000-8000-000000000009")).toBe(false);
    await bus.cancel("00000000-0000-4000-8000-000000000009");
    expect(await bus.isCanceled("00000000-0000-4000-8000-000000000009")).toBe(true);
  });
});
