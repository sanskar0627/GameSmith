"use client";

import Link from "next/link";
import { PixelLoader } from "@/components/brand/pixel-loader";
import { DitherImage } from "@/components/dither/dither-image";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import type { GameSummary } from "@/lib/games/types";
import { cn } from "@/lib/utils";

/** One game in the sidebar's Recent list: dithered thumb, title, status. */
export function GameNavItem({ game, active }: { game: GameSummary; active: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={game.title}
        render={<Link href={`/g/${game.id}`} />}
        className="gap-2.5 data-active:bg-sidebar-accent"
      >
        <GameThumb game={game} />
        <span className="flex-1 truncate">{game.title}</span>
        <GameStatusMark status={game.status} />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function GameThumb({ game }: { game: GameSummary }) {
  if (game.thumbnailUrl) {
    return (
      <DitherImage
        src={game.thumbnailUrl}
        alt=""
        pixel={1}
        className="size-4 shrink-0 rounded-[3px] ring-1 ring-sidebar-border"
      />
    );
  }
  // No screenshot yet: a dithered swatch stands in.
  return (
    <span className="relative size-4 shrink-0 overflow-hidden rounded-[3px] bg-sidebar-accent ring-1 ring-sidebar-border">
      <span className="absolute inset-0 bg-ember/70 dither-25 [--dither-cell:4px]" />
    </span>
  );
}

export function GameStatusMark({ status, className }: { status: GameSummary["status"]; className?: string }) {
  if (status === "building") return <PixelLoader size="sm" label="Building" className={className} />;
  if (status === "error")
    return <span aria-label="Error" className={cn("size-1.5 shrink-0 rounded-[1px] bg-destructive", className)} />;
  if (status === "draft")
    return <span aria-label="Draft" className={cn("size-1.5 shrink-0 rounded-[1px] border border-muted-foreground/60", className)} />;
  return null;
}
