"use client";

import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Spark } from "@/components/brand/spark";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Shared error UI for route error boundaries. Shows the digest (a server
 * error id) so a user can quote it, never the raw message or stack.
 */
export function ErrorState({ digest, retry, homeHref = "/" }: { digest?: string; retry: () => void; homeHref?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <Spark size={28} className="text-destructive" />
      <p className="label-pixel mt-5 text-destructive">Something broke</p>
      <h1 className="mt-2 font-display text-display-md sm:text-display-lg">The forge sputtered.</h1>
      <p className="mt-2 max-w-sm text-[15px] text-muted-foreground">
        Not your game, this part of GameSmith. Try again; if it keeps happening, it&rsquo;s on us.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button onClick={retry}>
          <RotateCw data-icon="inline-start" /> Try again
        </Button>
        <Link href={homeHref} className={buttonVariants({ variant: "ghost" })}>
          Go home
        </Link>
      </div>
      {digest && <p className="mt-8 font-mono text-[11px] text-muted-foreground">Error id {digest}</p>}
    </div>
  );
}
