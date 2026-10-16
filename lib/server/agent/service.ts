import "server-only";

import { and, eq, lt } from "drizzle-orm";

import { getModel, modelOrDefault } from "@/lib/ai/models";
import { db, type Database } from "@/lib/db";
import { agentRuns, messages, type MessageRow } from "@/lib/db/schema";
import { finishRun, startRun } from "@/lib/server/billing/runs";
import { requireGameAccessFor } from "@/lib/server/games/access";
import { listMessages, toChatMessage } from "@/lib/server/games/queries";
import { RateLimiter } from "@/lib/server/rate-limit";
import { sandboxesConfigured } from "@/lib/server/sandbox/service";
import type { Attachment, ChatMessage, MessagePart } from "@/lib/workspace/types";

import { dispatchRun, runBus } from "./queue";
import { latestRunningRun } from "./runner";

/**
 * Starting, following and stopping agent runs for the game's owner.
 * Each start is one of: a new prompt, an answer to the agent's question,
 * approving its brief, or (first visit) answering the saved first prompt.
 */

export class RunInProgressError extends Error {
  constructor(public readonly runId: string) {
    super("The agent is already working on this game.");
    this.name = "RunInProgressError";
  }
}

export class RunInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunInputError";
  }
}

export class RunsRateLimitedError extends Error {
  constructor() {
    super("Too many requests. Give it a minute.");
    this.name = "RunsRateLimitedError";
  }
}

export type RunInput =
  | { kind: "prompt"; text: string; attachments?: Attachment[] }
  | { kind: "answer"; askId: string; value: string }
  | { kind: "approve" }
  | { kind: "resume" };

/** A run with no heartbeat for this long is treated as dead. */
export const STALE_MS = 3 * 60_000;
const starts = new RateLimiter(30, 10 * 60_000);

/** Fails runs whose worker died, releasing their sparks. */
export async function sweepStaleRuns(filter: { gameId?: string } = {}, database: Database = db(), now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_MS);
  const stale = await database
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.status, "running"),
        lt(agentRuns.heartbeatAt, cutoff),
        filter.gameId ? eq(agentRuns.gameId, filter.gameId) : undefined,
      ),
    );
  for (const run of stale) {
    const spec = getModel(run.modelId) ?? modelOrDefault(null);
    await finishRun(
      { runId: run.id, spec, usage: { inputTokens: 0, outputTokens: 0 }, outcome: "failed", error: "The agent stopped responding." },
      database,
    );
    await runBus()
      .publish(run.id, { type: "done", status: "failed" })
      .catch(() => {});
  }
  return stale.length;
}

function isOneRunningViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth++) {
    const e = current as { code?: string; constraint_name?: string; constraint?: string; cause?: unknown };
    if (e.code === "23505" && (e.constraint_name ?? e.constraint) === "agent_runs_one_running_uq") return true;
    current = e.cause;
  }
  return false;
}

function lastAssistant(thread: MessageRow[]): MessageRow | undefined {
  return [...thread].reverse().find((m) => m.role === "assistant");
}

function textOf(message: MessageRow | undefined): string {
  return (message?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("\n")
    .trim();
}

export async function createRun(
  userId: string,
  gameId: string,
  input: RunInput,
  database: Database = db(),
): Promise<{ runId: string; userMessage: ChatMessage | null }> {
  const game = await requireGameAccessFor(gameId, userId, "write", database);
  if (!sandboxesConfigured()) throw new RunInputError("Sandboxes aren't set up on this server yet, so the agent can't build.");
  if (!starts.take(userId)) throw new RunsRateLimitedError();

  await sweepStaleRuns({ gameId: game.id }, database);
  const running = await latestRunningRun(database, game.id);
  if (running) throw new RunInProgressError(running.id);

  const thread = await listMessages(game.id, database);
  const assistant = lastAssistant(thread);
  const last = thread.at(-1);

  // Work out what this run answers, before touching sparks.
  let prompt = "";
  let editParts: { id: string; parts: MessagePart[] } | null = null;
  let newUserMessage: { text: string; attachments?: Attachment[] } | null = null;

  switch (input.kind) {
    case "prompt":
      prompt = input.text;
      newUserMessage = { text: input.text, attachments: input.attachments };
      break;
    case "answer": {
      const ask = assistant?.parts.find((p) => p.type === "ask" && p.id === input.askId);
      if (!assistant || !ask || ask.type !== "ask") throw new RunInputError("That question is no longer open.");
      if (ask.answer) throw new RunInputError("That question was already answered.");
      prompt = input.value;
      editParts = {
        id: assistant.id,
        parts: assistant.parts.map((p) => (p.type === "ask" && p.id === input.askId ? { ...p, answer: input.value } : p)),
      };
      newUserMessage = { text: input.value };
      break;
    }
    case "approve": {
      const brief = assistant?.parts.find((p) => p.type === "brief" && p.status === "proposed");
      if (!assistant || !brief || last?.id !== assistant.id) throw new RunInputError("There's no plan waiting for approval.");
      prompt = brief.type === "brief" ? `Build the plan: ${brief.brief.title}` : "Build the plan";
      editParts = {
        id: assistant.id,
        parts: assistant.parts.map((p) => (p.type === "brief" ? { ...p, status: "approved" as const } : p)),
      };
      break;
    }
    case "resume":
      if (!last || last.role !== "user") throw new RunInputError("There's nothing waiting for an answer.");
      prompt = textOf(last);
      break;
  }

  let started;
  try {
    started = await startRun({ userId, gameId: game.id, modelId: game.modelId ?? modelOrDefault(null).id }, database);
  } catch (error) {
    if (isOneRunningViolation(error)) {
      const now = await latestRunningRun(database, game.id);
      throw new RunInProgressError(now?.id ?? "");
    }
    throw error;
  }
  const run = started.run;

  let userMessage: ChatMessage | null = null;
  try {
    await database.transaction(async (tx) => {
      await tx.update(agentRuns).set({ prompt: prompt.slice(0, 4000) }).where(eq(agentRuns.id, run.id));
      if (editParts) await tx.update(messages).set({ parts: editParts.parts }).where(eq(messages.id, editParts.id));
      if (newUserMessage) {
        const [row] = await tx
          .insert(messages)
          .values({
            gameId: game.id,
            runId: run.id,
            role: "user",
            parts: [{ type: "text", text: newUserMessage.text }],
            attachments: newUserMessage.attachments?.length ? newUserMessage.attachments : null,
          })
          .returning();
        userMessage = toChatMessage(row);
      }
    });
    await dispatchRun(run.id);
  } catch (error) {
    await finishRun(
      { runId: run.id, spec: started.spec, usage: { inputTokens: 0, outputTokens: 0 }, outcome: "failed", error: "Could not start" },
      database,
    );
    throw error;
  }
  return { runId: run.id, userMessage };
}

/** The game's running run, after clearing dead ones. Owner only. */
export async function activeRun(userId: string, gameId: string, database: Database = db()): Promise<string | null> {
  const game = await requireGameAccessFor(gameId, userId, "write", database);
  await sweepStaleRuns({ gameId: game.id }, database);
  return (await latestRunningRun(database, game.id))?.id ?? null;
}

/** Checks the run belongs to the user's game. Returns its status. */
export async function requireRun(userId: string, gameId: string, runId: string, database: Database = db()) {
  const game = await requireGameAccessFor(gameId, userId, "write", database);
  const [run] = /^[0-9a-f-]{36}$/i.test(runId)
    ? await database
        .select({ id: agentRuns.id, status: agentRuns.status })
        .from(agentRuns)
        .where(and(eq(agentRuns.id, runId), eq(agentRuns.gameId, game.id)))
        .limit(1)
    : [];
  if (!run) throw new RunInputError("Run not found");
  return run;
}

export async function cancelRun(userId: string, gameId: string, runId: string, database: Database = db()) {
  const run = await requireRun(userId, gameId, runId, database);
  if (run.status === "running") await runBus().cancel(run.id);
}

/** Thread for the workspace page (oldest first). */
export async function threadFor(gameId: string, database: Database = db()): Promise<ChatMessage[]> {
  return (await listMessages(gameId, database)).map(toChatMessage);
}
