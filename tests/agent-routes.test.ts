import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => {
  process.env.PLATFORM_ANTHROPIC_API_KEY = "sk-platform-test";
  return { userId: null as string | null };
});
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.userId, orgId: null, redirectToSignIn: () => {} }),
  currentUser: async () => null,
}));

import { POST as cancelRoute } from "@/app/api/games/[gameId]/runs/[runId]/cancel/route";
import { GET as eventsRoute } from "@/app/api/games/[gameId]/runs/[runId]/events/route";
import { GET as activeRoute, POST as startRoute } from "@/app/api/games/[gameId]/runs/route";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { MemoryBus } from "@/lib/server/agent/bus";
import { setAgentRuntimeForTests } from "@/lib/server/agent/queue";
import { executeRun } from "@/lib/server/agent/runner";
import { getWallet } from "@/lib/server/billing/wallet";
import { setSandboxClientForTests } from "@/lib/server/sandbox/service";
import type { RunEvent } from "@/lib/workspace/events";

import { fakeSandbox, finish, scriptedModel, text } from "./support/agent";
import { createGame, createUser } from "./support/factories";

let bus: MemoryBus;
let running: Promise<void>[];
let gate: Promise<void>;
let open: () => void;

const ctx = (gameId: string) => ({ params: Promise.resolve({ gameId }) });
const runCtx = (gameId: string, runId: string) => ({ params: Promise.resolve({ gameId, runId }) });
const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  bus = new MemoryBus();
  running = [];
  gate = new Promise((r) => (open = r));
  const sandbox = fakeSandbox();
  setSandboxClientForTests(sandbox.client);
  const { model } = scriptedModel([[...text("t", "Hello from Smith."), finish("stop")]]);
  setAgentRuntimeForTests({
    bus,
    // Runs wait for the test to open the gate, so "running" states are observable.
    inline: (runId) => {
      const p = gate.then(() => executeRun(runId, { bus, modelFor: () => model, sandbox: () => sandbox.client }));
      running.push(p);
      return p;
    },
  });
});

afterEach(async () => {
  open();
  await Promise.all(running);
  setAgentRuntimeForTests(null);
  setSandboxClientForTests(null);
  clerk.userId = null;
});

async function ownGame() {
  await createUser("user_a");
  await getWallet("user_a");
  clerk.userId = "user_a";
  return createGame("user_a");
}

function parseSse(body: string): RunEvent[] {
  return body
    .split("\n\n")
    .map((block) => block.split("\n").find((l) => l.startsWith("data: ")))
    .filter((l): l is string => !!l)
    .map((l) => JSON.parse(l.slice(6)) as RunEvent);
}

describe("run routes", () => {
  it("start a run, report it as active and stream its events to the end", async () => {
    const game = await ownGame();
    const res = await startRoute(post({ kind: "prompt", text: "A space shooter" }), ctx(game.id));
    expect(res.status).toBe(201);
    const { runId, userMessage } = (await res.json()) as { runId: string; userMessage: { role: string } };
    expect(userMessage.role).toBe("user");
    expect(await (await activeRoute(new Request("http://x"), ctx(game.id))).json()).toEqual({ runId });

    const again = await startRoute(post({ kind: "prompt", text: "more" }), ctx(game.id));
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ runId });

    const stream = await eventsRoute(new Request("http://x"), runCtx(game.id, runId));
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    open();
    const events = parseSse(await stream.text());
    expect(events[0]).toMatchObject({ type: "start", runId });
    expect(events.at(-1)).toEqual({ type: "done", status: "settled" });
    expect(await (await activeRoute(new Request("http://x"), ctx(game.id))).json()).toEqual({ runId: null });

    // Reconnecting after the end replays what is buffered, still ending in done.
    const replay = parseSse(await (await eventsRoute(new Request("http://x"), runCtx(game.id, runId))).text());
    expect(replay.at(-1)).toEqual({ type: "done", status: "settled" });
  });

  it("validate input and map errors", async () => {
    const game = await ownGame();
    expect((await startRoute(post({ kind: "prompt", text: "  " }), ctx(game.id))).status).toBe(400);
    expect((await startRoute(post({ kind: "nope" }), ctx(game.id))).status).toBe(400);
    expect((await startRoute(post({ kind: "resume" }), ctx(game.id))).status).toBe(400);
    await db().update(wallets).set({ granted: 0 }).where(eq(wallets.userId, "user_a"));
    const broke = await startRoute(post({ kind: "prompt", text: "go" }), ctx(game.id));
    expect(broke.status).toBe(402);
    expect(await broke.json()).toMatchObject({ code: "no-sparks" });
  });

  it("cancel a run", async () => {
    const game = await ownGame();
    const { runId } = (await (await startRoute(post({ kind: "prompt", text: "go" }), ctx(game.id))).json()) as { runId: string };
    expect((await cancelRoute(new Request("http://x", { method: "POST" }), runCtx(game.id, runId))).status).toBe(202);
    expect(await bus.isCanceled(runId)).toBe(true);
  });

  it("are owner only", async () => {
    const game = await ownGame();
    const { runId } = (await (await startRoute(post({ kind: "prompt", text: "go" }), ctx(game.id))).json()) as { runId: string };
    await createUser("user_b");
    clerk.userId = "user_b";
    expect((await startRoute(post({ kind: "prompt", text: "x" }), ctx(game.id))).status).toBe(404);
    expect((await activeRoute(new Request("http://x"), ctx(game.id))).status).toBe(404);
    expect((await eventsRoute(new Request("http://x"), runCtx(game.id, runId))).status).toBe(404);
    expect((await cancelRoute(new Request("http://x", { method: "POST" }), runCtx(game.id, runId))).status).toBe(404);
    clerk.userId = null;
    expect((await startRoute(post({ kind: "prompt", text: "x" }), ctx(game.id))).status).toBe(401);
  });
});
