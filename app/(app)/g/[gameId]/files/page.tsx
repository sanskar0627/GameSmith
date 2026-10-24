import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { FileBrowser } from "@/components/games/file-browser";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_FILES } from "@/lib/games/mock";
import type { GameFile } from "@/lib/games/types";
import { GameNotFoundError, requireGameAccessFor } from "@/lib/server/games/access";
import { ensureUser } from "@/lib/server/users";

export const metadata: Metadata = { title: "Files" };

/** Owner-only source view. `/g/demo/files` shows the review fixtures. */
export default async function GameFilesPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  let game: { id: string; title: string };
  let files: GameFile[];
  if (gameId === "demo") {
    game = { id: "demo", title: "Floating Islands" };
    files = DEMO_FILES;
  } else {
    const user = await ensureUser();
    game = await requireGameAccessFor(gameId, user.id, "write").catch((error: unknown) => {
      if (error instanceof GameNotFoundError) notFound();
      throw error;
    });
    // Files live in the game's sandbox, which arrives in Phase 7.
    files = [];
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-1.5">
            <Link href={`/g/${game.id}`} className="truncate text-muted-foreground hover:text-foreground">
              {game.title}
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <span>Files</span>
          </span>
        }
        actions={
          <Link href={`/g/${game.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeft data-icon="inline-start" /> Back to game
          </Link>
        }
      />
      <FileBrowser files={files} />
    </div>
  );
}
