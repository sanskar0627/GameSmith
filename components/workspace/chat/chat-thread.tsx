"use client";

import { TriangleAlert } from "lucide-react";
import { Spark } from "@/components/brand/spark";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { ChatMessage, MessagePart, ToolPart } from "@/lib/workspace/types";
import { AskCard } from "./ask-card";
import { BriefCard } from "./brief-card";
import {
  Checkpoint,
  ErrorBlock,
  Notice,
  ReasoningBlock,
  TextBlock,
  ToolLog,
} from "./parts";

type Handlers = {
  onAnswer: (askId: string, value: string) => void;
  onApproveBrief: () => void;
  onReviseBrief: () => void;
  busy: boolean;
};

export function ChatThread({
  messages,
  ...handlers
}: { messages: ChatMessage[] } & Handlers) {
  return (
    // autoScroll: follow the agent while it streams, unless the reader scrolls up.
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-2xl gap-7 px-4 pt-6 pb-10 sm:px-6">
            {messages.map((m) => (
              <MessageScrollerItem
                key={m.id}
                messageId={m.id}
                scrollAnchor={m.role === "user"}
              >
                {m.role === "user" ? (
                  <UserMessage message={m} />
                ) : (
                  <AgentMessage message={m} {...handlers} />
                )}
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  const text = message.parts.find((p) => p.type === "text");
  return (
    <div className="flex flex-col items-end gap-1.5">
      {message.attachments?.map((a, i) => (
        <span
          key={i}
          className="flex max-w-[85%] items-center gap-1.5 rounded-sm border border-destructive/30 bg-destructive/5 px-2 py-1 text-[12px] text-destructive"
        >
          <TriangleAlert className="size-3 shrink-0" />
          <span className="truncate font-mono">{a.message}</span>
        </span>
      ))}
      {text && (
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-muted px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
          {text.text}
        </div>
      )}
    </div>
  );
}

/** Groups consecutive tool calls into one work log. */
function groupParts(parts: MessagePart[]) {
  const out: (MessagePart | { type: "tool-group"; parts: ToolPart[] })[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (p.type === "tool") {
      if (last && last.type === "tool-group") last.parts.push(p);
      else out.push({ type: "tool-group", parts: [p] });
    } else out.push(p);
  }
  return out;
}

function AgentMessage({
  message,
  onAnswer,
  onApproveBrief,
  onReviseBrief,
  busy,
}: { message: ChatMessage } & Handlers) {
  const working = message.parts.length === 0;
  return (
    <div className="flex gap-3">
      <div
        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-sm bg-ember-soft"
        aria-hidden
      >
        <Spark size={14} twinkle={working} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <span className="label-pixel pt-1.5 text-muted-foreground">Smith</span>
        {working && (
          <ReasoningBlock
            part={{ type: "reasoning", text: "", streaming: true }}
          />
        )}
        {groupParts(message.parts).map((p, i) => {
          switch (p.type) {
            case "tool-group":
              return <ToolLog key={`g${i}`} parts={p.parts} />;
            case "text":
              return <TextBlock key={i} part={p} />;
            case "reasoning":
              return <ReasoningBlock key={i} part={p} />;
            case "ask":
              return (
                <AskCard
                  key={p.id}
                  part={p}
                  onAnswer={(v) => onAnswer(p.id, v)}
                  disabled={busy}
                />
              );
            case "brief":
              return (
                <BriefCard
                  key={i}
                  part={p}
                  onApprove={onApproveBrief}
                  onRevise={onReviseBrief}
                  disabled={busy}
                />
              );
            case "checkpoint":
              return <Checkpoint key={i} part={p} />;
            case "error":
              return <ErrorBlock key={i} part={p} />;
            case "notice":
              return <Notice key={i} part={p} />;
          }
        })}
      </div>
    </div>
  );
}
