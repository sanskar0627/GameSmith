import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: null, orgId: null, redirectToSignIn: () => {} }),
  currentUser: async () => null,
}));

import { GET as serveBuild } from "@/app/b/[buildId]/[access]/[[...path]]/route";
import { db } from "@/lib/db";
import { games, publishedBuilds, publishedFiles } from "@/lib/db/schema";
import { GameNotFoundError } from "@/lib/server/games/access";
import {
  buildUrl,
  getPublishState,
  ownerToken,
  playableBuild,
  publishGame,
  PublishError,
  pruneOrphanBuilds,
  unpublishGame,
} from "@/lib/server/publish/service";
import { contentTypeFor } from "@/lib/server/publish/mime";
import { setSandboxClientForTests } from "@/lib/server/sandbox/service";
import { publishedOriginFrom } from "@/lib/published-origin";

import { fakeSandbox } from "./support/agent";
import { createGame, createUser } from "./support/factories";

// Tests run with the default app URL (http://localhost:3000), so the content
// origin is http://127.0.0.1:3000.
const CONTENT = "127.0.0.1:3000";

let sandbox: ReturnType<typeof fakeSandbox>;

beforeEach(() => {
  sandbox = fakeSandbox();
  setSandboxClientForTests(sandbox.client);
});
afterEach(() => setSandboxClientForTests(null));

async function setup(fields: Parameters<typeof createGame>[1] = {}) {
  await createUser("user_a");
  await createUser("user_b");
  return createGame("user_a", { currentVersion: 2, status: "ready", ...fields });
}

function fetchBuild(url: string, host = CONTENT) {
  const u = new URL(url);
  const [, , buildId, access, ...path] = u.pathname.split("/");
  return serveBuild(new Request(u, { headers: { host } }), {
    params: Promise.resolve({ buildId: buildId!, access: access!, path: path.filter(Boolean) }),
  });
}

describe("publishing", () => {
  it("builds what's in the sandbox and serves it to the owner", async () => {
    const game = await setup();
    const state = await publishGame("user_a", game.id);
    expect(state.published).toMatchObject({ version: 2, files: 2 });
    expect(state.published!.url).toBe(`http://127.0.0.1:3000/b/${state.published!.buildId}/${ownerToken(state.published!.buildId)}/index.html`);
    expect(sandbox.calls).toContain(`POST /v1/sandboxes/${game.id}/build`);

    const page = await fetchBuild(state.published!.url);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toMatch(/text\/html/);
    expect(page.headers.get("content-security-policy")).toMatch(/frame-ancestors 'self' http:\/\/localhost:3000/);
    expect(await page.text()).toContain("./assets/index.js");

    const script = await fetchBuild(state.published!.url.replace("index.html", "assets/index.js"));
    expect(script.headers.get("content-type")).toMatch(/javascript/);
    expect(await script.text()).toBe("start()");
  });

  it("serves the public link only while the game is shared", async () => {
    const game = await setup();
    const { published } = await publishGame("user_a", game.id);
    const publicUrl = buildUrl(published!.buildId, false)!;
    expect((await fetchBuild(publicUrl)).status).toBe(404);
    expect(playableBuild({ ...game, publishedBuildId: published!.buildId }, null)).toBeNull();

    await db().update(games).set({ visibility: "link" }).where(eq(games.id, game.id));
    expect((await fetchBuild(publicUrl)).status).toBe(200);
    expect(playableBuild({ ...game, visibility: "link", publishedBuildId: published!.buildId }, "user_b")).toBe(publicUrl);
  });

  it("never serves builds on the app's own host", async () => {
    const game = await setup({ visibility: "link" });
    const { published } = await publishGame("user_a", game.id);
    expect((await fetchBuild(published!.url, "localhost:3000")).status).toBe(404);
    expect((await fetchBuild(published!.url, "evil.example")).status).toBe(404);
  });

  it("rejects forged tokens, other builds and odd paths", async () => {
    const game = await setup();
    const { published } = await publishGame("user_a", game.id);
    const id = published!.buildId;
    expect((await fetchBuild(`http://${CONTENT}/b/${id}/${"x".repeat(32)}/index.html`)).status).toBe(404);
    expect((await fetchBuild(`http://${CONTENT}/b/${crypto.randomUUID()}/${ownerToken(id)}/index.html`)).status).toBe(404);
    const res = await serveBuild(new Request(`http://${CONTENT}/b/x`, { headers: { host: CONTENT } }), {
      params: Promise.resolve({ buildId: id, access: ownerToken(id), path: ["..", "secret"] }),
    });
    expect(res.status).toBe(404);
  });

  it("redirects the folder to its index so relative assets resolve", async () => {
    const game = await setup();
    const { published } = await publishGame("user_a", game.id);
    const res = await serveBuild(new Request(`http://${CONTENT}/b/x/y`, { headers: { host: CONTENT } }), {
      params: Promise.resolve({ buildId: published!.buildId, access: "p" }),
    });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(`http://127.0.0.1:3000/b/${published!.buildId}/p/index.html`);
  });

  it("replaces the old build when publishing again, and unpublishes", async () => {
    const game = await setup();
    const first = (await publishGame("user_a", game.id)).published!;
    sandbox.build.files = { "index.html": "v2" };
    const second = (await publishGame("user_a", game.id)).published!;
    expect(second.buildId).not.toBe(first.buildId);
    expect((await fetchBuild(first.url)).status).toBe(404);
    expect(await (await fetchBuild(second.url)).text()).toBe("v2");
    expect(await db().select().from(publishedBuilds)).toHaveLength(1);

    await unpublishGame("user_a", game.id);
    expect((await fetchBuild(second.url)).status).toBe(404);
    expect(await db().select().from(publishedFiles)).toHaveLength(0);
    expect((await getPublishState("user_a", game.id)).published).toBeNull();
  });

  it("only lets the owner publish, and only a saved game", async () => {
    const game = await setup();
    await expect(publishGame("user_b", game.id)).rejects.toBeInstanceOf(GameNotFoundError);
    await expect(unpublishGame("user_b", game.id)).rejects.toBeInstanceOf(GameNotFoundError);
    const fresh = await createGame("user_a");
    await expect(publishGame("user_a", fresh.id)).rejects.toMatchObject({ status: 409 });
  });

  it("explains a build that fails", async () => {
    const game = await setup();
    sandbox.build.status = 422;
    sandbox.build.error = "The game didn't build:\nsrc/main.ts: Unexpected token";
    const error = await publishGame("user_a", game.id).catch((e) => e);
    expect(error).toBeInstanceOf(PublishError);
    expect(error.status).toBe(422);
    expect(error.detail).toContain("Unexpected token");
    expect((await getPublishState("user_a", game.id)).published).toBeNull();
  });

  it("stops serving a deleted game but keeps its build for restore", async () => {
    const game = await setup({ visibility: "link" });
    const { published } = await publishGame("user_a", game.id);
    await db().update(games).set({ deletedAt: new Date() }).where(eq(games.id, game.id));
    expect((await fetchBuild(published!.url)).status).toBe(404);

    await db().update(publishedBuilds).set({ createdAt: new Date(Date.now() - 2 * 3600_000) });
    expect(await pruneOrphanBuilds()).toBe(0);
    await db().update(games).set({ deletedAt: null }).where(eq(games.id, game.id));
    expect((await fetchBuild(published!.url)).status).toBe(200);

    // A build nothing points at (an interrupted publish) is pruned.
    await db().update(games).set({ publishedBuildId: null }).where(eq(games.id, game.id));
    expect(await pruneOrphanBuilds()).toBe(1);
  });

  it("derives the local content origin and file types", () => {
    expect(publishedOriginFrom({ NODE_ENV: "development" })).toBe("http://127.0.0.1:3000");
    expect(publishedOriginFrom({ NODE_ENV: "development", NEXT_PUBLIC_APP_URL: "http://localhost:4000" })).toBe("http://127.0.0.1:4000");
    expect(publishedOriginFrom({ NODE_ENV: "production" })).toBeNull();
    expect(publishedOriginFrom({ NODE_ENV: "production", PUBLISHED_ORIGIN: "https://play.example/" })).toBe("https://play.example");
    expect(contentTypeFor("a/b.JPG")).toBe("image/jpeg");
    expect(contentTypeFor("x.unknown")).toBe("application/octet-stream");
  });
});
