import { describe, expect, it, vi } from "vitest";

import { DEFAULT_MODEL_ID, getModel, MODELS, modelOrDefault, PROVIDER_INFO, PROVIDERS } from "@/lib/ai/models";
import { chatModel } from "@/lib/ai/providers";
import { probeUrl, verifyProviderKey } from "@/lib/ai/verify";

describe("model catalog", () => {
  it("has unique ids of the form provider/apiId", () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MODELS) expect(m.id).toBe(`${m.provider}/${m.apiId}`);
  });

  it("stores integer prices and sane limits", () => {
    for (const m of MODELS) {
      for (const n of [m.price.input, m.price.output, m.longContext?.input ?? 0, m.longContext?.output ?? 0]) {
        expect(Number.isSafeInteger(n) && n >= 0).toBe(true);
      }
      expect(m.price.output).toBeGreaterThanOrEqual(m.price.input);
      expect(m.maxOutput).toBeLessThanOrEqual(m.contextWindow);
      if (m.longContext) expect(m.longContext.input).toBeGreaterThan(m.price.input);
    }
  });

  it("never offers Fal as a chat model", () => {
    expect(MODELS.some((m) => (m.provider as string) === "fal")).toBe(false);
    expect(PROVIDER_INFO.fal.role).toBe("assets");
  });

  it("has a default on platform credits, and falls back to it", () => {
    expect(getModel(DEFAULT_MODEL_ID)?.credits).toBe(true);
    expect(modelOrDefault(null).id).toBe(DEFAULT_MODEL_ID);
    expect(modelOrDefault("retired/model").id).toBe(DEFAULT_MODEL_ID);
  });

  it("offers at least one model per chat provider", () => {
    for (const p of PROVIDERS.filter((p) => p !== "fal")) expect(MODELS.some((m) => m.provider === p)).toBe(true);
  });
});

describe("chatModel", () => {
  it("builds the right provider model with the given key", () => {
    for (const spec of MODELS) {
      const model = chatModel(spec, "sk-test-key-0000000000") as { provider: string; modelId: string };
      expect(model.modelId).toBe(spec.apiId);
      expect(model.provider.startsWith(spec.provider)).toBe(true);
    }
  });

  it("refuses to build a model without a key (no silent env fallback)", () => {
    expect(() => chatModel(MODELS[0], "")).toThrow();
  });
});

describe("verifyProviderKey", () => {
  const KEY = "sk-secret-key-value-123456";

  function fakeFetch(status: number) {
    return vi.fn<typeof fetch>(async () => new Response("{}", { status }));
  }

  it("sends the key in a header only, never the URL", async () => {
    for (const provider of PROVIDERS) {
      const fetchImpl = fakeFetch(200);
      expect(await verifyProviderKey(provider, KEY, fetchImpl)).toEqual({ ok: true });
      const [url, init] = fetchImpl.mock.calls[0];
      expect(String(url)).toBe(probeUrl(provider));
      expect(String(url)).not.toContain(KEY);
      expect(init?.method).toBe("GET");
      expect(JSON.stringify(init?.headers)).toContain(KEY);
    }
  });

  it("maps 401/403 to invalid and everything else to unreachable", async () => {
    expect(await verifyProviderKey("openai", KEY, fakeFetch(401))).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyProviderKey("openai", KEY, fakeFetch(403))).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyProviderKey("openai", KEY, fakeFetch(429))).toEqual({ ok: false, reason: "unreachable" });
    expect(await verifyProviderKey("openai", KEY, fakeFetch(503))).toEqual({ ok: false, reason: "unreachable" });
    const throws = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await verifyProviderKey("anthropic", KEY, throws)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("uses each provider's documented auth header", async () => {
    const headers = async (provider: (typeof PROVIDERS)[number]) => {
      const fetchImpl = fakeFetch(200);
      await verifyProviderKey(provider, KEY, fetchImpl);
      return fetchImpl.mock.calls[0][1]?.headers as Record<string, string>;
    };
    expect(await headers("anthropic")).toMatchObject({ "x-api-key": KEY, "anthropic-version": "2023-06-01" });
    expect(await headers("openai")).toMatchObject({ authorization: `Bearer ${KEY}` });
    expect(await headers("openrouter")).toMatchObject({ authorization: `Bearer ${KEY}` });
    expect(await headers("fal")).toMatchObject({ authorization: `Key ${KEY}` });
  });
});
