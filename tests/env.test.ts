import { afterEach, describe, expect, it, vi } from "vitest";


// serverEnv() caches its result, so each case loads a fresh copy of the module.
async function loadEnv() {
  vi.resetModules();
  return (await import("@/lib/env")).serverEnv;
}

describe("serverEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses DATABASE_URL when it is set", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://u:p@db.example:5432/app");
    expect((await loadEnv())().DATABASE_URL).toBe("postgres://u:p@db.example:5432/app");
  });

  it("falls back to the local compose database in development, with a warning", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("POSTGRES_PASSWORD", "p@ss word");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await loadEnv())().DATABASE_URL).toBe("postgres://gamesmith:p%40ss%20word@localhost:5432/gamesmith");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("explains what to set when there is neither DATABASE_URL nor a local password", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("POSTGRES_PASSWORD", "");
    expect(await loadEnv()).toThrow(/POSTGRES_PASSWORD/);
  });

  it("refuses to start in production without DATABASE_URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    expect(await loadEnv()).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-postgres URL", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://u:p@localhost/app");
    expect(await loadEnv()).toThrow(/postgres:\/\//);
  });

  it("requires an encryption keyring in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://u:p@db.example:5432/app");
    vi.stubEnv("KEY_ENCRYPTION_KEYS", "");
    expect(await loadEnv()).toThrow(/KEY_ENCRYPTION_KEYS/);
    vi.stubEnv("KEY_ENCRYPTION_KEYS", "1:tooshort");
    expect(await loadEnv()).toThrow(/32 bytes/);
  });

  it("uses a fixed development keyring outside production, with a warning", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("KEY_ENCRYPTION_KEYS", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await loadEnv())().KEY_ENCRYPTION_KEYS).toMatch(/^0:/);
    expect(warn.mock.calls.flat().join(" ")).toMatch(/KEY_ENCRYPTION_KEYS/);
  });

  it("treats blank platform keys as unset", async () => {
    vi.stubEnv("PLATFORM_OPENAI_API_KEY", "   ");
    expect((await loadEnv())().PLATFORM_OPENAI_API_KEY).toBeUndefined();
  });

  describe("agent queue", () => {
    it("runs inline in development and builds the local Redis URL from its password", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("REDIS_URL", "");
      vi.stubEnv("REDIS_PASSWORD", "r/pw");
      const env = (await loadEnv())();
      expect(env.AGENT_QUEUE).toBe("inline");
      expect(env.REDIS_URL).toBe("redis://:r%2Fpw@127.0.0.1:6379");
    });

    it("uses Redis in production and requires REDIS_URL there", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("KEY_ENCRYPTION_KEYS", `1:${Buffer.alloc(32, 9).toString("base64")}`);
      vi.stubEnv("REDIS_URL", "");
      expect(await loadEnv()).toThrow(/REDIS_URL/);
      vi.stubEnv("REDIS_URL", "redis://redis:6379");
      expect((await loadEnv())().AGENT_QUEUE).toBe("redis");
    });

    it("refuses inline runs in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("KEY_ENCRYPTION_KEYS", `1:${Buffer.alloc(32, 9).toString("base64")}`);
      vi.stubEnv("AGENT_QUEUE", "inline");
      expect(await loadEnv()).toThrow(/AGENT_QUEUE/);
    });
  });
});
