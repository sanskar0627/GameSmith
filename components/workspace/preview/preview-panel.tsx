"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { Check, Code2, ExternalLink, Maximize2, MousePointerClick, RotateCw, TriangleAlert } from "lucide-react";
import { PixelLoader, DitherProgress } from "@/components/brand/pixel-loader";
import { Spark } from "@/components/brand/spark";
import { DitherField } from "@/components/dither/dither-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { BuildState, BuildStep, RuntimeError } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";

/**
 * The game stage. Always Night: games read best in a dark frame.
 *
 * Security: the game runs in a sandboxed iframe WITHOUT allow-same-origin,
 * so it gets an opaque origin and can never read GameSmith cookies or
 * storage. For saved games the src is the game's sandbox preview (a private
 * capability URL); the demo build is the fallback when sandboxes aren't
 * running. Runtime errors will arrive via postMessage.
 */
const DEMO_SRC = "/preview-demo.html";

export function PreviewPanel({
  build,
  onFix,
  src,
  editHref,
  onRuntimeError,
  onRecovered,
}: {
  build: BuildState;
  onFix: () => void;
  /** The game's live preview URL. Falls back to the demo build. */
  src?: string;
  /** Where to edit the code by hand (saved games only). */
  editHref?: string;
  /** The game crashed (reported by the sandbox template's error hook). */
  onRuntimeError?: (error: RuntimeError) => void;
  /** A hot update applied cleanly after a crash. */
  onRecovered?: () => void;
}) {
  const frameSrc = src ?? DEMO_SRC;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const handlers = useRef({ onRuntimeError, onRecovered });
  useEffect(() => {
    handlers.current = { onRuntimeError, onRecovered };
  });

  // The sandbox template posts errors to its parent. The iframe has an opaque
  // origin, so the check is on the sender window, never on event.origin.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const data = event.data as { type?: unknown; message?: unknown; stack?: unknown } | null;
      if (data?.type === "gamesmith:error" && typeof data.message === "string") {
        handlers.current.onRuntimeError?.({
          message: data.message.slice(0, 2000),
          stack: typeof data.stack === "string" ? data.stack.slice(0, 4000) : undefined,
        });
      } else if (data?.type === "gamesmith:ok") {
        handlers.current.onRecovered?.();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const playableVersion =
    build.status === "ready" || build.status === "crashed"
      ? build.version
      : build.status === "building"
        ? build.previousVersion
        : undefined;

  return (
    <section aria-label="Game preview" className="dark flex h-full min-h-0 flex-col bg-background text-foreground">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-3">
        <StatusChip build={build} />
        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarButton label="Reload game" disabled={!playableVersion} onClick={() => setReloadKey((k) => k + 1)}>
            <RotateCw />
          </ToolbarButton>
          <ToolbarButton
            label="Open in new tab"
            disabled={!playableVersion}
            onClick={() => window.open(frameSrc, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink />
          </ToolbarButton>
          <ToolbarButton label="Fullscreen" disabled={!playableVersion} onClick={() => stageRef.current?.requestFullscreen?.()}>
            <Maximize2 />
          </ToolbarButton>
        </div>
      </div>

      {/* Stage */}
      <div className="min-h-0 flex-1 p-2 sm:p-3">
        <div
          ref={stageRef}
          className="relative isolate size-full overflow-hidden rounded-xl bg-night ring-1 ring-border"
        >
          {playableVersion !== undefined && (
            <iframe
              key={`${frameSrc}-${playableVersion}-${reloadKey}`}
              ref={frameRef}
              src={frameSrc}
              title={`Game preview, version ${playableVersion}`}
              sandbox="allow-scripts allow-pointer-lock"
              allow="fullscreen; gamepad; autoplay"
              className={cn(
                "absolute inset-0 size-full border-0 transition-[filter,opacity] duration-300",
                (build.status === "building" || build.status === "crashed") && "opacity-40 saturate-50",
              )}
            />
          )}

          {build.status === "empty" && <EmptyStage editHref={editHref} />}
          {build.status === "building" && !build.previousVersion && <FirstBuild steps={build.steps} version={build.version} />}
          {build.status === "building" && build.previousVersion !== undefined && <Rebuild steps={build.steps} version={build.version} />}
          {build.status === "crashed" && (
            <CrashOverlay error={build.error} onFix={onFix} onReload={() => setReloadKey((k) => k + 1)} />
          )}
          {build.status === "ready" && <PlayHint />}
        </div>
      </div>
    </section>
  );
}

function ToolbarButton({
  label,
  children,
  ...props
}: { label: string; children: ReactNode } & ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={label} className="text-muted-foreground" {...props} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function StatusChip({ build }: { build: BuildState }) {
  const base = "label-pixel flex items-center gap-1.5 rounded-sm border px-1.5 py-1";
  switch (build.status) {
    case "empty":
      return <span className={cn(base, "border-border text-muted-foreground")}>No build yet</span>;
    case "building":
      return (
        <span className={cn(base, "border-ember/40 text-ember-text")}>
          <PixelLoader size="sm" /> Building v{build.version}
        </span>
      );
    case "ready":
      return (
        <span className={cn(base, "border-border text-foreground")}>
          <span className="size-1.5 rounded-[1px] bg-ember" /> v{build.version} · Live
        </span>
      );
    case "crashed":
      return (
        <span className={cn(base, "border-destructive/40 text-destructive")}>
          <TriangleAlert className="size-3" /> v{build.version} · Crashed
        </span>
      );
  }
}

function EmptyStage({ editHref }: { editHref?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="absolute inset-0 opacity-80">
        <DitherField scene="glow" pixel={4} palette={["--color-night", "--color-ember-900", "--ember"]} bias={-0.3} />
      </div>
      {/* Solid scrim: never set body text on a dense field. */}
      <div className="relative mx-6 max-w-xs rounded-lg bg-night/90 px-6 py-5 text-center backdrop-blur-sm">
        <p className="font-display text-display-sm">Your game appears here.</p>
        <p className="mt-2 text-sm text-muted-foreground">Describe it in the chat. Smith will ask what matters, then build.</p>
        {editHref && (
          <Link href={editHref} className={buttonVariants({ variant: "ghost", size: "sm", className: "mt-3 text-muted-foreground" })}>
            <Code2 data-icon="inline-start" /> Or edit the starter code
          </Link>
        )}
      </div>
    </div>
  );
}

function Steps({ steps }: { steps: BuildStep[] }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {steps.map((s) => (
        <li
          key={s.label}
          className={cn(
            "flex items-center gap-2.5 text-[13px]",
            s.state === "pending" && "text-muted-foreground/60",
            s.state === "done" && "text-muted-foreground",
          )}
        >
          <span className="grid size-4 place-items-center">
            {s.state === "done" && <Check className="size-3.5" />}
            {s.state === "active" && <PixelLoader size="sm" />}
            {s.state === "pending" && <span className="size-1 rounded-[1px] bg-current" />}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function progressOf(steps: BuildStep[]) {
  const done = steps.filter((s) => s.state === "done").length;
  return Math.round(((done + 0.5) / steps.length) * 100);
}

/** First build: the forge is the whole stage. */
function FirstBuild({ steps, version }: { steps: BuildStep[]; version: number }) {
  return (
    <div className="absolute inset-0">
      <DitherField
        scene="forge"
        animated
        pixel={4}
        palette={["--color-night", "--color-ember-900", "--ember", "--color-ember-200"]}
        label="Forging your game"
      />
      <div className="absolute inset-x-3 bottom-3 rounded-lg border border-border bg-night/90 p-4 backdrop-blur sm:right-auto sm:w-80">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Spark size={14} twinkle /> Forging v{version}
        </p>
        <div className="mt-3">
          <Steps steps={steps} />
        </div>
        <DitherProgress value={progressOf(steps)} className="mt-4" label="Build progress" />
      </div>
    </div>
  );
}

/** Later builds: keep the last version visible, show a slim status bar. */
function Rebuild({ steps, version }: { steps: BuildStep[]; version: number }) {
  const active = steps.find((s) => s.state === "active")?.label ?? "Building";
  return (
    <div className="absolute inset-x-0 top-0">
      <DitherProgress className="h-1 bg-transparent" label="Rebuild progress" />
      <div className="m-3 inline-flex items-center gap-2 rounded-md border border-border bg-night/90 px-2.5 py-1.5 text-[13px] backdrop-blur">
        <PixelLoader size="sm" /> {active} · v{version}
      </div>
    </div>
  );
}

function CrashOverlay({ error, onFix, onReload }: { error: { message: string; stack?: string }; onFix: () => void; onReload: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-night/70 p-4 backdrop-blur-[2px]">
      <div role="alert" className="w-full max-w-md rounded-xl border border-destructive/40 bg-night/95 p-5 shadow-float">
        <p className="label-pixel flex items-center gap-2 text-destructive">
          <TriangleAlert className="size-3.5" /> Runtime error
        </p>
        <p className="mt-3 font-display text-display-sm">The game crashed.</p>
        <pre className="mt-3 max-h-36 overflow-auto rounded-md bg-background/70 p-3 font-mono text-[12px] leading-relaxed text-muted-foreground">
          {error.message}
          {error.stack ? `\n  ${error.stack.replaceAll("\n", "\n  ")}` : ""}
        </pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ember" size="sm" onClick={onFix}>
            <Spark size={7} className="text-ink" /> Ask Smith to fix it
          </Button>
          <Button variant="ghost" size="sm" onClick={onReload}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  );
}

function PlayHint() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 animate-hint-out items-center gap-1.5 rounded-md bg-night/80 px-2 py-1 text-[12px] text-muted-foreground backdrop-blur">
      <MousePointerClick className="size-3.5" /> Click the game to play
    </div>
  );
}
