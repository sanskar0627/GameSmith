import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { gameVersions, games } from "@/lib/db/schema";
import { GameNotFoundError } from "@/lib/server/games/access";
import {
  createGame,
  duplicateGame,
  listGames,
  listMessages,
  listRecentGames,
  listVersions,
  renameGame,
  restoreGame,
  setGameModel,
  setGameVisibility,
  softDeleteGame,
  titleFromPrompt,
  toGameCard,
  toGameVersion,
} from "@/lib/server/games/queries";

import { createGame as insertGame, createUser } from "./support/factories";

const MISSING = "00000000-0000-4000-8000-000000000000";

describe("titleFromPrompt", () => {
  it("uses the first clause, capitalised", () => {
    expect(titleFromPrompt("a knight crossing floating islands, collecting crystals before sunset.")).toBe(
      "A knight crossing floating islands",
    );
  });

  it("cuts long clauses at a word boundary within the limit", () => {
    const title = titleFromPrompt("an extremely long and winding description of a world that never seems to end at all");
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith(" ")).toBe(false);
    expect("an extremely long and winding description of a world that never seems".startsWith(title.toLowerCase())).toBe(true);
  });

  it("falls back when there is nothing usable", () => {
    expect(titleFromPrompt("   ...  ")).toBe("Untitled game");
  });
});

describe("createGame", () => {
  it("creates a private draft and saves the prompt as the first message", async () => {
    await createUser("user_a");
    const game = await createGame("user_a", "  Low-poly racing through a neon canyon at night.  ");
    expect(game).toMatchObject({
      ownerId: "user_a",
      title: "Low-poly racing through a neon canyon at night",
      status: "draft",
      visibility: "private",
      currentVersion: 0,
    });
    const thread = await listMessages(game.id);
    expect(thread).toHaveLength(1);
    expect(thread[0]).toMatchObject({ role: "user", parts: [{ type: "text", text: "Low-poly racing through a neon canyon at night." }] });
  });

  it("rejects an empty prompt", async () => {
    await createUser("user_a");
    await expect(createGame("user_a", "   ")).rejects.toThrow();
  });
});

describe("model choice", () => {
  it("stores the composer's model on create and on change, owner only", async () => {
    await createUser("user_a");
    await createUser("user_b");
    const game = await createGame("user_a", "A tiny space trader", undefined, "openai/gpt-6.1-sol");
    expect(game.modelId).toBe("openai/gpt-6.1-sol");
    expect((await setGameModel("user_a", game.id, "anthropic/claude-haiku-5-5")).modelId).toBe(
      "anthropic/claude-haiku-5-5",
    );
    await expect(setGameModel("user_b", game.id, "openai/gpt-6-luna")).rejects.toBeInstanceOf(GameNotFoundError);
  });

  it("rejects ids outside the catalog", async () => {
    await createUser("user_a");
    const game = await insertGame("user_a");
    await expect(setGameModel("user_a", game.id, "openai/gpt-2")).rejects.toThrow(RangeError);
    await expect(createGame("user_a", "Prompt", undefined, "nope")).rejects.toThrow(RangeError);
  });
});

describe("listing", () => {
  it("shows only the owner's live games, newest edit first", async () => {
    await createUser("user_a");
    await createUser("user_b");
    const older = await insertGame("user_a", { title: "Older", updatedAt: new Date("2026-01-01") });
    const newer = await insertGame("user_a", { title: "Newer", updatedAt: new Date("2026-02-01") });
    await insertGame("user_a", { title: "Deleted", deletedAt: new Date() });
    await insertGame("user_b", { title: "Someone else's" });

    expect((await listGames("user_a")).map((g) => g.id)).toEqual([newer.id, older.id]);
    expect(await listGames("user_b")).toHaveLength(1);
  });

  it("limits recent games", async () => {
    await createUser("user_a");
    for (let i = 0; i < 7; i++) await insertGame("user_a", { title: `Game ${i}` });
    expect(await listRecentGames("user_a")).toHaveLength(5);
  });
});

describe("owner-only changes", () => {
  it("renames, trimming whitespace", async () => {
    await createUser("user_a");
    const game = await insertGame("user_a");
    const renamed = await renameGame("user_a", game.id, "  Sky   Knight ");
    expect(renamed.title).toBe("Sky Knight");
  });

  it("rejects empty and over-long titles", async () => {
    await createUser("user_a");
    const game = await insertGame("user_a");
    await expect(renameGame("user_a", game.id, "   ")).rejects.toThrow();
    await expect(renameGame("user_a", game.id, "x".repeat(61))).rejects.toThrow();
  });

  it("refuses every change from another user, as not found", async () => {
    await createUser("user_a");
    await createUser("user_b");
    const game = await insertGame("user_a", { title: "Mine" });
    await expect(renameGame("user_b", game.id, "Stolen")).rejects.toBeInstanceOf(GameNotFoundError);
    await expect(setGameVisibility("user_b", game.id, "link")).rejects.toBeInstanceOf(GameNotFoundError);
    await expect(softDeleteGame("user_b", game.id)).rejects.toBeInstanceOf(GameNotFoundError);
    await expect(duplicateGame("user_b", game.id)).rejects.toBeInstanceOf(GameNotFoundError);
    const [row] = await db().select().from(games).where(eq(games.id, game.id));
    expect(row).toMatchObject({ title: "Mine", visibility: "private", deletedAt: null });
    expect(await listGames("user_b")).toHaveLength(0);
  });

  it("treats malformed and unknown ids as not found", async () => {
    await createUser("user_a");
    await expect(renameGame("user_a", "demo", "x")).rejects.toBeInstanceOf(GameNotFoundError);
    await expect(restoreGame("user_a", "'; drop table games; --")).rejects.toBeInstanceOf(GameNotFoundError);
    await expect(setGameVisibility("user_a", MISSING, "link")).rejects.toBeInstanceOf(GameNotFoundError);
  });

  it("changes visibility", async () => {
    await createUser("user_a");
    const game = await insertGame("user_a");
    expect((await setGameVisibility("user_a", game.id, "link")).visibility).toBe("link");
  });
});

describe("delete and restore", () => {
  it("hides a deleted game and brings it back", async () => {
    await createUser("user_a");
    const game = await insertGame("user_a");
    await softDeleteGame("user_a", game.id);
    expect(await listGames("user_a")).toHaveLength(0);
    // Deleted games can't be changed until restored.
    await expect(renameGame("user_a", game.id, "Ghost")).rejects.toBeInstanceOf(GameNotFoundError);

    await restoreGame("user_a", game.id);
    expect((await listGames("user_a")).map((g) => g.id)).toEqual([game.id]);
  });

  it("only restores your own deleted games", async () => {
    await createUser("user_a");
    await createUser("user_b");
    const game = await insertGame("user_a", { deletedAt: new Date() });
    await expect(restoreGame("user_b", game.id)).rejects.toBeInstanceOf(GameNotFoundError);
    // Restoring a game that is not deleted is also "not found".
    const live = await insertGame("user_a");
    await expect(restoreGame("user_a", live.id)).rejects.toBeInstanceOf(GameNotFoundError);
  });
});

describe("duplicateGame", () => {
  it("copies details, versions and conversation into a private game", async () => {
    await createUser("user_a");
    const source = await createGame("user_a", "Floating islands at dusk");
    await db().update(games).set({ visibility: "link", currentVersion: 2, genre: "Adventure" }).where(eq(games.id, source.id));
    await db().insert(gameVersions).values([
      { gameId: source.id, number: 1, label: "First light", status: "ready" },
      { gameId: source.id, number: 2, label: "Fireflies", status: "ready" },
    ]);

    const copy = await duplicateGame("user_a", source.id);
    expect(copy).toMatchObject({
      title: "Floating islands at dusk (copy)",
      visibility: "private",
      currentVersion: 2,
      genre: "Adventure",
    });
    expect(copy.id).not.toBe(source.id);
    expect((await listVersions(copy.id)).map((v) => v.number)).toEqual([2, 1]);
    expect((await listMessages(copy.id)).map((m) => m.parts)).toEqual((await listMessages(source.id)).map((m) => m.parts));
    // The source is untouched.
    expect((await listVersions(source.id))).toHaveLength(2);
  });
});

describe("mapping to UI contracts", () => {
  it("maps a game row to a library card", async () => {
    await createUser("user_a");
    const game = await insertGame("user_a", { title: "Card", genre: "Puzzle", currentVersion: 3 });
    expect(toGameCard(game)).toMatchObject({ id: game.id, title: "Card", genre: "Puzzle", version: 3, thumbnailUrl: null });
    expect(typeof toGameCard(game).updatedAt).toBe("string");
  });

  it("marks versions restorable only when a snapshot exists", async () => {
    await createUser("user_a");
    const game = await insertGame("user_a");
    const [withSnap, without] = await db()
      .insert(gameVersions)
      .values([
        { gameId: game.id, number: 1, label: "a", status: "ready", snapshotKey: "snapshots/x/1.tar.zst" },
        { gameId: game.id, number: 2, label: "b", status: "ready" },
      ])
      .returning();
    expect(toGameVersion(withSnap).restorable).toBe(true);
    expect(toGameVersion(without).restorable).toBe(false);
  });
});
