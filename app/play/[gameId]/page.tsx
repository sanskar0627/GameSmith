import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { cache } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { MadeBy } from "@/components/brand/made-by";
import { Spark } from "@/components/brand/spark";
import { buttonVariants } from "@/components/ui/button";
import { getShowcaseGame } from "@/lib/games/mock";
import { GameNotFoundError, requireGameAccessFor } from "@/lib/server/games/access";
import { playableBuild } from "@/lib/server/publish/service";

type Props = { params: Promise<{ gameId: string }> };

type Playable = { title: string; pitch: string; build: string | null; owner: boolean; external: boolean };

/**
 * Who may play: anyone for a link-shared game, the owner for a private one,
 * nobody for a deleted one. Every denial is a 404 so private games stay
 * invisible. Landing-page showcase games resolve by slug.
 */
const loadPlayable = cache(async (gameId: string): Promise<Playable | null> => {
  const showcase = getShowcaseGame(gameId);
  if (showcase) return { title: showcase.title, pitch: showcase.pitch, build: "/preview-demo.html", owner: false, external: false };

  const { userId } = await auth();
  try {
    const game = await requireGameAccessFor(gameId, userId ?? null, "read");
    // Published builds come from the content origin, never this one.
    const owner = userId === game.ownerId;
    return { title: game.title, pitch: game.pitch, build: playableBuild(game, userId ?? null), owner, external: true };
  } catch (error) {
    if (error instanceof GameNotFoundError) return null;
    throw error;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const game = await loadPlayable((await params).gameId);
  return game
    ? { title: `${game.title} · Play`, description: game.pitch, openGraph: { title: game.title, description: game.pitch } }
    : { title: "Game not found" };
}

/** Public play page. Players see the game, never the chat or the source. */
export default async function PlayPage({ params }: Props) {
  const { gameId } = await params;
  const game = await loadPlayable(gameId);
  if (!game) notFound();

  return (
    <main id="main" className="dark flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-hairline px-3 sm:px-4">
        <Link href="/" aria-label="GameSmith home" className="shrink-0 rounded-sm">
          <Wordmark height={15} />
        </Link>
        <span className="h-4 w-px bg-border" aria-hidden />
        <h1 className="min-w-0 truncate text-sm font-medium">{game.title}</h1>
        <span className="label-pixel ml-auto hidden items-center gap-1.5 text-muted-foreground sm:flex">
          <Spark size={7} /> Forged with GameSmith
        </span>
        <Link href="/sign-up" className={buttonVariants({ variant: "ember", size: "sm" })}>
          Make your own
        </Link>
      </header>
      <div className="min-h-0 flex-1 p-2 sm:p-3">
        {game.build ? (
          <iframe
            src={game.build}
            title={`${game.title}, playable`}
            // The content origin is a different site, so allow-same-origin only
            // gives the game its own origin (for localStorage saves), never ours.
            sandbox={game.external ? "allow-scripts allow-same-origin allow-pointer-lock" : "allow-scripts allow-pointer-lock"}
            allow="fullscreen; gamepad; autoplay"
            className="size-full rounded-xl border-0 bg-night ring-1 ring-border"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center rounded-xl px-6 text-center ring-1 ring-border">
            <Spark size={21} className="text-muted-foreground" />
            <p className="mt-4 font-display text-display-sm">Not ready to play yet.</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {game.owner
                ? "Publish it from the workspace (Share, then Publish) and it plays here."
                : "This game hasn\u2019t been published. Check back once its maker ships a build."}
            </p>
            {game.owner && (
              <Link href={`/g/${gameId}`} className={buttonVariants({ variant: "outline", size: "sm", className: "mt-4" })}>
                Open the workspace
              </Link>
            )}
          </div>
        )}
      </div>
      <footer className="shrink-0 border-t border-hairline px-3 py-2 sm:px-4">
        <MadeBy layout="row" className="text-xs" />
      </footer>
    </main>
  );
}
