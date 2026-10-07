"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, Plus, Search, X } from "lucide-react";
import { Spark } from "@/components/brand/spark";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { GameCard as GameCardData, GameStatus } from "@/lib/games/types";
import { cn } from "@/lib/utils";
import { GameCard, type GameAction } from "./game-card";
import { DeleteDialog, RenameDialog, ShareDialog } from "./game-dialogs";
import { STATUS_LABEL } from "./game-status";

type Filter = "all" | GameStatus;
type Sort = "updated" | "created" | "name";

const FILTERS: Filter[] = ["all", "ready", "building", "error", "draft"];
const SORT_LABEL: Record<Sort, string> = {
  updated: "Last edited",
  created: "Newest",
  name: "Name",
};

/**
 * The library. Local state stands in for mutations until the backend lands.
 * TODO(data): rename/duplicate/delete/visibility become server actions that
 * check ownership with requireGameAccess().
 */
export function Library({ initialGames }: { initialGames: GameCardData[] }) {
  const [games, setGames] = useState(initialGames);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("updated");
  const [dialog, setDialog] = useState<{
    kind: "rename" | "delete" | "share";
    game: GameCardData;
  } | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: games.length,
      ready: 0,
      building: 0,
      error: 0,
      draft: 0,
    };
    for (const g of games) c[g.status]++;
    return c;
  }, [games]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return games
      .filter((g) => filter === "all" || g.status === filter)
      .filter(
        (g) =>
          !q || `${g.title} ${g.pitch} ${g.genre}`.toLowerCase().includes(q),
      )
      .sort((a, b) =>
        sort === "name"
          ? a.title.localeCompare(b.title)
          : Date.parse(sort === "created" ? b.createdAt : b.updatedAt) -
            Date.parse(sort === "created" ? a.createdAt : a.updatedAt),
      );
  }, [games, query, filter, sort]);

  const update = (id: string, patch: Partial<GameCardData>) =>
    setGames((gs) =>
      gs.map((g) =>
        g.id === id
          ? { ...g, ...patch, updatedAt: new Date().toISOString() }
          : g,
      ),
    );

  const onAction = (action: GameAction, game: GameCardData) => {
    if (action === "duplicate") {
      const copy: GameCardData = {
        ...game,
        id: `${game.id}-copy-${Date.now().toString(36)}`,
        title: `${game.title} (copy)`.slice(0, 60),
        visibility: "private",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setGames((gs) => [copy, ...gs]);
      toast.add({
        title: "Game duplicated",
        description: `“${copy.title}” is private until you share it.`,
      });
      return;
    }
    setDialog({ kind: action, game });
  };

  const close = () => setDialog(null);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-display-md">Your games</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {counts.all} {counts.all === 1 ? "game" : "games"} · {counts.ready}{" "}
            live
          </p>
        </div>
        <Link href="/new" className={buttonVariants({ variant: "ember" })}>
          <Plus data-icon="inline-start" /> New game
        </Link>
      </div>

      {/* Toolbar */}
      <div className="mt-6 flex flex-col gap-3 border-b border-hairline pb-4 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games"
            aria-label="Search games"
            className="h-9 bg-card pl-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div
          role="tablist"
          aria-label="Filter by status"
          className="-mx-1 flex gap-1 overflow-x-auto px-1"
        >
          {FILTERS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors",
                filter === f
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f === "all" ? "All" : STATUS_LABEL[f]}
              <span className="font-pixel text-[11px] text-muted-foreground">
                {counts[f]}
              </span>
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground lg:ml-auto"
              />
            }
          >
            <ArrowDownWideNarrow data-icon="inline-start" /> {SORT_LABEL[sort]}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(v) => setSort(v as Sort)}
            >
              {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  {SORT_LABEL[s]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Grid */}
      {visible.length > 0 ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((g) => (
            <li key={g.id}>
              <GameCard game={g} onAction={onAction} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center px-4 py-20 text-center">
          <Spark size={21} className="text-muted-foreground" />
          <p className="mt-4 font-display text-display-sm">No games match.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try another search or filter.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-5"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}

      {/* Dialogs */}
      <RenameDialog
        open={dialog?.kind === "rename"}
        onOpenChange={(o) => !o && close()}
        title={dialog?.game.title ?? ""}
        onRename={(title) => {
          if (dialog) update(dialog.game.id, { title });
          toast.add({
            title: "Renamed",
            description: `Now called “${title}”.`,
          });
          close();
        }}
      />
      <DeleteDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(o) => !o && close()}
        title={dialog?.game.title ?? ""}
        onDelete={() => {
          if (dialog)
            setGames((gs) => gs.filter((g) => g.id !== dialog.game.id));
          toast.add({
            title: "Game deleted",
            description: dialog ? `“${dialog.game.title}” is gone.` : undefined,
          });
          close();
        }}
      />
      {dialog?.kind === "share" && (
        <ShareDialog
          open
          onOpenChange={(o) => !o && close()}
          gameId={dialog.game.id}
          title={dialog.game.title}
          visibility={
            games.find((g) => g.id === dialog.game.id)?.visibility ?? "private"
          }
          onVisibilityChange={(v) => update(dialog.game.id, { visibility: v })}
        />
      )}
    </div>
  );
}
