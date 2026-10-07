"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * Types example game prompts in steps, like a terminal, then erases them.
 * Shows what GameSmith does without a word of marketing copy.
 * Decorative: hidden from assistive tech (the list is exposed as text below).
 */
const PROMPTS = [
  "A knight crossing floating islands, collecting crystals before sunset.",
  "Low-poly racing through a neon canyon at night.",
  "A lighthouse keeper holding the coast against fog creatures.",
  "A cozy farm on the back of a giant sleeping turtle.",
  "Dodge meteors in a tiny ship with one-button controls.",
];

const TYPE_MS = 34;
const ERASE_MS = 14;
const HOLD_MS = 2600;

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia(MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false,
  );
}

export function PromptTicker({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<"type" | "hold" | "erase">("type");

  useEffect(() => {
    const prompt = PROMPTS[index];

    // Reduced motion: show whole prompts, rotate slowly, no typing.
    if (reduce) {
      const t = setTimeout(() => setIndex((i) => (i + 1) % PROMPTS.length), 5000);
      return () => clearTimeout(t);
    }

    let t: ReturnType<typeof setTimeout>;
    if (phase === "type") {
      if (count < prompt.length) t = setTimeout(() => setCount((c) => c + 1), TYPE_MS);
      else t = setTimeout(() => setPhase("hold"), 0);
    } else if (phase === "hold") {
      t = setTimeout(() => setPhase("erase"), HOLD_MS);
    } else if (count > 0) {
      t = setTimeout(() => setCount((c) => c - 1), ERASE_MS);
    } else {
      t = setTimeout(() => {
        setIndex((i) => (i + 1) % PROMPTS.length);
        setPhase("type");
      }, 240);
    }
    return () => clearTimeout(t);
  }, [index, count, phase, reduce]);

  const text = reduce ? PROMPTS[index] : PROMPTS[index].slice(0, count);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <span className="label-pixel text-muted-foreground">Try describing</span>
      <p aria-hidden className="min-h-[3.4em] font-display text-display-sm text-foreground italic">
        &ldquo;{text}
        <span className="ml-0.5 inline-block h-[0.8em] w-[0.45em] translate-y-[0.08em] animate-caret bg-ember align-baseline" />
      </p>
      <ul className="sr-only">
        {PROMPTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
