import { gzipSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.userId, orgId: null, redirectToSignIn: () => {} }),
  currentUser: async () => null,
}));

import { GET as downloadRoute } from "@/app/api/games/[gameId]/download/route";
import { DELETE as deleteRoute, PATCH as renameRoute } from "@/app/api/games/[gameId]/files/[...path]/route";
import { SandboxClient } from "@/lib/server/sandbox/client";
import { normalizeFilePath, setSandboxClientForTests } from "@/lib/server/sandbox/service";

import { makeTar, readZip } from "./support/archives";
import { createGame, createUser } from "./support/factories";

/** Sandbox manager stand-in with files, deletes and source archives. */
function fakeManager(options: { snapshot?: boolean } = {}) {
  const calls: string[] = [];
  const files = new Map<string, string>([
    ["package.json", "{}"],
    ["src/main.ts", "start()"],
  ]);
  let running = false;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);
    const m = /^\/v1\/sandboxes\/([^/]+)(\/[a-z]+)?(?:\/(.*))?$/.exec(url.pathname);
    const action = m?.[2] ?? "";
    const path = m?.[3] ? decodeURIComponent(m[3]) : "";
    const status = () =>
      running ? { running: true, previewPath: `/p/${m?.[1]}-secretsecretsecret/`, startedAt: 1, lastActive: 1 } : { running: false };
    if (action === "" && method === "GET") return Response.json(status());
    if (action === "/start") {
      running = true;
      return Response.json(status());
    }
    if (action === "/archive") {
      if (!running && !options.snapshot) return Response.json({ error: "No files yet" }, { status: 404 });
      const tar = makeTar([...files].map(([name, data]) => ({ name, data })));
      return new Response(gzipSync(tar));
    }
    if (action === "/files" && !path) return Response.json({ files: [...files.keys()].map((p) => ({ path: p, size: 1, mtime: 0 })) });
    if (action === "/files" && method === "GET") {
      return files.has(path) ? new Response(files.get(path)) : Response.json({ error: "File not found" }, { status: 404 });
    }
    if (action === "/files" && method === "PUT") {
      files.set(path, Buffer.from(await new Response(init?.body).arrayBuffer()).toString());
      return Response.json({ ok: true });
    }
    if (action === "/files" && method === "DELETE") {
      if (!files.delete(path)) return Response.json({ error: "File not found" }, { status: 404 });
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  };
  return { calls, files, fetchImpl };
}

let manager: ReturnType<typeof fakeManager>;
const ctx = (gameId: string) => ({ params: Promise.resolve({ gameId }) });
const fileCtx = (gameId: string, path: string) => ({ params: Promise.resolve({ gameId, path: path.split("/") }) });
const patch = (to: unknown) =>
  new Request("http://x", { method: "PATCH", body: JSON.stringify({ to }), headers: { "content-type": "application/json" } });

function useManager(options?: { snapshot?: boolean }) {
  manager = fakeManager(options);
  setSandboxClientForTests(new SandboxClient("http://manager:4100", "manager-token", manager.fetchImpl));
}

async function ownGame() {
  await createUser("user_a");
  const game = await createGame("user_a", { title: "Floating Islands" });
  clerk.userId = "user_a";
  return game;
}

beforeEach(() => useManager());

afterEach(() => {
  setSandboxClientForTests(null);
  clerk.userId = null;
});

describe("renaming files", () => {
  it("moves a file to its new path", async () => {
    const game = await ownGame();
    const res = await renameRoute(patch("./src//game.ts"), fileCtx(game.id, "src/main.ts"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, path: "src/game.ts" });
    expect(manager.files.get("src/game.ts")).toBe("start()");
    expect(manager.files.has("src/main.ts")).toBe(false);
  });

  it("refuses to overwrite an existing file", async () => {
    const game = await ownGame();
    manager.files.set("src/other.ts", "keep me");
    const res = await renameRoute(patch("src/other.ts"), fileCtx(game.id, "src/main.ts"));
    expect(res.status).toBe(409);
    expect(manager.files.get("src/other.ts")).toBe("keep me");
    expect(manager.files.has("src/main.ts")).toBe(true);
  });

  it("refuses a file name that is already a folder", async () => {
    const game = await ownGame();
    const res = await renameRoute(patch("src"), fileCtx(game.id, "src/main.ts"));
    expect(res.status).toBe(409);
  });

  it("rejects bad bodies and paths", async () => {
    const game = await ownGame();
    expect((await renameRoute(patch(42), fileCtx(game.id, "src/main.ts"))).status).toBe(400);
    expect((await renameRoute(patch("../escape.ts"), fileCtx(game.id, "src/main.ts"))).status).toBe(400);
    expect((await renameRoute(patch("src/x.ts"), fileCtx(game.id, "src/nope.ts"))).status).toBe(404);
  });

  it("keeps package.json where the sandbox expects it", async () => {
    const game = await ownGame();
    const res = await renameRoute(patch("pkg.json"), fileCtx(game.id, "package.json"));
    expect(res.status).toBe(409);
    expect(manager.files.has("package.json")).toBe(true);
  });
});

describe("deleting files", () => {
  it("deletes a file", async () => {
    const game = await ownGame();
    const res = await deleteRoute(new Request("http://x", { method: "DELETE" }), fileCtx(game.id, "src/main.ts"));
    expect(res.status).toBe(200);
    expect(manager.files.has("src/main.ts")).toBe(false);
  });

  it("never deletes package.json", async () => {
    const game = await ownGame();
    const res = await deleteRoute(new Request("http://x", { method: "DELETE" }), fileCtx(game.id, "package.json"));
    expect(res.status).toBe(409);
    expect(manager.files.has("package.json")).toBe(true);
    expect(manager.calls.some((c) => c.startsWith("DELETE"))).toBe(false);
  });
});

describe("downloading source", () => {
  it("returns a zip of the same tree under the game's name", async () => {
    useManager({ snapshot: true });
    const game = await ownGame();
    const res = await downloadRoute(new Request("http://x"), ctx(game.id));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="floating-islands.zip"');
    const entries = readZip(Buffer.from(await res.arrayBuffer()));
    expect(entries.map((e) => e.name)).toEqual([
      "floating-islands/",
      "floating-islands/package.json",
      "floating-islands/src/main.ts",
    ]);
    expect(entries[2]!.data.toString()).toBe("start()");
    // A sleeping sandbox with a snapshot is not woken up.
    expect(manager.calls.some((c) => c.endsWith("/start"))).toBe(false);
  });

  it("starts a game that never ran so it has files", async () => {
    const game = await ownGame();
    const res = await downloadRoute(new Request("http://x"), ctx(game.id));
    expect(res.status).toBe(200);
    expect(manager.calls).toContain(`POST /v1/sandboxes/${game.id}/start`);
  });

  it("is owner only and says 'not found' to everyone else", async () => {
    await createUser("user_a");
    await createUser("user_b");
    const game = await createGame("user_a", { visibility: "link" });
    clerk.userId = "user_b";
    expect((await downloadRoute(new Request("http://x"), ctx(game.id))).status).toBe(404);
    expect((await renameRoute(patch("a.ts"), fileCtx(game.id, "src/main.ts"))).status).toBe(404);
    clerk.userId = null;
    expect((await downloadRoute(new Request("http://x"), ctx(game.id))).status).toBe(401);
    expect(manager.calls).toHaveLength(0);
  });
});

describe("normalizeFilePath", () => {
  it("tidies editor input and rejects escapes", () => {
    expect(normalizeFilePath(" ./src//levels/one.ts ")).toBe("src/levels/one.ts");
    expect(() => normalizeFilePath("src/../../etc")).toThrow();
    expect(() => normalizeFilePath("  ")).toThrow();
    expect(() => normalizeFilePath("a\\b")).toThrow();
  });
});
