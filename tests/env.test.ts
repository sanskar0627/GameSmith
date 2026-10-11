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
});
