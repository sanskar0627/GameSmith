import { requireApiUser } from "@/lib/auth";
import { runErrorResponse } from "@/lib/server/agent/http";
import { runBus } from "@/lib/server/agent/queue";
import { requireRun, sweepStaleRuns } from "@/lib/server/agent/service";

type Ctx = { params: Promise<{ gameId: string; runId: string }> };

const encoder = new TextEncoder();
const KEEPALIVE_MS = 15_000;
const CONNECTION_MS = 55_000;

/**
 * Server-sent events for one run. Resumes after `Last-Event-ID` (the browser
 * sends it on reconnect), so a dropped connection loses nothing. A run that
 * already ended and whose events expired just reports `done`. Connections
 * close after about a minute and the browser reconnects; each connect first
 * fails runs whose worker stopped sending heartbeats.
 */
export async function GET(request: Request, { params }: Ctx) {
  let run;
  try {
    const { userId } = await requireApiUser();
    const { gameId, runId } = await params;
    run = await requireRun(userId, gameId, runId);
    if (run.status === "running" && (await sweepStaleRuns({ gameId }))) run = await requireRun(userId, gameId, runId);
  } catch (error) {
    return runErrorResponse(error);
  }

  const after = request.headers.get("last-event-id") || new URL(request.url).searchParams.get("after");
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          abort.abort();
        }
      };
      send("retry: 2000\n\n");
      const keepalive = setInterval(() => send(": keepalive\n\n"), KEEPALIVE_MS);
      let sawDone = false;
      // A finished run only replays what is still buffered, with a short bound.
      const finished = run.status !== "running";
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(finished ? 1500 : CONNECTION_MS)]);
      try {
        for await (const { id, event } of runBus().read(run.id, after, signal)) {
          send(`id: ${id}\ndata: ${JSON.stringify(event)}\n\n`);
          if (event.type === "done") sawDone = true;
        }
        if (finished && !sawDone) send(`data: ${JSON.stringify({ type: "done", status: run.status })}\n\n`);
      } catch (error) {
        if (!abort.signal.aborted) console.error("[agent] event stream failed", error);
      } finally {
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
