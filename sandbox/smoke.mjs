#!/usr/bin/env node
// End-to-end check of the sandbox runtime against real Docker.
// Run after `npm run sandbox:build && npm run sandbox:up`:
//
//   npm run sandbox:smoke
//
// Starts two throwaway sandboxes, edits a file, checks the preview and HMR
// path, checks isolation from inside a sandbox, then stops and restores.
// Exits non-zero on the first failure. Cleans up after itself.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const MANAGER = process.env.SANDBOX_MANAGER_URL || "http://127.0.0.1:4100";
const PREVIEW = process.env.SANDBOX_PREVIEW_ORIGIN || "http://127.0.0.1:4101";
const TOKEN = process.env.SANDBOX_MANAGER_TOKEN;
const EXPECT_RUNTIME = process.env.SANDBOX_RUNTIME || "runc";
if (!TOKEN) {
  console.error("SANDBOX_MANAGER_TOKEN is not set (add it to .env.local).");
  process.exit(1);
}

const a = randomUUID();
const b = randomUUID();
let failures = 0;
const ok = (label) => console.log(`  ✓ ${label}`);
const fail = (label, detail = "") => {
  failures++;
  console.log(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
};
const check = (cond, label, detail) => (cond ? ok(label) : fail(label, detail));

async function api(method, path, body) {
  const res = await fetch(`${MANAGER}${path}`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/octet-stream" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return res;
}

/** Runs a probe inside the sandbox; returns what it printed. */
function inside(gameId, script) {
  try {
    return execFileSync("docker", ["exec", `gs-sbx-${gameId}`, "node", "-e", script], {
      encoding: "utf8",
      timeout: 20_000,
    }).trim();
  } catch (error) {
    return `error: ${error.stderr || error.message}`;
  }
}

const probe = (target) => `
  const net = require("node:net");
  const [host, port] = ${JSON.stringify(target)}.split(":");
  const s = net.connect({ host, port: Number(port), timeout: 4000 });
  s.on("connect", () => { console.log("CONNECTED"); s.destroy(); });
  s.on("timeout", () => { console.log("BLOCKED timeout"); s.destroy(); });
  s.on("error", (e) => console.log("BLOCKED " + e.code));
`;

try {
  console.log("Sandbox smoke test");
  check((await fetch(`${MANAGER}/healthz`)).ok, "manager is up");

  const startA = await api("POST", `/v1/sandboxes/${a}/start`, {});
  const statusA = await startA.json();
  check(startA.ok && statusA.running, "sandbox A starts", JSON.stringify(statusA));
  const startB = await api("POST", `/v1/sandboxes/${b}/start`, {});
  check(startB.ok, "sandbox B starts");

  const page = await fetch(`${PREVIEW}${statusA.previewPath}`);
  const html = await page.text();
  check(page.ok && html.includes(`${statusA.previewPath}src/main.ts`), "preview serves the game under its private path");
  check((await fetch(`${PREVIEW}/p/${a}-${"x".repeat(24)}/`)).status === 404, "a wrong preview secret gets 404");

  const write = await api("PUT", `/v1/sandboxes/${a}/files/src/smoke.ts`, "export const smoke = 1;\n");
  check(write.ok, "write a file");
  const read = await api("GET", `/v1/sandboxes/${a}/files/src/smoke.ts`);
  check((await read.text()) === "export const smoke = 1;\n", "read it back");
  const served = await fetch(`${PREVIEW}${statusA.previewPath}src/smoke.ts`);
  check(served.ok && (await served.text()).includes("smoke"), "the dev server serves the new file");

  const info = JSON.parse(execFileSync("docker", ["inspect", `gs-sbx-${a}`], { encoding: "utf8" }))[0];
  check(info.HostConfig.Runtime === EXPECT_RUNTIME, `runtime is ${EXPECT_RUNTIME}`, info.HostConfig.Runtime);
  check(info.HostConfig.ReadonlyRootfs && info.HostConfig.CapDrop?.includes("ALL"), "read-only root, all capabilities dropped");
  check(info.Config.User === "node", "runs as the unprivileged node user");

  console.log("Isolation (from inside sandbox A)");
  const targets = {
    "internet (registry.npmjs.org:443)": "registry.npmjs.org:443",
    "public IP (1.1.1.1:443)": "1.1.1.1:443",
    "Postgres by name (postgres:5432)": "postgres:5432",
    "host machine (host.docker.internal:5432)": "host.docker.internal:5432",
    "manager API (sandbox-manager:4100)": "sandbox-manager:4100",
    "manager API (gamesmith-sandbox-manager:4100)": "gamesmith-sandbox-manager:4100",
    [`sandbox B (gs-sbx-${b.slice(0, 8)}...:5173)`]: `gs-sbx-${b}:5173`,
  };
  for (const [label, target] of Object.entries(targets)) {
    const out = inside(a, probe(target));
    check(out.startsWith("BLOCKED"), `blocked: ${label}`, out);
  }

  console.log("Stop, snapshot and restore");
  check((await api("POST", `/v1/sandboxes/${a}/stop`, {})).ok, "stop A (snapshots first)");
  check((await fetch(`${PREVIEW}${statusA.previewPath}`)).status === 404, "the old preview link is dead");
  execFileSync("docker", ["volume", "rm", `gs-ws-${a}`]);
  ok("workspace volume removed (simulates a new host)");
  const again = await (await api("POST", `/v1/sandboxes/${a}/start`, {})).json();
  check(again.running && again.previewPath !== statusA.previewPath, "restarts with a new preview secret");
  const restored = await api("GET", `/v1/sandboxes/${a}/files/src/smoke.ts`);
  check((await restored.text()) === "export const smoke = 1;\n", "the edited file came back from the snapshot");
} catch (error) {
  fail("unexpected error", error.message);
} finally {
  for (const id of [a, b]) {
    await api("POST", `/v1/sandboxes/${id}/stop`, { snapshot: false }).catch(() => {});
    try {
      execFileSync("docker", ["volume", "rm", "-f", `gs-ws-${id}`], { stdio: "ignore" });
    } catch {}
  }
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
