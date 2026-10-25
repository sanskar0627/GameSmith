import "server-only";

import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { db, type Executor } from "@/lib/db";
import { gameVersions, games, messages, type Game, type GameVersionRow, type MessageRow } from "@/lib/db/schema";
import type { GameCard, GameSummary, GameVersion, GameVisibility } from "@/lib/games/types";
import type { ChatMessage } from "@/lib/workspace/types";

import { GameNotFoundError, isUuid, requireGameAccessFor } from "./access";

/**
 * Games data access. Every function that changes a game takes the acting
 * user's id and checks ownership itself, so callers cannot forget to.
 */

export const TITLE_MAX = 60;
export const PROMPT_MAX = 2000;
const PITCH_MAX = 280;

/* --- Mapping to the UI contracts (lib/games/types.ts) ------------------- */

export function toGameSummary(g: Game): GameSummary {
  return { id: g.id, title: g.title, status: g.status, updatedAt: g.updatedAt.toISOString(), thumbnailUrl: null };
}

export function toGameCard(g: Game): GameCard {
  return {
    ...toGameSummary(g),
    pitch: g.pitch,
    genre: g.genre,
    version: g.currentVersion,
    createdAt: g.createdAt.toISOString(),
    visibility: g.visibility,
    coverSeed: g.coverSeed,
  };
}

export function toGameVersion(v: GameVersionRow): GameVersion {
  return {
    version: v.number,
    label: v.label,
    prompt: v.prompt,
    createdAt: v.createdAt.toISOString(),
    status: v.status,
    filesChanged: v.filesChanged,
    // Restoring copies an old snapshot back into the sandbox (Phase 7).
    restorable: v.snapshotKey !== null,
  };
}

export function toChatMessage(m: MessageRow): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    parts: m.parts,
    createdAt: m.createdAt.toISOString(),
    ...(m.attachments ? { attachments: m.attachments } : {}),
  };
}

/**
 * A readable working title from the first prompt: its first clause, cut at a
 * word boundary. "A knight crossing floating islands, collecting crystals"
 * becomes "A knight crossing floating islands".
 */
export function titleFromPrompt(prompt: string): string {
  const clause = prompt.trim().split(/[.!?\n,;:—–]/)[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (!clause) return "Untitled game";
  let title = clause;
  if (title.length > TITLE_MAX) {
    const cut = title.slice(0, TITLE_MAX + 1);
    const lastSpace = cut.lastIndexOf(" ");
    title = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut.slice(0, TITLE_MAX)).trim();
  }
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/* --- Reads --------------------------------------------------------------- */

const live = (ownerId: string) => and(eq(games.ownerId, ownerId), isNull(games.deletedAt));

/** The owner's games, most recently edited first. */
export async function listGames(ownerId: string, database: Executor = db()): Promise<Game[]> {
  return database.select().from(games).where(live(ownerId)).orderBy(desc(games.updatedAt));
}

export async function listRecentGames(ownerId: string, limit = 5, database: Executor = db()): Promise<Game[]> {
  return database.select().from(games).where(live(ownerId)).orderBy(desc(games.updatedAt)).limit(limit);
}

/** Newest first. Callers must have authorized access to the game. */
export async function listVersions(gameId: string, database: Executor = db()): Promise<GameVersionRow[]> {
  return database
    .select()
    .from(gameVersions)
    .where(eq(gameVersions.gameId, gameId))
    .orderBy(desc(gameVersions.number));
}

/** Oldest first. Callers must have authorized access to the game. */
export async function listMessages(gameId: string, database: Executor = db()): Promise<MessageRow[]> {
  return database
    .select()
    .from(messages)
    .where(eq(messages.gameId, gameId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
}

/* --- Writes -------------------------------------------------------------- */

/** Creates a draft game from the first prompt, which becomes its first message. */
export async function createGame(ownerId: string, prompt: string, database: Executor = db()): Promise<Game> {
  const text = prompt.trim().slice(0, PROMPT_MAX);
  if (!text) throw new Error("Prompt is empty");
  return database.transaction(async (tx) => {
    const [game] = await tx
      .insert(games)
      .values({ ownerId, title: titleFromPrompt(text), pitch: text.slice(0, PITCH_MAX) })
      .returning();
    await tx.insert(messages).values({ gameId: game.id, role: "user", parts: [{ type: "text", text }] });
    return game;
  });
}

/**
 * Updates one of the owner's live games in a single statement (no gap
 * between the ownership check and the write). Throws GameNotFoundError
 * when the id is malformed, unknown, deleted or someone else's.
 */
async function updateOwned(
  ownerId: string,
  gameId: string,
  set: Partial<typeof games.$inferInsert>,
  database: Executor,
): Promise<Game> {
  if (!isUuid(gameId)) throw new GameNotFoundError();
  const [game] = await database
    .update(games)
    .set(set)
    .where(and(eq(games.id, gameId), live(ownerId)))
    .returning();
  if (!game) throw new GameNotFoundError();
  return game;
}

export function cleanTitle(title: string): string {
  const clean = title.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > TITLE_MAX) throw new RangeError(`Title must be 1 to ${TITLE_MAX} characters`);
  return clean;
}

export async function renameGame(ownerId: string, gameId: string, title: string, database: Executor = db()) {
  return updateOwned(ownerId, gameId, { title: cleanTitle(title) }, database);
}

export async function setGameVisibility(
  ownerId: string,
  gameId: string,
  visibility: GameVisibility,
  database: Executor = db(),
) {
  return updateOwned(ownerId, gameId, { visibility }, database);
}

/** Moves a game out of the library. `restoreGame` brings it back. */
export async function softDeleteGame(ownerId: string, gameId: string, database: Executor = db()) {
  return updateOwned(ownerId, gameId, { deletedAt: new Date() }, database);
}

export async function restoreGame(ownerId: string, gameId: string, database: Executor = db()) {
  if (!isUuid(gameId)) throw new GameNotFoundError();
  const [game] = await database
    .update(games)
    .set({ deletedAt: null })
    .where(and(eq(games.id, gameId), eq(games.ownerId, ownerId), isNotNull(games.deletedAt)))
    .returning();
  if (!game) throw new GameNotFoundError();
  return game;
}

/**
 * Copies a game with its versions and conversation. The copy is always
 * private. (Sandbox files are copied too once sandboxes exist, Phase 7.)
 */
export async function duplicateGame(ownerId: string, gameId: string, database: Executor = db()): Promise<Game> {
  const source = await requireGameAccessFor(gameId, ownerId, "write", database);
  return database.transaction(async (tx) => {
    const [copy] = await tx
      .insert(games)
      .values({
        ownerId,
        title: `${source.title} (copy)`.slice(0, TITLE_MAX),
        pitch: source.pitch,
        genre: source.genre,
        status: source.status === "building" ? "ready" : source.status,
        visibility: "private",
        coverSeed: source.coverSeed,
        currentVersion: source.currentVersion,
        modelId: source.modelId,
      })
      .returning();

    const versions = await listVersions(source.id, tx);
    if (versions.length > 0) {
      await tx.insert(gameVersions).values(
        versions.map((v) => ({
          gameId: copy.id,
          number: v.number,
          label: v.label,
          prompt: v.prompt,
          status: v.status,
          filesChanged: v.filesChanged,
          snapshotKey: v.snapshotKey,
          createdAt: v.createdAt,
        })),
      );
    }
    const thread = await listMessages(source.id, tx);
    if (thread.length > 0) {
      await tx.insert(messages).values(
        thread.map((m) => ({
          gameId: copy.id,
          role: m.role,
          parts: m.parts,
          attachments: m.attachments,
          createdAt: m.createdAt,
        })),
      );
    }
    return copy;
  });
}
