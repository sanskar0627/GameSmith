import "server-only";

import { db, type Executor } from "@/lib/db";
import { sandboxes } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { requireGameAccessFor } from "@/lib/server/games/access";
import { RateLimiter } from "@/lib/server/rate-limit";

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
  await (await awake(userId, gameId, database)).deleteFile(gameId, path);
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
