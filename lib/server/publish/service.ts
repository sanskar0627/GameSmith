import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";

import { parseKeyring } from "@/lib/crypto/keyring";
import { db, type Database } from "@/lib/db";
import { games, publishedBuilds, publishedFiles, type Game } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { requireGameAccessFor } from "@/lib/server/games/access";
import { RateLimiter } from "@/lib/server/rate-limit";
import { SandboxError } from "@/lib/server/sandbox/client";
import { runSandbox, sandboxesConfigured, SandboxNotConfiguredError } from "@/lib/server/sandbox/service";

import { contentTypeFor } from "./mime";

/**
 * Publishing (Phase 11). The owner publishes what is live in the sandbox:
 * the sandbox runs a production build (vite build, inside the sandbox) and
 * the files are stored here, immutable per build. Players get them from
 * the content origin (PUBLISHED_ORIGIN), a different site from the app, so
 * game code can never read the app's cookies or call its APIs.
 *
 * Build URLs are `<origin>/b/<buildId>/<access>/<file>`:
 * - access "p": anyone, while the game is shared by link.
 * - access <owner token>: an HMAC of the build id, only ever given to the
 *   owner, so they can play a published build of a private game.
 * Unpublishing (or publishing again) makes old URLs stop working.
 */

export class PublishNotConfiguredError extends Error {
  constructor() {
    super("Publishing isn't set up on this server yet.");
    this.name = "PublishNotConfiguredError";
  }
}

export class PublishError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

export const MAX_BUILD_BYTES = 40 * 1024 * 1024;
const MAX_BUILD_FILES = 2000;
const PUBLIC_ACCESS = "p";

/** Builds are the expensive call: cap them per user. */
const publishes = new RateLimiter(20, 60 * 60_000);

export function publishedOrigin(): string | undefined {
  return serverEnv().PUBLISHED_ORIGIN?.replace(/\/$/, "");
}

export function publishingConfigured(): boolean {
  return Boolean(publishedOrigin()) && sandboxesConfigured();
}

/* --- Access tokens -------------------------------------------------------- */

let signingKey: { source: string; key: Buffer } | null = null;

function key(): Buffer {
  const source = serverEnv().KEY_ENCRYPTION_KEYS;
  if (signingKey?.source !== source) {
    const ring = parseKeyring(source);
    // A separate key per purpose, derived from the active keyring entry.
    const derived = createHmac("sha256", ring.keys.get(ring.active)!).update("gamesmith/published-build/v1").digest();
    signingKey = { source, key: derived };
  }
  return signingKey.key;
}

export function ownerToken(buildId: string): string {
  return createHmac("sha256", key()).update(buildId).digest("base64url").slice(0, 32);
}

function validOwnerToken(buildId: string, token: string): boolean {
  const expected = Buffer.from(ownerToken(buildId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The iframe URL for a published build, for a viewer who can see it. */
export function buildUrl(buildId: string, asOwner: boolean): string | null {
  const origin = publishedOrigin();
  if (!origin) return null;
  return `${origin}/b/${buildId}/${asOwner ? ownerToken(buildId) : PUBLIC_ACCESS}/index.html`;
}

/* --- Publishing ----------------------------------------------------------- */

export type PublishState = {
  configured: boolean;
  published: null | { buildId: string; version: number; publishedAt: string; url: string; files: number; bytes: number };
};

export async function getPublishState(userId: string, gameId: string, database: Database = db()): Promise<PublishState> {
  const game = await requireGameAccessFor(gameId, userId, "write", database);
  return { configured: publishingConfigured(), published: await describe(game, database) };
}

async function describe(game: Game, database: Database): Promise<PublishState["published"]> {
  if (!game.publishedBuildId) return null;
  const [build] = await database.select().from(publishedBuilds).where(eq(publishedBuilds.id, game.publishedBuildId)).limit(1);
  if (!build) return null;
  return {
    buildId: build.id,
    version: build.version,
    publishedAt: (game.publishedAt ?? build.createdAt).toISOString(),
    url: buildUrl(build.id, true) ?? "",
    files: build.files,
    bytes: build.bytes,
  };
}

/** Normalized build path, or null when the sandbox sent something odd. */
function cleanPath(raw: string): string | null {
  if (raw.length === 0 || raw.length > 300 || raw.startsWith("/") || raw.includes("\\") || raw.includes("\0")) return null;
  const parts = raw.split("/");
  if (parts.some((p) => p === "" || p === "." || p === ".." || !/^[A-Za-z0-9._@~+-]+$/.test(p))) return null;
  return parts.join("/");
}

export async function publishGame(userId: string, gameId: string, database: Database = db()): Promise<PublishState> {
  const game = await requireGameAccessFor(gameId, userId, "write", database);
  if (!publishedOrigin()) throw new PublishNotConfiguredError();
  if (!sandboxesConfigured()) throw new SandboxNotConfiguredError();
  if (game.currentVersion === 0) throw new PublishError(409, "Save a playable version first, then publish it.");
  if (!publishes.take(userId)) throw new PublishError(429, "You've published a lot in the last hour. Try again later.");

  const sandbox = runSandbox();
  const status = await sandbox.status(game.id);
  if (!status.running) await sandbox.start(game.id);

  let built: { files: { path: string; data: string }[] };
  try {
    built = await sandbox.build(game.id);
  } catch (error) {
    if (error instanceof SandboxError && error.status === 422) {
      throw new PublishError(422, "The game didn't build. Ask Smith to fix it, then publish again.", error.message.slice(0, 3000));
    }
    if (error instanceof SandboxError && error.status === 413) throw new PublishError(413, "This game is too large to publish.");
    throw error;
  }

  const files: { path: string; contentType: string; data: Buffer }[] = [];
  let bytes = 0;
  for (const f of built.files) {
    const path = cleanPath(f.path);
    if (!path) continue;
    const data = Buffer.from(f.data, "base64");
    bytes += data.length;
    files.push({ path, contentType: contentTypeFor(path), data });
  }
  if (bytes > MAX_BUILD_BYTES || files.length > MAX_BUILD_FILES) throw new PublishError(413, "This game is too large to publish.");
  if (!files.some((f) => f.path === "index.html")) throw new PublishError(422, "The build has no index.html.");

  const buildId = await database.transaction(async (tx) => {
    const [build] = await tx
      .insert(publishedBuilds)
      .values({ gameId: game.id, version: game.currentVersion, files: files.length, bytes })
      .returning({ id: publishedBuilds.id });
    // Insert in batches: one statement per file would be slow, one for all too big.
    for (let i = 0; i < files.length; i += 50) {
      await tx.insert(publishedFiles).values(files.slice(i, i + 50).map((f) => ({ buildId: build.id, ...f })));
    }
    await tx.update(games).set({ publishedBuildId: build.id, publishedAt: new Date() }).where(eq(games.id, game.id));
    // Older builds are no longer reachable: drop them.
    await tx.delete(publishedBuilds).where(and(eq(publishedBuilds.gameId, game.id), ne(publishedBuilds.id, build.id)));
    return build.id;
  });

  const [fresh] = await database.select().from(games).where(eq(games.id, game.id)).limit(1);
  const published = await describe(fresh, database);
  if (!published || published.buildId !== buildId) throw new PublishError(500, "Publishing didn't stick. Try again.");
  return { configured: true, published };
}

export async function unpublishGame(userId: string, gameId: string, database: Database = db()): Promise<PublishState> {
  const game = await requireGameAccessFor(gameId, userId, "write", database);
  await database.transaction(async (tx) => {
    await tx.update(games).set({ publishedBuildId: null, publishedAt: null }).where(eq(games.id, game.id));
    await tx.delete(publishedBuilds).where(eq(publishedBuilds.gameId, game.id));
  });
  return { configured: publishingConfigured(), published: null };
}

/* --- Serving (content origin only) --------------------------------------- */

export type ServedFile = { contentType: string; data: Buffer; access: "public" | "owner" };

/**
 * One file of a live build, or null. Checks on every request that the
 * build is still the game's published one and that the viewer may see it.
 */
export async function readPublishedFile(
  buildId: string,
  access: string,
  path: string,
  database: Database = db(),
): Promise<ServedFile | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(buildId)) return null;
  const clean = cleanPath(path || "index.html");
  if (!clean) return null;

  const [game] = await database
    .select({ visibility: games.visibility })
    .from(games)
    .where(and(eq(games.publishedBuildId, buildId), isNull(games.deletedAt)))
    .limit(1);
  if (!game) return null;
  let kind: ServedFile["access"];
  if (access === PUBLIC_ACCESS) {
    if (game.visibility !== "link") return null;
    kind = "public";
  } else if (validOwnerToken(buildId, access)) {
    kind = "owner";
  } else return null;

  const [file] = await database
    .select({ contentType: publishedFiles.contentType, data: publishedFiles.data })
    .from(publishedFiles)
    .where(and(eq(publishedFiles.buildId, buildId), eq(publishedFiles.path, clean)))
    .limit(1);
  return file ? { ...file, access: kind } : null;
}

/** For the play page: the game's live build and who may open it. */
export function playableBuild(game: Pick<Game, "publishedBuildId" | "visibility" | "ownerId">, viewerId: string | null) {
  if (!game.publishedBuildId) return null;
  const owner = viewerId !== null && viewerId === game.ownerId;
  if (!owner && game.visibility !== "link") return null;
  return buildUrl(game.publishedBuildId, owner);
}

/**
 * Housekeeping: builds no live game points at (a deleted game's, or one
 * left behind by a failed publish). Their files go with them (cascade).
 */
export async function pruneOrphanBuilds(database: Database = db()): Promise<number> {
  const rows = await database.execute<{ id: string }>(sql`
    delete from published_builds b
    where b.created_at < now() - interval '1 hour'
      and not exists (
        select 1 from games g where g.published_build_id = b.id and g.deleted_at is null
      )
    returning b.id`);
  return rows.length;
}

/** Most recent build per game (debugging and tests). */
export async function latestBuild(gameId: string, database: Database = db()) {
  const [row] = await database
    .select()
    .from(publishedBuilds)
    .where(eq(publishedBuilds.gameId, gameId))
    .orderBy(desc(publishedBuilds.createdAt))
    .limit(1);
  return row ?? null;
}
