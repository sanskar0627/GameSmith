import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    userId: clerk.userId,
    orgId: null,
    redirectToSignIn: () => {
      throw new Error("REDIRECT_TO_SIGN_IN");
    },
  }),
  currentUser: async () => null,
}));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ refresh }));

import {
  createGameAction,
  deleteGameAction,
  duplicateGameAction,
  renameGameAction,
  restoreGameAction,
  setVisibilityAction,
} from "@/lib/server/games/actions";
import { listGames } from "@/lib/server/games/queries";

import { createGame, createUser } from "./support/factories";

describe("game server actions", () => {
  beforeEach(() => {
    refresh.mockClear();
  });

  it("redirects signed-out callers before touching anything", async () => {
    clerk.userId = null;
    await expect(createGameAction("A game")).rejects.toThrow("REDIRECT_TO_SIGN_IN");
    await expect(renameGameAction("00000000-0000-4000-8000-000000000000", "x")).rejects.toThrow(
      "REDIRECT_TO_SIGN_IN",
    );
  });

  it("creates a game for the signed-in user and refreshes the shell", async () => {
    await createUser("user_a");
    clerk.userId = "user_a";
    const result = await createGameAction("A cozy farm on a turtle's back");
    expect(result.ok).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
    expect((await listGames("user_a")).map((g) => g.title)).toEqual(["A cozy farm on a turtle's back"]);
  });

  it("returns friendly validation errors instead of throwing", async () => {
    await createUser("user_a");
    clerk.userId = "user_a";
    expect(await createGameAction("   ")).toEqual({ ok: false, error: "Describe your game first" });
    const game = await createGame("user_a");
    expect(await renameGameAction(game.id, "x".repeat(61))).toMatchObject({ ok: false });
    expect(await renameGameAction("not-a-uuid", "Fine")).toMatchObject({ ok: false });
    // @ts-expect-error: callers can send anything to a server action
    expect(await setVisibilityAction(game.id, "public")).toMatchObject({ ok: false });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("never lets one user change another user's game", async () => {
    await createUser("user_a");
    await createUser("user_b");
    const game = await createGame("user_a", { title: "Mine" });
    clerk.userId = "user_b";
    for (const result of [
      await renameGameAction(game.id, "Stolen"),
      await setVisibilityAction(game.id, "link"),
      await deleteGameAction(game.id),
      await duplicateGameAction(game.id),
    ]) {
      expect(result).toEqual({ ok: false, error: "That game no longer exists." });
    }
    expect((await listGames("user_a"))[0]).toMatchObject({ title: "Mine", visibility: "private" });
    expect(await listGames("user_b")).toHaveLength(0);
  });

  it("deletes with undo", async () => {
    await createUser("user_a");
    clerk.userId = "user_a";
    const game = await createGame("user_a");
    expect(await deleteGameAction(game.id)).toEqual({ ok: true, data: undefined });
    expect(await listGames("user_a")).toHaveLength(0);
    const restored = await restoreGameAction(game.id);
    expect(restored).toMatchObject({ ok: true, data: { id: game.id } });
    expect(await listGames("user_a")).toHaveLength(1);
  });
});
