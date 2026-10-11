import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { gameVersions, messages } from "@/lib/db/schema";

import { createGame, createUser } from "./support/factories";

describe("schema constraints", () => {
  it("applies defaults to a new game", async () => {
    await createUser("user_1");
    const game = await createGame("user_1");
    expect(game).toMatchObject({ status: "draft", visibility: "private", currentVersion: 0, deletedAt: null });
    expect(Number.isInteger(game.coverSeed)).toBe(true);
  });

  it("rejects empty and over-long titles", async () => {
    await createUser("user_1");
    await expect(createGame("user_1", { title: "" })).rejects.toThrow();
    await expect(createGame("user_1", { title: "x".repeat(121) })).rejects.toThrow();
  });

  it("rejects games for unknown owners", async () => {
    await expect(createGame("user_missing")).rejects.toThrow();
  });

  it("keeps version numbers unique per game", async () => {
    await createUser("user_1");
    const game = await createGame("user_1");
    const v = { gameId: game.id, number: 1, label: "First light", status: "ready" as const };
    await db().insert(gameVersions).values(v);
    await expect(db().insert(gameVersions).values(v)).rejects.toThrow();
  });

  it("stores message parts as JSON and round-trips them", async () => {
    await createUser("user_1");
    const game = await createGame("user_1");
    const parts = [
      { type: "text" as const, text: "Make the islands float higher" },
      { type: "checkpoint" as const, version: 2, label: "Higher islands" },
    ];
    const [row] = await db().insert(messages).values({ gameId: game.id, role: "user", parts }).returning();
    expect(row.parts).toEqual(parts);
  });
});
