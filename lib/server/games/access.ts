import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db, type Executor } from "@/lib/db";
import { games, type Game } from "@/lib/db/schema";

/**
 * Game authorization. Every page, action and route that touches a game
 * goes through `requireGameAccess`.
 *
 * - "read":  the owner, or anyone (signed in or not) when visibility is "link".
 * - "write": the owner only.
 *
 * Failures are always "not found", never "forbidden", so game ids cannot be
 * probed to learn which ones exist.
 */
export type GameIntent = "read" | "write";

export class GameNotFoundError extends Error {
  readonly status = 404;
  constructor() {
    super("Game not found");
    this.name = "GameNotFoundError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Game ids are UUIDs; anything else can never match (and would make Postgres throw). */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Pure rule, shared by queries and tests. */
export function canAccessGame(
  game: Pick<Game, "ownerId" | "visibility" | "deletedAt">,
  viewerId: string | null,
  intent: GameIntent,
): boolean {
  if (game.deletedAt) return false;
  const isOwner = viewerId !== null && game.ownerId === viewerId;
  if (intent === "write") return isOwner;
  return isOwner || game.visibility === "link";
}

/** Loads a game for an explicit viewer. Throws `GameNotFoundError` on any denial. */
export async function requireGameAccessFor(
  gameId: string,
  viewerId: string | null,
  intent: GameIntent,
  database: Executor = db(),
): Promise<Game> {
  if (!isUuid(gameId)) throw new GameNotFoundError();
  const [game] = await database
    .select()
    .from(games)
    .where(and(eq(games.id, gameId), isNull(games.deletedAt)))
    .limit(1);
  if (!game || !canAccessGame(game, viewerId, intent)) throw new GameNotFoundError();
  return game;
}

/** Loads a game for the current request's viewer (signed in or not). */
export async function requireGameAccess(gameId: string, intent: GameIntent): Promise<Game> {
  // Loaded here, not at the top: the agent worker imports this module outside Next.
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  return requireGameAccessFor(gameId, userId ?? null, intent);
}
