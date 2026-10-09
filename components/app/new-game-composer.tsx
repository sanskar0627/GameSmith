"use client";

import { useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";

const IDEAS = ["Floating islands", "Neon canyon racer", "Lighthouse vs fog", "Turtle-back farm"];
const IDEA_PROMPTS: Record<string, string> = {
  "Floating islands": "A knight crossing floating islands, collecting crystals before sunset.",
  "Neon canyon racer": "Low-poly racing through a neon canyon at night.",
  "Lighthouse vs fog": "A lighthouse keeper holding the coast against fog creatures.",
  "Turtle-back farm": "A cozy farm on the back of a giant sleeping turtle.",
};

/**
 * First-prompt composer. The agent hookup (creating the game, streaming the
 * build) lands in the workspace stage; for now submit explains that.
 */
export function NewGameComposer({ initialPrompt = "" }: { initialPrompt?: string }) {
  const [value, setValue] = useState(initialPrompt);
  const [notice, setNotice] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const empty = value.trim().length === 0;

  const submit = () => {
    if (empty) return;
    setNotice(true);
  };

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="rounded-xl border border-border bg-card p-2 shadow-float transition-colors focus-within:border-ember/60"
      >
        <label htmlFor="prompt" className="sr-only">
          Describe your game
        </label>
        <Textarea
          id="prompt"
          ref={ref}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setNotice(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          autoFocus
          placeholder="A knight crossing floating islands, collecting crystals before the sun sets…"
          className="min-h-24 resize-none border-0 bg-transparent px-2.5 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>Enter</Kbd>
            <span className="ml-1">to forge</span>
          </span>
          <Button type="submit" variant="ember" size="sm" disabled={empty} className="ml-auto">
            Forge <ArrowUp data-icon="inline-end" />
          </Button>
        </div>
      </form>

      {notice ? (
        <p role="status" className="mt-3 text-center text-[13px] text-muted-foreground">
          The forge isn&rsquo;t wired up yet. Building starts in the next update.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => {
                setValue(IDEA_PROMPTS[idea]);
                ref.current?.focus();
              }}
              className="rounded-sm border border-border bg-transparent px-2.5 py-1 text-[13px] text-muted-foreground transition-colors hover:border-ember/50 hover:text-foreground"
            >
              {idea}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
