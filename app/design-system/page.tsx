import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowUp, Gamepad2, Plus, TriangleAlert } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { Spark } from "@/components/brand/spark";
import { DitherProgress, PixelLoader } from "@/components/brand/pixel-loader";
import { DitherField } from "@/components/dither/dither-field";
import { DitherImage } from "@/components/dither/dither-image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Living style guide for the GameSmith design system (Stage 1).
 * Internal: hidden in production builds.
 */
export const metadata: Metadata = { title: "Design system · GameSmith" };

const BONE = [
  ["50", "#fcfaf5"],
  ["100", "#f8f4ea", "Paper"],
  ["200", "#efe9dc"],
  ["300", "#e2dacb", "Border"],
  ["400", "#c9c0ae"],
  ["500", "#9a958a", "Muted, night"],
  ["600", "#6b6862", "Muted, paper"],
  ["700", "#45433f"],
  ["800", "#2a2926"],
  ["900", "#1c1b19", "Ink"],
  ["950", "#121110", "Night"],
] as const;

const EMBER = [
  ["50", "#fdf1ea"],
  ["100", "#fbe1d3", "Soft"],
  ["200", "#f6c2a7"],
  ["300", "#f09f7b"],
  ["400", "#ea8158", "Hover"],
  ["500", "#e4663a", "Ember"],
  ["600", "#ce5226"],
  ["700", "#b83f16", "Text on paper"],
  ["800", "#8f3112", "Key shadow"],
  ["900", "#66240e"],
] as const;

const SCENES = [
  { scene: "horizon", title: "Horizon", use: "Auth, landing, onboarding", palette: ["--dither-ink", "--ember", "--dither-paper"] },
  { scene: "sun", title: "Ember sun", use: "Hero moments, success", palette: ["--dither-paper", "--ember"] },
  { scene: "clouds", title: "Cloud bank", use: "Empty states, backdrops", palette: ["--dither-paper", "--dither-mid"] },
  { scene: "forge", title: "Forge", use: "Building a game (animated)", palette: ["--dither-ink", "--color-ember-800", "--ember", "--color-ember-200"], animated: true },
  { scene: "glow", title: "Glow", use: "Focus halos, preview idle", palette: ["--dither-ink", "--ember"] },
  { scene: "fade", title: "Fade", use: "Dissolving edges", palette: ["transparent", "--dither-ink"] },
] as const;

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="flex-1 bg-background">
      <Hero />
      <div className="mx-auto flex max-w-6xl flex-col gap-28 px-4 py-24 sm:px-8">
        <Section index="01" title="Brand" lede="One mark, one glyph, one accent. The spark is the dot of the i, and it marks every AI moment.">
          <BrandSection />
        </Section>
        <Section index="02" title="Color" lede="A single warm ramp from bone to ink, and ember. Hierarchy comes from tone and texture, never from extra hues.">
          <ColorSection />
        </Section>
        <Section index="03" title="Typography" lede="Editorial serif for voice, Geist for work, mono for the machine, pixel for labels.">
          <TypeSection />
        </Section>
        <Section index="04" title="Space & shape" lede="4px grid. Crisp radii. Hairlines over boxes. Depth comes from a hard key shadow, not blur.">
          <ShapeSection />
        </Section>
        <Section index="05" title="Dither" lede="The identity is the dither. Procedural scenes replace stock imagery; ordered masks texture fills, edges and progress.">
          <DitherSection />
        </Section>
        <Section index="06" title="Controls" lede="Ink is the default action. Ember is the forge action, one per view.">
          <ControlsSection />
        </Section>
        <Section index="07" title="States" lede="Waiting should feel like the forge is working: stepped, pixel, never a generic spinner.">
          <StatesSection />
        </Section>
        <Section index="08" title="Night" lede="The same system after dark. Every token flips; nothing is redesigned.">
          <NightSection />
        </Section>
      </div>
      <footer className="dark relative h-72 overflow-hidden bg-background">
        <DitherField scene="horizon" seed={3} pixel={3} palette={["--dither-ink", "--dither-mid", "--dither-paper"]} />
        <div className="absolute inset-x-0 top-10 flex flex-col items-center gap-3">
          <Wordmark height={15} className="text-foreground" />
          <span className="label-pixel text-muted-foreground">Design system v0.1</span>
        </div>
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="dark relative isolate h-[min(78vh,720px)] min-h-[520px] overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 -z-10">
        <DitherField scene="horizon" pixel={3} seed={11} palette={["--dither-ink", "--color-ember-900", "--ember", "--color-ember-200"]} />
      </div>
      <div className="mx-auto flex h-full max-w-6xl flex-col px-4 py-10 sm:px-8 sm:py-12">
        <div className="flex items-center justify-between">
          <Wordmark height={30} className="text-foreground" />
          <span className="label-pixel text-muted-foreground">Design system · v0.1</span>
        </div>
        <div className="mt-[8vh] max-w-3xl">
          <p className="label-pixel mb-5 flex items-center gap-2 text-ember-text">
            <Spark size={14} twinkle /> Stage 01 · Visual language
          </p>
          <h1 className="font-display text-display-xl text-foreground sm:text-display-2xl">
            Describe a world. <em className="text-ember">We&rsquo;ll forge it.</em>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-bone-400">
            Ember on bone. Ordered dither as texture, not decoration. A creative tool with the quiet of an editorial page and the
            pulse of a game.
          </p>
        </div>
      </div>
    </section>
  );
}

function Section({ index, title, lede, children }: { index: string; title: string; lede: string; children: ReactNode }) {
  return (
    <section className="grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-16">
      <header className="lg:sticky lg:top-24 lg:self-start">
        <span className="label-pixel text-ember-text">{index}</span>
        <h2 className="mt-3 font-display text-display-md">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{lede}</p>
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Panel({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      {label && (
        <div className="border-b border-hairline px-4 py-2.5">
          <span className="label-pixel text-muted-foreground">{label}</span>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

/* --- 01 Brand ------------------------------------------------------------ */

function BrandSection() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel label="Wordmark · duo" className="md:col-span-2">
        <div className="flex flex-wrap items-end gap-x-12 gap-y-8 py-4">
          <Wordmark height={60} />
          <Wordmark height={30} />
          <Wordmark height={15} />
        </div>
      </Panel>
      <Panel label="Wordmark · mono">
        <div className="flex flex-col gap-5">
          <Wordmark height={30} tone="mono" />
          <div className="rounded-md bg-ember px-4 py-3">
            <Wordmark height={30} tone="mono" className="text-ink" />
          </div>
        </div>
      </Panel>
      <Panel label="Spark">
        <div className="flex items-center gap-6">
          <Spark size={56} />
          <Spark size={28} />
          <Spark size={14} />
          <Spark size={28} twinkle className="text-foreground" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Draw at multiples of 7px. Ember marks the agent; ink when it is a static ornament.
        </p>
      </Panel>
      <Panel label="Source · logo.png dithered" className="md:col-span-2">
        <div className="grid gap-4 sm:grid-cols-3">
          <DitherImage src="/logo.png" alt="GameSmith logo" className="aspect-square rounded-md border border-hairline" pixel={2} />
          <DitherImage src="/logo.png" alt="GameSmith logo, ink dither" className="aspect-square rounded-md border border-hairline" palette={["--dither-ink", "--dither-paper"]} pixel={3} />
          <div className="group relative aspect-square">
            <DitherImage src="/logo.png" alt="GameSmith logo, hover to reveal" className="size-full rounded-md border border-hairline" palette={["--color-ember-900", "--ember", "--color-ember-100"]} pixel={4} reveal />
            <span className="label-pixel absolute bottom-3 left-3 rounded-sm bg-background/90 px-1.5 py-1 text-muted-foreground">Hover: reveal</span>
          </div>
        </div>
        <p className="mt-4 max-w-xl text-sm text-muted-foreground">
          Every generated game gets a dithered thumbnail in the same palette, so a grid of wildly different games still reads
          as one library. The real image reveals on hover.
        </p>
      </Panel>
      <Panel label="Principles" className="md:col-span-2">
        <ol className="grid gap-x-10 gap-y-4 text-sm sm:grid-cols-2">
          {[
            ["Texture over hue", "One accent. Depth and emphasis come from dither density and tone."],
            ["Editorial calm", "Generous space, serif voice, few borders. The game is the loudest thing on screen."],
            ["Stepped motion", "Animations move in steps like sprites. No floaty easing on brand moments."],
            ["Ember means agency", "Ember marks the forge action and the agent. If everything is ember, nothing is."],
            ["Real pixels", "Pixel art is drawn on a grid and scaled by integers. Never blur a pixel."],
            ["Quiet chrome", "Hairlines, not boxes. Panels recede so conversation and preview lead."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="label-pixel mt-0.5 text-ember-text">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <span className="font-medium">{t}.</span> <span className="text-muted-foreground">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

/* --- 02 Color ------------------------------------------------------------ */

function Ramp({ name, steps }: { name: string; steps: readonly (readonly string[])[] }) {
  return (
    <div>
      <span className="label-pixel text-muted-foreground">{name}</span>
      <div className="mt-3 grid grid-cols-5 gap-px overflow-hidden rounded-md border border-border sm:grid-cols-11">
        {steps.map(([step, hex, role]) => (
          <div key={step} className="flex flex-col">
            <div className="h-16" style={{ background: hex }} />
            <div className="flex flex-col gap-0.5 bg-card px-2 py-2">
              <span className="font-mono text-[11px]">{step}</span>
              <span className="font-mono text-[10px] text-muted-foreground uppercase">{hex.slice(1)}</span>
              {role && <span className="text-[10px] leading-tight text-ember-text">{role}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColorSection() {
  const tokens = [
    ["background", "bg-background"],
    ["surface", "bg-surface"],
    ["card", "bg-card"],
    ["muted", "bg-muted"],
    ["primary", "bg-primary"],
    ["ember", "bg-ember"],
    ["ember-soft", "bg-ember-soft"],
    ["destructive", "bg-destructive"],
  ] as const;
  return (
    <div className="flex flex-col gap-10">
      <Ramp name="Bone → Ink" steps={BONE} />
      <Ramp name="Ember" steps={EMBER} />
      <div className="grid gap-4 md:grid-cols-2">
        {["", "dark"].map((mode) => (
          <div key={mode || "paper"} className={cn(mode, "rounded-lg border border-border bg-background p-5 text-foreground")}>
            <span className="label-pixel text-muted-foreground">{mode ? "Night tokens" : "Paper tokens"}</span>
            <div className="mt-4 grid grid-cols-4 gap-3">
              {tokens.map(([name, cls]) => (
                <div key={name} className="flex flex-col gap-1.5">
                  <div className={cn("h-10 rounded-sm border border-hairline", cls)} />
                  <span className="font-mono text-[10px] text-muted-foreground">{name}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-1 border-t border-hairline pt-4 text-sm">
              <span>Foreground text</span>
              <span className="text-muted-foreground">Muted text, AA on both themes</span>
              <span className="text-ember-text">Ember text, links and agent names</span>
            </div>
          </div>
        ))}
      </div>
      <Panel label="Contrast pairs (WCAG)">
        <ul className="grid gap-2 font-mono text-xs sm:grid-cols-2">
          {[
            ["Ink on paper", "15.7 : 1"],
            ["Ink on ember (buttons)", "5.1 : 1"],
            ["Ember-700 text on paper", "5.1 : 1"],
            ["Muted-600 on paper", "5.1 : 1"],
            ["Ember on night", "5.6 : 1"],
            ["Muted-500 on night", "6.3 : 1"],
          ].map(([k, v]) => (
            <li key={k} className="flex justify-between border-b border-hairline py-1.5">
              <span className="text-muted-foreground">{k}</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Pure ember on paper is 3.1 : 1. Use it for display type and fills, never body text.</p>
      </Panel>
    </div>
  );
}

/* --- 03 Type ------------------------------------------------------------- */

function TypeSection() {
  const scale = [
    ["display-2xl", "72 / 0.95", "text-display-2xl"],
    ["display-xl", "56 / 1.0", "text-display-xl"],
    ["display-lg", "44 / 1.05", "text-display-lg"],
    ["display-md", "34 / 1.1", "text-display-md"],
    ["display-sm", "26 / 1.15", "text-display-sm"],
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <Panel label="Display · Instrument Serif">
        <div className="flex flex-col gap-5">
          {scale.map(([name, metric, cls]) => (
            <div key={name} className="flex items-baseline gap-6 border-b border-hairline pb-4 last:border-0 last:pb-0">
              <span className="w-24 shrink-0 font-mono text-[11px] text-muted-foreground">
                {name}
                <br />
                {metric}
              </span>
              <span className={cn("font-display truncate", cls)}>
                Floating islands <em className="text-ember-text">at dusk</em>
              </span>
            </div>
          ))}
        </div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-3">
        <Panel label="UI · Geist Sans">
          <p className="text-xl font-semibold tracking-tight">Make the enemies faster</p>
          <p className="mt-2 text-[15px] leading-relaxed">Body 15/1.55. Used for chat, settings and every working surface.</p>
          <p className="mt-2 text-[13px] text-muted-foreground">Small 13. Metadata, helper text, timestamps.</p>
        </Panel>
        <Panel label="Machine · Geist Mono">
          <pre className="font-mono text-[12.5px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">write_file</span> src/game/enemies.ts{"\n"}
            <span className="text-ember-text">replace_text</span> speed: 2 → 3.4{"\n"}
            <span className="text-foreground">read_file</span> src/main.ts
          </pre>
          <p className="mt-3 text-[13px] text-muted-foreground">Tool calls, files, code, errors.</p>
        </Panel>
        <Panel label="Labels · Geist Pixel">
          <div className="flex flex-col gap-3">
            <span className="label-pixel">Now forging</span>
            <span className="label-pixel text-ember-text">Level 03 · Night</span>
            <span className="font-pixel text-3xl tabular-nums">1,280</span>
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">Eyebrows, chips, keys, counters. Never sentences.</p>
        </Panel>
      </div>
    </div>
  );
}

/* --- 04 Space & shape ---------------------------------------------------- */

function ShapeSection() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel label="Spacing · 4px base">
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 6, 8, 12, 16, 24].map((n) => (
            <div key={n} className="flex items-center gap-4">
              <span className="w-10 font-mono text-[11px] text-muted-foreground">{n * 4}px</span>
              <div className="h-2 bg-ember" style={{ width: n * 4 }} />
            </div>
          ))}
        </div>
      </Panel>
      <Panel label="Radii · crisp">
        <div className="grid grid-cols-3 gap-4">
          {[
            ["sm", "rounded-sm", "chips"],
            ["md", "rounded-md", "buttons"],
            ["lg", "rounded-lg", "panels"],
            ["xl", "rounded-xl", "composer"],
            ["2xl", "rounded-2xl", "preview"],
            ["none", "rounded-none", "pixel art"],
          ].map(([n, cls, use]) => (
            <div key={n} className="flex flex-col gap-2">
              <div className={cn("h-14 border border-border bg-muted", cls)} />
              <span className="font-mono text-[11px] text-muted-foreground">
                {n} · {use}
              </span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel label="Edges & depth" className="md:col-span-2">
        <div className="grid gap-6 sm:grid-cols-4">
          <div className="flex flex-col gap-2">
            <div className="h-16 rounded-md border border-hairline bg-card" />
            <span className="font-mono text-[11px] text-muted-foreground">hairline · dividers</span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-16 rounded-md border border-border bg-card" />
            <span className="font-mono text-[11px] text-muted-foreground">border · panels</span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-16 rounded-md bg-ember shadow-key" />
            <span className="font-mono text-[11px] text-muted-foreground">shadow-key · press</span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-16 rounded-md bg-popover shadow-float" />
            <span className="font-mono text-[11px] text-muted-foreground">shadow-float · menus</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* --- 05 Dither ----------------------------------------------------------- */

function DitherSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SCENES.map((s) => (
          <figure key={s.scene} className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="h-40 bg-background">
              <DitherField
                scene={s.scene}
                palette={[...s.palette]}
                pixel={3}
                animated={"animated" in s && s.animated}
                seed={5}
              />
            </div>
            <figcaption className="flex items-baseline justify-between gap-3 border-t border-hairline px-4 py-3">
              <span className="text-sm font-medium">{s.title}</span>
              <span className="text-right text-[12px] text-muted-foreground">{s.use}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel label="Ordered masks · dither-12 / 25 / 50 / 75">
          <div className="grid grid-cols-4 gap-3">
            {["dither-12", "dither-25", "dither-50", "dither-75"].map((d) => (
              <div key={d} className="flex flex-col gap-2">
                <div className={cn("h-20 rounded-sm bg-ember", d)} />
                <span className="font-mono text-[11px] text-muted-foreground">{d}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex h-8 overflow-hidden rounded-sm">
            <div className="flex-1 bg-ink" />
            <div className="flex-1 bg-ink dither-75" />
            <div className="flex-1 bg-ink dither-50" />
            <div className="flex-1 bg-ink dither-25" />
            <div className="flex-1 bg-ink dither-12" />
            <div className="flex-1" />
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">
            Masks take the element&rsquo;s own background. Step them to dissolve an edge instead of a soft gradient.
          </p>
        </Panel>
        <Panel label="Halftone & grain">
          <div className="grid grid-cols-2 gap-3">
            <div className="h-28 rounded-sm bg-halftone text-ember" />
            <div className="grain h-28 rounded-sm bg-surface [--grain-opacity:0.18]" />
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">
            Halftone in currentColor for logo-like skies. Grain on large paper surfaces only, at 6 to 10 percent.
          </p>
        </Panel>
      </div>
      <Panel label="Rules">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li>One dither field per view. It is atmosphere, not wallpaper.</li>
          <li>Dither pixel is 2 to 4 CSS px. Larger reads as retro, smaller as noise.</li>
          <li>Palettes come from tokens, so fields follow the theme.</li>
          <li>Animate only while the agent works. Respect reduced motion.</li>
          <li>Never put body text directly on a dense field. Use a solid scrim.</li>
          <li>Thumbnails dither; the live game preview never does.</li>
        </ul>
      </Panel>
    </div>
  );
}

/* --- 06 Controls --------------------------------------------------------- */

function ControlsSection() {
  return (
    <div className="flex flex-col gap-4">
      <Panel label="Buttons">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ember">
              Forge game <ArrowRight data-icon="inline-end" />
            </Button>
            <Button>Continue</Button>
            <Button variant="outline">Duplicate</Button>
            <Button variant="secondary">Share</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="link">View files</Button>
            <Button variant="destructive">Delete game</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ember" size="lg">
              <Spark size={14} className="text-ink" /> Forge
            </Button>
            <Button size="lg">Large</Button>
            <Button>Default</Button>
            <Button size="sm">Small</Button>
            <Button size="xs">XS</Button>
            <Button size="icon" variant="outline" aria-label="New game">
              <Plus />
            </Button>
            <Button size="icon" variant="ember" aria-label="Send">
              <ArrowUp />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ember" disabled>
              <PixelLoader size="sm" className="text-ink" /> Forging
            </Button>
            <Button disabled>Disabled</Button>
            <Button variant="outline" disabled>
              Disabled
            </Button>
          </div>
        </div>
        <p className="mt-5 text-[13px] text-muted-foreground">
          Ember presses down 2px onto its key shadow. Ink darkens on hover. Focus is a 2px ember ring offset by 2px.
        </p>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel label="Inputs">
          <div className="flex flex-col gap-3">
            <Input placeholder="Game title" />
            <Input placeholder="Invalid" aria-invalid defaultValue="???" />
            <Input placeholder="Disabled" disabled />
          </div>
        </Panel>
        <Panel label="Badges & keys">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="pixel">Draft</Badge>
            <Badge variant="pixel" className="border-ember/40 text-ember-text">
              Building
            </Badge>
            <Badge variant="ember">3D · Adventure</Badge>
            <Badge>Live</Badge>
            <Badge variant="outline">v12</Badge>
            <Badge variant="destructive">Error</Badge>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Kbd>⌘</Kbd>
            <Kbd>Enter</Kbd>
            <span className="ml-1">to forge</span>
            <span className="mx-2 text-border">/</span>
            <Kbd>W</Kbd>
            <Kbd>A</Kbd>
            <Kbd>S</Kbd>
            <Kbd>D</Kbd>
          </div>
        </Panel>
      </div>
      <Panel label="Composer preview (full design in Stage 4)">
        <div className="rounded-xl border border-border bg-card p-2 shadow-float focus-within:border-ember/60">
          <Textarea
            placeholder="Describe a game… a knight crossing floating islands, collecting crystals before the sun sets."
            className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-1">
              <Button size="icon-sm" variant="ghost" aria-label="Attach">
                <Plus />
              </Button>
              <Badge variant="pixel">
                <Gamepad2 /> three.js
              </Badge>
            </div>
            <Button variant="ember" size="sm">
              Forge <ArrowUp data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* --- 07 States ----------------------------------------------------------- */

function StatesSection() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel label="Loading">
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-6">
            <PixelLoader size="sm" />
            <PixelLoader />
            <PixelLoader size="lg" />
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spark size={14} twinkle /> Thinking
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="label-pixel text-muted-foreground">Compiling scene · 64%</span>
            <DitherProgress value={64} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="label-pixel text-muted-foreground">Starting sandbox</span>
            <DitherProgress />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      </Panel>
      <Panel label="Agent working (preview area)">
        <div className="relative h-56 overflow-hidden rounded-lg bg-night">
          <DitherField scene="forge" animated pixel={4} palette={["--color-night", "--color-ember-900", "--ember", "--color-ember-200"]} />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-night/85 px-4 py-3 text-bone">
            <span className="flex items-center gap-2 text-sm">
              <Spark size={14} twinkle /> Forging your world
            </span>
            <span className="label-pixel text-bone-500">Step 3 / 5</span>
          </div>
        </div>
      </Panel>
      <Panel label="Empty">
        <div className="relative flex h-64 flex-col items-center justify-start overflow-hidden rounded-lg border border-dashed border-border pt-7 text-center">
          <div className="absolute inset-x-0 bottom-0 h-14">
            <DitherField scene="clouds" pixel={3} palette={["transparent", "--dither-mid"]} seed={2} bias={-0.1} />
          </div>
          <Spark size={28} className="relative" />
          <p className="relative mt-4 font-display text-display-sm">No games yet</p>
          <p className="relative mt-1 max-w-xs text-sm text-muted-foreground">Describe one sentence of a world and the forge does the rest.</p>
          <Button variant="ember" size="sm" className="relative mt-5">
            Forge your first game
          </Button>
        </div>
      </Panel>
      <Panel label="Error">
        <div className="flex h-64 flex-col justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-5">
          <div>
            <span className="label-pixel flex items-center gap-2 text-destructive">
              <TriangleAlert className="size-3.5" /> Runtime error
            </span>
            <p className="mt-3 font-display text-display-sm">The game crashed on load.</p>
            <pre className="mt-3 overflow-x-auto rounded-sm bg-background/70 p-3 font-mono text-[12px] text-muted-foreground">
              TypeError: player.mesh is undefined{"\n"}  at update (src/game/player.ts:42)
            </pre>
          </div>
          <div className="flex gap-2">
            <Button variant="ember" size="sm">
              <Spark size={12} className="text-ink" /> Ask the agent to fix
            </Button>
            <Button variant="ghost" size="sm">
              View file
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* --- 08 Night ------------------------------------------------------------ */

function NightSection() {
  return (
    <div className="dark overflow-hidden rounded-xl border border-border bg-background text-foreground">
      <div className="relative h-40">
        <DitherField scene="sun" pixel={3} seed={9} palette={["--color-night", "--color-ember-900", "--ember"]} />
      </div>
      <div className="grid gap-8 p-6 md:grid-cols-2">
        <div>
          <span className="label-pixel text-ember-text">Night · tokens flip</span>
          <p className="mt-3 font-display text-display-md">
            The forge, <em className="text-ember">after dark.</em>
          </p>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Night is for the workspace, where the game preview needs a dark frame. Paper is for reading, auth and settings.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Input placeholder="Make the castle more mysterious" />
          <div className="flex flex-wrap gap-2">
            <Button variant="ember">
              Forge <ArrowUp data-icon="inline-end" />
            </Button>
            <Button>Continue</Button>
            <Button variant="outline">Duplicate</Button>
            <Button variant="ghost">Cancel</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="pixel">Draft</Badge>
            <Badge variant="ember">3D · Adventure</Badge>
            <PixelLoader className="ml-2" />
          </div>
          <DitherProgress value={38} />
        </div>
      </div>
    </div>
  );
}
