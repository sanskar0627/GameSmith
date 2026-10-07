import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { Spark } from "@/components/brand/spark";
import { DitherField } from "@/components/dither/dither-field";
import { PromptTicker } from "./prompt-ticker";

/**
 * Auth layout: a night landscape on the left (the world you are about to
 * forge) and a quiet paper column on the right holding the form.
 * Phones get the landscape as a short band above the form.
 */
type AuthShellProps = {
  variant: "sign-in" | "sign-up";
  children: ReactNode;
};

const COPY = {
  "sign-in": {
    eyebrow: "Welcome back",
    title: (
      <>
        The forge is <em className="text-ember">still warm.</em>
      </>
    ),
    scene: "horizon",
    seed: 11,
  },
  "sign-up": {
    eyebrow: "New world",
    title: (
      <>
        Your first world is <em className="text-ember">one sentence away.</em>
      </>
    ),
    scene: "dawn",
    seed: 4,
  },
} as const;

export function AuthShell({ variant, children }: AuthShellProps) {
  const copy = COPY[variant];

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-1">
      {/* World */}
      <aside className="dark relative isolate flex h-44 flex-col overflow-hidden bg-background p-5 text-foreground sm:h-56 sm:p-8 lg:h-auto lg:min-h-dvh lg:p-12">
        <div className="absolute inset-0 -z-10">
          <DitherField
            scene={copy.scene}
            seed={copy.seed}
            pixel={3}
            palette={["--dither-ink", "--color-ember-900", "--ember", "--color-ember-200"]}
          />
        </div>
        <Link href="/" aria-label="GameSmith home" className="w-fit rounded-sm">
          <Wordmark height={30} className="hidden text-foreground sm:block" />
          <Wordmark height={15} className="text-foreground sm:hidden" />
        </Link>
        <div className="mt-5 max-w-xl sm:mt-8 lg:mt-[9vh] short:lg:mt-[6vh]">
          <p className="label-pixel flex items-center gap-2 text-ember-text lg:mb-4">
            <Spark size={14} /> {copy.eyebrow}
          </p>
          {/* On small screens the form carries the heading; the band is atmosphere. */}
          <h1 className="sr-only font-display text-display-xl text-foreground lg:not-sr-only">{copy.title}</h1>
          <PromptTicker className="mt-8 hidden max-w-md lg:flex short:hidden" />
        </div>
      </aside>

      {/* Form */}
      <main className="grain flex flex-col bg-background px-5 py-8 sm:px-10 lg:py-10">
        <div className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-6">{children}</div>
        <footer className="relative z-10 mx-auto flex w-full max-w-sm items-center justify-between pt-6">
          <span className="label-pixel text-muted-foreground">&copy; {new Date().getFullYear()} GameSmith</span>
          <Link href="/" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            Back home
          </Link>
        </footer>
      </main>
    </div>
  );
}
