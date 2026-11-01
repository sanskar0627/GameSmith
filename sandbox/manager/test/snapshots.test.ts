import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import tar from "tar-stream";
import { describe, expect, it } from "vitest";

import { cleanEntryPath, isSnapshotName, sanitizeTar, SnapshotStore } from "../src/snapshots.js";

type Entry = { name: string; type?: "file" | "directory" | "symlink" | "character-device"; body?: string; mode?: number; linkname?: string };

async function makeTar(entries: Entry[]): Promise<Readable> {
  const pack = tar.pack();
  for (const e of entries) {
    await new Promise<void>((resolve, reject) => {
      pack.entry(
        { name: e.name, type: e.type ?? "file", mode: e.mode ?? 0o644, linkname: e.linkname, uid: 0, gid: 0 },
        e.type === "file" || e.type === undefined ? (e.body ?? "") : "",
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }
  pack.finalize();
  return Readable.from(pack, { objectMode: false });
}

async function readTar(stream: Readable) {
  const extract = tar.extract();
  const out: { name: string; type: string; body: string; mode: number; uid: number }[] = [];
  extract.on("entry", (header, s, next) => {
    const chunks: Buffer[] = [];
    s.on("data", (c: unknown) => void chunks.push(c as Buffer));
    s.on("end", () => {
      out.push({ name: header.name, type: header.type!, body: Buffer.concat(chunks).toString(), mode: header.mode!, uid: header.uid! });
      next();
    });
  });
  const done = new Promise<void>((r) => extract.on("finish", () => r()));
  stream.pipe(extract as unknown as NodeJS.WritableStream);
  await done;
  return out;
}

describe("snapshot sanitizing", () => {
  it("keeps only safe files and directories, owned by the sandbox user", async () => {
    const input = await makeTar([
      { name: "workspace/", type: "directory" },
      { name: "workspace/src/", type: "directory" },
      { name: "workspace/src/main.ts", body: "game" },
      { name: "workspace/run.sh", body: "#!/bin/sh", mode: 0o4777 },
      { name: "workspace/node_modules/x.js", body: "dep" },
      { name: "workspace/.vite/deps.js", body: "cache" },
      { name: "workspace/../../etc/cron.d/evil", body: "pwn" },
      { name: "/etc/passwd", body: "pwn" },
      { name: "workspace/link", type: "symlink", linkname: "/etc/shadow" },
      { name: "workspace/dev", type: "character-device" },
      { name: "elsewhere/file", body: "not under workspace" },
    ]);
    const entries = await readTar(sanitizeTar(input, "workspace"));
    expect(entries.map((e) => e.name)).toEqual(["src/", "src/main.ts", "run.sh"]);
    expect(entries.find((e) => e.name === "run.sh")).toMatchObject({ mode: 0o755, uid: 1000 });
    expect(entries.find((e) => e.name === "src/main.ts")).toMatchObject({ mode: 0o644, body: "game" });
  });

  it("validates entry paths and snapshot names", () => {
    expect(cleanEntryPath("workspace/a/b.ts", "workspace")).toBe("a/b.ts");
    expect(cleanEntryPath("workspace/a/../b.ts", "workspace")).toBeNull();
    expect(cleanEntryPath("workspace/dist/x", "workspace")).toBeNull();
    expect(isSnapshotName("latest")).toBe(true);
    expect(isSnapshotName("v12")).toBe(true);
    expect(isSnapshotName("../x")).toBe(false);
    expect(isSnapshotName("Latest")).toBe(false);
  });

  it("round-trips through the store", async () => {
    const store = new SnapshotStore(mkdtempSync(path.join(tmpdir(), "snaps-")));
    const id = "00000000-0000-4000-8000-000000000001";
    await store.save(id, "latest", await makeTar([{ name: "workspace/index.html", body: "<h1>hi</h1>" }]));
    expect(await store.exists(id)).toBe(true);
    expect(await readTar(store.open(id))).toMatchObject([{ name: "index.html", body: "<h1>hi</h1>" }]);
    const copy = "00000000-0000-4000-8000-000000000002";
    await store.copy(id, copy);
    expect(await store.exists(copy)).toBe(true);
    expect(() => store.open(id, "../../etc")).toThrow();
  });
});
