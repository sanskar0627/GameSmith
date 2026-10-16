import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { SandboxClient } from "@/lib/server/sandbox/client";

/** Sandbox manager stand-in: files in memory, running state, snapshots. */
export function fakeSandbox(seed: Record<string, string> = { "package.json": "{}", "src/main.ts": "start()" }) {
  const files = new Map(Object.entries(seed));
  const snapshots: string[] = [];
  let running = false;
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);
    const m = /^\/v1\/sandboxes\/([^/]+)(\/[a-z]+)?(?:\/(.*))?$/.exec(url.pathname);
    const action = m?.[2] ?? "";
    const path = m?.[3] ? decodeURIComponent(m[3]) : "";
    const status = () =>
      running ? { running: true, previewPath: `/p/${m?.[1]}-secretsecretsecret/`, startedAt: 1, lastActive: 1 } : { running: false };
    if (action === "" && method === "GET") return Response.json(status());
    if (action === "/start") {
      running = true;
      return Response.json(status());
    }
    if (action === "/snapshots") {
      snapshots.push(JSON.parse(String(init?.body)).name);
      return Response.json({ bytes: 1 });
    }
    if (!running && action === "/files") return Response.json({ error: "Sandbox is not running" }, { status: 409 });
    if (action === "/files" && !path) return Response.json({ files: [...files.keys()].map((p) => ({ path: p, size: 1, mtime: 0 })) });
    if (action === "/files" && method === "GET") {
      return files.has(path) ? new Response(files.get(path)) : Response.json({ error: "File not found" }, { status: 404 });
    }
    if (action === "/files" && method === "PUT") {
      files.set(path, Buffer.from(await new Response(init?.body).arrayBuffer()).toString());
      return Response.json({ ok: true });
    }
    if (action === "/files" && method === "DELETE") {
      return files.delete(path) ? Response.json({ ok: true }) : Response.json({ error: "File not found" }, { status: 404 });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  };
  return { files, snapshots, calls, client: new SandboxClient("http://manager:4100", "token", fetchImpl), isRunning: () => running };
}

type Chunk = Parameters<typeof simulateReadableStream>[0]["chunks"][number];

export function usage(input: number, output: number) {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: output, text: output, reasoning: undefined },
  };
}

export const text = (id: string, value: string): Chunk[] => [
  { type: "text-start", id },
  { type: "text-delta", id, delta: value },
  { type: "text-end", id },
];

export const call = (toolCallId: string, toolName: string, input: unknown): Chunk => ({
  type: "tool-call",
  toolCallId,
  toolName,
  input: JSON.stringify(input),
});

export const finish = (reason: "stop" | "tool-calls", input = 1000, output = 200): Chunk => ({
  type: "finish",
  finishReason: { unified: reason, raw: undefined },
  usage: usage(input, output),
});

/** A model that plays back one scripted step per call. */
export function scriptedModel(steps: Chunk[][], options: { delayMs?: number } = {}) {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      const chunks = steps[Math.min(call, steps.length - 1)]!;
      call++;
      return {
        stream: simulateReadableStream({ chunks, chunkDelayInMs: options.delayMs ?? null, initialDelayInMs: null }),
      };
    },
  });
  return { model, calls: () => call };
}
