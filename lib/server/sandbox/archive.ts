import "server-only";

import { crc32, deflateRawSync } from "node:zlib";

/**
 * Turns the sandbox manager's source archive (a tar, already sanitized by
 * the manager) into a zip for downloads. Everything happens in memory: a
 * game's source is capped at 100 MB by the manager, and usually a few
 * hundred kB.
 */

export type ArchiveEntry = { path: string; dir: boolean; data: Buffer; mtime: Date };

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveError";
  }
}

const BLOCK = 512;

function text(buf: Buffer, start: number, length: number): string {
  const slice = buf.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString("utf8");
}

function octal(buf: Buffer, start: number, length: number): number {
  // Base-256 sizes (first byte 0x80) only appear above 8 GB.
  if (buf[start]! & 0x80) throw new ArchiveError("Archive entry is too large");
  const raw = text(buf, start, length).trim();
  return raw ? parseInt(raw, 8) : 0;
}

/** PAX records: "<length> <key>=<value>\n". Only `path` matters here. */
function paxPath(data: Buffer): string | undefined {
  let offset = 0;
  let path: string | undefined;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = parseInt(data.subarray(offset, space).toString("utf8"), 10);
    if (!length) break;
    const record = data.subarray(space + 1, offset + length - 1).toString("utf8");
    const eq = record.indexOf("=");
    if (eq !== -1 && record.slice(0, eq) === "path") path = record.slice(eq + 1);
    offset += length;
  }
  return path;
}

/** A relative path with no `..`, absolute or empty parts, or null. */
export function safeEntryPath(raw: string): string | null {
  const name = raw.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!name || name.startsWith("/") || name.includes("\\") || name.includes("\0")) return null;
  const parts = name.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return null;
  return name;
}

/** Reads regular files and directories from a ustar/pax tar. Anything else is skipped. */
export function readTar(tar: Buffer): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  let offset = 0;
  let nextPath: string | undefined;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((b) => b === 0)) break;

    const size = octal(header, 124, 12);
    const type = header[156] === 0 ? "0" : String.fromCharCode(header[156]!);
    const dataStart = offset + BLOCK;
    if (dataStart + size > tar.length) throw new ArchiveError("Archive is truncated");
    const data = tar.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;

    if (type === "x") {
      nextPath = paxPath(data) ?? nextPath;
      continue;
    }
    if (type === "L") {
      nextPath = text(data, 0, data.length);
      continue;
    }
    if (type === "g") continue;

    const prefix = text(header, 257, 6).startsWith("ustar") ? text(header, 345, 155) : "";
    const name = text(header, 0, 100);
    const raw = nextPath ?? (prefix ? `${prefix}/${name}` : name);
    nextPath = undefined;

    if (type !== "0" && type !== "5") continue;
    const path = safeEntryPath(raw);
    if (!path) continue;
    entries.push({
      path,
      dir: type === "5",
      data: type === "5" ? Buffer.alloc(0) : Buffer.from(data),
      mtime: new Date(octal(header, 136, 12) * 1000),
    });
  }
  return entries;
}

function dosDateTime(date: Date): { time: number; date: number } {
  // Zip timestamps are local-time and start in 1980.
  const d = Number.isNaN(date.getTime()) || date.getFullYear() < 1980 ? new Date(1980, 0, 1) : date;
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const MAX_ZIP_ENTRIES = 0xffff;
const MAX_ZIP_BYTES = 0xffffffff;

/**
 * A plain zip (no zip64). Files are deflated when that makes them smaller.
 * `root` puts every entry under one folder, like a repository download.
 */
export function writeZip(entries: ArchiveEntry[], root = ""): Buffer {
  if (entries.length + 1 > MAX_ZIP_ENTRIES) throw new ArchiveError("Too many files to zip");
  const base = root ? `${root.replace(/\/+$/, "")}/` : "";
  const all = entries.map((e) => ({ ...e, name: `${base}${e.path}${e.dir ? "/" : ""}` }));
  if (base) all.unshift({ path: "", dir: true, data: Buffer.alloc(0), mtime: new Date(), name: base });

  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of all) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = entry.dir ? Buffer.alloc(0) : entry.data;
    const deflated = raw.length > 0 ? deflateRawSync(raw) : raw;
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const crc = crc32(raw) >>> 0;
    const { time, date } = dosDateTime(entry.mtime);
    if (offset + body.length > MAX_ZIP_BYTES) throw new ArchiveError("Archive is too large to zip");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, spec 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    // extra, comment, disk start, internal attributes stay 0
    const mode = entry.dir ? 0o40755 : 0o100644;
    central.writeUInt32LE(((mode << 16) | (entry.dir ? 0x10 : 0)) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(all.length, 8);
  end.writeUInt16LE(all.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** Folder and file name for a download, from the game's title. */
export function archiveName(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "game";
}
