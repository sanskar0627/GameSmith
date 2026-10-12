import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.userId, orgId: null, redirectToSignIn: () => {} }),
  currentUser: async () => null,
}));

import { GET as getSandboxRoute, POST as startRoute, DELETE as stopRoute } from "@/app/api/games/[gameId]/sandbox/route";
import { GET as listRoute } from "@/app/api/games/[gameId]/files/route";
import { GET as readRoute, PUT as writeRoute } from "@/app/api/games/[gameId]/files/[...path]/route";
import { db } from "@/lib/db";
import { sandboxes } from "@/lib/db/schema";
import { encodePath, SandboxClient } from "@/lib/server/sandbox/client";
import { copyGameFiles, setSandboxClientForTests } from "@/lib/server/sandbox/service";

import { createGame, createUser } from "./support/factories";

/** A stand-in for the sandbox manager API, recording every call. */
function fakeManager() {
  const calls: string[] = [];
  const files = new Map<string, string>([["src/main.ts", "console.log('hi')"]]);
  let running = false;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);
    if ((init?.headers as Record<string, string>).authorization !== "Bearer manager-token") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const m = /^\/v1\/sandboxes\/([^/]+)(\/[a-z]+)?(?:\/(.*))?$/.exec(url.pathname);
    const action = m?.[2] ?? "";
    const status = () =>
      running ? { running: true, previewPath: `/p/${m?.[1]}-secretsecretsecret/`, startedAt: 1_700_000_000_000, lastActive: 0 } : { running: false };
    if (url.pathname === "/v1/snapshots/copy") return Response.json({ copied: true });
    if (action === "" && method === "GET") return Response.json(status());
    if (action === "/start") {
      running = true;
      return Response.json(status());
    }
    if (action === "/stop") {
      running = false;
      return Response.json(status());
    }
    if (action === "/snapshots") return Response.json({ bytes: 10 });
    if (action === "/files" && !m?.[3]) return Response.json({ files: [...files.keys()].map((p) => ({ path: p, size: 1, mtime: 0 })) });
    if (action === "/files" && method === "GET") {
      const path = decodeURIComponent(m![3]!);
      return files.has(path) ? new Response(files.get(path)) : Response.json({ error: "File not found" }, { status: 404 });
    }
    if (action === "/files" && method === "PUT") {
      files.set(decodeURIComponent(m![3]!), Buffer.from(await new Response(init?.body).arrayBuffer()).toString());
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  };
  return { calls, files, fetchImpl, isRunning: () => running };
}

let manager: ReturnType<typeof fakeManager>;
const ctx = (gameId: string) => ({ params: Promise.resolve({ gameId }) });
const fileCtx = (gameId: string, path: string) => ({ params: Promise.resolve({ gameId, path: path.split("/") }) });

beforeEach(() => {
  manager = fakeManager();
  setSandboxClientForTests(new SandboxClient("http://manager:4100", "manager-token", manager.fetchImpl));
});

afterEach(() => {
  setSandboxClientForTests(null);
  clerk.userId = null;
});

describe("sandbox routes", () => {
  it("require a signed-in user", async () => {
    const res = await startRoute(new Request("http://x"), ctx("00000000-0000-4000-8000-000000000000"));
    expect(res.status).toBe(401);
    expect(manager.calls).toHaveLength(0);
  });

  it("start, report and stop the owner's sandbox with a private preview URL", async () => {
    await createUser("user_a");
    const game = await createGame("user_a");
    clerk.userId = "user_a";

    const started = await startRoute(new Request("http://x"), ctx(game.id));
    expect(started.status).toBe(200);
    const body = (await started.json()) as { running: boolean; previewUrl: string };
    expect(body.running).toBe(true);
    expect(body.previewUrl).toBe(`http://localhost:4101/p/${game.id}-secretsecretsecret/`);
    expect(started.headers.get("cache-control")).toBe("no-store");
    const [row] = await db().select().from(sandboxes);
    expect(row).toMatchObject({ gameId: game.id, status: "running" });

    expect(await (await getSandboxRoute(new Request("http://x"), ctx(game.id))).json()).toMatchObject({ running: true });
    expect(await (await stopRoute(new Request("http://x"), ctx(game.id))).json()).toEqual({ running: false });
    expect((await db().select().from(sandboxes))[0].status).toBe("stopped");
  });

  it("never touch another user's game, and say 'not found'", async () => {
    await createUser("user_a");
    await createUser("user_b");
    const game = await createGame("user_a");
    clerk.userId = "user_b";
    for (const res of [
      await startRoute(new Request("http://x"), ctx(game.id)),
      await getSandboxRoute(new Request("http://x"), ctx(game.id)),
      await listRoute(new Request("http://x"), ctx(game.id)),
      await readRoute(new Request("http://x"), fileCtx(game.id, "src/main.ts")),
      await writeRoute(new Request("http://x", { method: "PUT", body: "x" }), fileCtx(game.id, "src/main.ts")),
    ]) {
      expect(res.status).toBe(404);
    }
    expect(manager.calls).toHaveLength(0);
  });

  it("read and write files, waking the sandbox when needed", async () => {
    await createUser("user_a");
    const game = await createGame("user_a");
    clerk.userId = "user_a";

    const list = await listRoute(new Request("http://x"), ctx(game.id));
    expect(await list.json()).toEqual({ files: [{ path: "src/main.ts", size: 1, mtime: 0 }] });
    expect(manager.calls).toContain(`POST /v1/sandboxes/${game.id}/start`);

    const put = await writeRoute(
      new Request("http://x", { method: "PUT", body: "export const x = 1;" }),
      fileCtx(game.id, "src/level 1.ts"),
    );
    expect(put.status).toBe(200);
    expect(manager.files.get("src/level 1.ts")).toBe("export const x = 1;");

    const read = await readRoute(new Request("http://x"), fileCtx(game.id, "src/level 1.ts"));
    expect(read.headers.get("content-disposition")).toBe("attachment");
    expect(await read.text()).toBe("export const x = 1;");

    const missing = await readRoute(new Request("http://x"), fileCtx(game.id, "nope.ts"));
    expect(missing.status).toBe(404);
  });

  it("refuse oversized uploads before reaching the sandbox", async () => {
    await createUser("user_a");
    const game = await createGame("user_a");
    clerk.userId = "user_a";
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    const res = await writeRoute(new Request("http://x", { method: "PUT", body: big }), fileCtx(game.id, "big.bin"));
    expect(res.status).toBe(413);
    expect(manager.calls.some((c) => c.startsWith("PUT"))).toBe(false);
  });

  it("answer 503 when sandboxes aren't configured", async () => {
    setSandboxClientForTests(null);
    await createUser("user_a");
    const game = await createGame("user_a");
    clerk.userId = "user_a";
    const res = await startRoute(new Request("http://x"), ctx(game.id));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Sandboxes aren't set up on this server yet." });
  });

  it("hide manager failures behind a generic message", async () => {
    setSandboxClientForTests(new SandboxClient("http://manager:4100", "wrong-token", manager.fetchImpl));
    await createUser("user_a");
    const game = await createGame("user_a");
    clerk.userId = "user_a";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await startRoute(new Request("http://x"), ctx(game.id));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "The sandbox had a problem. Try again." });
    error.mockRestore();
  });
});

describe("sandbox client", () => {
  it("encodes path segments but keeps slashes", () => {
    expect(encodePath("src/level 1.ts")).toBe("src/level%201.ts");
    expect(encodePath("a/../b")).toBe("a/../b");
  });

  it("copies a running game's latest files for a duplicate", async () => {
    await manager.fetchImpl("http://manager:4100/v1/sandboxes/00000000-0000-4000-8000-00000000000a/start", {
      method: "POST",
      headers: { authorization: "Bearer manager-token" },
    });
    const copied = await copyGameFiles("00000000-0000-4000-8000-00000000000a", "00000000-0000-4000-8000-00000000000b");
    expect(copied).toBe(true);
    expect(manager.calls).toEqual(
      expect.arrayContaining([
        "POST /v1/sandboxes/00000000-0000-4000-8000-00000000000a/snapshots",
        "POST /v1/snapshots/copy",
      ]),
    );
  });
});
