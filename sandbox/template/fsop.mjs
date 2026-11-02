#!/usr/bin/env node
// File operations for the GameSmith sandbox manager. Runs INSIDE the sandbox
// (as the unprivileged `node` user, under gVisor in production), so it can
// only ever touch this game's own /workspace, whatever paths or symlinks the
// game contains. The manager talks to it through `docker exec`.
//
//   fsop.mjs list               -> JSON [{ path, size, mtime }]
//   fsop.mjs read <path>        -> file bytes on stdout
//   fsop.mjs write <path>       <- file bytes on stdin
//   fsop.mjs delete <path>
//
// Exit codes: 0 ok, 2 bad request, 3 not found, 4 too large.
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rm } from "node:fs/promises";
import path from "node:path";

const ROOT = process.env.GS_WORKSPACE ?? "/workspace";
const MAX_FILE = Number(process.env.GS_MAX_FILE_BYTES ?? 2 * 1024 * 1024);
const MAX_FILES = 5000;
// Not part of the game's source: dependencies, caches and build output.
const SKIP = new Set(["node_modules", ".vite", "dist", ".git"]);

class Fail extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** A clean relative path inside the workspace, or a Fail(2). */
export function clean(input) {
  if (typeof input !== "string" || input.length === 0 || input.length > 512) throw new Fail(2, "bad path");
  if (input.startsWith("/") || input.includes("\0") || input.includes("\\")) throw new Fail(2, "bad path");
  const parts = input.split("/").filter((p) => p !== "" && p !== ".");
  if (parts.length === 0 || parts.length > 24) throw new Fail(2, "bad path");
  for (const part of parts) {
    if (part === ".." || part.length > 255) throw new Fail(2, "bad path");
  }
  if (SKIP.has(parts[0])) throw new Fail(2, "protected path");
  return parts.join("/");
}

/** Refuses any symlink on the way to `rel` (the game may have created some). */
async function noSymlinks(rel, { last = true } = {}) {
  const parts = rel.split("/");
  let current = ROOT;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    if (!last && i === parts.length - 1) break;
    try {
      const st = await lstat(current);
      if (st.isSymbolicLink()) throw new Fail(2, "symlinks are not allowed");
    } catch (error) {
      if (error instanceof Fail) throw error;
      if (error.code === "ENOENT") return;
      throw error;
    }
  }
}

async function list() {
  const out = [];
  async function walk(dir, prefix) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (prefix === "" && SKIP.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel);
      else if (entry.isFile()) {
        const st = await lstat(path.join(dir, entry.name));
        out.push({ path: rel, size: st.size, mtime: Math.round(st.mtimeMs) });
        if (out.length >= MAX_FILES) return;
      }
    }
  }
  await walk(ROOT, "");
  out.sort((a, b) => a.path.localeCompare(b.path));
  process.stdout.write(JSON.stringify(out));
}

async function read(rel) {
  await noSymlinks(rel);
  let handle;
  try {
    handle = await open(path.join(ROOT, rel), constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error.code === "ENOENT") throw new Fail(3, "not found");
    if (error.code === "ELOOP") throw new Fail(2, "symlinks are not allowed");
    throw error;
  }
  try {
    const st = await handle.stat();
    if (!st.isFile()) throw new Fail(2, "not a file");
    if (st.size > MAX_FILE) throw new Fail(4, "file too large");
    process.stdout.write(await handle.readFile());
  } finally {
    await handle.close();
  }
}

async function readStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_FILE) throw new Fail(4, "file too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function write(rel) {
  const data = await readStdin();
  await noSymlinks(rel);
  const parent = path.dirname(rel);
  if (parent !== ".") await mkdir(path.join(ROOT, parent), { recursive: true });
  await noSymlinks(rel);
  const handle = await open(
    path.join(ROOT, rel),
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
    0o644,
  );
  try {
    await handle.writeFile(data);
  } finally {
    await handle.close();
  }
}

async function remove(rel) {
  await noSymlinks(rel, { last: false });
  try {
    const st = await lstat(path.join(ROOT, rel));
    if (st.isDirectory()) throw new Fail(2, "is a directory");
  } catch (error) {
    if (error instanceof Fail) throw error;
    if (error.code === "ENOENT") throw new Fail(3, "not found");
    throw error;
  }
  await rm(path.join(ROOT, rel));
}

async function main() {
  const [op, arg] = process.argv.slice(2);
  try {
    if (op === "list") return await list();
    if (op === "read") return await read(clean(arg));
    if (op === "write") return await write(clean(arg));
    if (op === "delete") return await remove(clean(arg));
    throw new Fail(2, "unknown op");
  } catch (error) {
    if (error instanceof Fail) {
      process.stderr.write(error.message);
      process.exitCode = error.code;
      return;
    }
    process.stderr.write(String(error?.message ?? error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) await main();
