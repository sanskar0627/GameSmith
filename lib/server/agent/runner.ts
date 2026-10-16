import "server-only";

import { randomUUID } from "node:crypto";

import { hasToolCall, isStepCount, streamText, type LanguageModel, type StopCondition } from "ai";
import { and, desc, eq, max } from "drizzle-orm";

import type { ModelSpec } from "@/lib/ai/models";
import { chatModel } from "@/lib/ai/providers";
import { costMicroUsd, sparksForCost, type TokenUsage } from "@/lib/billing/pricing";
import { db, type Database } from "@/lib/db";
import { agentRuns, gameVersions, games, messages, type AgentRun } from "@/lib/db/schema";
import { resolveRunCredentials } from "@/lib/server/ai/access";
import { finishRun, runAllowance } from "@/lib/server/billing/runs";
import { listMessages, toChatMessage } from "@/lib/server/games/queries";
import type { SandboxClient } from "@/lib/server/sandbox/client";
import { runSandbox } from "@/lib/server/sandbox/service";
import type { RunEvent } from "@/lib/workspace/events";
import type { AgentActivity, BuildState, BuildStep, FileTool, MessagePart } from "@/lib/workspace/types";

import type { RunBus } from "./bus";
import { ASK_TOOL, BRIEF_TOOL, toModelMessages } from "./history";
import { agentInstructions } from "./prompt";
import { agentTools, FILE_TOOLS, type CheckpointResult } from "./tools";

/**
 * Executes one agent run: model tool loop against the game's sandbox,
 * streaming events to the bus, then saving the assistant message and
 * settling sparks. Safe to call for a run that already ended (no-op).
 */

export type RunnerDeps = {
  bus: RunBus;
  database?: Database;
  /** Tests pass a mock model; production builds it from the catalog. */
  modelFor?: (spec: ModelSpec, apiKey: string) => LanguageModel;
  sandbox?: () => SandboxClient;
  maxSteps?: number;
  /** Wall-clock cap for one run. */
  timeoutMs?: number;
  heartbeatMs?: number;
  cancelPollMs?: number;
};

export const MAX_STEPS = 40;
const DELTA_FLUSH_MS = 40;
const BUILD_STEPS = ["Reading the project", "Writing code", "Saving the version"];

const VERB: Record<FileTool, string> = {
  list_files: "Looking around",
  read_file: "Reading",
  write_file: "Writing",
  replace_text: "Editing",
  delete_file: "Deleting",
};

type Outcome = "settled" | "failed" | "canceled";

function friendlyError(error: unknown, spec: ModelSpec): string {
  const status = (error as { statusCode?: number })?.statusCode;
  const provider = spec.provider === "openrouter" ? "OpenRouter" : spec.provider === "openai" ? "OpenAI" : "Anthropic";
  if (status === 401 || status === 403) return `${provider} rejected the API key for this run.`;
  if (status === 429) return `${provider} is rate limiting requests. Try again in a minute.`;
  if (status && status >= 500) return `${provider} had a problem answering. Try again.`;
  return "The model call failed. Try again.";
}

function addUsage(total: TokenUsage, usage: { inputTokens?: number; outputTokens?: number } | undefined) {
  total.inputTokens += usage?.inputTokens ?? 0;
  total.outputTokens += usage?.outputTokens ?? 0;
}

export async function executeRun(runId: string, deps: RunnerDeps): Promise<void> {
  const database = deps.database ?? db();
  const [run] = await database.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
  if (!run || run.status !== "running") return;

  const creds = await resolveRunCredentials(run.userId, run.modelId, database);
  if (creds.mode === "unknown-model" || creds.mode === "locked" || creds.mode !== run.billingMode) {
    await failEarly(run, deps, database, "The model for this run is no longer available with your current keys. Try again.");
    return;
  }
  const { spec, apiKey } = creds;

  const [game] = await database.select().from(games).where(eq(games.id, run.gameId)).limit(1);
  if (!game || game.deletedAt) {
    await finishRun({ runId, spec, usage: { inputTokens: 0, outputTokens: 0 }, outcome: "failed", error: "Game deleted" }, database);
    return;
  }

  let sandbox: SandboxClient;
  try {
    sandbox = (deps.sandbox ?? runSandbox)();
    const status = await sandbox.status(game.id);
    if (!status.running) await sandbox.start(game.id);
  } catch {
    await failEarly(run, deps, database, "The game's sandbox couldn't start. Try again in a minute.");
    return;
  }

  /* --- Event plumbing -------------------------------------------------- */

  const bus = deps.bus;
  const parts: MessagePart[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  const emit = (event: RunEvent) => {
    chain = chain.then(() => bus.publish(runId, event)).catch((error) => console.error("[agent] publish failed", error));
  };
  const pendingDeltas = new Map<number, string>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    for (const [index, text] of pendingDeltas) emit({ type: "delta", index, text });
    pendingDeltas.clear();
  };
  const setPart = (index: number, part: MessagePart) => {
    flush();
    parts[index] = part;
    emit({ type: "part", index, part });
  };
  const pushPart = (part: MessagePart) => {
    setPart(parts.length, part);
    return parts.length - 1;
  };
  const appendText = (index: number, text: string) => {
    const part = parts[index];
    if (!part || (part.type !== "text" && part.type !== "reasoning")) return;
    parts[index] = { ...part, text: part.text + text };
    pendingDeltas.set(index, (pendingDeltas.get(index) ?? "") + text);
    flushTimer ??= setTimeout(flush, DELTA_FLUSH_MS);
  };
  const activity = (a: AgentActivity) => {
    flush();
    emit({ type: "activity", activity: a });
  };
  let build: BuildState = game.currentVersion > 0 ? { status: "ready", version: game.currentVersion } : { status: "empty" };
  const setBuild = (next: BuildState) => {
    build = next;
    flush();
    emit({ type: "build", build });
  };

  const messageId = randomUUID();
  emit({ type: "start", runId, messageId, createdAt: new Date().toISOString() });
  activity({ state: "thinking" });

  /* --- Versions ---------------------------------------------------------- */

  const previous = game.currentVersion > 0 ? game.currentVersion : undefined;
  const changed = new Set<string>();
  let saved: CheckpointResult | null = null;
  const steps = (active: number): BuildStep[] =>
    BUILD_STEPS.map((label, i) => ({ label, state: i < active ? "done" : i === active ? "active" : "pending" }));
  const nextVersion = async () => {
    const [row] = await database.select({ n: max(gameVersions.number) }).from(gameVersions).where(eq(gameVersions.gameId, game.id));
    return (row?.n ?? 0) + 1;
  };

  const checkpoint = async (label: string): Promise<CheckpointResult> => {
    const version = await nextVersion();
    const snapshotKey = `v${version}`;
    await sandbox.snapshot(game.id, snapshotKey);
    await database.transaction(async (tx) => {
      await tx.insert(gameVersions).values({
        gameId: game.id,
        number: version,
        label: label.trim().slice(0, 60) || `Version ${version}`,
        prompt: run.prompt.slice(0, 2000),
        status: "ready",
        filesChanged: changed.size,
        snapshotKey,
      });
      await tx.update(games).set({ currentVersion: version, status: "ready" }).where(eq(games.id, game.id));
    });
    saved = { version, label };
    changed.clear();
    return saved;
  };

  /* --- Cancel, timeout, heartbeat ---------------------------------------- */

  const abort = new AbortController();
  let cancelReason: "canceled" | "timeout" | null = null;
  const cancelPoll = setInterval(() => {
    void bus.isCanceled(runId).then((yes) => {
      if (yes && !abort.signal.aborted) {
        cancelReason = "canceled";
        abort.abort();
      }
    });
  }, deps.cancelPollMs ?? 1000);
  const timeout = setTimeout(() => {
    cancelReason = "timeout";
    abort.abort();
  }, deps.timeoutMs ?? 15 * 60_000);
  let stepCount = 0;
  const heartbeat = setInterval(() => {
    void database.update(agentRuns).set({ heartbeatAt: new Date(), steps: stepCount }).where(eq(agentRuns.id, runId));
  }, deps.heartbeatMs ?? 30_000);

  /* --- The loop ---------------------------------------------------------- */

  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let outOfSparks = false;
  const budget: StopCondition<ReturnType<typeof agentTools>> = ({ steps: done }) => {
    const sofar: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    for (const s of done) addUsage(sofar, s.usage);
    const last = done.at(-1);
    const lastCost = last ? sparksForCost(costMicroUsd(spec, { inputTokens: last.usage?.inputTokens ?? 0, outputTokens: last.usage?.outputTokens ?? 0 })) : 0;
    const left = runAllowance(run, spec, sofar);
    outOfSparks = left <= Math.max(1, lastCost);
    return outOfSparks;
  };

  const textIndex = new Map<string, number>();
  const reasoningStart = new Map<string, number>();
  const toolIndex = new Map<string, number>();
  let errorMessage: string | null = null;
  let outcome: Outcome = "settled";

  try {
    const thread = (await listMessages(game.id, database)).map(toChatMessage);
    const result = streamText({
      model: (deps.modelFor ?? chatModel)(spec, apiKey),
      instructions: agentInstructions({ title: game.title, pitch: game.pitch }),
      messages: toModelMessages(thread),
      tools: agentTools({ gameId: game.id, sandbox, checkpoint }),
      stopWhen: [isStepCount(deps.maxSteps ?? MAX_STEPS), hasToolCall(ASK_TOOL, BRIEF_TOOL), budget],
      abortSignal: abort.signal,
      maxRetries: 2,
    });

    for await (const part of result.stream) {
      switch (part.type) {
        case "text-start":
          textIndex.set(part.id, pushPart({ type: "text", text: "", streaming: true }));
          break;
        case "text-delta": {
          const index = textIndex.get(part.id) ?? pushPart({ type: "text", text: "", streaming: true });
          textIndex.set(part.id, index);
          appendText(index, part.text);
          break;
        }
        case "text-end": {
          const index = textIndex.get(part.id);
          const current = index === undefined ? undefined : parts[index];
          if (index !== undefined && current?.type === "text") {
            if (current.text.trim()) setPart(index, { type: "text", text: current.text });
            else setPart(index, { type: "text", text: "" });
          }
          break;
        }
        case "reasoning-start":
          reasoningStart.set(part.id, Date.now());
          textIndex.set(`r:${part.id}`, pushPart({ type: "reasoning", text: "", streaming: true }));
          activity({ state: "thinking" });
          break;
        case "reasoning-delta": {
          const index = textIndex.get(`r:${part.id}`);
          if (index !== undefined) appendText(index, part.text);
          break;
        }
        case "reasoning-end": {
          const index = textIndex.get(`r:${part.id}`);
          const current = index === undefined ? undefined : parts[index];
          if (index !== undefined && current?.type === "reasoning") {
            const seconds = Math.max(1, Math.round((Date.now() - (reasoningStart.get(part.id) ?? Date.now())) / 1000));
            setPart(index, { type: "reasoning", text: current.text, seconds });
          }
          break;
        }
        case "tool-call": {
          const input = (part.input ?? {}) as Record<string, unknown>;
          if (FILE_TOOLS.has(part.toolName)) {
            const tool = part.toolName as FileTool;
            const file = typeof input.path === "string" ? input.path : "";
            toolIndex.set(part.toolCallId, pushPart({ type: "tool", id: part.toolCallId, tool, state: "running", path: file }));
            activity({ state: "working", detail: file ? `${VERB[tool]} ${file}` : VERB[tool] });
            if (tool !== "read_file" && tool !== "list_files" && (build as BuildState).status !== "building") {
              setBuild({ status: "building", version: (previous ?? 0) + 1, steps: steps(1), previousVersion: previous });
            }
          } else if (part.toolName === ASK_TOOL) {
            pushPart({
              type: "ask",
              id: part.toolCallId,
              question: String(input.question ?? ""),
              hint: typeof input.hint === "string" ? input.hint : undefined,
              options: Array.isArray(input.options) ? (input.options as { id: string; label: string; description?: string }[]) : [],
            });
            activity({ state: "waiting" });
          } else if (part.toolName === BRIEF_TOOL) {
            const brief = (input as { brief?: unknown }).brief;
            if (brief) pushPart({ type: "brief", brief: brief as Extract<MessagePart, { type: "brief" }>["brief"], status: "proposed" });
            activity({ state: "waiting" });
          } else if (part.toolName === "checkpoint") {
            activity({ state: "working", detail: "Saving a version" });
            setBuild({ status: "building", version: (previous ?? 0) + 1, steps: steps(2), previousVersion: previous });
          }
          break;
        }
        case "tool-result": {
          const index = toolIndex.get(part.toolCallId);
          const output = (part.output ?? {}) as { added?: number; removed?: number; path?: string };
          if (index !== undefined) {
            const current = parts[index];
            if (current?.type === "tool") {
              if (current.tool !== "read_file" && current.tool !== "list_files" && current.path) changed.add(current.path);
              setPart(index, { ...current, state: "done", added: output.added, removed: output.removed });
            }
          } else if (part.toolName === "checkpoint") {
            const result = part.output as CheckpointResult;
            pushPart({ type: "checkpoint", version: result.version, label: result.label });
            setBuild({ status: "ready", version: result.version });
          }
          activity({ state: "thinking" });
          break;
        }
        case "tool-error": {
          const index = toolIndex.get(part.toolCallId);
          const message = part.error instanceof Error ? part.error.message : String(part.error);
          const current = index === undefined ? undefined : parts[index];
          if (index !== undefined && current?.type === "tool") setPart(index, { ...current, state: "error", error: message.slice(0, 300) });
          activity({ state: "thinking" });
          break;
        }
        case "finish-step":
          stepCount++;
          addUsage(usage, part.usage);
          void database.update(agentRuns).set({ heartbeatAt: new Date(), steps: stepCount }).where(eq(agentRuns.id, runId));
          break;
        case "error":
          errorMessage = friendlyError(part.error, spec);
          console.error("[agent] model error", run.id, (part.error as Error)?.message ?? part.error);
          break;
        case "abort":
          break;
      }
    }
  } catch (error) {
    if (!abort.signal.aborted) {
      errorMessage = friendlyError(error, spec);
      console.error("[agent] run failed", run.id, (error as Error)?.message ?? error);
    }
  } finally {
    clearInterval(cancelPoll);
    clearInterval(heartbeat);
    clearTimeout(timeout);
    flush();
  }

  /* --- Wrap up ------------------------------------------------------------ */

  if (cancelReason === "canceled") outcome = "canceled";
  else if (errorMessage || cancelReason === "timeout") outcome = "failed";

  // Close anything left open.
  parts.forEach((part, index) => {
    if (part.type === "tool" && part.state === "running") setPart(index, { ...part, state: "error", error: "Stopped" });
    else if ((part.type === "text" || part.type === "reasoning") && part.streaming) setPart(index, { ...part, streaming: false });
  });
  const live = (saved as CheckpointResult | null)?.version ?? previous;
  if (cancelReason === "canceled") {
    pushPart({
      type: "notice",
      text: live ? `Stopped. v${live} is still live; edits made so far stay in the files.` : "Stopped before the first build. Edits made so far stay in the files.",
    });
  } else if (cancelReason === "timeout") {
    pushPart({ type: "error", message: "This run took too long and was stopped.", detail: "Ask again to continue from where it left off." });
  } else if (errorMessage) {
    pushPart({ type: "error", message: errorMessage });
  } else if (outOfSparks) {
    pushPart({ type: "notice", text: "Paused: this run used up its sparks. Top up or switch to your own API key to continue." });
  }
  if (changed.size > 0) {
    pushPart({ type: "notice", text: "Some changes are live in the preview but not saved as a version yet." });
  }

  const finalParts = parts.filter((p) => !(p.type === "text" && !p.text.trim()));
  try {
    if (finalParts.length > 0) {
      await database.insert(messages).values({ id: messageId, gameId: game.id, runId, role: "assistant", parts: finalParts });
    }
    await database
      .update(games)
      .set({ status: (await currentVersion(database, game.id)) > 0 ? "ready" : "draft" })
      .where(eq(games.id, game.id));
  } finally {
    await finishRun({ runId, spec, usage, outcome, error: errorMessage ?? undefined }, database);
  }

  const finalVersion = await currentVersion(database, game.id);
  setBuild(finalVersion > 0 ? { status: "ready", version: finalVersion } : { status: "empty" });
  const waiting = finalParts.some((p) => (p.type === "ask" && !p.answer) || (p.type === "brief" && p.status === "proposed"));
  activity(waiting && outcome === "settled" ? { state: "waiting" } : { state: "idle" });
  emit({ type: "done", status: outcome });
  await chain;
}

async function currentVersion(database: Database, gameId: string): Promise<number> {
  const [row] = await database.select({ v: games.currentVersion }).from(games).where(eq(games.id, gameId)).limit(1);
  return row?.v ?? 0;
}

/** A run that can't even start: release its hold and tell the browser. */
async function failEarly(run: AgentRun, deps: RunnerDeps, database: Database, message: string) {
  const { getModel, modelOrDefault } = await import("@/lib/ai/models");
  const spec = getModel(run.modelId) ?? modelOrDefault(null);
  const messageId = randomUUID();
  await deps.bus.publish(run.id, { type: "start", runId: run.id, messageId, createdAt: new Date().toISOString() });
  const part: MessagePart = { type: "error", message };
  await deps.bus.publish(run.id, { type: "part", index: 0, part });
  await database.insert(messages).values({ id: messageId, gameId: run.gameId, runId: run.id, role: "assistant", parts: [part] });
  await finishRun({ runId: run.id, spec, usage: { inputTokens: 0, outputTokens: 0 }, outcome: "failed", error: message }, database);
  await deps.bus.publish(run.id, { type: "activity", activity: { state: "idle" } });
  await deps.bus.publish(run.id, { type: "done", status: "failed" });
}

/** The most recent run of a game that is still going, if any. */
export async function latestRunningRun(database: Database, gameId: string) {
  const [row] = await database
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.gameId, gameId), eq(agentRuns.status, "running")))
    .orderBy(desc(agentRuns.createdAt))
    .limit(1);
  return row ?? null;
}
