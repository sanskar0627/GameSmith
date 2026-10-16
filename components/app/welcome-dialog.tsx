"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Spark } from "@/components/brand/spark";
import { DitherField } from "@/components/dither/dither-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const KEY = "gs-welcomed";

const STEPS = [
  { title: "Describe", body: "One sentence is enough. The world, the goal, what makes it hard." },
  { title: "Shape", body: "Smith asks what matters, then shows you a plan before writing code." },
  { title: "Play and iterate", body: "Every change is a new version. Roll back anytime." },
];

/**
 * First-run welcome. Shown once per browser.
 * TODO(data): store "welcomed" on the user (Clerk metadata) so it is once per account.
 */
export function WelcomeDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // From a timer, not the effect body: a short beat after the shell paints.
    const t = setTimeout(() => {
      try {
        if (!localStorage.getItem(KEY)) setOpen(true);
      } catch {
        /* storage blocked: skip onboarding rather than nag */
      }
    }, 600);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <div className="dark relative h-36 bg-background" aria-hidden>
          <DitherField scene="dawn" seed={4} pixel={3} palette={["--dither-ink", "--color-ember-900", "--ember", "--color-ember-200"]} />
        </div>
        <div className="px-6 pt-5 pb-6">
          <span className="label-pixel flex items-center gap-1.5 text-ember-text">
            <Spark size={7} /> Welcome
          </span>
          <DialogTitle className="mt-2 text-display-md!">Welcome to the forge.</DialogTitle>
          <DialogDescription className="mt-1">Here&rsquo;s how a game gets made here.</DialogDescription>
          <ol className="mt-5 flex flex-col gap-3.5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-sm border border-border font-pixel text-[11px] text-ember-text">
                  {i + 1}
                </span>
                <span className="text-sm">
                  <span className="font-medium">{s.title}.</span> <span className="text-muted-foreground">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Look around first
            </Button>
            <Link href="/new" onClick={close} className={buttonVariants({ variant: "ember" })}>
              Forge your first game
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
