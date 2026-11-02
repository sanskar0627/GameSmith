import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

import tar from "tar-stream";

/**
 * Workspace snapshots: gzip tars of a game's source, without dependencies,
 * caches or build output. Stored on local disk for now (Phase 12 adds an
 * R2 copy). Tars are rebuilt entry by entry, so a snapshot only ever holds
 * plain files and directories with safe relative paths and modes, whatever
 * the game wrote: no symlinks, devices, absolute paths or `..`.
 */

const SKIP = new Set(["node_modules", ".vite", "dist", ".git"]);
const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 10_000;
const SANDBOX_UID = 1000;

export class SnapshotError extends Error {}

export function isSnapshotName(name: unknown): name is string {
  return typeof name === "string" && NAME.test(name);
}

/** Safe relative path for an entry, or null to drop it. */
export function cleanEntryPath(raw: string, prefix: string): string | null {
  let name = raw.replace(/^\.\//, "");
  if (prefix) {
    if (name === prefix || name === `${prefix}/`) return null;
    if (!name.startsWith(`${prefix}/`)) return null;
    name = name.slice(prefix.length + 1);
  }
  name = name.replace(/\/+$/, "");
  if (!name || name.startsWith("/") || name.includes("\\") || name.includes("\0")) return null;
  const parts = name.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return null;
  if (SKIP.has(parts[0]!)) return null;
  return parts.join("/");
}

/**
 * Re-packs a tar stream keeping only regular files and directories.
 * `prefix` strips the leading folder Docker adds (`workspace`).
 */
export function sanitizeTar(input: Readable, prefix = ""): Readable {
  const extract = tar.extract();
  const pack = tar.pack();
  let total = 0;
  let entries = 0;
  extract.on("entry", (header, stream, next) => {
    const name = cleanEntryPath(header.name, prefix);
    const keep = name !== null && (header.type === "file" || header.type === "directory");
    if (keep) {
      entries++;
      total += header.size ?? 0;
      if (entries > MAX_ENTRIES || total > MAX_SNAPSHOT_BYTES) {
        stream.resume();
        extract.destroy(new SnapshotError("Workspace is too large to snapshot"));
        return;
      }
    }
    if (!keep) {
      stream.on("end", next);
      stream.resume();
      return;
    }
    const isDir = header.type === "directory";
    const out = pack.entry(
      {
        name: isDir ? `${name}/` : name!,
        type: header.type,
        size: isDir ? 0 : header.size,
        mode: isDir ? 0o755 : (header.mode ?? 0) & 0o111 ? 0o755 : 0o644,
        mtime: header.mtime,
        uid: SANDBOX_UID,
        gid: SANDBOX_UID,
      },
      (error) => {
        if (error) extract.destroy(error);
        else next();
      },
    );
    stream.pipe(out);
  });
  extract.on("finish", () => pack.finalize());
  extract.on("error", (error) => pack.destroy(error));
  input.on("error", (error) => extract.destroy(error));
  input.pipe(extract as unknown as NodeJS.WritableStream);
  // tar-stream uses streamx streams; hand back a regular Node stream.
  return Readable.from(pack, { objectMode: false });
}

export class SnapshotStore {
  constructor(private readonly dir: string) {}

  private file(gameId: string, name: string) {
    if (!isSnapshotName(name)) throw new SnapshotError("Invalid snapshot name");
    return path.join(this.dir, gameId, `${name}.tar.gz`);
  }

  async exists(gameId: string, name = "latest"): Promise<boolean> {
    try {
      await stat(this.file(gameId, name));
      return true;
    } catch {
      return false;
    }
  }

  /** Writes a sanitized, gzipped snapshot atomically (temp file, then rename). */
  async save(gameId: string, name: string, dockerTar: Readable): Promise<{ bytes: number }> {
    const target = this.file(gameId, name);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      await pipeline(sanitizeTar(dockerTar, "workspace"), createGzip(), createWriteStream(temp));
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    return { bytes: (await stat(target)).size };
  }

  /** Uncompressed tar, paths relative to /workspace, ready for Docker's putArchive. */
  open(gameId: string, name = "latest"): Readable {
    const out = new PassThrough();
    pipeline(createReadStream(this.file(gameId, name)), createGunzip(), out).catch((error) => out.destroy(error));
    return out;
  }

  /** Gzipped bytes as stored (for downloads). */
  openCompressed(gameId: string, name = "latest"): Readable {
    return createReadStream(this.file(gameId, name));
  }

  async copy(fromGameId: string, toGameId: string, name = "latest") {
    const target = this.file(toGameId, name);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(this.file(fromGameId, name), target);
  }
}
