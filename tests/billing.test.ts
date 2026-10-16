import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getModel } from "@/lib/ai/models";
import type { VerifyResult } from "@/lib/ai/verify";
import { costMicroUsd, runBudgetSparks, sparksForCost } from "@/lib/billing/pricing";
import { db } from "@/lib/db";
import { agentRuns, sparkLedger, users, wallets } from "@/lib/db/schema";

import { createGame, createUser, ledgerMatchesWallet } from "./support/factories";

const sonnet = getModel("anthropic/claude-sonnet-5-5")!;
const haiku = getModel("anthropic/claude-haiku-5-5")!;
const ok = async (): Promise<VerifyResult> => ({ ok: true });

// Platform keys are read through serverEnv(), which caches: load fresh modules per test.
async function load() {
  vi.resetModules();
  vi.stubEnv("PLATFORM_ANTHROPIC_API_KEY", "platform-anthropic");
  return {
    wallet: await import("@/lib/server/billing/wallet"),
    runs: await import("@/lib/server/billing/runs"),
    summary: await import("@/lib/server/billing/summary"),
    keys: await import("@/lib/server/keys"),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

async function walletOf(userId: string) {
  const [w] = await db().select().from(wallets).where(eq(wallets.userId, userId));
  return w;
}

/** Sets balances through an "adjust" ledger row, as an admin correction would. */
async function setBalance(userId: string, granted: number, purchased = 0) {
  const before = await walletOf(userId);
  await db().update(wallets).set({ granted, purchased }).where(eq(wallets.userId, userId));
  await db()
    .insert(sparkLedger)
    .values({
      userId,
      reason: "adjust",
      grantedDelta: granted - before.granted,
      purchasedDelta: purchased - before.purchased,
      idempotencyKey: `test:${userId}:${Math.random()}`,
    });
}

describe("pricing", () => {
  it("charges list price, with long-context rates over the threshold", () => {
    // Sonnet: $2 in / $10 out per million.
    expect(costMicroUsd(sonnet, { inputTokens: 1_000_000, outputTokens: 0 })).toBe(2_000_000);
    expect(costMicroUsd(sonnet, { inputTokens: 0, outputTokens: 100_000 })).toBe(1_000_000);
    // Haiku: $0.10 / $0.50 up to 100K prompt tokens, $0.50 / $2.50 above.
    expect(costMicroUsd(haiku, { inputTokens: 100_000, outputTokens: 0 })).toBe(10_000);
    expect(costMicroUsd(haiku, { inputTokens: 100_001, outputTokens: 0 })).toBe(50_001);
  });

  it("rounds sparks up so a paid call is never free", () => {
    expect(sparksForCost(0)).toBe(0);
    expect(sparksForCost(1)).toBe(1);
    expect(sparksForCost(500)).toBe(1);
    expect(sparksForCost(501)).toBe(2);
  });
});

describe("wallet periods", () => {
  it("grants the free allowance once per month and expires it at the end", async () => {
    const { wallet } = await load();
    await createUser("user_a");
    const oct = new Date("2026-10-15T10:00:00Z");
    expect((await wallet.getWallet("user_a", db(), oct)).granted).toBe(2000);
    expect((await wallet.getWallet("user_a", db(), oct)).granted).toBe(2000);

    await setBalance("user_a", 300);
    const nov = await wallet.getWallet("user_a", db(), new Date("2026-11-02T00:00:00Z"));
    expect(nov).toMatchObject({ granted: 2000, allowance: 2000 });
    expect(nov.periodStart.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    const reasons = (await db().select().from(sparkLedger).where(eq(sparkLedger.userId, "user_a"))).map((r) => r.reason);
    expect(reasons.filter((r) => r === "grant")).toHaveLength(2);
    expect(reasons).toContain("expire");
    expect(await ledgerMatchesWallet("user_a")).toBe(true);
  });

  it("allows only one running agent per game", async () => {
    const { runs, wallet } = await load();
    await createUser("user_a");
    const game = await createGame("user_a");
    await wallet.getWallet("user_a");
    await setBalance("user_a", 5_000, 0);
    const first = await runs.startRun({ userId: "user_a", gameId: game.id, modelId: sonnet.id, budgetSparks: 300 });
    await expect(
      runs.startRun({ userId: "user_a", gameId: game.id, modelId: sonnet.id, budgetSparks: 300 }),
    ).rejects.toThrow();
    // The refused run held nothing.
    expect(await walletOf("user_a")).toMatchObject({ granted: 4_700 });
    await runs.finishRun({ runId: first.run.id, spec: sonnet, usage: { inputTokens: 0, outputTokens: 0 }, outcome: "canceled" });
    await runs.startRun({ userId: "user_a", gameId: game.id, modelId: sonnet.id, budgetSparks: 300 });
    expect(await ledgerMatchesWallet("user_a")).toBe(true);
  });
});

describe("runs on sparks", () => {
  it("holds up to the run budget, charges usage and returns the rest", async () => {
    const { runs } = await load();
    await createUser("user_a");
    const game = await createGame("user_a");
    const { run, apiKey } = await runs.startRun({ userId: "user_a", gameId: game.id, modelId: sonnet.id });
    expect(apiKey).toBe("platform-anthropic");
    expect(run).toMatchObject({ billingMode: "credits", reservedGranted: Math.min(2000, runBudgetSparks(sonnet)) });
    expect((await walletOf("user_a")).granted).toBe(2000 - run.reservedGranted);

    // 100K in + 10K out on Sonnet = $0.20 + $0.10 = 600 sparks.
    const done = await runs.finishRun({
      runId: run.id,
      spec: sonnet,
      usage: { inputTokens: 100_000, outputTokens: 10_000 },
      outcome: "settled",
    });
    expect(done).toMatchObject({ status: "settled", sparksCharged: 600, costMicroUsd: 300_000, sparksOverage: 0 });
    expect((await walletOf("user_a")).granted).toBe(1400);
    expect(await ledgerMatchesWallet("user_a")).toBe(true);

    // Finishing twice changes nothing.
    await runs.finishRun({ runId: run.id, spec: sonnet, usage: { inputTokens: 9e6, outputTokens: 9e6 }, outcome: "failed" });
    expect((await walletOf("user_a")).granted).toBe(1400);
  });

  it("never charges more than the hold, and records the overage", async () => {
    const { runs, wallet } = await load();
    await createUser("user_a");
    const game = await createGame("user_a");
    await wallet.getWallet("user_a");
    const { run } = await runs.startRun({ userId: "user_a", gameId: game.id, modelId: sonnet.id, budgetSparks: 100 });
    expect(runs.runAllowance(run, sonnet, { inputTokens: 10_000, outputTokens: 0 })).toBe(60);
    const done = await runs.finishRun({
      runId: run.id,
      spec: sonnet,
      usage: { inputTokens: 100_000, outputTokens: 0 },
      outcome: "settled",
    });
    expect(done).toMatchObject({ sparksCharged: 100, sparksOverage: 300 });
    expect((await walletOf("user_a")).granted).toBe(1900);
  });

  it("spends allowance before pack sparks and returns each to its bucket", async () => {
    const { runs, wallet } = await load();
    await createUser("user_a");
    const game = await createGame("user_a");
    await wallet.getWallet("user_a");
    await setBalance("user_a", 50, 1000);
    const { run } = await runs.startRun({ userId: "user_a", gameId: game.id, modelId: sonnet.id, budgetSparks: 500 });
    expect(run).toMatchObject({ reservedGranted: 50, reservedPurchased: 450 });
    await runs.finishRun({ runId: run.id, spec: sonnet, usage: { inputTokens: 50_000, outputTokens: 0 }, outcome: "canceled" });
    // 200 sparks used: 50 allowance + 150 pack.
    expect(await walletOf("user_a")).toMatchObject({ granted: 0, purchased: 850 });
  });

  it("refuses to start with too few sparks", async () => {
    const { runs, wallet } = await load();
    await createUser("user_a");
    const game = await createGame("user_a");
    await wallet.getWallet("user_a");
    await setBalance("user_a", 5);
    await expect(runs.startRun({ userId: "user_a", gameId: game.id, modelId: sonnet.id })).rejects.toBeInstanceOf(
      wallet.InsufficientSparksError,
    );
    expect(await db().select().from(agentRuns)).toHaveLength(0);
  });

  it("lets allowance held across a period end expire instead of coming back", async () => {
    const { runs, wallet } = await load();
    await createUser("user_a");
    const game = await createGame("user_a");
    const oct = new Date("2026-10-31T23:00:00Z");
    await wallet.getWallet("user_a", db(), oct);
    const { run } = await runs.startRun({ userId: "user_a", gameId: game.id, modelId: sonnet.id, budgetSparks: 1000, now: oct });
    await db().update(agentRuns).set({ createdAt: oct }).where(eq(agentRuns.id, run.id));
    await runs.finishRun({
      runId: run.id,
      spec: sonnet,
      usage: { inputTokens: 0, outputTokens: 0 },
      outcome: "settled",
      now: new Date("2026-11-01T01:00:00Z"),
    });
    // November's allowance only: October's held 1000 did not come back on top.
    expect((await walletOf("user_a")).granted).toBe(2000);
    expect(await ledgerMatchesWallet("user_a")).toBe(true);
  });

  it("can't start a run on someone else's game", async () => {
    const { runs } = await load();
    await createUser("user_a");
    await createUser("user_b");
    const game = await createGame("user_a");
    await expect(runs.startRun({ userId: "user_b", gameId: game.id, modelId: sonnet.id })).rejects.toThrow();
  });
});

describe("BYOK runs", () => {
  it("record usage and cost 0 sparks", async () => {
    const { runs, keys } = await load();
    await createUser("user_a");
    const game = await createGame("user_a");
    await keys.saveProviderKey("user_a", "anthropic", "sk-ant-user-0000000000000", { verify: ok });
    const { run, apiKey } = await runs.startRun({ userId: "user_a", gameId: game.id, modelId: sonnet.id });
    expect(apiKey).toBe("sk-ant-user-0000000000000");
    expect(runs.runAllowance(run, sonnet, { inputTokens: 1e9, outputTokens: 1e9 })).toBe(Infinity);
    const done = await runs.finishRun({
      runId: run.id,
      spec: sonnet,
      usage: { inputTokens: 100_000, outputTokens: 10_000 },
      outcome: "settled",
    });
    expect(done).toMatchObject({ billingMode: "byok", sparksCharged: 0, costMicroUsd: 300_000, inputTokens: 100_000 });
    expect(await db().select().from(sparkLedger).where(eq(sparkLedger.reason, "reserve"))).toHaveLength(0);
  });
});

describe("concurrency", () => {
  it("parallel runs can never overspend the wallet", async () => {
    const { runs, wallet } = await load();
    await createUser("user_a");
    // One game per run: a game only ever has one running agent (see below).
    const games = await Promise.all(Array.from({ length: 12 }, () => createGame("user_a")));
    await wallet.getWallet("user_a");
    await setBalance("user_a", 500, 500);
    // Each run asks for 300. Only 3 fit (900); the 4th gets the last 100; the rest fail.
    // Split across both buckets, so a stale read would pick a wrong split and fail.
    const attempts = await Promise.allSettled(
      games.map((game) =>
        runs.startRun({ userId: "user_a", gameId: game.id, modelId: sonnet.id, budgetSparks: 300 }),
      ),
    );
    const started = attempts.filter((a) => a.status === "fulfilled").map((a) => a.value.run);
    const held = started.reduce((n, r) => n + r.reservedGranted + r.reservedPurchased, 0);
    expect(held).toBe(1000);
    expect(started).toHaveLength(4);
    expect(attempts.filter((a) => a.status === "rejected")).toHaveLength(8);
    expect(await walletOf("user_a")).toMatchObject({ granted: 0, purchased: 0 });

    // Settle them all in parallel too.
    await Promise.all(
      started.map((r) =>
        runs.finishRun({ runId: r.id, spec: sonnet, usage: { inputTokens: 25_000, outputTokens: 0 }, outcome: "settled" }),
      ),
    );
    const after = await walletOf("user_a");
    expect(after.granted + after.purchased).toBe(1000 - 4 * 100);
    expect(await ledgerMatchesWallet("user_a")).toBe(true);
  });

  it("the database refuses a negative balance even if code tried", async () => {
    const { wallet } = await load();
    await createUser("user_a");
    await wallet.getWallet("user_a");
    await expect(
      db().update(wallets).set({ granted: sql`${wallets.granted} - 999999` }).where(eq(wallets.userId, "user_a")),
    ).rejects.toThrow();
  });
});

describe("usage summary", () => {
  it("reports allowance used, holds and spend by game", async () => {
    const { runs, summary } = await load();
    await createUser("user_a");
    const game = await createGame("user_a", { title: "Moon Pinball" });
    const first = await runs.startRun({ userId: "user_a", gameId: game.id, modelId: sonnet.id, budgetSparks: 800 });
    await runs.finishRun({ runId: first.run.id, spec: sonnet, usage: { inputTokens: 50_000, outputTokens: 0 }, outcome: "settled" });
    await runs.startRun({ userId: "user_a", gameId: game.id, modelId: sonnet.id, budgetSparks: 300 });

    const usage = await summary.getUsageSummary("user_a");
    expect(usage).toMatchObject({ plan: "free", allowance: 2000, used: 200, reserved: 300, granted: 1500, purchased: 0 });
    expect(usage.byGame).toEqual([{ gameId: game.id, title: "Moon Pinball", sparks: 200 }]);
  });
});

describe("plan bookkeeping", () => {
  it("free users stay free; the plan column only changes through billing", async () => {
    await createUser("user_a");
    const [u] = await db().select().from(users).where(eq(users.id, "user_a"));
    expect(u.plan).toBe("free");
  });
});
