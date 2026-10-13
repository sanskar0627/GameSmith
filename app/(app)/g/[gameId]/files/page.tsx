import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { FileBrowser } from "@/components/games/file-browser";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_FILES, getDemoGame } from "@/lib/games/mock";

export const metadata: Metadata = { title: "Files · GameSmith" };

export default async function GameFilesPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  // TODO(data): requireGameAccess(gameId), then read files from the sandbox.
  const game = getDemoGame(gameId) ?? (gameId === "demo" ? { id: "demo", title: "Floating Islands" } : undefined);
  if (!game) notFound();

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
      <FileBrowser files={DEMO_FILES} />
    </div>
  );
}
