import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { createApiServer } from "../src/api.js";
import type { Config } from "../src/config.js";
import { SandboxManager } from "../src/manager.js";
import { createPreviewServer } from "../src/proxy.js";
import { RemotePreviewAuth } from "../src/remote-auth.js";
import { LocalDriver } from "./local-driver.js";

const TOKEN = "t".repeat(40);
const GAME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

let clock = Date.now();
const config: Config = {
  token: TOKEN,
  apiPort: 0,
  previewPublicPort: 0,
  image: "unused",
  runtime: "runc",
  memoryMb: 512,
  cpus: 1,
  pids: 64,
  idleMinutes: 15,
  maxSandboxes: 2,
  proxyContainer: "unused",
  snapshotsDir: mkdtempSync(path.join(tmpdir(), "snapshots-")),
  maxFileBytes: 64 * 1024,
  appOrigin: "http://app.test",
};
const driver = new LocalDriver(mkdtempSync(path.join(tmpdir(), "sandboxes-")));

async function viteReady(gameId: string, base: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const ok = await fetch(`http://127.0.0.1:${driver.upstream(gameId).port}${base}`).then(
      (r) => r.status === 200,
      () => false,
    );
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("vite did not start");
}

const manager = new SandboxManager(config, driver, () => clock, viteReady);
const api = createApiServer(manager, { token: TOKEN, maxFileBytes: config.maxFileBytes });
const preview = createPreviewServer(manager.previewAuth(), (id) => driver.upstream(id), { frameAncestors: config.appOrigin });
let apiUrl = "";
let previewUrl = "";

beforeAll(async () => {
  await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
  await new Promise<void>((r) => preview.listen(0, "127.0.0.1", r));
  apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  previewUrl = `http://127.0.0.1:${(preview.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await driver.stopAll();
  api.close();
  preview.close();
});

afterEach(async () => {
  await manager.stopAll();
  await driver.removeWorkspace(GAME);
  await driver.removeWorkspace(OTHER);
});

function call(method: string, p: string, body?: unknown, token = TOKEN) {
  return fetch(`${apiUrl}${p}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("manager API", () => {
  it("requires the token and valid ids", async () => {
    expect((await call("GET", `/v1/sandboxes/${GAME}`, undefined, "wrong")).status).toBe(401);
    expect((await call("GET", `/v1/sandboxes/not-a-game`)).status).toBe(400);
    expect((await fetch(`${apiUrl}/healthz`)).status).toBe(200);
  });

  it("starts a sandbox and serves its preview through the proxy", async () => {
    const res = await call("POST", `/v1/sandboxes/${GAME}/start`, {});
    expect(res.status).toBe(200);
    const status = (await res.json()) as { running: boolean; previewPath: string };
    expect(status.running).toBe(true);
    expect(status.previewPath).toMatch(new RegExp(`^/p/${GAME}-[A-Za-z0-9_-]{24}/$`));

    const page = await fetch(`${previewUrl}${status.previewPath}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toBe("frame-ancestors http://app.test");
    const html = await page.text();
    // Vite rewrote asset URLs under the private base.
    expect(html).toContain(`${status.previewPath}src/main.ts`);
    expect((await fetch(`${previewUrl}${status.previewPath}src/main.ts`)).status).toBe(200);

    // Wrong or missing secret: plain 404, nothing proxied.
    const wrong = status.previewPath.replace(/-[A-Za-z0-9_-]{24}\//, `-${"x".repeat(24)}/`);
    expect((await fetch(`${previewUrl}${wrong}`)).status).toBe(404);
    expect((await fetch(`${previewUrl}/src/main.ts`)).status).toBe(404);
  });

  it("edits files and pushes the change over HMR", async () => {
    const { previewPath } = (await (await call("POST", `/v1/sandboxes/${GAME}/start`, {})).json()) as { previewPath: string };
    const files = (await (await call("GET", `/v1/sandboxes/${GAME}/files`)).json()) as { files: { path: string }[] };
    expect(files.files.map((f) => f.path)).toEqual(
      expect.arrayContaining(["index.html", "src/main.ts", "src/kit/palette.ts", "vite.config.ts", "package.json"]),
    );
    expect(files.files.some((f) => f.path.startsWith("node_modules"))).toBe(false);

    // Open the HMR socket through the proxy, as the browser would.
    const ws = new WebSocket(`${previewUrl.replace("http", "ws")}${previewPath}`, "vite-hmr");
    const messages: string[] = [];
    ws.on("message", (m) => messages.push(m.toString()));
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    // Load the module so Vite tracks it for updates.
    await fetch(`${previewUrl}${previewPath}src/kit/palette.ts`);

    const write = await call("PUT", `/v1/sandboxes/${GAME}/files/src/kit/palette.ts`, "export const edited = 42;\n");
    expect(write.status).toBe(200);
    const read = await call("GET", `/v1/sandboxes/${GAME}/files/src/kit/palette.ts`);
    expect(await read.text()).toBe("export const edited = 42;\n");

    const deadline = Date.now() + 15_000;
    while (!messages.some((m) => m.includes('"update"') || m.includes('"full-reload"')) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    ws.close();
    expect(messages.some((m) => m.includes('"update"') || m.includes('"full-reload"'))).toBe(true);
  });

  it("rejects bad paths and oversized files", async () => {
    await call("POST", `/v1/sandboxes/${GAME}/start`, {});
    expect((await call("PUT", `/v1/sandboxes/${GAME}/files/..%2F..%2Fescape.txt`, "x")).status).toBe(400);
    expect((await call("PUT", `/v1/sandboxes/${GAME}/files/node_modules/x.js`, "x")).status).toBe(400);
    expect((await call("PUT", `/v1/sandboxes/${GAME}/files/big.txt`, "x".repeat(70 * 1024))).status).toBe(413);
    expect((await call("GET", `/v1/sandboxes/${GAME}/files/missing.ts`)).status).toBe(404);
  });

  it("snapshots on stop and restores into a fresh workspace with a new preview secret", async () => {
    const first = (await (await call("POST", `/v1/sandboxes/${GAME}/start`, {})).json()) as { previewPath: string };
    await call("PUT", `/v1/sandboxes/${GAME}/files/src/notes.txt`, "keep me");
    expect((await call("POST", `/v1/sandboxes/${GAME}/stop`, {})).status).toBe(200);
    expect(await manager.snapshots.exists(GAME)).toBe(true);
    expect((await fetch(`${previewUrl}${first.previewPath}`)).status).toBe(404);

    // Lose the workspace (e.g. a new host): the start restores the snapshot.
    await driver.removeWorkspace(GAME);
    const second = (await (await call("POST", `/v1/sandboxes/${GAME}/start`, {})).json()) as { previewPath: string };
    expect(second.previewPath).not.toBe(first.previewPath);
    expect(await (await call("GET", `/v1/sandboxes/${GAME}/files/src/notes.txt`)).text()).toBe("keep me");

    // The download archive works while running.
    const archive = await call("GET", `/v1/sandboxes/${GAME}/archive`);
    expect(archive.headers.get("content-type")).toBe("application/gzip");
    expect((await archive.arrayBuffer()).byteLength).toBeGreaterThan(100);
  });

  it("stops idle sandboxes and caps how many run at once", async () => {
    await call("POST", `/v1/sandboxes/${GAME}/start`, {});
    await call("POST", `/v1/sandboxes/${OTHER}/start`, {});
    const third = await call("POST", `/v1/sandboxes/33333333-3333-4333-8333-333333333333/start`, {});
    expect(third.status).toBe(503);

    clock += 10 * 60_000;
    manager.touch(OTHER);
    clock += 6 * 60_000;
    expect(await manager.reap()).toEqual([GAME]);
    expect(manager.status(GAME).running).toBe(false);
    expect(manager.status(OTHER).running).toBe(true);
    expect(await manager.snapshots.exists(GAME)).toBe(true);
  });

  it("file operations need a running sandbox", async () => {
    expect((await call("GET", `/v1/sandboxes/${GAME}/files`)).status).toBe(409);
  });

  it("recovers running sandboxes after a manager restart", async () => {
    const { previewPath } = (await (await call("POST", `/v1/sandboxes/${GAME}/start`, {})).json()) as { previewPath: string };
    const restarted = new SandboxManager(config, driver, () => clock, viteReady);
    await restarted.recover();
    expect(restarted.status(GAME)).toMatchObject({ running: true, previewPath });
  });
});

describe("preview proxy in its own container", () => {
  it("checks links with the manager API and caches the answer", async () => {
    const { previewPath } = (await (await call("POST", `/v1/sandboxes/${GAME}/start`, {})).json()) as { previewPath: string };
    let calls = 0;
    const counting: typeof fetch = (input, init) => {
      calls++;
      return fetch(input, init);
    };
    const remote = createPreviewServer(new RemotePreviewAuth(apiUrl, TOKEN, counting), (id) => driver.upstream(id));
    await new Promise<void>((r) => remote.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(remote.address() as AddressInfo).port}`;
    expect((await fetch(`${url}${previewPath}`)).status).toBe(200);
    expect((await fetch(`${url}${previewPath}src/main.ts`)).status).toBe(200);
    expect(calls).toBe(1);
    expect((await fetch(`${url}/p/${GAME}-${"z".repeat(24)}/`)).status).toBe(404);
    // A wrong token never validates anything.
    const bad = createPreviewServer(new RemotePreviewAuth(apiUrl, "wrong".repeat(8)), (id) => driver.upstream(id));
    await new Promise<void>((r) => bad.listen(0, "127.0.0.1", r));
    expect((await fetch(`http://127.0.0.1:${(bad.address() as AddressInfo).port}${previewPath}`)).status).toBe(404);
    remote.close();
    bad.close();
  });
});

describe("preview server", () => {
  it("returns 404 for upgrades without a valid link", async () => {
    const ws = new WebSocket(`${previewUrl.replace("http", "ws")}/p/${GAME}-${"y".repeat(24)}/`);
    const result = await new Promise<string>((resolve) => {
      ws.once("open", () => resolve("open"));
      ws.once("unexpected-response", (_req, res: http.IncomingMessage) => resolve(String(res.statusCode)));
      ws.once("error", () => resolve("error"));
    });
    expect(result === "404" || result === "error").toBe(true);
  });
});
