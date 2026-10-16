import "server-only";

import { db, type Executor } from "@/lib/db";
import { sandboxes } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { requireGameAccessFor } from "@/lib/server/games/access";
import { RateLimiter } from "@/lib/server/rate-limit";

import { gunzipSync } from "node:zlib";

import { archiveName, readTar, writeZip } from "./archive";
import { SandboxClient, SandboxError, type SandboxFile } from "./client";

/**
 * Owner-only access to a game's sandbox. Every function checks that the
 * user owns the game (anything else is "not found") before calling the
 * sandbox manager. Preview URLs are capability links: only the owner gets
 * them, and they change on every start.
 */

export class SandboxNotConfiguredError extends Error {
  constructor() {
    super("Sandboxes aren't set up on this server yet.");
    this.name = "SandboxNotConfiguredError";
  }
}

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** The manager caps a game's source at 100 MB; leave room for tar headers. */
const MAX_ARCHIVE_BYTES = 110 * 1024 * 1024;

/**
 * Files the sandbox cannot run without. The entrypoint re-seeds the starter
 * template when package.json is missing, which would overwrite the game's
 * own files, so it can be edited but never deleted or renamed.
 */
const LOCKED_FILES = new Set(["package.json"]);

/**
 * Tidies a path from the editor ("./src//a.ts" -> "src/a.ts"). The sandbox
 * does the real checks (fsop.mjs); this only rejects what is clearly wrong.
 */
export function normalizeFilePath(raw: string): string {
  const parts = raw.trim().split("/").filter((p) => p !== "" && p !== ".");
  if (parts.length === 0 || parts.some((p) => p === "..") || raw.includes("\\") || raw.includes("\0")) {
    throw new SandboxError(400, "That isn't a valid file path.");
  }
  return parts.join("/");
}

function assertUnlocked(path: string) {
  if (LOCKED_FILES.has(path)) {
    throw new SandboxError(409, `${path} can't be deleted or renamed: the game needs it to run.`);
  }
}

let override: SandboxClient | null = null;
/** Tests inject a client; production builds one from the environment. */
export function setSandboxClientForTests(client: SandboxClient | null) {
  override = client;
}

function client(): SandboxClient {
  if (override) return override;
  const env = serverEnv();
  if (!env.SANDBOX_MANAGER_URL || !env.SANDBOX_MANAGER_TOKEN) throw new SandboxNotConfiguredError();
  return new SandboxClient(env.SANDBOX_MANAGER_URL, env.SANDBOX_MANAGER_TOKEN);
}

export function sandboxesConfigured(): boolean {
  const env = serverEnv();
  return Boolean(override || (env.SANDBOX_MANAGER_URL && env.SANDBOX_MANAGER_TOKEN));
}

function previewUrl(previewPath: string): string {
  const origin = serverEnv().SANDBOX_PREVIEW_ORIGIN ?? "http://localhost:4101";
  return `${origin.replace(/\/$/, "")}${previewPath}`;
}

export type SandboxView = { running: false } | { running: true; previewUrl: string; startedAt: string };

// Starting a sandbox is the expensive call; cap it per user.
const starts = new RateLimiter(30, 10 * 60_000);

async function record(gameId: string, status: "running" | "stopped", database: Executor) {
  const now = new Date();
  const times = status === "running" ? { startedAt: now } : { stoppedAt: now };
  await database
    .insert(sandboxes)
    .values({ gameId, status, ...times })
    .onConflictDoUpdate({ target: sandboxes.gameId, set: { status, ...times } });
}

export async function startSandbox(userId: string, gameId: string, database: Executor = db()): Promise<SandboxView> {
  await requireGameAccessFor(gameId, userId, "write", database);
  if (!starts.take(userId)) throw new SandboxError(429, "Too many sandbox starts. Try again in a few minutes.");
  const status = await client().start(gameId);
  if (!status.running) throw new SandboxError(502, "The sandbox did not start.");
  await record(gameId, "running", database);
  return { running: true, previewUrl: previewUrl(status.previewPath), startedAt: new Date(status.startedAt).toISOString() };
}

export async function stopSandbox(userId: string, gameId: string, database: Executor = db()): Promise<SandboxView> {
  await requireGameAccessFor(gameId, userId, "write", database);
  await client().stop(gameId);
  await record(gameId, "stopped", database);
  return { running: false };
}

export async function getSandbox(userId: string, gameId: string, database: Executor = db()): Promise<SandboxView> {
  await requireGameAccessFor(gameId, userId, "write", database);
  const status = await client().status(gameId);
  return status.running
    ? { running: true, previewUrl: previewUrl(status.previewPath), startedAt: new Date(status.startedAt).toISOString() }
    : { running: false };
}

/** File operations start the sandbox when it's asleep. */
async function awake(userId: string, gameId: string, database: Executor) {
  await requireGameAccessFor(gameId, userId, "write", database);
  const c = client();
  const status = await c.status(gameId);
  if (!status.running) {
    if (!starts.take(userId)) throw new SandboxError(429, "Too many sandbox starts. Try again in a few minutes.");
    await c.start(gameId);
    await record(gameId, "running", database);
  }
  return c;
}

export async function listGameFiles(userId: string, gameId: string, database: Executor = db()): Promise<SandboxFile[]> {
  return (await awake(userId, gameId, database)).listFiles(gameId);
}

export async function readGameFile(userId: string, gameId: string, path: string, database: Executor = db()) {
  return (await awake(userId, gameId, database)).readFile(gameId, path);
}

export async function writeGameFile(
  userId: string,
  gameId: string,
  path: string,
  data: Uint8Array,
  database: Executor = db(),
) {
  if (data.byteLength > MAX_FILE_BYTES) throw new SandboxError(413, "File too large");
  await (await awake(userId, gameId, database)).writeFile(gameId, path, data);
}

export async function deleteGameFile(userId: string, gameId: string, path: string, database: Executor = db()) {
  const target = normalizeFilePath(path);
  assertUnlocked(target);
  await (await awake(userId, gameId, database)).deleteFile(gameId, target);
}

/**
 * Moves one file. The sandbox has no rename, so this copies then deletes;
 * if the delete fails the file exists under both names, never under neither.
 */
export async function renameGameFile(
  userId: string,
  gameId: string,
  from: string,
  to: string,
  database: Executor = db(),
): Promise<string> {
  const source = normalizeFilePath(from);
  const target = normalizeFilePath(to);
  assertUnlocked(source);
  if (source === target) return target;
  const c = await awake(userId, gameId, database);
  const files = await c.listFiles(gameId);
  if (!files.some((f) => f.path === source)) throw new SandboxError(404, "File not found");
  if (files.some((f) => f.path === target)) throw new SandboxError(409, "A file with that name already exists.");
  if (files.some((f) => f.path.startsWith(`${target}/`))) throw new SandboxError(409, "A folder with that name already exists.");
  const data = await c.readFile(gameId, source);
  await c.writeFile(gameId, target, data);
  await c.deleteFile(gameId, source);
  return target;
}

async function readAll(stream: ReadableStream<Uint8Array>, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > limit) throw new SandboxError(413, "This game is too large to download.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * The game's source as a zip, under one folder named after the game. Uses
 * the live workspace when the sandbox is running, otherwise its last
 * snapshot; a game that never ran is started once so it has files.
 */
export async function downloadGameZip(
  userId: string,
  gameId: string,
  database: Executor = db(),
): Promise<{ filename: string; data: Buffer }> {
  const game = await requireGameAccessFor(gameId, userId, "write", database);
  let archive: ReadableStream<Uint8Array>;
  try {
    archive = await client().archive(gameId);
  } catch (error) {
    if (!(error instanceof SandboxError) || error.status !== 404) throw error;
    archive = await (await awake(userId, gameId, database)).archive(gameId);
  }
  const gz = await readAll(archive, MAX_ARCHIVE_BYTES);
  let tar: Buffer;
  try {
    tar = gunzipSync(gz, { maxOutputLength: MAX_ARCHIVE_BYTES });
  } catch {
    throw new SandboxError(502, "The game's files could not be read.");
  }
  const name = archiveName(game.title);
  return { filename: `${name}.zip`, data: writeZip(readTar(tar), name) };
}

/** Gives a duplicated game a copy of the source's files (best effort). */
export async function copyGameFiles(fromGameId: string, toGameId: string): Promise<boolean> {
  if (!sandboxesConfigured()) return false;
  try {
    const c = client();
    // Capture unsaved work first when the source is running.
    if ((await c.status(fromGameId)).running) await c.snapshot(fromGameId, "latest");
    return (await c.copySnapshot(fromGameId, toGameId)).copied;
  } catch (error) {
    console.error("[sandbox] copying files for a duplicate failed", error);
    return false;
  }
}
