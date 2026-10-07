"use client";

import { useId, useState } from "react";
import { Check, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AskPart } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";

/**
 * `ask_player`: the agent pauses to ask one focused design question.
 * Pick a suggested answer or write your own. Answered questions collapse.
 */
export function AskCard({ part, onAnswer, disabled }: { part: AskPart; onAnswer: (value: string) => void; disabled?: boolean }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const groupId = useId();

  if (part.answer) {
    return (
      <div className="rounded-lg border border-hairline bg-surface/60 px-3.5 py-2.5 text-sm">
        <p className="text-muted-foreground">{part.question}</p>
        <p className="mt-1 flex items-center gap-1.5 font-medium">
          <CornerDownRight className="size-3.5 text-ember-text" /> {part.answer}
        </p>
      </div>
    );
  }

  const value = custom.trim() || part.options.find((o) => o.id === choice)?.label || "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value) onAnswer(value);
      }}
      className="rounded-xl border border-border bg-card shadow-float"
    >
      <div className="px-4 pt-4 pb-3">
        <span className="label-pixel text-ember-text">Smith asks</span>
        <p id={groupId} className="mt-2 font-display text-[1.375rem] leading-snug">
          {part.question}
        </p>
        {part.hint && <p className="mt-1 text-[13px] text-muted-foreground">{part.hint}</p>}
      </div>
      <div role="radiogroup" aria-labelledby={groupId} className="flex flex-col gap-1.5 px-3 pb-3">
        {part.options.map((o, i) => {
          const selected = choice === o.id && !custom.trim();
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => {
                setChoice(o.id);
                setCustom("");
              }}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                selected ? "border-ember/60 bg-ember-soft/50" : "border-border hover:border-foreground/25 hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-sm border font-pixel text-[10px]",
                  selected ? "border-ember bg-ember text-ember-foreground" : "border-border text-muted-foreground",
                )}
              >
                {selected ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{o.label}</span>
                {o.description && <span className="block text-[13px] text-muted-foreground">{o.description}</span>}
              </span>
            </button>
          );
        })}
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          disabled={disabled}
          placeholder="Something else…"
          aria-label="Your own answer"
          className="mt-1 h-9 bg-transparent"
        />
      </div>
      <div className="flex items-center justify-end border-t border-hairline px-3 py-2.5">
        <Button type="submit" size="sm" disabled={!value || disabled}>
          Answer
        </Button>
      </div>
    </form>
  );
}
