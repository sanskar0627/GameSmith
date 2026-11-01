import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import type { Driver, ExecResult, StartSpec } from "../src/driver.js";

/**
 * Test double for DockerDriver that runs the real sandbox pieces as local
 * processes: the template's Vite dev server (with the same flags as the
 * container entrypoint) and fsop.mjs. Only Docker itself (isolation,
 * networks, gVisor) is missing; the smoke test covers that on a real host.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE = path.resolve(here, "../../template");
/** node_modules with the template's dependencies (installed by the test setup). */
export const TEMPLATE_MODULES = process.env.TEMPLATE_NODE_MODULES ?? path.join(TEMPLATE, "files/node_modules");

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

export class LocalDriver implements Driver {
  private readonly procs = new Map<string, { child: ChildProcess; port: number; base: string }>();

  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  workspace(gameId: string) {
    return path.join(this.root, gameId, "workspace");
  }

  upstream(gameId: string) {
    return { host: "127.0.0.1", port: this.procs.get(gameId)?.port ?? 1 };
  }

  async start(spec: StartSpec) {
    await this.stop(spec.gameId);
    const ws = this.workspace(spec.gameId);
    mkdirSync(ws, { recursive: true });
    if (spec.restore) {
      const chunks: Buffer[] = [];
      for await (const c of spec.restore) chunks.push(c as Buffer);
      const res = spawnSync("tar", ["-x", "-C", ws], { input: Buffer.concat(chunks) });
      if (res.status !== 0) throw new Error(`restore failed: ${res.stderr}`);
    }
    // Same steps as sandbox/template/entrypoint.sh.
    if (!existsSync(path.join(ws, "package.json"))) {
      for (const entry of readdirSync(path.join(TEMPLATE, "files"))) {
        if (entry === "node_modules" || entry === ".vite" || entry === "dist") continue;
        cpSync(path.join(TEMPLATE, "files", entry), path.join(ws, entry), { recursive: true });
      }
    }
    if (!existsSync(path.join(ws, "node_modules"))) symlinkSync(TEMPLATE_MODULES, path.join(ws, "node_modules"));
    const port = await freePort();
    const child = spawn(
      path.join(TEMPLATE_MODULES, ".bin/vite"),
      ["--host", "127.0.0.1", "--port", String(port), "--strictPort", "--base", spec.base],
      { cwd: ws, env: { ...process.env, GS_BASE: spec.base, GS_HMR_CLIENT_PORT: process.env.GS_HMR_CLIENT_PORT ?? "" }, stdio: "ignore" },
    );
    this.procs.set(spec.gameId, { child, port, base: spec.base });
  }

  async stop(gameId: string) {
    const proc = this.procs.get(gameId);
    if (!proc) return;
    this.procs.delete(gameId);
    proc.child.kill("SIGTERM");
    await new Promise((r) => proc.child.once("exit", r));
  }

  async running() {
    return [...this.procs.entries()].map(([gameId, p]) => ({ gameId, base: p.base }));
  }

  async isRunning(gameId: string) {
    return this.procs.has(gameId);
  }

  async hasWorkspace(gameId: string) {
    return existsSync(this.workspace(gameId));
  }

  async removeWorkspace(gameId: string) {
    rmSync(path.join(this.root, gameId), { recursive: true, force: true });
  }

  async exec(gameId: string, cmd: string[], stdin?: Buffer): Promise<ExecResult> {
    const [bin, script, ...args] = cmd;
    if (bin !== "node" || script !== "/opt/gs/fsop.mjs") throw new Error(`unexpected exec ${cmd.join(" ")}`);
    const res = spawnSync(process.execPath, [path.join(TEMPLATE, "fsop.mjs"), ...args], {
      input: stdin ?? Buffer.alloc(0),
      env: { ...process.env, GS_WORKSPACE: this.workspace(gameId), GS_MAX_FILE_BYTES: String(64 * 1024) },
    });
    return { exitCode: res.status ?? 1, stdout: res.stdout, stderr: res.stderr.toString() };
  }

  async exportWorkspace(gameId: string) {
    // Docker's getArchive puts entries under the directory's own name.
    const res = spawnSync("tar", ["-c", "-C", path.join(this.root, gameId), "workspace"], { maxBuffer: 1 << 28 });
    if (res.status !== 0) throw new Error(res.stderr.toString());
    return Readable.from([res.stdout]);
  }

  async stopAll() {
    for (const id of [...this.procs.keys()]) await this.stop(id);
  }
}
