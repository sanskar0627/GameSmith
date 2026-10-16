import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Server env is read once per test file, so the platform key is set before anything loads.
vi.hoisted(() => {
  process.env.PLATFORM_ANTHROPIC_API_KEY = "sk-platform-test";
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: null, orgId: null, redirectToSignIn: () => {} }),
  currentUser: async () => null,
}));

import { getModel } from "@/lib/ai/models";
import { costMicroUsd, sparksForCost } from "@/lib/billing/pricing";
import { db } from "@/lib/db";
import { agentRuns, gameVersions, games, messages, wallets } from "@/lib/db/schema";
import { MemoryBus } from "@/lib/server/agent/bus";
import { toModelMessages } from "@/lib/server/agent/history";
import { setAgentRuntimeForTests } from "@/lib/server/agent/queue";
import { executeRun } from "@/lib/server/agent/runner";
import { createRun, RunInProgressError, RunInputError, sweepStaleRuns } from "@/lib/server/agent/service";
import { lineChange } from "@/lib/server/agent/tools";
import { InsufficientSparksError, getWallet } from "@/lib/server/billing/wallet";
import { saveProviderKey } from "@/lib/server/keys";
import { setSandboxClientForTests } from "@/lib/server/sandbox/service";
import type { RunEvent } from "@/lib/workspace/events";
import type { ChatMessage, MessagePart } from "@/lib/workspace/types";

import { call, fakeSandbox, finish, scriptedModel, text } from "./support/agent";
import { createGame, createUser, ledgerMatchesWallet } from "./support/factories";

const sonnet = getModel("anthropic/claude-sonnet-5-5")!;

let bus: MemoryBus;
let sandbox: ReturnType<typeof fakeSandbox>;
let running: Promise<void>[];

function useModel(model: ReturnType<typeof scriptedModel>["model"], options: { cancelPollMs?: number } = {}) {
  setAgentRuntimeForTests({
    bus,
    inline: (runId) => {
      const p = executeRun(runId, { bus, modelFor: () => model, sandbox: () => sandbox.client, heartbeatMs: 50, ...options });
      running.push(p);
      return p;
    },
  });
}

async function settled() {
  await Promise.all(running);
  running = [];
}

async function events(runId: string): Promise<RunEvent[]> {
  const out: RunEvent[] = [];
  for await (const { event } of bus.read(runId, null, AbortSignal.timeout(1000))) out.push(event);
  return out;
}

async function assistantParts(gameId: string): Promise<MessagePart[]> {
  const rows = await db().select().from(messages).where(and(eq(messages.gameId, gameId), eq(messages.role, "assistant")));
  return rows.at(-1)?.parts ?? [];
}

async function setup() {
  await createUser("user_a");
  const game = await createGame("user_a");
  await getWallet("user_a");
  return game;
}

beforeEach(() => {
  bus = new MemoryBus();
  sandbox = fakeSandbox();
  running = [];
  setSandboxClientForTests(sandbox.client);
});

afterEach(() => {
  setAgentRuntimeForTests(null);
  setSandboxClientForTests(null);
});

describe("agent runs", () => {
  it("writes files, saves a version and settles sparks", async () => {
    const game = await setup();
    const { model, calls } = scriptedModel([
      [...text("t1", "On it."), call("c1", "write_file", { path: "src/main.ts", content: "a\nb\nc" }), finish("tool-calls", 2000, 300)],
      [call("c2", "checkpoint", { label: "First playable" }), finish("tool-calls", 2500, 50)],
      [...text("t2", "Your game is live."), finish("stop", 2600, 40)],
    ]);
    useModel(model);

    const { runId, userMessage } = await createRun("user_a", game.id, { kind: "prompt", text: "A tiny platformer" });
    expect(userMessage?.parts).toEqual([{ type: "text", text: "A tiny platformer" }]);
    await settled();

    expect(calls()).toBe(3);
    expect(sandbox.files.get("src/main.ts")).toBe("a\nb\nc");
    expect(sandbox.snapshots).toEqual(["v1"]);

    const [version] = await db().select().from(gameVersions).where(eq(gameVersions.gameId, game.id));
    expect(version).toMatchObject({ number: 1, label: "First playable", snapshotKey: "v1", filesChanged: 1, prompt: "A tiny platformer" });
    const [g] = await db().select().from(games).where(eq(games.id, game.id));
    expect(g).toMatchObject({ currentVersion: 1, status: "ready" });

    const parts = await assistantParts(game.id);
    expect(parts.map((p) => p.type)).toEqual(["text", "tool", "checkpoint", "text"]);
    expect(parts[1]).toMatchObject({ tool: "write_file", path: "src/main.ts", state: "done", added: 3, removed: 1 });

    const [run] = await db().select().from(agentRuns).where(eq(agentRuns.id, runId));
    const cost = costMicroUsd(sonnet, { inputTokens: 7100, outputTokens: 390 });
    expect(run).toMatchObject({ status: "settled", billingMode: "credits", inputTokens: 7100, outputTokens: 390, steps: 3 });
    expect(run.sparksCharged).toBe(sparksForCost(cost));
    expect(await ledgerMatchesWallet("user_a")).toBe(true);
    const [w] = await db().select().from(wallets).where(eq(wallets.userId, "user_a"));
    expect(w.granted).toBe(2000 - run.sparksCharged);

    const stream = await events(runId);
    expect(stream[0]).toMatchObject({ type: "start", runId });
    expect(stream.at(-1)).toEqual({ type: "done", status: "settled" });
    expect(stream).toContainEqual({ type: "build", build: { status: "ready", version: 1 } });
  });

  it("charges nothing on the user's own key", async () => {
    const game = await setup();
    await saveProviderKey("user_a", "anthropic", "sk-ant-user-key-1234567890", { verify: async () => ({ ok: true }) });
    const { model } = scriptedModel([[...text("t", "Hi"), finish("stop", 50_000, 5_000)]]);
    useModel(model);
    const { runId } = await createRun("user_a", game.id, { kind: "prompt", text: "hello" });
    await settled();
    const [run] = await db().select().from(agentRuns).where(eq(agentRuns.id, runId));
    expect(run).toMatchObject({ status: "settled", billingMode: "byok", sparksCharged: 0, inputTokens: 50_000 });
    const [w] = await db().select().from(wallets).where(eq(wallets.userId, "user_a"));
    expect(w.granted).toBe(2000);
  });

  it("stops at a question and continues with the answer", async () => {
    const game = await setup();
    const ask = { question: "Which camera?", options: [{ id: "side", label: "Side view" }, { id: "top", label: "Top down" }] };
    const first = scriptedModel([[...text("t", "One question:"), call("ask1", "ask_player", ask), finish("tool-calls")]]);
    useModel(first.model);
    await createRun("user_a", game.id, { kind: "prompt", text: "A racing game" });
    await settled();
    expect(first.calls()).toBe(1);
    const parts = await assistantParts(game.id);
    expect(parts.at(-1)).toMatchObject({ type: "ask", id: "ask1", question: "Which camera?" });

    const second = scriptedModel([[...text("t", "Side view it is."), finish("stop")]]);
    useModel(second.model);
    await createRun("user_a", game.id, { kind: "answer", askId: "ask1", value: "Side view" });
    await settled();
    expect((await assistantParts(game.id))[0]).toBeDefined();
    const prompt = JSON.stringify(second.model.doStreamCalls[0]!.prompt);
    expect(prompt).toContain('"toolName":"ask_player"');
    expect(prompt).toContain("Side view");
    await expect(createRun("user_a", game.id, { kind: "answer", askId: "ask1", value: "Top" })).rejects.toBeInstanceOf(RunInputError);
  });

  it("can be stopped mid-run and keeps the hold it didn't use", async () => {
    const game = await setup();
    const slow = scriptedModel(
      [[...text("t", "Working"), call("c1", "write_file", { path: "src/a.ts", content: "x" }), finish("tool-calls", 100, 10)]],
      { delayMs: 40 },
    );
    useModel(slow.model, { cancelPollMs: 10 });
    const { runId } = await createRun("user_a", game.id, { kind: "prompt", text: "go" });
    await bus.cancel(runId);
    await settled();
    const [run] = await db().select().from(agentRuns).where(eq(agentRuns.id, runId));
    expect(run.status).toBe("canceled");
    expect((await assistantParts(game.id)).some((p) => p.type === "notice" && p.text.startsWith("Stopped"))).toBe(true);
    expect(await ledgerMatchesWallet("user_a")).toBe(true);
    const [w] = await db().select().from(wallets).where(eq(wallets.userId, "user_a"));
    expect(w.granted).toBe(2000 - run.sparksCharged);
  });

  it("reports model errors and releases the hold", async () => {
    const game = await setup();
    const { model } = scriptedModel([[{ type: "error", error: Object.assign(new Error("bad key"), { statusCode: 401 }) }]]);
    useModel(model);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runId } = await createRun("user_a", game.id, { kind: "prompt", text: "go" });
    await settled();
    error.mockRestore();
    const [run] = await db().select().from(agentRuns).where(eq(agentRuns.id, runId));
    expect(run.status).toBe("failed");
    expect(await assistantParts(game.id)).toContainEqual({ type: "error", message: "Anthropic rejected the API key for this run." });
    const [w] = await db().select().from(wallets).where(eq(wallets.userId, "user_a"));
    expect(w.granted).toBe(2000);
  });

  it("refuses a second run, an empty wallet and missing sandboxes", async () => {
    const game = await setup();
    const slow = scriptedModel([[...text("t", "..."), finish("stop")]], { delayMs: 30 });
    useModel(slow.model);
    const { runId } = await createRun("user_a", game.id, { kind: "prompt", text: "one" });
    await expect(createRun("user_a", game.id, { kind: "prompt", text: "two" })).rejects.toBeInstanceOf(RunInProgressError);
    await settled();
    await bus.read(runId, null, AbortSignal.timeout(10)).next();

    await db().update(wallets).set({ granted: 0, purchased: 0 }).where(eq(wallets.userId, "user_a"));
    const before = (await db().select().from(messages).where(eq(messages.gameId, game.id))).length;
    await expect(createRun("user_a", game.id, { kind: "prompt", text: "three" })).rejects.toBeInstanceOf(InsufficientSparksError);
    expect((await db().select().from(messages).where(eq(messages.gameId, game.id))).length).toBe(before);

    setSandboxClientForTests(null);
    await expect(createRun("user_a", game.id, { kind: "prompt", text: "four" })).rejects.toThrow("Sandboxes aren't set up");
  });

  it("answers the saved first prompt on resume", async () => {
    await createUser("user_a");
    await getWallet("user_a");
    const game = await createGame("user_a");
    await db().insert(messages).values({ gameId: game.id, role: "user", parts: [{ type: "text", text: "A maze game" }] });
    const { model } = scriptedModel([[...text("t", "Nice."), finish("stop")]]);
    useModel(model);
    const { runId, userMessage } = await createRun("user_a", game.id, { kind: "resume" });
    expect(userMessage).toBeNull();
    await settled();
    const [run] = await db().select().from(agentRuns).where(eq(agentRuns.id, runId));
    expect(run.prompt).toBe("A maze game");
    await expect(createRun("user_a", game.id, { kind: "resume" })).rejects.toBeInstanceOf(RunInputError);
  });

  it("fails runs whose worker stopped and releases their sparks", async () => {
    const game = await setup();
    useModel(scriptedModel([[finish("stop")]]).model);
    setAgentRuntimeForTests({ bus, inline: async () => {} });
    const { runId } = await createRun("user_a", game.id, { kind: "prompt", text: "go" });
    await db().update(agentRuns).set({ heartbeatAt: new Date(Date.now() - 10 * 60_000) }).where(eq(agentRuns.id, runId));
    expect(await sweepStaleRuns({ gameId: game.id })).toBe(1);
    const [run] = await db().select().from(agentRuns).where(eq(agentRuns.id, runId));
    expect(run).toMatchObject({ status: "failed", sparksCharged: 0 });
    const [w] = await db().select().from(wallets).where(eq(wallets.userId, "user_a"));
    expect(w.granted).toBe(2000);
  });
});

describe("history", () => {
  const at = new Date(0).toISOString();
  it("replays questions and briefs as tool calls with the player's response", () => {
    const thread: ChatMessage[] = [
      { id: "u1", role: "user", createdAt: at, parts: [{ type: "text", text: "A game" }] },
      {
        id: "a1",
        role: "assistant",
        createdAt: at,
        parts: [
          { type: "text", text: "Question:" },
          { type: "ask", id: "k1", question: "Camera?", options: [{ id: "a", label: "A" }], answer: "A" },
        ],
      },
      { id: "u2", role: "user", createdAt: at, parts: [{ type: "text", text: "A" }], attachments: [{ kind: "runtime-error", message: "boom" }] },
      {
        id: "a2",
        role: "assistant",
        createdAt: at,
        parts: [
          { type: "reasoning", text: "hmm" },
          { type: "tool", id: "t", tool: "write_file", state: "done", path: "src/x.ts" },
          { type: "brief", status: "approved", brief: { title: "T", pitch: "", loop: "", goal: "", challenge: "", controls: [], world: "", style: "", feel: "" } },
        ],
      },
    ];
    const out = toModelMessages(thread);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "tool", "user", "assistant", "tool"]);
    expect(JSON.stringify(out[2])).toContain('"answer":"A"');
    expect(out[3]!.content).toContain("boom");
    expect(JSON.stringify(out[4])).toContain("wrote src/x.ts");
    expect(JSON.stringify(out[5])).toContain('"status":"approved"');
  });

  it("counts changed lines", () => {
    expect(lineChange("", "a\nb")).toEqual({ added: 2, removed: 0 });
    expect(lineChange("a\nb\nc", "a\nx\nc")).toEqual({ added: 1, removed: 1 });
  });
});
