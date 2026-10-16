import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { GameEditor } from "@/components/editor/game-editor";
import { FileBrowser } from "@/components/games/file-browser";
import { buttonVariants } from "@/components/ui/button";
import { downloadUrl } from "@/lib/games/files-api";
import { DEMO_FILES } from "@/lib/games/mock";
import { GameNotFoundError, requireGameAccessFor } from "@/lib/server/games/access";
import { ensureUser } from "@/lib/server/users";

export const metadata: Metadata = { title: "Files" };

/**
 * Owner-only code view. Real games get the live editor (files from the
 * game's sandbox, preview beside them). `/g/demo/files` shows the read-only
 * review fixtures.
 */
export default async function GameFilesPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const isDemo = gameId === "demo";

  let game: { id: string; title: string };
  if (isDemo) {
    game = { id: "demo", title: "Floating Islands" };
  } else {
    const user = await ensureUser();
    game = await requireGameAccessFor(gameId, user.id, "write").catch((error: unknown) => {
      if (error instanceof GameNotFoundError) notFound();
      throw error;
    });
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
          <>
            {!isDemo && (
              <a
                href={downloadUrl(game.id)}
                download
                className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
              >
                <Download data-icon="inline-start" /> Download
              </a>
            )}
            <Link href={`/g/${game.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ArrowLeft data-icon="inline-start" /> Back to game
            </Link>
          </>
        }
      />
      {isDemo ? <FileBrowser files={DEMO_FILES} /> : <GameEditor gameId={game.id} />}
    </div>
  );
}
