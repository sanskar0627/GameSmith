"use client";

import { Check } from "lucide-react";
import { Spark } from "@/components/brand/spark";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import type { BriefPart } from "@/lib/workspace/types";

/**
 * The game brief: the agent's plan before it writes code. Approve to build,
 * or keep talking to change it. Approved briefs stay as a compact record.
 */
export function BriefCard({
  part,
  onApprove,
  onRevise,
  disabled,
}: {
  part: BriefPart;
  onApprove?: () => void;
  onRevise?: () => void;
  disabled?: boolean;
}) {
  const { brief } = part;
  const rows: [string, string][] = [
    ["Loop", brief.loop],
    ["Goal", brief.goal],
    ["Challenge", brief.challenge],
    ["World", brief.world],
    ["Style", brief.style],
    ["Feel", brief.feel],
  ];

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-float">
      <header className="border-b border-hairline px-4 pt-4 pb-3.5">
        <div className="flex items-center justify-between">
          <span className="label-pixel flex items-center gap-1.5 text-ember-text">
            <Spark size={7} /> Game brief
          </span>
          {part.status === "approved" && (
            <span className="label-pixel flex items-center gap-1 text-muted-foreground">
              <Check className="size-3" /> Approved
            </span>
          )}
        </div>
        <h3 className="mt-2 font-display text-display-sm">{brief.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{brief.pitch}</p>
      </header>
      <dl className="grid gap-x-6 gap-y-3 px-4 py-4 text-[13px] sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="label-pixel text-muted-foreground">{k}</dt>
            <dd className="mt-1 leading-relaxed">{v}</dd>
          </div>
        ))}
        <div className="sm:col-span-2">
          <dt className="label-pixel text-muted-foreground">Controls</dt>
          <dd className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
            {brief.controls.map((c) => (
              <span key={c.action} className="flex items-center gap-1.5">
                <span className="flex gap-0.5">
                  {c.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
                <span className="text-muted-foreground">{c.action}</span>
              </span>
            ))}
          </dd>
        </div>
      </dl>
      {part.status === "proposed" && (
        <footer className="flex items-center justify-between gap-2 border-t border-hairline bg-surface/50 px-4 py-3">
          <button
            type="button"
            onClick={onRevise}
            disabled={disabled}
            className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Change something
          </button>
          <Button variant="ember" size="sm" onClick={onApprove} disabled={disabled}>
            <Spark size={7} className="text-ink" /> Build it
          </Button>
        </footer>
      )}
    </article>
  );
}
