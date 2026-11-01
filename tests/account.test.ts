import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: null, orgId: null, redirectToSignIn: () => {} }),
  currentUser: async () => null,
}));

import { db } from "@/lib/db";
import { games, providerKeys, publishedBuilds, subscriptions, users } from "@/lib/db/schema";
import { deleteAccountData } from "@/lib/server/account";
import { GAME_RETENTION_DAYS, purgeDeletedGames, runHousekeeping } from "@/lib/server/housekeeping";
import { saveProviderKey } from "@/lib/server/keys";
import { publishGame } from "@/lib/server/publish/service";
import { setSandboxClientForTests } from "@/lib/server/sandbox/service";

import { fakeSandbox } from "./support/agent";
import { createGame, createUser } from "./support/factories";

let sandbox: ReturnType<typeof fakeSandbox>;
beforeEach(() => {
  sandbox = fakeSandbox();
  setSandboxClientForTests(sandbox.client);
});
afterEach(() => setSandboxClientForTests(null));

describe("deleting an account", () => {
  it("hides games, unpublishes, destroys sandboxes and clears personal data", async () => {
    await createUser("user_a");
    await createUser("user_b");
    const game = await createGame("user_a", { currentVersion: 1, visibility: "link" });
    const other = await createGame("user_b");
    await publishGame("user_a", game.id);
    await saveProviderKey("user_a", "fal", "fal-user-key-1234567890", { verify: async () => ({ ok: true }) });

    const result = await deleteAccountData("user_a");
    expect(result).toEqual({ games: 1, sandboxesLeft: 0 });
    expect(sandbox.destroyed).toEqual([game.id]);

    const [g] = await db().select().from(games).where(eq(games.id, game.id));
    expect(g.deletedAt).not.toBeNull();
    expect(g).toMatchObject({ publishedBuildId: null, visibility: "private" });
    expect(await db().select().from(publishedBuilds)).toHaveLength(0);
    expect(await db().select().from(providerKeys)).toHaveLength(0);
    const [u] = await db().select().from(users).where(eq(users.id, "user_a"));
    expect(u).toMatchObject({ email: null, name: null });
    expect(u.deletedAt).not.toBeNull();

    // Someone else's games are untouched.
    const [o] = await db().select().from(games).where(eq(games.id, other.id));
    expect(o.deletedAt).toBeNull();

    // Housekeeping purges a deleted account's games right away.
    expect(await purgeDeletedGames()).toBe(1);
    expect(await db().select().from(games).where(eq(games.id, game.id))).toHaveLength(0);
  });

  it("is safe to run twice", async () => {
    await createUser("user_a");
    await createGame("user_a");
    await deleteAccountData("user_a");
    await expect(deleteAccountData("user_a")).resolves.toMatchObject({ games: 1 });
  });

  it("treats subscriptions as unpaid when payments aren't configured", async () => {
    await createUser("user_a");
    await db().insert(subscriptions).values({ id: "sub_1", userId: "user_a", plan: "forge", status: "active" });
    // No POLAR_ACCESS_TOKEN in tests: nothing to revoke remotely, deletion proceeds.
    await expect(deleteAccountData("user_a")).resolves.toBeTruthy();
  });
});

describe("housekeeping", () => {
  it("purges games deleted longer ago than the retention window, not recent ones", async () => {
    await createUser("user_a");
    const old = await createGame("user_a", { deletedAt: new Date(Date.now() - (GAME_RETENTION_DAYS + 1) * 86_400_000) });
    const recent = await createGame("user_a", { deletedAt: new Date() });
    const live = await createGame("user_a");
    const report = await runHousekeeping();
    expect(report.purgedGames).toBe(1);
    const left = (await db().select({ id: games.id }).from(games)).map((r) => r.id).sort();
    expect(left).toEqual([recent.id, live.id].sort());
    expect(sandbox.destroyed).toEqual([old.id]);
  });

  it("keeps a game's rows when its sandbox couldn't be removed, to retry later", async () => {
    await createUser("user_a");
    await createGame("user_a", { deletedAt: new Date(Date.now() - (GAME_RETENTION_DAYS + 1) * 86_400_000) });
    setSandboxClientForTests(fakeSandbox().client);
    const broken = { ...sandbox.client, destroy: async () => Promise.reject(new Error("down")) } as unknown as typeof sandbox.client;
    setSandboxClientForTests(broken);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await purgeDeletedGames()).toBe(0);
    expect(await db().select().from(games)).toHaveLength(1);
  });
});
