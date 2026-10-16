import "server-only";

import type { Redis } from "ioredis";

import type { RunEvent, RunEventEnvelope } from "@/lib/workspace/events";

/**
 * Where a run's events go between the worker and the browser.
 *
 * Production: one Redis Stream per run (`gs:run:<id>:events`). The worker
 * XADDs, every SSE connection XREADs from its own `Last-Event-ID`, so a
 * dropped connection resumes without losing anything. Cancel is a flag key.
 *
 * Local development without Redis: the same contract in this process's
 * memory (the inline queue runs the agent in the Next server).
 */
export interface RunBus {
  publish(runId: string, event: RunEvent): Promise<string>;
  /** Events after `after` (or from the start), until `done` or the signal aborts. */
  read(runId: string, after: string | null, signal: AbortSignal): AsyncGenerator<RunEventEnvelope>;
  cancel(runId: string): Promise<void>;
  isCanceled(runId: string): Promise<boolean>;
}

const KEEP_AFTER_DONE_MS = 60 * 60_000;

/* --- In memory ------------------------------------------------------------ */

type Log = { events: RunEventEnvelope[]; waiters: Set<() => void>; canceled: boolean; seq: number };

export class MemoryBus implements RunBus {
  private readonly logs = new Map<string, Log>();

  private log(runId: string): Log {
    let log = this.logs.get(runId);
    if (!log) {
      log = { events: [], waiters: new Set(), canceled: false, seq: 0 };
      this.logs.set(runId, log);
    }
    return log;
  }

  async publish(runId: string, event: RunEvent): Promise<string> {
    const log = this.log(runId);
    const id = String(++log.seq);
    log.events.push({ id, event });
    for (const wake of log.waiters) wake();
    log.waiters.clear();
    if (event.type === "done") {
      const timer = setTimeout(() => this.logs.delete(runId), KEEP_AFTER_DONE_MS);
      timer.unref?.();
    }
    return id;
  }

  async *read(runId: string, after: string | null, signal: AbortSignal): AsyncGenerator<RunEventEnvelope> {
    const log = this.log(runId);
    let next = after ? Number(after) : 0;
    while (!signal.aborted) {
      const pending = log.events.filter((e) => Number(e.id) > next);
      for (const envelope of pending) {
        next = Number(envelope.id);
        yield envelope;
        if (envelope.event.type === "done") return;
      }
      await new Promise<void>((resolve) => {
        const wake = () => {
          signal.removeEventListener("abort", wake);
          resolve();
        };
        log.waiters.add(wake);
        signal.addEventListener("abort", wake, { once: true });
      });
    }
  }

  async cancel(runId: string) {
    this.log(runId).canceled = true;
  }

  async isCanceled(runId: string) {
    return this.logs.get(runId)?.canceled ?? false;
  }
}

/* --- Redis Streams -------------------------------------------------------- */

const key = (runId: string) => `gs:run:${runId}:events`;
const cancelKey = (runId: string) => `gs:run:${runId}:cancel`;

export class RedisBus implements RunBus {
  constructor(private readonly redis: Redis) {}

  async publish(runId: string, event: RunEvent): Promise<string> {
    const id = await this.redis.xadd(key(runId), "MAXLEN", "~", "20000", "*", "e", JSON.stringify(event));
    // Streams outlive a crashed worker by a few hours at most.
    await this.redis.expire(key(runId), event.type === "done" ? KEEP_AFTER_DONE_MS / 1000 : 6 * 3600);
    return id as string;
  }

  async *read(runId: string, after: string | null, signal: AbortSignal): AsyncGenerator<RunEventEnvelope> {
    // XREAD BLOCK holds its connection, so each reader gets its own.
    const conn = this.redis.duplicate();
    const stop = () => conn.disconnect();
    signal.addEventListener("abort", stop, { once: true });
    let last = after ?? "0";
    try {
      while (!signal.aborted) {
        const reply = (await conn.xread("COUNT", 200, "BLOCK", 10_000, "STREAMS", key(runId), last).catch((error) => {
          if (signal.aborted) return null;
          throw error;
        })) as [string, [string, string[]][]][] | null;
        if (!reply) continue;
        for (const [, entries] of reply) {
          for (const [id, fields] of entries) {
            last = id;
            const raw = fields[fields.indexOf("e") + 1];
            if (!raw) continue;
            const event = JSON.parse(raw) as RunEvent;
            yield { id, event };
            if (event.type === "done") return;
          }
        }
      }
    } finally {
      signal.removeEventListener("abort", stop);
      conn.disconnect();
    }
  }

  async cancel(runId: string) {
    await this.redis.set(cancelKey(runId), "1", "EX", 3600);
  }

  async isCanceled(runId: string) {
    return (await this.redis.exists(cancelKey(runId))) === 1;
  }
}
