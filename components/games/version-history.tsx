"use client";

import { useState } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Spark } from "@/components/brand/spark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { timeAgo } from "@/lib/format";
import type { GameVersion } from "@/lib/games/types";
import { cn } from "@/lib/utils";

/**
 * Version history. Every build is a version. Restoring never rewrites
 * history: it creates a new version from the old files.
 * TODO(data): restore becomes a server action that snapshots files into the sandbox.
 */
export function VersionHistory({
  open,
  onOpenChange,
  title,
  versions: initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  versions: GameVersion[];
}) {
  const [versions, setVersions] = useState(initial);
  const [confirming, setConfirming] = useState<number | null>(null);
  const current = versions[0]?.version;

  const restore = (v: GameVersion) => {
    const next: GameVersion = {
      ...v,
      version: (current ?? 0) + 1,
      label: `Restored v${v.version}`,
      prompt: `Restore v${v.version}: ${v.label}`,
      createdAt: new Date().toISOString(),
    };
    setVersions((vs) => [next, ...vs]);
    setConfirming(null);
    toast.add({
      title: `Restored v${v.version}`,
      description: `Saved as v${next.version}. Nothing was deleted.`,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-hairline px-5 pt-5 pb-4">
          <span className="label-pixel text-ember-text">Version history</span>
          <SheetTitle>
            {title}
          </SheetTitle>
          <SheetDescription>
            Every build is saved. Restoring creates a new version, so nothing is
            lost.
          </SheetDescription>
        </SheetHeader>
        <ol className="flex-1 overflow-y-auto px-5 py-4">
          {versions.map((v, i) => {
            const isCurrent = v.version === current;
            return (
              <li
                key={`${v.version}-${v.createdAt}`}
                className="relative flex gap-3.5 pb-5 last:pb-0"
              >
                {/* Timeline rail */}
                {i < versions.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute top-6 bottom-0 left-[11px] w-px bg-border"
                  />
                )}
                <span
                  className={cn(
                    "relative z-10 grid size-6 shrink-0 place-items-center rounded-sm border",
                    isCurrent
                      ? "border-ember/50 bg-ember-soft"
                      : "border-border bg-background",
                  )}
                >
                  {v.status === "error" ? (
                    <TriangleAlert className="size-3 text-destructive" />
                  ) : (
                    <Spark
                      size={7}
                      className={isCurrent ? "" : "text-muted-foreground"}
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="label-pixel text-ember-text">
                      v{v.version}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {v.label}
                    </span>
                    {isCurrent && (
                      <span className="label-pixel ml-auto rounded-sm border border-border px-1 py-0.5 text-muted-foreground">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground italic">
                    &ldquo;{v.prompt}&rdquo;
                  </p>
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    {v.filesChanged} {v.filesChanged === 1 ? "file" : "files"}{" "}
                    changed ·{" "}
                    <time dateTime={v.createdAt} suppressHydrationWarning>
                      {timeAgo(v.createdAt)}
                    </time>
                    {v.status === "error" && (
                      <span className="text-destructive"> · crashed</span>
                    )}
                  </p>
                  {!isCurrent &&
                    (confirming === v.version ? (
                      <div className="mt-2.5 flex items-center gap-2">
                        <Button size="xs" onClick={() => restore(v)}>
                          Restore as v{(current ?? 0) + 1}
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setConfirming(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="xs"
                        variant="outline"
                        className="mt-2.5"
                        onClick={() => setConfirming(v.version)}
                      >
                        <RotateCcw data-icon="inline-start" /> Restore
                      </Button>
                    ))}
                </div>
              </li>
            );
          })}
        </ol>
      </SheetContent>
    </Sheet>
  );
}
