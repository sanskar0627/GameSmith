import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { SITE } from "@/lib/site";

/**
 * "Made by GameSmith · @sanskarshukla" plus the creator's X, GitHub and
 * LinkedIn links. Links open in a new tab and say so to screen readers.
 *
 * `layout="stack"` puts the links under the attribution (footers);
 * `layout="row"` keeps everything on one line (the play page strip).
 */
export function MadeBy({
  layout = "stack",
  className,
}: {
  layout?: "stack" | "row";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex text-[13px] text-muted-foreground",
        layout === "stack" ? "flex-col gap-2" : "flex-wrap items-center justify-between gap-x-4 gap-y-1",
        className,
      )}
    >
      <p>{SITE.attribution}</p>
      <CreatorLinks />
    </div>
  );
}

export function CreatorLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Creator links" className={className}>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {SITE.links.map((link) => (
          <li key={link.id}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 rounded-sm font-medium text-foreground underline-offset-4 hover:text-ember-text hover:underline"
            >
              {link.label}
              <ArrowUpRight className="size-3.5" aria-hidden />
              <span className="sr-only">: {link.description} (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
