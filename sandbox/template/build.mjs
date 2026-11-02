#!/usr/bin/env node
// Production build of a game, for publishing. Runs INSIDE the sandbox (as
// the unprivileged `node` user, under gVisor in production) through
// `docker exec`, so the game's own build config can only affect itself.
//
//   build.mjs  -> JSON { files: [{ path, data (base64) }] } on stdout
//
// The output uses relative URLs (--base ./) so it can be served from any
// path. Exit codes: 0 ok, 5 build failed (log on stderr), 4 too large.
import { spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const MAX_TOTAL = Number(process.env.GS_MAX_BUILD_BYTES ?? 40 * 1024 * 1024);
const MAX_FILES = 2000;
const VITE = "/opt/template/node_modules/.bin/vite";

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: "/workspace", env: { ...process.env, NODE_ENV: "production" } });
    let log = "";
    const keep = (chunk) => {
      log = (log + chunk.toString()).slice(-8000);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("close", (code) => resolve({ code: code ?? 1, log }));
    child.on("error", (error) => resolve({ code: 1, log: String(error) }));
  });
}

async function collect(root) {
  const out = [];
  let total = 0;
  async function walk(dir, prefix) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      const st = await lstat(full);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) await walk(full, rel);
      else if (st.isFile()) {
        total += st.size;
        if (total > MAX_TOTAL || out.length >= MAX_FILES) {
          const error = new Error("build too large");
          error.code = 4;
          throw error;
        }
        out.push({ path: rel, data: (await readFile(full)).toString("base64") });
      }
    }
  }
  await walk(root, "");
  return out;
}

async function main() {
  // /tmp is a small tmpfs; the workspace volume has room for the output.
  const parent = process.env.GS_BUILD_DIR ?? "/workspace/.vite";
  const outDir = await mkdir(parent, { recursive: true })
    .then(() => mkdtemp(path.join(parent, "gs-build-")))
    .catch(() => mkdtemp(path.join(tmpdir(), "gs-build-")));
  try {
    const result = await run(VITE, ["build", "--configLoader", "runner", "--base", "./", "--outDir", outDir, "--emptyOutDir", "--logLevel", "warn"]);
    if (result.code !== 0) {
      process.stderr.write(result.log || "vite build failed");
      process.exitCode = 5;
      return;
    }
    const files = await collect(outDir);
    if (!files.some((f) => f.path === "index.html")) {
      process.stderr.write("The build has no index.html");
      process.exitCode = 5;
      return;
    }
    process.stdout.write(JSON.stringify({ files }));
  } catch (error) {
    process.stderr.write(String(error?.message ?? error));
    process.exitCode = error?.code === 4 ? 4 : 1;
  } finally {
    await rm(outDir, { recursive: true, force: true }).catch(() => {});
  }
}

await main();
