import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    userId: clerk.userId,
    orgId: null,
    redirectToSignIn: () => {
      throw new Error("REDIRECT_TO_SIGN_IN");
    },
  }),
  currentUser: async () => null,
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
// Provider calls are faked: status per key suffix.
const verify = vi.hoisted(() =>
  vi.fn(async (_provider: string, key: string) =>
    key.endsWith("BAD") ? { ok: false as const, reason: "invalid" as const } : { ok: true as const },
  ),
);
vi.mock("@/lib/ai/verify", () => ({ verifyProviderKey: verify }));

import { removeKeyAction, saveKeyAction, setKeyEnabledAction } from "@/lib/server/keys-actions";
import { listProviderKeys } from "@/lib/server/keys";

import { createUser } from "./support/factories";

const GOOD = "sk-or-v1-0123456789abcdefGOOD";
const BAD = "sk-or-v1-0123456789abcdef-BAD";

describe("key server actions", () => {
  beforeEach(() => {
    verify.mockClear();
  });

  it("redirects signed-out callers before anything else", async () => {
    clerk.userId = null;
    await expect(saveKeyAction("openai", GOOD)).rejects.toThrow("REDIRECT_TO_SIGN_IN");
    expect(verify).not.toHaveBeenCalled();
  });

  it("saves a key and returns only a summary", async () => {
    await createUser("user_keys_1");
    clerk.userId = "user_keys_1";
    const result = await saveKeyAction("openrouter", GOOD);
    expect(result).toMatchObject({ ok: true, data: { provider: "openrouter", last4: "GOOD", status: "valid" } });
    expect(JSON.stringify(result)).not.toContain("0123456789abcdef");
  });

  it("explains a rejected key without echoing it, and stores nothing", async () => {
    await createUser("user_keys_2");
    clerk.userId = "user_keys_2";
    const result = await saveKeyAction("openrouter", BAD);
    expect(result).toEqual({
      ok: false,
      error: "OpenRouter didn't accept that key. Check it was copied in full and is still active.",
    });
    expect(await listProviderKeys("user_keys_2")).toHaveLength(0);
  });

  it("validates provider and input types", async () => {
    await createUser("user_keys_3");
    clerk.userId = "user_keys_3";
    expect(await saveKeyAction("google", GOOD)).toMatchObject({ ok: false, error: "Unknown provider" });
    // @ts-expect-error: anything can reach a server action
    expect(await saveKeyAction("openai", { key: GOOD })).toMatchObject({ ok: false });
    // @ts-expect-error: anything can reach a server action
    expect(await setKeyEnabledAction("openai", "yes")).toMatchObject({ ok: false });
    expect(await removeKeyAction("openai")).toEqual({ ok: false, error: "There's no key saved for that provider." });
    expect(verify).not.toHaveBeenCalled();
  });

  it("toggles and removes", async () => {
    await createUser("user_keys_4");
    clerk.userId = "user_keys_4";
    await saveKeyAction("anthropic", GOOD);
    expect(await setKeyEnabledAction("anthropic", false)).toMatchObject({ ok: true, data: { enabled: false } });
    expect(await removeKeyAction("anthropic")).toEqual({ ok: true, data: null });
    expect(await listProviderKeys("user_keys_4")).toHaveLength(0);
  });

  it("rate limits saves per user", async () => {
    await createUser("user_keys_5");
    clerk.userId = "user_keys_5";
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await saveKeyAction("openai", GOOD));
    expect(results.slice(0, 10).every((r) => r.ok)).toBe(true);
    expect(results[10]).toEqual({ ok: false, error: "Too many attempts. Try again in a few minutes." });
    expect(verify).toHaveBeenCalledTimes(10);
  });
});

describe("RateLimiter", () => {
  it("resets after the window", async () => {
    const { RateLimiter } = await import("@/lib/server/rate-limit");
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    expect([limiter.take("a"), limiter.take("a"), limiter.take("a"), limiter.take("b")]).toEqual([true, true, false, true]);
    now = 1000;
    expect(limiter.take("a")).toBe(true);
  });
});
