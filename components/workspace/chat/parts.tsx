"use client";

import { useState } from "react";
import { Check, ChevronRight, FilePen, FilePlus, FileSearch, FileX, FolderTree, TriangleAlert, X } from "lucide-react";
import { PixelLoader } from "@/components/brand/pixel-loader";
import { Spark } from "@/components/brand/spark";
import type { CheckpointPart, ErrorPart, NoticePart, ReasoningPart, TextPart, ToolPart } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";

/* --- Text ---------------------------------------------------------------- */

export function TextBlock({ part }: { part: TextPart }) {
  return (
    <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-foreground">
      {part.text}
      {part.streaming && (
        <span aria-hidden className="ml-0.5 inline-block h-[1em] w-[0.5em] translate-y-[0.15em] animate-caret bg-ember" />
      )}
    </p>
  );
}

/* --- Reasoning ----------------------------------------------------------- */

export function ReasoningBlock({ part }: { part: ReasoningPart }) {
  const [open, setOpen] = useState(false);
  if (part.streaming) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Spark size={14} twinkle />
        <span>Thinking</span>
      </div>
    );
  }
  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        Thought for {part.seconds ?? 1}s
      </button>
      {open && (
        <p className="mt-1.5 border-l border-border pl-3 text-[13px] leading-relaxed text-muted-foreground italic">{part.text}</p>
      )}
    </div>
  );
}

/* --- Tool log ------------------------------------------------------------ */

const TOOL = {
  list_files: { icon: FolderTree, label: "List" },
  read_file: { icon: FileSearch, label: "Read" },
  write_file: { icon: FilePlus, label: "Write" },
  replace_text: { icon: FilePen, label: "Edit" },
  delete_file: { icon: FileX, label: "Delete" },
} as const;

function summarize(all: ToolPart[]) {
  const parts = all.filter((p) => p.state === "done");
  const changed = new Set(parts.filter((p) => p.tool !== "read_file" && p.tool !== "list_files").map((p) => p.path)).size;
  const read = new Set(parts.filter((p) => p.tool === "read_file").map((p) => p.path)).size;
  const bits = [];
  if (changed) bits.push(`changed ${changed} file${changed > 1 ? "s" : ""}`);
  if (read) bits.push(`read ${read}`);
  const s = bits.join(", ") || "looked around";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A run of file operations, shown as one compact, collapsible work log. */
export function ToolLog({ parts }: { parts: ToolPart[] }) {
  const running = parts.some((p) => p.state === "running");
  const failed = parts.some((p) => p.state === "error");
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? running;
  // Only completed operations count toward totals.
  const added = parts.reduce((n, p) => n + (p.state === "done" ? (p.added ?? 0) : 0), 0);
  const removed = parts.reduce((n, p) => n + (p.state === "done" ? (p.removed ?? 0) : 0), 0);

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface/60">
      <button
        type="button"
        onClick={() => setOpenOverride(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-muted/60"
      >
        {running ? (
          <PixelLoader size="sm" label="Working" />
        ) : failed ? (
          <X className="size-3.5 text-destructive" />
        ) : (
          <Check className="size-3.5 text-muted-foreground" />
        )}
        <span className="font-medium">{running ? "Working in the sandbox" : summarize(parts)}</span>
        {(added > 0 || removed > 0) && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {added > 0 && <span className="text-ember-text">+{added}</span>}
            {added > 0 && removed > 0 && " "}
            {removed > 0 && <span>−{removed}</span>}
          </span>
        )}
        <ChevronRight className={cn("ml-auto size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <ul className="border-t border-hairline px-1.5 py-1.5">
          {parts.map((p) => {
            const { icon: Icon, label } = TOOL[p.tool];
            return (
              <li
                key={p.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-1.5 py-1 text-[12.5px]",
                  p.state === "running" && "bg-ember-soft/60",
                )}
              >
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="label-pixel w-10 shrink-0 text-muted-foreground">{label}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-foreground">{p.path}</span>
                {p.state === "done" && (p.added || p.removed) ? (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {p.added ? <span className="text-ember-text">+{p.added}</span> : null}
                    {p.added && p.removed ? " " : null}
                    {p.removed ? <span>−{p.removed}</span> : null}
                  </span>
                ) : null}
                {p.state === "running" && <PixelLoader size="sm" label="Running" />}
                {p.state === "error" && <span className="shrink-0 text-[11px] text-destructive">{p.error ?? "Failed"}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* --- Checkpoint ---------------------------------------------------------- */

export function Checkpoint({ part }: { part: CheckpointPart }) {
  return (
    <div className="flex items-center gap-3 py-1" role="note">
      <span className="h-px flex-1 bg-border" />
      <span className="flex items-center gap-2 rounded-sm border border-border bg-background px-2 py-1">
        <Spark size={7} />
        <span className="label-pixel text-ember-text">v{part.version}</span>
        <span className="text-[12px] text-muted-foreground">{part.label}</span>
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/* --- Error / notice ------------------------------------------------------ */

export function ErrorBlock({ part, onRetry }: { part: ErrorPart; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5">
      <p className="flex items-center gap-2 text-sm font-medium text-destructive">
        <TriangleAlert className="size-4" /> {part.message}
      </p>
      {part.detail && (
        <pre className="mt-2 overflow-x-auto rounded-sm bg-background/70 p-2.5 font-mono text-[12px] text-muted-foreground">{part.detail}</pre>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-[13px] font-medium text-ember-text hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function Notice({ part }: { part: NoticePart }) {
  return <p className="text-[13px] text-muted-foreground italic">{part.text}</p>;
}
