import { TriangleAlert } from "lucide-react";
import { PixelLoader } from "@/components/brand/pixel-loader";
import type { GameStatus } from "@/lib/games/types";
import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<GameStatus, string> = {
  ready: "Live",
  building: "Building",
  error: "Needs fix",
  draft: "Draft",
};

/** Pixel status chip. Sits on dark covers, so it carries its own night surface. */
export function GameStatusChip({
  status,
  version,
  className,
}: {
  status: GameStatus;
  version?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "label-pixel inline-flex items-center gap-1.5 rounded-sm border bg-night/85 px-1.5 py-1 text-bone backdrop-blur",
        status === "error"
          ? "border-destructive/50 text-[#f2a49f]"
          : "border-white/10",
        className,
      )}
    >
      {status === "ready" && (
        <span className="size-1.5 rounded-[1px] bg-ember" />
      )}
      {status === "building" && <PixelLoader size="sm" label="Building" />}
      {status === "error" && <TriangleAlert className="size-3" />}
      {status === "draft" && (
        <span className="size-1.5 rounded-[1px] border border-current" />
      )}
      {STATUS_LABEL[status]}
      {version ? <span className="text-bone-500">· v{version}</span> : null}
    </span>
  );
}
