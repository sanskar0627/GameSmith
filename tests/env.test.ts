import { afterEach, describe, expect, it, vi } from "vitest";

import { DEV_DATABASE_URL } from "@/lib/db/dev-url";

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
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await loadEnv())().DATABASE_URL).toBe(DEV_DATABASE_URL);
    expect(warn).toHaveBeenCalledOnce();
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
});
