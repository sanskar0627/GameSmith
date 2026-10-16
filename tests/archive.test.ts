import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { archiveName, readTar, safeEntryPath, writeZip } from "@/lib/server/sandbox/archive";

import { makeTar, paxRecord, readZip } from "./support/archives";

describe("readTar", () => {
  it("reads files and folders, including ustar prefixes and pax paths", () => {
    const long = `src/${"deep/".repeat(30)}file.ts`;
    const tar = makeTar([
      { name: "src/", type: "5" },
      { name: "src/main.ts", data: "console.log(1)\n" },
      { name: "main.ts", prefix: "src/levels", data: "export {}" },
      { name: "PaxHeader", type: "x", data: paxRecord("path", long) },
      { name: "truncated-name", data: "deep" },
      { name: "index.html", data: Buffer.alloc(1300, 65) },
    ]);
    const entries = readTar(tar);
    expect(entries.map((e) => [e.path, e.dir])).toEqual([
      ["src", true],
      ["src/main.ts", false],
      ["src/levels/main.ts", false],
      [long, false],
      ["index.html", false],
    ]);
    expect(entries[1]!.data.toString()).toBe("console.log(1)\n");
    expect(entries[4]!.data.length).toBe(1300);
    expect(entries[1]!.mtime.getTime()).toBe(1_700_000_000_000);
  });

  it("skips links and unsafe paths", () => {
    const tar = makeTar([
      { name: "link", type: "2" },
      { name: "../escape.ts", data: "x" },
      { name: "/abs.ts", data: "x" },
      { name: "ok.ts", data: "x" },
    ]);
    expect(readTar(tar).map((e) => e.path)).toEqual(["ok.ts"]);
  });

  it("rejects a truncated archive", () => {
    const tar = makeTar([{ name: "a.ts", data: "x".repeat(2000) }]);
    expect(() => readTar(tar.subarray(0, 900))).toThrow("truncated");
  });
});

describe("safeEntryPath", () => {
  it("keeps clean relative paths only", () => {
    expect(safeEntryPath("./src/a.ts")).toBe("src/a.ts");
    expect(safeEntryPath("src/")).toBe("src");
    expect(safeEntryPath("a/../b")).toBeNull();
    expect(safeEntryPath("a//b")).toBeNull();
    expect(safeEntryPath("")).toBeNull();
  });
});

describe("writeZip", () => {
  const entries = [
    { path: "src", dir: true, data: Buffer.alloc(0), mtime: new Date(2026, 9, 16, 12, 30) },
    { path: "src/main.ts", dir: false, data: Buffer.from("const a = 1;\n".repeat(200)), mtime: new Date(2026, 9, 16) },
    { path: "notes/ünïcode.md", dir: false, data: Buffer.from("hi"), mtime: new Date(2026, 9, 16) },
    { path: "empty.txt", dir: false, data: Buffer.alloc(0), mtime: new Date(1970, 0, 1) },
  ];

  it("round-trips the same tree under one root folder", () => {
    const zip = writeZip(entries, "floating-islands");
    const files = readZip(zip);
    expect(files.map((f) => f.name)).toEqual([
      "floating-islands/",
      "floating-islands/src/",
      "floating-islands/src/main.ts",
      "floating-islands/notes/ünïcode.md",
      "floating-islands/empty.txt",
    ]);
    expect(files[2]!.data.toString()).toBe("const a = 1;\n".repeat(200));
    expect(files[3]!.data.toString()).toBe("hi");
    // Repetitive source is deflated.
    expect(zip.length).toBeLessThan(2600);
  });

  it("opens with the system unzip tool when one is installed", () => {
    let hasUnzip = true;
    try {
      execFileSync("unzip", ["-v"], { stdio: "ignore" });
    } catch {
      hasUnzip = false;
    }
    if (!hasUnzip) return;
    const dir = mkdtempSync(path.join(tmpdir(), "gs-zip-"));
    try {
      writeFileSync(path.join(dir, "game.zip"), writeZip(entries, "game"));
      execFileSync("unzip", ["-tq", path.join(dir, "game.zip")]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("archiveName", () => {
  it("makes a safe slug from the title", () => {
    expect(archiveName("Floating Islands")).toBe("floating-islands");
    expect(archiveName("  Café: Night/Day!! ")).toBe("cafe-night-day");
    expect(archiveName("🙂")).toBe("game");
    expect(archiveName("a".repeat(80)).length).toBe(60);
  });
});
