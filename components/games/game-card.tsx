"use client";

import Link from "next/link";
import {
  Code2,
  Copy,
  History,
  MoreHorizontal,
  PencilLine,
  Share2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { timeAgo } from "@/lib/format";
import type { GameCard as GameCardData } from "@/lib/games/types";
import { GameCover } from "./game-cover";
import { GameStatusChip } from "./game-status";

export type GameAction = "rename" | "duplicate" | "share" | "delete";

export function GameCard({
  game,
  onAction,
}: {
  game: GameCardData;
  onAction: (a: GameAction, game: GameCardData) => void;
}) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-[border-color,translate] duration-200 ease-forge hover:-translate-y-0.5 hover:border-foreground/20 focus-within:border-ember/50">
      {/* Whole card opens the workspace; the menu sits above this layer. */}
      <Link
        href={`/g/${game.id}`}
        className="absolute inset-0 z-0 rounded-xl"
        aria-label={`Open ${game.title}`}
      />
      <div className="pointer-events-none relative aspect-[16/10]">
        <GameCover
          title={game.title}
          thumbnailUrl={game.thumbnailUrl}
          seed={game.coverSeed}
          className="absolute inset-0"
        />
        <GameStatusChip
          status={game.status}
          version={game.version || undefined}
          className="absolute top-2.5 left-2.5"
        />
      </div>
      <div className="flex items-start gap-2 px-3.5 pt-3 pb-3.5">
        <div className="pointer-events-none min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-medium">{game.title}</h3>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
            {game.pitch}
          </p>
          <p className="label-pixel mt-2.5 text-muted-foreground">
            {game.genre} ·{" "}
            <time dateTime={game.updatedAt} suppressHydrationWarning>
              {timeAgo(game.updatedAt)}
            </time>
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${game.title}`}
                className="relative z-10 -mr-1.5 text-muted-foreground"
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onClick={() => onAction("rename", game)}>
              <PencilLine /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("duplicate", game)}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("share", game)}>
              <Share2 /> Share
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={<Link href={`/g/${game.id}?panel=versions`} />}
            >
              <History /> Version history
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href={`/g/${game.id}/files`} />}>
              <Code2 /> View files
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onAction("delete", game)}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
