import type { ReactNode } from "react";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { ArrowUp, Check, Code2, History, Share2 } from "lucide-react";
import { Spark } from "@/components/brand/spark";
import { Wordmark } from "@/components/brand/wordmark";
import { DitherField } from "@/components/dither/dither-field";
import { GameCover } from "@/components/games/game-cover";
import { GameStatusChip } from "@/components/games/game-status";
import { AuthCta } from "@/components/landing/auth-cta";
import { Kbd } from "@/components/ui/kbd";
import { DEMO_FILES, DEMO_GAMES } from "@/lib/games/mock";

const NIGHT_PALETTE = ["--dither-ink", "--color-ember-900", "--ember", "--color-ember-200"];

export default async function Home() {
  const user = await currentUser();
  // TODO(data): featured public games.
  const showcase = DEMO_GAMES.filter((g) => g.visibility === "link").slice(0, 3);
  const snippet = DEMO_FILES[0].content.split("\n").slice(6, 23).join("\n");

  return (
    <main id="main" className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="dark relative isolate overflow-hidden bg-background text-foreground">
        <div className="absolute inset-0 -z-10">
          <DitherField scene="dawn" seed={4} pixel={3} palette={NIGHT_PALETTE} />
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 pt-[12vh] pb-[56vh] sm:px-8">
          <p className="label-pixel mb-5 flex items-center gap-2 text-ember-text">
            <Spark size={14} /> {user ? `Welcome back${user.firstName ? `, ${user.firstName}` : ""}` : "AI game forge"}
          </p>
          <h1 className="max-w-3xl font-display text-display-lg text-foreground sm:text-display-2xl">
            Describe a world. <em className="text-ember">We&rsquo;ll forge it.</em>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-bone-400">
            Type an idea. GameSmith designs it, builds it in real code, and hands you a playable 3D game you can keep shaping in
            conversation.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <AuthCta />
            <a href="#how" className="text-sm text-bone-400 underline-offset-4 transition-colors hover:text-foreground hover:underline">
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-16 border-b border-hairline">
        <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-8">
          <p className="label-pixel text-ember-text">How it works</p>
          <h2 className="mt-3 max-w-xl font-display text-display-md sm:text-display-lg">From one sentence to something you can play.</h2>
          <ol className="mt-12 grid gap-6 lg:grid-cols-3">
            <Step n={1} title="Describe" body="The world, the goal, what makes it hard. One sentence is enough to start.">
              <div className="rounded-lg border border-border bg-card p-3 shadow-float">
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  A knight crossing floating islands, collecting crystals before the sun sets.
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Kbd>Enter</Kbd> to forge
                  </span>
                  <span className="grid size-7 place-items-center rounded-md bg-ember text-ember-foreground shadow-key">
                    <ArrowUp className="size-4" />
                  </span>
                </div>
              </div>
            </Step>
            <Step n={2} title="Shape" body="Smith asks what matters, then shows you a plan before writing a line of code.">
              <div className="rounded-lg border border-border bg-card p-3 shadow-float">
                <span className="label-pixel flex items-center gap-1.5 text-ember-text">
                  <Spark size={7} /> Game brief
                </span>
                <p className="mt-1.5 font-display text-xl">Floating Islands</p>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <dt className="label-pixel text-muted-foreground">Goal</dt>
                    <dd className="mt-0.5">Reach the castle by sunset</dd>
                  </div>
                  <div>
                    <dt className="label-pixel text-muted-foreground">Feel</dt>
                    <dd className="mt-0.5">Calm, tense jumps</dd>
                  </div>
                </dl>
              </div>
            </Step>
            <Step n={3} title="Play and iterate" body="Play it in the browser. Ask for changes. Every build is a version you can roll back.">
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-float">
                <div className="relative aspect-[16/8]">
                  <GameCover title="Floating Islands" seed={10} className="absolute inset-0" />
                  <GameStatusChip status="ready" version={3} className="absolute top-2 left-2" />
                </div>
                <p className="px-3 py-2.5 text-[12px] text-muted-foreground">&ldquo;Make the sentinels faster&rdquo; → v3</p>
              </div>
            </Step>
          </ol>
        </div>
      </section>

      {/* Real code */}
      <section className="border-b border-hairline bg-surface">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-24 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center">
          <div>
            <p className="label-pixel text-ember-text">Not a demo reel</p>
            <h2 className="mt-3 font-display text-display-md sm:text-display-lg">Real code you own.</h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              Every game is a real three.js project built on a shared runtime. Smith edits the files you can read, so changes
              are targeted, not regenerated from scratch.
            </p>
            <ul className="mt-8 flex flex-col gap-4 text-sm">
              {[
                { icon: History, title: "Versions", body: "Every build is saved. Restore any of them." },
                { icon: Code2, title: "Files", body: "Browse the exact source behind every version." },
                { icon: Share2, title: "Share", body: "Send a link. Friends play; your chat stays private." },
              ].map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-card">
                    <Icon className="size-4 text-ember-text" />
                  </span>
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="text-muted-foreground">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <figure className="overflow-hidden rounded-xl border border-border bg-card shadow-float">
            <figcaption className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
              <span className="font-mono text-[12.5px]">src/main.ts</span>
              <span className="label-pixel ml-auto text-muted-foreground">Written by Smith</span>
            </figcaption>
            <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7] text-foreground">
              <code>{snippet}</code>
            </pre>
          </figure>
        </div>
      </section>

      {/* Showcase */}
      {showcase.length > 0 && (
        <section className="border-b border-hairline">
          <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="label-pixel text-ember-text">Forged with GameSmith</p>
                <h2 className="mt-3 font-display text-display-md sm:text-display-lg">Play a few.</h2>
              </div>
              <p className="max-w-xs text-sm text-muted-foreground">Each one started as a single sentence.</p>
            </div>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {showcase.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/play/${g.id}`}
                    className="group block overflow-hidden rounded-xl border border-border bg-card transition-[border-color,translate] duration-200 ease-forge hover:-translate-y-0.5 hover:border-foreground/20"
                  >
                    <GameCover title={g.title} seed={g.coverSeed} className="aspect-[16/10]" />
                    <div className="px-4 py-3.5">
                      <p className="flex items-center justify-between font-medium">
                        {g.title}
                        <span className="text-[13px] text-ember-text opacity-0 transition-opacity group-hover:opacity-100">Play →</span>
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{g.pitch}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Closing CTA + footer */}
      <section className="dark relative isolate overflow-hidden bg-background text-foreground">
        <div className="absolute inset-0 -z-10">
          <DitherField scene="horizon" seed={3} pixel={3} palette={["--dither-ink", "--dither-mid", "--dither-paper"]} />
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 pt-24 pb-[30vh] text-center sm:px-8">
          <h2 className="mx-auto max-w-2xl font-display text-display-md sm:text-display-xl">
            Your first world is <em className="text-ember">one sentence away.</em>
          </h2>
          <ul className="mx-auto mt-6 flex max-w-md flex-wrap justify-center gap-x-5 gap-y-2 text-[13px] text-bone-400">
            {["Free to start", "No game engine required", "Runs in the browser"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="size-3.5 text-ember" /> {t}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex justify-center">
            <AuthCta />
          </div>
        </div>
        <footer className="border-t border-white/10 bg-night/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-8">
            <Wordmark height={15} />
            <span className="label-pixel text-muted-foreground">&copy; {new Date().getFullYear()} GameSmith</span>
          </div>
        </footer>
      </section>
    </main>
  );
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-5 rounded-xl border border-border bg-background p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-sm border border-border font-pixel text-[12px] text-ember-text">
          {n}
        </span>
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>
      </div>
      <div className="mt-auto">{children}</div>
    </li>
  );
}
