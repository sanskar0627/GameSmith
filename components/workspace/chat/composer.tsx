"use client";

import { forwardRef, useState, type ReactNode } from "react";
import { ArrowUp, Plus, Square, TriangleAlert, X } from "lucide-react";
import { PixelLoader } from "@/components/brand/pixel-loader";
import { Spark } from "@/components/brand/spark";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentActivity, Attachment, RuntimeError } from "@/lib/workspace/types";

type ComposerProps = {
  activity: AgentActivity;
  hasMessages: boolean;
  /** Present while the current build is crashed; offered as an attachment. */
  crash?: RuntimeError;
  onSend: (text: string, attachments?: Attachment[]) => void;
  onStop: () => void;
};

/**
 * Workspace composer. Enter sends, Shift+Enter adds a line. While the agent
 * works, Send becomes Stop. A crash is attached automatically (removable).
 */
export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  { activity, hasMessages, crash, onSend, onStop },
  ref,
) {
  const [value, setValue] = useState("");
  const [dropCrashFor, setDropCrashFor] = useState<string | null>(null);
  const busy = activity.state === "thinking" || activity.state === "working";
  const attachCrash = crash && dropCrashFor !== crash.message;
  const canSend = !busy && (value.trim().length > 0 || attachCrash);

  const submit = () => {
    if (!canSend) return;
    const text = value.trim() || "The game crashed. Can you fix it?";
    onSend(text, attachCrash && crash ? [{ kind: "runtime-error", message: crash.message }] : undefined);
    setValue("");
  };

  const placeholder = !hasMessages
    ? "Describe your game…"
    : activity.state === "waiting"
      ? "Answer here, or tell Smith what to change…"
      : "Ask for a change, like “make the sentinels slower”";

  return (
    <div className="shrink-0 px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="mx-auto w-full max-w-2xl">
        <StatusLine activity={activity} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="rounded-xl border border-border bg-card p-2 shadow-float transition-colors focus-within:border-ember/60"
        >
          {attachCrash && crash && (
            <div className="mb-1 flex px-1">
              <span className="flex max-w-full items-center gap-1.5 rounded-sm border border-destructive/30 bg-destructive/5 py-1 pr-1 pl-2 text-[12px] text-destructive">
                <TriangleAlert className="size-3 shrink-0" />
                <span className="truncate font-mono">{crash.message}</span>
                <button
                  type="button"
                  aria-label="Remove error"
                  onClick={() => setDropCrashFor(crash.message)}
                  className="rounded-sm p-0.5 hover:bg-destructive/10"
                >
                  <X className="size-3" />
                </button>
              </span>
            </div>
          )}
          <label htmlFor="workspace-prompt" className="sr-only">
            Message Smith
          </label>
          <Textarea
            id="workspace-prompt"
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={placeholder}
            className="field-sizing-content max-h-48 min-h-11 resize-none border-0 bg-transparent px-2.5 py-2 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex items-center justify-between gap-2 px-0.5">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Attach (coming soon)" disabled>
              <Plus />
            </Button>
            {busy ? (
              <Button type="button" variant="outline" size="sm" onClick={onStop}>
                <Square className="fill-current" data-icon="inline-start" /> Stop
              </Button>
            ) : (
              <Button type="submit" variant="ember" size="icon-sm" aria-label="Send" disabled={!canSend}>
                <ArrowUp />
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
});

function StatusLine({ activity }: { activity: AgentActivity }) {
  let content: ReactNode = null;
  if (activity.state === "thinking")
    content = (
      <>
        <Spark size={7} twinkle /> Smith is thinking
      </>
    );
  else if (activity.state === "working")
    content = (
      <>
        <PixelLoader size="sm" /> <span className="truncate">{activity.detail}</span>
      </>
    );
  else if (activity.state === "waiting")
    content = (
      <>
        <Spark size={7} /> Waiting for you
      </>
    );
  return (
    <div className="flex h-7 items-center gap-2 px-1 text-[12.5px] text-muted-foreground" role="status" aria-live="polite">
      {content}
    </div>
  );
}
