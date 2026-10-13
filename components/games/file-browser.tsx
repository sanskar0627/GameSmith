"use client";

import { useMemo, useState } from "react";
import { Check, Copy, FileCode2, FileJson, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameFile } from "@/lib/games/types";
import { cn } from "@/lib/utils";

const ICON = {
  ts: FileCode2,
  html: FileCode2,
  css: FileCode2,
  json: FileJson,
  md: FileText,
} as const;

/**
 * Read-only view of the game's real source. Proof that GameSmith writes an
 * actual project, and a way to see exactly what the agent changed.
 * TODO(data): list and read files from the game's sandbox (owner only).
 */
export function FileBrowser({ files }: { files: GameFile[] }) {
  const sorted = useMemo(
    () =>
      [...files].sort((a, b) => {
        const da = a.path.includes("/") ? 0 : 1;
        const db = b.path.includes("/") ? 0 : 1;
        return da - db || a.path.localeCompare(b.path);
      }),
    [files],
  );
  const [active, setActive] = useState(sorted[0]?.path);
  const [copied, setCopied] = useState(false);
  const file = sorted.find((f) => f.path === active) ?? sorted[0];
  const lines = file?.content.replace(/\n$/, "").split("\n") ?? [];

  // Group by directory for the tree.
  const groups = useMemo(() => {
    const map = new Map<string, GameFile[]>();
    for (const f of sorted) {
      const dir = f.path.includes("/")
        ? f.path.slice(0, f.path.lastIndexOf("/"))
        : "";
      map.set(dir, [...(map.get(dir) ?? []), f]);
    }
    return [...map.entries()];
  }, [sorted]);

  const copy = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-1">
      {/* Tree (desktop) / picker (mobile) */}
      <nav
        aria-label="Files"
        className="border-b border-hairline bg-surface md:border-r md:border-b-0"
      >
        <label className="block p-3 md:hidden">
          <span className="sr-only">File</span>
          <select
            value={file?.path}
            onChange={(e) => setActive(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-card px-2 font-mono text-[13px]"
          >
            {sorted.map((f) => (
              <option key={f.path}>{f.path}</option>
            ))}
          </select>
        </label>
        <div className="hidden h-full overflow-y-auto p-2 md:block">
          {groups.map(([dir, items]) => (
            <div key={dir || "root"} className="mb-2">
              {dir && (
                <p className="label-pixel px-2 pt-2 pb-1 text-muted-foreground">
                  {dir}/
                </p>
              )}
              <ul>
                {items.map((f) => {
                  const Icon = ICON[f.language];
                  const name = f.path.slice(f.path.lastIndexOf("/") + 1);
                  const isActive = f.path === file?.path;
                  return (
                    <li key={f.path}>
                      <button
                        type="button"
                        onClick={() => setActive(f.path)}
                        aria-current={isActive ? "true" : undefined}
                        className={cn(
                          "relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[12.5px] transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                          isActive &&
                            "before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-ember",
                        )}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        <span className="truncate">{name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Code */}
      <section
        aria-label={file?.path}
        className="flex min-h-0 min-w-0 flex-col"
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-hairline px-3">
          <span className="truncate font-mono text-[12.5px]">{file?.path}</span>
          <span className="label-pixel rounded-sm border border-border px-1 py-0.5 text-muted-foreground">
            {file?.language}
          </span>
          <span className="ml-auto hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:flex">
            <Lock className="size-3" /> Read-only. Ask Smith for changes.
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={copy}
            className="text-muted-foreground"
          >
            {copied ? (
              <Check data-icon="inline-start" />
            ) : (
              <Copy data-icon="inline-start" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-card">
          <pre className="min-w-max py-3 font-mono text-[12.5px] leading-[1.7]">
            {lines.map((line, i) => (
              <div key={i} className="flex hover:bg-muted/40">
                <span
                  aria-hidden
                  className="w-12 shrink-0 pr-4 text-right text-muted-foreground/60 select-none"
                >
                  {i + 1}
                </span>
                <code className="pr-6">{line || " "}</code>
              </div>
            ))}
          </pre>
        </div>
      </section>
    </div>
  );
}
