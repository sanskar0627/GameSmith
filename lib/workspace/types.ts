/**
 * Workspace contracts: what the chat and preview render.
 *
 * Shaped after AI SDK UI message parts so the real agent (Trigger.dev +
 * AI SDK) can stream into these without UI changes. The mock agent in
 * components/workspace/use-mock-agent.ts produces the same shapes.
 */

export type FileTool = "list_files" | "read_file" | "write_file" | "replace_text" | "delete_file";

export type TextPart = { type: "text"; text: string; streaming?: boolean };

export type ReasoningPart = { type: "reasoning"; text: string; seconds?: number; streaming?: boolean };

/** One file operation inside the game's sandbox. */
export type ToolPart = {
  type: "tool";
  id: string;
  tool: FileTool;
  state: "running" | "done" | "error";
  path: string;
  added?: number;
  removed?: number;
  error?: string;
};

export type AskOption = { id: string; label: string; description?: string };

/** `ask_player`: a focused design question with suggested answers. */
export type AskPart = {
  type: "ask";
  id: string;
  question: string;
  hint?: string;
  options: AskOption[];
  answer?: string;
};

export type GameBrief = {
  title: string;
  pitch: string;
  loop: string;
  goal: string;
  challenge: string;
  controls: { keys: string[]; action: string }[];
  world: string;
  style: string;
  feel: string;
};

export type BriefPart = { type: "brief"; brief: GameBrief; status: "proposed" | "approved" };

/** Marks a playable version in the thread. */
export type CheckpointPart = { type: "checkpoint"; version: number; label: string };

export type ErrorPart = { type: "error"; message: string; detail?: string };

export type NoticePart = { type: "notice"; text: string };

export type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolPart
  | AskPart
  | BriefPart
  | CheckpointPart
  | ErrorPart
  | NoticePart;

export type Attachment = { kind: "runtime-error"; message: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  createdAt: string;
  attachments?: Attachment[];
};

export type RuntimeError = { message: string; stack?: string; file?: string; line?: number };

export type BuildStep = { label: string; state: "done" | "active" | "pending" };

export type BuildState =
  | { status: "empty" }
  | { status: "building"; version: number; steps: BuildStep[]; previousVersion?: number }
  | { status: "ready"; version: number }
  | { status: "crashed"; version: number; error: RuntimeError };

/** What the agent is doing right now (drives the composer and status line). */
export type AgentActivity =
  | { state: "idle" }
  | { state: "thinking" }
  | { state: "working"; detail: string }
  | { state: "waiting" }; // asked the player a question or proposed a brief

export type WorkspaceSnapshot = {
  messages: ChatMessage[];
  build: BuildState;
  activity: AgentActivity;
};
