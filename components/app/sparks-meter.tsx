import Link from "next/link";
import { cn } from "@/lib/utils";

/** Monthly sparks at a glance. Turns ember-text when nearly spent. */
export function SparksMeter({ used, allowance }: { used: number; allowance: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, allowance)) * 100));
  const low = pct >= 85;
  return (
    <Link
      href="/settings/billing"
      className="group/sparks mx-1 mb-1 block rounded-md px-1.5 py-1.5 transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
    >
      <span className="flex items-center justify-between">
        <span className="label-pixel text-muted-foreground">Sparks</span>
        <span className={cn("font-pixel text-[11px] tabular-nums", low ? "text-ember-text" : "text-muted-foreground")}>
          {used.toLocaleString("en-US")} / {allowance.toLocaleString("en-US")}
        </span>
        <span className="sr-only"> used this month. View usage and billing.</span>
      </span>
      <span className="mt-1.5 block h-1 overflow-hidden rounded-[1px] bg-sidebar-accent">
        <span className="block h-full bg-ember" style={{ width: `${pct}%` }} />
      </span>
    </Link>
  );
}
