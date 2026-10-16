import "server-only";

import type { ModelMessage } from "ai";

import type { ChatMessage, MessagePart } from "@/lib/workspace/types";

/**
 * Turns the saved thread into model messages. File tool calls are not
 * replayed (their inputs aren't stored); the agent gets a one-line summary
 * and can re-read files. `ask_player` and `propose_brief` are replayed as
 * real tool calls with the player's response as the result, so the model
 * sees its own question answered.
 */

export const ASK_TOOL = "ask_player";
export const BRIEF_TOOL = "propose_brief";

const VERB = {
  list_files: "listed files",
  read_file: "read",
  write_file: "wrote",
  replace_text: "edited",
  delete_file: "deleted",
} as const;

function userText(message: ChatMessage): string {
  const text = message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("\n")
    .trim();
  const crashes = (message.attachments ?? [])
    .filter((a) => a.kind === "runtime-error")
    .map((a) => `The game crashed in the preview with this error:\n${a.message.slice(0, 4000)}`);
  return [text, ...crashes].filter(Boolean).join("\n\n") || "(no message)";
}

function workSummary(parts: MessagePart[]): string | null {
  const done = parts.filter((p) => p.type === "tool" && p.state === "done" && p.tool !== "list_files" && p.tool !== "read_file");
  if (done.length === 0) return null;
  const lines = done.map((p) => (p.type === "tool" ? `${VERB[p.tool]} ${p.path}` : ""));
  return `(Files changed in this turn: ${[...new Set(lines)].join(", ")}.)`;
}

export function toModelMessages(thread: ChatMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  thread.forEach((message, index) => {
    if (message.role === "user") {
      out.push({ role: "user", content: userText(message) });
      return;
    }

    const content: Exclude<Extract<ModelMessage, { role: "assistant" }>["content"], string> = [];
    const results: Extract<ModelMessage, { role: "tool" }>["content"] = [];
    const repliedLater = thread.slice(index + 1).some((m) => m.role === "user");

    for (const part of message.parts) {
      if (part.type === "text" && part.text.trim()) content.push({ type: "text", text: part.text });
      if (part.type === "checkpoint") content.push({ type: "text", text: `(Saved checkpoint v${part.version}: ${part.label}.)` });
      if (part.type === "ask") {
        content.push({
          type: "tool-call",
          toolCallId: part.id,
          toolName: ASK_TOOL,
          input: { question: part.question, hint: part.hint, options: part.options },
        });
        const answer = part.answer ?? (repliedLater ? "The player skipped the question and wrote in the chat instead." : "No answer yet.");
        results.push({ type: "tool-result", toolCallId: part.id, toolName: ASK_TOOL, output: { type: "json", value: { answer } } });
      }
      if (part.type === "brief") {
        const id = `brief-${message.id}`;
        content.push({ type: "tool-call", toolCallId: id, toolName: BRIEF_TOOL, input: { brief: part.brief } });
        const value =
          part.status === "approved"
            ? { status: "approved", note: "The player approved the plan. Build it." }
            : { status: "not approved", note: repliedLater ? "The player asked for changes in the chat." : "Waiting for the player." };
        results.push({ type: "tool-result", toolCallId: id, toolName: BRIEF_TOOL, output: { type: "json", value } });
      }
    }
    const summary = workSummary(message.parts);
    if (summary) content.push({ type: "text", text: summary });
    if (content.length === 0) return;
    out.push({ role: "assistant", content });
    if (results.length > 0) out.push({ role: "tool", content: results });
  });
  return out;
}
