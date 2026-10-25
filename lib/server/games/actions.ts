"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { GameCard, GameVisibility } from "@/lib/games/types";
import { ensureUser } from "@/lib/server/users";

import { GameNotFoundError } from "./access";
import {
  createGame,
  duplicateGame,
  PROMPT_MAX,
  renameGame,
  restoreGame,
  setGameVisibility,
  softDeleteGame,
  TITLE_MAX,
  toGameCard,
} from "./queries";

/**
 * Server actions for games. Each one is a public endpoint, so each one
 * authenticates (`ensureUser`), validates its input and lets the queries
 * enforce ownership. `refresh()` re-renders the current route so the
 * sidebar's recent games stay in sync.
 */

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const gameId = z.string().uuid();
const title = z.string().trim().min(1, "Give it a name").max(TITLE_MAX, `Keep it under ${TITLE_MAX} characters`);
const prompt = z.string().trim().min(1, "Describe your game first").max(PROMPT_MAX, "That prompt is too long");
const visibility = z.enum(["private", "link"]);

async function run<T>(label: string, fn: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await ensureUser();
  try {
    return { ok: true, data: await fn(user.id) };
  } catch (error) {
    if (error instanceof GameNotFoundError) return { ok: false, error: "That game no longer exists." };
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Invalid input" };
    console.error(`[games] ${label} failed`, error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

export async function createGameAction(input: string): Promise<ActionResult<{ id: string }>> {
  return run("create", async (userId) => {
    const game = await createGame(userId, prompt.parse(input));
    refresh();
    return { id: game.id };
  });
}

export async function renameGameAction(id: string, newTitle: string): Promise<ActionResult<GameCard>> {
  return run("rename", async (userId) => {
    const game = await renameGame(userId, gameId.parse(id), title.parse(newTitle));
    refresh();
    return toGameCard(game);
  });
}

export async function setVisibilityAction(id: string, value: GameVisibility): Promise<ActionResult<GameCard>> {
  return run("visibility", async (userId) => {
    const game = await setGameVisibility(userId, gameId.parse(id), visibility.parse(value));
    refresh();
    return toGameCard(game);
  });
}

export async function deleteGameAction(id: string): Promise<ActionResult> {
  return run("delete", async (userId) => {
    await softDeleteGame(userId, gameId.parse(id));
    refresh();
    return undefined;
  });
}

export async function restoreGameAction(id: string): Promise<ActionResult<GameCard>> {
  return run("restore", async (userId) => {
    const game = await restoreGame(userId, gameId.parse(id));
    refresh();
    return toGameCard(game);
  });
}

export async function duplicateGameAction(id: string): Promise<ActionResult<GameCard>> {
  return run("duplicate", async (userId) => {
    const game = await duplicateGame(userId, gameId.parse(id));
    refresh();
    return toGameCard(game);
  });
}
