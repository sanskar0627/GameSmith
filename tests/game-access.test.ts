import { describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: authMock.userId }),
  currentUser: async () => null,
}));

import {
  canAccessGame,
  GameNotFoundError,
  requireGameAccess,
  requireGameAccessFor,
} from "@/lib/server/games/access";

import { createGame, createUser } from "./support/factories";

describe("canAccessGame (rule)", () => {
  const base = { ownerId: "owner", visibility: "private" as const, deletedAt: null };

  it("lets the owner read and write", () => {
    expect(canAccessGame(base, "owner", "read")).toBe(true);
    expect(canAccessGame(base, "owner", "write")).toBe(true);
  });

  it("hides private games from everyone else", () => {
    expect(canAccessGame(base, "other", "read")).toBe(false);
    expect(canAccessGame(base, null, "read")).toBe(false);
  });

  it("lets anyone read a link-shared game, but only the owner write", () => {
    const shared = { ...base, visibility: "link" as const };
    expect(canAccessGame(shared, null, "read")).toBe(true);
    expect(canAccessGame(shared, "other", "read")).toBe(true);
    expect(canAccessGame(shared, "other", "write")).toBe(false);
    expect(canAccessGame(shared, null, "write")).toBe(false);
  });

  it("denies deleted games, even to the owner", () => {
    expect(canAccessGame({ ...base, deletedAt: new Date() }, "owner", "read")).toBe(false);
  });
});

describe("requireGameAccessFor (database)", () => {
  it("returns the game to its owner", async () => {
    await createUser("user_owner");
    const game = await createGame("user_owner");
    const found = await requireGameAccessFor(game.id, "user_owner", "write");
    expect(found.id).toBe(game.id);
  });

  it("reports another user's private game as not found", async () => {
    await createUser("user_owner");
    await createUser("user_other");
    const game = await createGame("user_owner");
    await expect(requireGameAccessFor(game.id, "user_other", "read")).rejects.toBeInstanceOf(GameNotFoundError);
    await expect(requireGameAccessFor(game.id, null, "read")).rejects.toBeInstanceOf(GameNotFoundError);
  });

  it("allows signed-out reads of link-shared games but never writes", async () => {
    await createUser("user_owner");
    const game = await createGame("user_owner", { visibility: "link" });
    await expect(requireGameAccessFor(game.id, null, "read")).resolves.toMatchObject({ id: game.id });
    await expect(requireGameAccessFor(game.id, null, "write")).rejects.toBeInstanceOf(GameNotFoundError);
  });

  it("treats soft-deleted games as not found", async () => {
    await createUser("user_owner");
    const game = await createGame("user_owner", { deletedAt: new Date() });
    await expect(requireGameAccessFor(game.id, "user_owner", "read")).rejects.toBeInstanceOf(GameNotFoundError);
  });

  it("rejects malformed and unknown ids without querying errors", async () => {
    await expect(requireGameAccessFor("demo", "user_owner", "read")).rejects.toBeInstanceOf(GameNotFoundError);
    await expect(requireGameAccessFor("'; drop table games; --", null, "read")).rejects.toBeInstanceOf(
      GameNotFoundError,
    );
    await expect(
      requireGameAccessFor("00000000-0000-4000-8000-000000000000", "user_owner", "read"),
    ).rejects.toBeInstanceOf(GameNotFoundError);
  });
});

describe("requireGameAccess (current request)", () => {
  it("uses the signed-in Clerk user", async () => {
    await createUser("user_owner");
    const game = await createGame("user_owner");

    authMock.userId = "user_owner";
    await expect(requireGameAccess(game.id, "write")).resolves.toMatchObject({ id: game.id });

    authMock.userId = null;
    await expect(requireGameAccess(game.id, "read")).rejects.toBeInstanceOf(GameNotFoundError);
  });
});
