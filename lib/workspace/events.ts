import type { AgentActivity, BuildState, ChatMessage, MessagePart } from "./types";

/**
 * What an agent run streams to the workspace (SSE, see
 * app/api/games/[gameId]/runs/[runId]/events). The worker publishes these;
 * the browser applies them to the assistant message it is building.
 */
export type RunEvent =
  /** The run started answering; parts below belong to this assistant message. */
  | { type: "start"; runId: string; messageId: string; createdAt: string }
  /** Insert or replace the part at `index`. */
  | { type: "part"; index: number; part: MessagePart }
  /** Append text to the text or reasoning part at `index`. */
  | { type: "delta"; index: number; text: string }
  | { type: "activity"; activity: AgentActivity }
  | { type: "build"; build: BuildState }
  /** The run ended. The message is saved; refresh versions and sparks. */
  | { type: "done"; status: "settled" | "failed" | "canceled" };

export type RunEventEnvelope = { id: string; event: RunEvent };

/** Applies one event to an assistant message's parts (shared by server and client). */
export function applyPartEvent(parts: MessagePart[], event: RunEvent): MessagePart[] {
  if (event.type === "part") {
    const next = parts.slice();
    next[event.index] = event.part;
    return next;
  }
  if (event.type === "delta") {
    const current = parts[event.index];
    if (!current || (current.type !== "text" && current.type !== "reasoning")) return parts;
    const next = parts.slice();
    next[event.index] = { ...current, text: current.text + event.text };
    return next;
  }
  return parts;
}

/** Builds the assistant message a client sees, from scratch or a replay. */
export function emptyAssistant(event: Extract<RunEvent, { type: "start" }>): ChatMessage {
  return { id: event.messageId, role: "assistant", createdAt: event.createdAt, parts: [] };
}
