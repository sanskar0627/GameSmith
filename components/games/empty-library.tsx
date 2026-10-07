import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Spark } from "@/components/brand/spark";
import { DitherField } from "@/components/dither/dither-field";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STARTERS = [
  {
    tag: "Adventure",
    prompt:
      "A knight crossing floating islands, collecting crystals before sunset.",
  },
  { tag: "Racing", prompt: "Low-poly racing through a neon canyon at night." },
  {
    tag: "Arcade",
    prompt: "Dodge meteors in a tiny ship with one-button controls.",
  },
];

/** First-run library: no games yet. */
export function EmptyLibrary() {
  return (
    <>
      <div className="relative flex flex-1 flex-col">
        <section className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-4 pt-[12vh] pb-16 text-center">
          <Spark size={28} />
          <h2 className="mt-5 font-display text-display-md sm:text-display-lg">
            Nothing forged yet.
          </h2>
          <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            Describe one sentence of a world. GameSmith designs it, builds it,
            and hands you something to play.
          </p>
          <Link
            href="/new"
            className={cn(
              buttonVariants({ variant: "ember", size: "lg" }),
              "mt-7",
            )}
          >
            Forge your first game
          </Link>

          <div className="mt-14 w-full">
            <p className="label-pixel mb-3 text-left text-muted-foreground">
              Or start from an idea
            </p>
            <ul className="grid gap-3 sm:grid-cols-3">
              {STARTERS.map((s) => (
                <li key={s.prompt}>
                  <Link
                    href={{ pathname: "/new", query: { prompt: s.prompt } }}
                    className="group flex h-full flex-col justify-between gap-6 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-ember/50"
                  >
                    <span className="flex items-center justify-between">
                      <span className="label-pixel text-ember-text">
                        {s.tag}
                      </span>
                      <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-ember-text" />
                    </span>
                    <span className="font-display text-xl leading-snug italic">
                      &ldquo;{s.prompt}&rdquo;
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
        >
          <DitherField
            scene="clouds"
            pixel={3}
            seed={8}
            palette={["transparent", "--dither-mid"]}
            bias={-0.18}
          />
        </div>
      </div>
    </>
  );
}
