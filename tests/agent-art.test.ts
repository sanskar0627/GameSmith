import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PLATFORM_ANTHROPIC_API_KEY = "sk-platform-test";
  process.env.PLATFORM_FAL_KEY = "fal-platform-test";
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: null, orgId: null, redirectToSignIn: () => {} }),
  currentUser: async () => null,
}));

import { getModel } from "@/lib/ai/models";
import { costMicroUsd, imageCostMicroUsd, MAX_IMAGES_PER_RUN, sparksForCost } from "@/lib/billing/pricing";
import { db } from "@/lib/db";
import { agentRuns, messages } from "@/lib/db/schema";
import type { Draw } from "@/lib/server/agent/art";
import { imageExtension } from "@/lib/server/agent/art";
import { MemoryBus } from "@/lib/server/agent/bus";
import { agentInstructions } from "@/lib/server/agent/prompt";
import { setAgentRuntimeForTests } from "@/lib/server/agent/queue";
import { executeRun } from "@/lib/server/agent/runner";
import { createRun } from "@/lib/server/agent/service";
import { getWallet } from "@/lib/server/billing/wallet";
import { saveProviderKey } from "@/lib/server/keys";
import { setSandboxClientForTests } from "@/lib/server/sandbox/service";
import type { MessagePart } from "@/lib/workspace/types";

import { call, fakeSandbox, finish, scriptedModel, text } from "./support/agent";
import { createGame, createUser, ledgerMatchesWallet } from "./support/factories";

const sonnet = getModel("anthropic/claude-sonnet-5-5")!;

let bus: MemoryBus;
let sandbox: ReturnType<typeof fakeSandbox>;
let running: Promise<void>[];
let drawn: { key: string; prompt: string; transparent: boolean }[];

const fakeDraw = (key: string): Draw => async ({ prompt, transparent }) => {
  drawn.push({ key, prompt, transparent });
  return { data: new TextEncoder().encode("IMG"), mediaType: transparent ? "image/png" : "image/jpeg" };
};

function useModel(model: ReturnType<typeof scriptedModel>["model"]) {
  setAgentRuntimeForTests({
    bus,
    inline: (runId) => {
      const p = executeRun(runId, { bus, modelFor: () => model, sandbox: () => sandbox.client, drawFor: fakeDraw, heartbeatMs: 50 });
      running.push(p);
      return p;
    },
  });
}

async function settled() {
  await Promise.all(running);
  running = [];
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
  drawn = [];
  setSandboxClientForTests(sandbox.client);
});

afterEach(() => {
  setAgentRuntimeForTests(null);
  setSandboxClientForTests(null);
});

describe("game art", () => {
  it("paints with the platform key on a sparks run and charges for it", async () => {
    const game = await setup();
    const { model, tools } = scriptedModel([
      [call("c1", "generate_image", { name: "night-sky", prompt: "a starry night sky", shape: "landscape" }), finish("tool-calls", 1000, 100)],
      [call("c2", "generate_image", { name: "hero", prompt: "a tiny robot", transparent: true }), finish("tool-calls", 1000, 100)],
      [...text("t1", "Painted."), finish("stop", 1000, 50)],
    ]);
    useModel(model);

    const { runId } = await createRun("user_a", game.id, { kind: "prompt", text: "Make it pretty" });
    await settled();

    expect(tools()[0]).toContain("generate_image");
    expect(drawn).toEqual([
      { key: "fal-platform-test", prompt: "a starry night sky", transparent: false },
      { key: "fal-platform-test", prompt: "a tiny robot", transparent: true },
    ]);
    expect(sandbox.files.get("public/assets/night-sky.jpg")).toBe("IMG");
    expect(sandbox.files.get("public/assets/hero.png")).toBe("IMG");

    const parts = await assistantParts(game.id);
    const tool = parts.filter((p) => p.type === "tool");
    expect(tool).toMatchObject([
      { tool: "generate_image", path: "public/assets/night-sky.jpg", state: "done" },
      { tool: "generate_image", path: "public/assets/hero.png", state: "done" },
    ]);

    const [run] = await db().select().from(agentRuns).where(eq(agentRuns.id, runId));
    const cost = costMicroUsd(sonnet, { inputTokens: 3000, outputTokens: 250 }) + imageCostMicroUsd(false) + imageCostMicroUsd(true);
    expect(run.costMicroUsd).toBe(cost);
    expect(run.sparksCharged).toBe(sparksForCost(cost));
    expect(await ledgerMatchesWallet("user_a")).toBe(true);
  });

  it("uses the player's own Fal key for free", async () => {
    const game = await setup();
    await saveProviderKey("user_a", "fal", "fal-user-key-1234567890", { verify: async () => ({ ok: true }) });
    const { model } = scriptedModel([
      [call("c1", "generate_image", { name: "sky", prompt: "a sunset sky" }), finish("tool-calls", 1000, 100)],
      [...text("t1", "Done."), finish("stop", 1000, 50)],
    ]);
    useModel(model);

    const { runId } = await createRun("user_a", game.id, { kind: "prompt", text: "Sky please" });
    await settled();

    expect(drawn.map((d) => d.key)).toEqual(["fal-user-key-1234567890"]);
    const [run] = await db().select().from(agentRuns).where(eq(agentRuns.id, runId));
    expect(run.costMicroUsd).toBe(costMicroUsd(sonnet, { inputTokens: 2000, outputTokens: 150 }));
  });

  it("offers no art tool on the player's chat key without a Fal key", async () => {
    const game = await setup();
    await saveProviderKey("user_a", "anthropic", "sk-ant-user-key-1234567890", { verify: async () => ({ ok: true }) });
    const { model, tools } = scriptedModel([[...text("t1", "Code art only."), finish("stop", 1000, 50)]]);
    useModel(model);

    await createRun("user_a", game.id, { kind: "prompt", text: "Hi" });
    await settled();
    expect(tools()[0]).not.toContain("generate_image");
    expect(tools()[0]).toContain("write_file");
  });

  it("stops painting at the per-run cap", async () => {
    const game = await setup();
    await saveProviderKey("user_a", "fal", "fal-user-key-1234567890", { verify: async () => ({ ok: true }) });
    const steps = Array.from({ length: MAX_IMAGES_PER_RUN + 1 }, (_, i) => [
      call(`c${i}`, "generate_image", { name: `a${i}`, prompt: "a thing" }),
      finish("tool-calls", 100, 10),
    ]);
    const { model } = scriptedModel([...steps, [...text("t", "ok"), finish("stop", 100, 10)]]);
    useModel(model);

    await createRun("user_a", game.id, { kind: "prompt", text: "Lots of art" });
    await settled();
    expect(drawn).toHaveLength(MAX_IMAGES_PER_RUN);
    const parts = await assistantParts(game.id);
    expect(parts.filter((p) => p.type === "tool" && p.state === "error")).toHaveLength(1);
  });

  it("rejects bad asset names", async () => {
    const game = await setup();
    await saveProviderKey("user_a", "fal", "fal-user-key-1234567890", { verify: async () => ({ ok: true }) });
    const { model } = scriptedModel([
      [call("c1", "generate_image", { name: "../../etc/passwd", prompt: "x x x" }), finish("tool-calls", 100, 10)],
      [...text("t", "ok"), finish("stop", 100, 10)],
    ]);
    useModel(model);
    await createRun("user_a", game.id, { kind: "prompt", text: "Hack" });
    await settled();
    expect(drawn).toHaveLength(0);
    expect([...sandbox.files.keys()].some((k) => k.includes("passwd"))).toBe(false);
  });

  it("only mentions the art tool when the run has it", () => {
    expect(agentInstructions({ title: "T", pitch: "" }, { art: true })).toContain("generate_image");
    expect(agentInstructions({ title: "T", pitch: "" })).not.toContain("generate_image");
    expect(imageExtension("image/png")).toBe("png");
    expect(imageExtension("image/jpeg")).toBe("jpg");
  });
});
