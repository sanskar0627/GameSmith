"use client";

import { useEffect, useState } from "react";
import { FilesApiError, startSandbox } from "@/lib/games/files-api";

export type SandboxPreview = { url: string | null; problem: string | null };

/**
 * The game's live sandbox preview URL, once there is something to play.
 * `url` stays null while the sandbox starts; `problem` says why there is no
 * preview (sandboxes not set up, all busy). Never falls back to a demo build.
 */
export function useSandboxPreview(gameId: string | null, enabled: boolean): SandboxPreview {
  const [state, setState] = useState<SandboxPreview>({ url: null, problem: null });

  useEffect(() => {
    if (!gameId || !enabled) return;
    let cancelled = false;
    startSandbox(gameId).then(
      (sandbox) => {
        if (!cancelled) setState(sandbox.running ? { url: sandbox.previewUrl, problem: null } : { url: null, problem: "The game didn’t start." });
      },
      (error: unknown) => {
        if (!cancelled) setState({ url: null, problem: error instanceof FilesApiError ? error.message : "The game didn’t start." });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gameId, enabled]);

  return state;
}
