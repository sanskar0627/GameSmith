"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { createGameAction } from "@/lib/server/games/actions";

const IDEAS = [
  "Floating islands",
  "Neon canyon racer",
  "Lighthouse vs fog",
  "Turtle-back farm",
];
const IDEA_PROMPTS: Record<string, string> = {
  "Floating islands":
    "A knight crossing floating islands, collecting crystals before sunset.",
  "Neon canyon racer": "Low-poly racing through a neon canyon at night.",
  "Lighthouse vs fog":
    "A lighthouse keeper holding the coast against fog creatures.",
  "Turtle-back farm": "A cozy farm on the back of a giant sleeping turtle.",
};

/**
 * First-prompt composer. Creates the game (the prompt becomes its first
 * message), then opens its workspace.
 */
export function NewGameComposer({
  initialPrompt = "",
}: {
  initialPrompt?: string;
}) {
  const [value, setValue] = useState(initialPrompt);
  const router = useRouter();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const empty = value.trim().length === 0;

  const submit = () => {
    if (empty || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await createGameAction(value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/g/${result.data.id}`);
    });
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
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          maxLength={2000}
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "prompt-error" : undefined}
          placeholder="A knight crossing floating islands, collecting crystals before the sun sets…"
          className="min-h-24 resize-none border-0 bg-transparent px-2.5 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>Enter</Kbd>
            <span className="ml-1">to forge</span>
          </span>
          <Button
            type="submit"
            variant="ember"
            size="sm"
            disabled={empty || pending}
            className="ml-auto"
          >
            {pending ? "Forging…" : "Forge"} <ArrowUp data-icon="inline-end" />
          </Button>
        </div>
      </form>
      {error && (
        <p id="prompt-error" role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

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
    </div>
  );
}
