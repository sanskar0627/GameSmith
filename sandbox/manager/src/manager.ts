import { randomBytes, timingSafeEqual } from "node:crypto";

import type { Config } from "./config.js";
import type { Driver } from "./driver.js";
import { SnapshotStore } from "./snapshots.js";

/**
 * Sandbox lifecycle. One sandbox per game: started on demand, stopped after
 * `idleMinutes` without preview traffic or file operations. Every start
 * gets a fresh preview secret, so old preview links stop working.
 */

export class ManagerError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Session = { gameId: string; secret: string; base: string; startedAt: number; lastActive: number };

export type FileEntry = { path: string; size: number; mtime: number };

const FSOP = ["node", "/opt/gs/fsop.mjs"];

export class SandboxManager {
  private readonly sessions = new Map<string, Session>();
  private readonly locks = new Map<string, Promise<unknown>>();
  readonly snapshots: SnapshotStore;

  constructor(
    private readonly config: Config,
    private readonly driver: Driver,
    private readonly now: () => number = Date.now,
    private readonly waitReady: (gameId: string, base: string) => Promise<void> = (g, b) =>
      defaultWaitReady(driver, g, b),
  ) {
    this.snapshots = new SnapshotStore(config.snapshotsDir);
  }

  /** One lifecycle operation per game at a time. */
  private async locked<T>(gameId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(gameId) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(fn);
    this.locks.set(gameId, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(gameId) === run) this.locks.delete(gameId);
    }
  }

  /** Rebuilds sessions from running containers after a manager restart. */
  async recover() {
    for (const { gameId, base } of await this.driver.running()) {
      const match = /^\/p\/[0-9a-f-]{36}-([A-Za-z0-9_-]+)\/$/.exec(base);
      if (!match) continue;
      const t = this.now();
      this.sessions.set(gameId, { gameId, secret: match[1]!, base, startedAt: t, lastActive: t });
    }
  }

  session(gameId: string): Session | undefined {
    return this.sessions.get(gameId);
  }

  touch(gameId: string) {
    const s = this.sessions.get(gameId);
    if (s) s.lastActive = this.now();
  }

  /** Constant-time check of a preview secret. */
  checkPreview(gameId: string, secret: string): Session | undefined {
    const s = this.sessions.get(gameId);
    if (!s) return undefined;
    const a = Buffer.from(s.secret);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b) ? s : undefined;
  }

  /** Preview access checks for an in-process proxy (tests, single-container dev). */
  previewAuth() {
    return {
      check: async (gameId: string, secret: string) => {
        const ok = Boolean(this.checkPreview(gameId, secret));
        if (ok) this.touch(gameId);
        return ok;
      },
      touch: (gameId: string) => this.touch(gameId),
    };
  }

  status(gameId: string) {
    const s = this.sessions.get(gameId);
    return s
      ? { running: true as const, previewPath: s.base, startedAt: s.startedAt, lastActive: s.lastActive }
      : { running: false as const };
  }

  async start(gameId: string, options: { restore?: string } = {}) {
    return this.locked(gameId, async () => {
      const existing = this.sessions.get(gameId);
      if (existing && !options.restore && (await this.driver.isRunning(gameId))) {
        existing.lastActive = this.now();
        return this.status(gameId);
      }
      if (!existing && this.sessions.size >= this.config.maxSandboxes) {
        throw new ManagerError(503, "All sandboxes are busy. Try again in a minute.");
      }

      let restoreFrom: string | undefined;
      if (options.restore) {
        if (!(await this.snapshots.exists(gameId, options.restore))) throw new ManagerError(404, "Snapshot not found");
        if (existing) await this.stopUnlocked(gameId, { snapshot: false });
        await this.driver.removeWorkspace(gameId);
        restoreFrom = options.restore;
      } else if (!(await this.driver.hasWorkspace(gameId)) && (await this.snapshots.exists(gameId, "latest"))) {
        restoreFrom = "latest";
      }

      const secret = randomBytes(18).toString("base64url");
      const base = `/p/${gameId}-${secret}/`;
      await this.driver.start({
        gameId,
        base,
        restore: restoreFrom ? this.snapshots.open(gameId, restoreFrom) : undefined,
      });
      try {
        await this.waitReady(gameId, base);
      } catch (error) {
        await this.driver.stop(gameId).catch(() => {});
        throw new ManagerError(502, `Sandbox did not become ready: ${(error as Error).message}`);
      }
      const t = this.now();
      this.sessions.set(gameId, { gameId, secret, base, startedAt: t, lastActive: t });
      return this.status(gameId);
    });
  }

  async stop(gameId: string, options: { snapshot?: boolean } = {}) {
    return this.locked(gameId, () => this.stopUnlocked(gameId, options));
  }

  private async stopUnlocked(gameId: string, { snapshot = true }: { snapshot?: boolean }) {
    if (snapshot && (await this.driver.isRunning(gameId))) {
      await this.snapshots.save(gameId, "latest", await this.driver.exportWorkspace(gameId));
    }
    await this.driver.stop(gameId);
    this.sessions.delete(gameId);
    return { running: false as const };
  }

  /** Raw Docker tar of the running workspace (callers sanitize it). */
  async exportLive(gameId: string) {
    this.requireRunning(gameId);
    this.touch(gameId);
    return this.driver.exportWorkspace(gameId);
  }

  async snapshot(gameId: string, name: string) {
    this.requireRunning(gameId);
    this.touch(gameId);
    return this.snapshots.save(gameId, name, await this.driver.exportWorkspace(gameId));
  }

  private requireRunning(gameId: string) {
    if (!this.sessions.has(gameId)) throw new ManagerError(409, "Sandbox is not running");
  }

  private async fsop(gameId: string, args: string[], stdin?: Buffer) {
    this.requireRunning(gameId);
    this.touch(gameId);
    const result = await this.driver.exec(gameId, [...FSOP, ...args], stdin);
    if (result.exitCode === 0) return result.stdout;
    if (result.exitCode === 2) throw new ManagerError(400, result.stderr || "Bad request");
    if (result.exitCode === 3) throw new ManagerError(404, "File not found");
    if (result.exitCode === 4) throw new ManagerError(413, "File too large");
    throw new ManagerError(500, "File operation failed");
  }

  async listFiles(gameId: string): Promise<FileEntry[]> {
    return JSON.parse((await this.fsop(gameId, ["list"])).toString("utf8")) as FileEntry[];
  }

  readFile(gameId: string, path: string) {
    return this.fsop(gameId, ["read", path]);
  }

  async writeFile(gameId: string, path: string, data: Buffer) {
    if (data.length > this.config.maxFileBytes) throw new ManagerError(413, "File too large");
    await this.fsop(gameId, ["write", path], data);
  }

  async deleteFile(gameId: string, path: string) {
    await this.fsop(gameId, ["delete", path]);
  }

  /** Stops sandboxes idle for longer than the limit. Returns the ids stopped. */
  async reap(): Promise<string[]> {
    const cutoff = this.now() - this.config.idleMinutes * 60_000;
    const idle = [...this.sessions.values()].filter((s) => s.lastActive < cutoff).map((s) => s.gameId);
    const stopped: string[] = [];
    for (const gameId of idle) {
      try {
        await this.stop(gameId);
        stopped.push(gameId);
      } catch (error) {
        console.error(`[reaper] failed to stop ${gameId}`, error);
      }
    }
    return stopped;
  }

  async stopAll() {
    for (const gameId of [...this.sessions.keys()]) await this.stop(gameId).catch(() => {});
  }
}

/**
 * Waits until the dev server answers. The manager is not on the sandbox
 * network, so it asks from inside the sandbox.
 */
async function defaultWaitReady(driver: Driver, gameId: string, base: string, timeoutMs = 60_000) {
  const probe = `fetch("http://127.0.0.1:5173${base}").then(r=>process.exit(r.status===200?0:1),()=>process.exit(1))`;
  const deadline = Date.now() + timeoutMs;
  let last = "not started";
  while (Date.now() < deadline) {
    try {
      const result = await driver.exec(gameId, ["node", "-e", probe], undefined, 5000);
      if (result.exitCode === 0) return;
      last = `exit ${result.exitCode}`;
    } catch (error) {
      last = (error as Error).message;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(last);
}
