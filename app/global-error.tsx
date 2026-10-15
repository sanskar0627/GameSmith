"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last-resort boundary: replaces the root layout, so it brings its own
 * document and styles. Kept dependency-light on purpose.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // TODO(observability): report to Sentry.
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center font-sans text-foreground">
        <title>Something went wrong · GameSmith</title>
        <p className="label-pixel text-ember-text">GameSmith</p>
        <h1 className="mt-3 font-display text-display-md">The forge went dark.</h1>
        <p className="mt-2 max-w-sm text-[15px] text-muted-foreground">Something failed before the page could load.</p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-7 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85"
        >
          Try again
        </button>
        {error.digest && <p className="mt-8 font-mono text-[11px] text-muted-foreground">Error id {error.digest}</p>}
      </body>
    </html>
  );
}
