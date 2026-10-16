"use client";

import { useEffect, useState } from "react";
import { startSandbox } from "@/lib/games/files-api";

/**
 * The game's live sandbox preview URL, once there is something to play.
 * Undefined while it starts, for the demo workspace, or when sandboxes
 * aren't set up on this server (the panel then keeps its demo build).
 */
export function useSandboxPreview(gameId: string | null, enabled: boolean): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!gameId || !enabled) return;
    let cancelled = false;
    startSandbox(gameId).then(
      (sandbox) => {
        if (!cancelled && sandbox.running) setUrl(sandbox.previewUrl);
      },
      () => {
        /* not set up or busy: keep the fallback */
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gameId, enabled]);

  return url;
}
