import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { TEMPLATE } from "./local-driver.js";

const FSOP = path.join(TEMPLATE, "fsop.mjs");
let ws: string;

function run(args: string[], input?: string | Buffer) {
  const res = spawnSync(process.execPath, [FSOP, ...args], {
    input: input ?? "",
    env: { ...process.env, GS_WORKSPACE: ws, GS_MAX_FILE_BYTES: "1000" },
  });
  return { code: res.status, out: res.stdout.toString(), err: res.stderr.toString() };
}

beforeEach(() => {
  ws = mkdtempSync(path.join(tmpdir(), "fsop-"));
});

describe("fsop (runs inside the sandbox)", () => {
  it("writes, reads, lists and deletes", () => {
    expect(run(["write", "src/game/level.ts"], "export const n = 1;\n").code).toBe(0);
    expect(run(["read", "src/game/level.ts"]).out).toBe("export const n = 1;\n");
    const list = JSON.parse(run(["list"]).out) as { path: string; size: number }[];
    expect(list.map((f) => f.path)).toEqual(["src/game/level.ts"]);
    expect(run(["delete", "src/game/level.ts"]).code).toBe(0);
    expect(run(["read", "src/game/level.ts"]).code).toBe(3);
  });

  it("hides dependencies, caches and build output from the listing", () => {
    for (const dir of ["node_modules", ".vite", "dist", "src"]) {
      mkdirSync(path.join(ws, dir), { recursive: true });
      writeFileSync(path.join(ws, dir, "x.js"), "1");
    }
    expect((JSON.parse(run(["list"]).out) as { path: string }[]).map((f) => f.path)).toEqual(["src/x.js"]);
    expect(run(["write", "node_modules/evil.js"], "x").code).toBe(2);
  });

  it("rejects traversal, absolute and odd paths", () => {
    for (const bad of ["../escape.txt", "/etc/passwd", "src/../../x", "a\\b", "", "a/".repeat(30) + "x"]) {
      expect(run(["write", bad], "x").code, bad).toBe(2);
    }
  });

  it("refuses to follow symlinks, so it can't touch anything outside the workspace", () => {
    const outside = mkdtempSync(path.join(tmpdir(), "outside-"));
    writeFileSync(path.join(outside, "secret.txt"), "secret");
    symlinkSync(path.join(outside, "secret.txt"), path.join(ws, "link.txt"));
    symlinkSync(outside, path.join(ws, "linkdir"));
    expect(run(["read", "link.txt"]).code).toBe(2);
    expect(run(["read", "linkdir/secret.txt"]).code).toBe(2);
    expect(run(["write", "linkdir/new.txt"], "x").code).toBe(2);
    expect(run(["write", "link.txt"], "x").code).toBe(2);
    expect(readFileSync(path.join(outside, "secret.txt"), "utf8")).toBe("secret");
  });

  it("enforces the size limit on both reads and writes", () => {
    expect(run(["write", "big.txt"], "x".repeat(1001)).code).toBe(4);
    writeFileSync(path.join(ws, "big2.txt"), "x".repeat(2000));
    expect(run(["read", "big2.txt"]).code).toBe(4);
  });
});
