import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProviderKeySummary } from "@/lib/ai/keys";
import { getModel } from "@/lib/ai/models";
import type { VerifyResult } from "@/lib/ai/verify";

import { createUser } from "./support/factories";

const ok = async (): Promise<VerifyResult> => ({ ok: true });
const sonnet = getModel("anthropic/claude-sonnet-5-5")!;
const fable = getModel("anthropic/claude-fable-5-1")!;

// serverEnv() caches, so tests that change platform keys load fresh modules.
async function load() {
  vi.resetModules();
  return {
    access: await import("@/lib/server/ai/access"),
    keys: await import("@/lib/server/keys"),
  };
}

const saved = (fields: Partial<ProviderKeySummary> = {}): ProviderKeySummary => ({
  provider: "anthropic",
  last4: "abcd",
  status: "valid",
  verifiedAt: null,
  enabled: true,
  needsReentry: false,
  updatedAt: new Date().toISOString(),
  ...fields,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("decideAccess", () => {
  it("prefers the user's own usable key", async () => {
    const { access } = await load();
    expect(access.decideAccess(sonnet, saved(), true)).toEqual({ kind: "byok" });
    expect(access.decideAccess(fable, saved({ status: "unverified" }), false)).toEqual({ kind: "byok" });
  });

  it("falls back to credits only for credit models with a platform key", async () => {
    const { access } = await load();
    expect(access.decideAccess(sonnet, saved({ enabled: false }), true)).toEqual({ kind: "credits" });
    expect(access.decideAccess(sonnet, undefined, false)).toEqual({ kind: "locked", reason: "platform-unavailable" });
    expect(access.decideAccess(fable, undefined, true)).toEqual({ kind: "locked", reason: "needs-key" });
    expect(access.decideAccess(fable, saved({ status: "invalid" }), true)).toEqual({ kind: "locked", reason: "needs-key" });
    expect(access.decideAccess(fable, saved({ needsReentry: true }), true)).toEqual({ kind: "locked", reason: "needs-key" });
  });
});

describe("resolveRunCredentials", () => {
  it("uses the user's key (BYOK) over the platform key", async () => {
    vi.stubEnv("PLATFORM_ANTHROPIC_API_KEY", "platform-anthropic-key");
    const { access, keys } = await load();
    await createUser("user_a");
    await keys.saveProviderKey("user_a", "anthropic", "sk-ant-user-key-0000000000", { verify: ok });
    const creds = await access.resolveRunCredentials("user_a", sonnet.id);
    expect(creds).toMatchObject({ mode: "byok", apiKey: "sk-ant-user-key-0000000000" });
  });

  it("uses the platform key for credit models when the user has none", async () => {
    vi.stubEnv("PLATFORM_ANTHROPIC_API_KEY", "platform-anthropic-key");
    const { access } = await load();
    await createUser("user_a");
    expect(await access.resolveRunCredentials("user_a", sonnet.id)).toMatchObject({
      mode: "credits",
      apiKey: "platform-anthropic-key",
    });
    expect(await access.resolveRunCredentials("user_a", fable.id)).toMatchObject({ mode: "locked", reason: "needs-key" });
  });

  it("never lends one user's key to another", async () => {
    const { access, keys } = await load();
    await createUser("user_a");
    await createUser("user_b");
    await keys.saveProviderKey("user_a", "anthropic", "sk-ant-user-key-0000000000", { verify: ok });
    expect(await access.resolveRunCredentials("user_b", sonnet.id)).toMatchObject({ mode: "locked" });
  });

  it("rejects models outside the catalog", async () => {
    const { access } = await load();
    expect(await access.resolveRunCredentials("user_a", "openai/gpt-2")).toEqual({ mode: "unknown-model" });
  });
});

describe("listModelOptions", () => {
  it("describes every catalog model without exposing keys", async () => {
    vi.stubEnv("PLATFORM_OPENAI_API_KEY", "platform-openai-key");
    const { access, keys } = await load();
    await createUser("user_a");
    await keys.saveProviderKey("user_a", "anthropic", "sk-ant-user-key-0000000000", { verify: ok });
    const options = await access.listModelOptions("user_a");
    const byId = new Map(options.map((o) => [o.id, o.access]));
    expect(byId.get("anthropic/claude-fable-5-1")).toEqual({ kind: "byok" });
    expect(byId.get("openai/gpt-6.1-sol")).toEqual({ kind: "credits" });
    expect(byId.get("openai/gpt-6-astra")).toEqual({ kind: "locked", reason: "needs-key" });
    expect(byId.get("openrouter/x-ai/grok-4.7")).toEqual({ kind: "locked", reason: "platform-unavailable" });
    const json = JSON.stringify(options);
    expect(json).not.toContain("sk-ant-user-key");
    expect(json).not.toContain("platform-openai-key");
  });
});
