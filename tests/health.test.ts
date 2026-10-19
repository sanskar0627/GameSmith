import { describe, expect, it, vi } from "vitest";

// `connection()` needs a live Next.js request scope; outside one it is a no-op here.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("reports ok when the database answers", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ok", db: "ok" });
  });
});
