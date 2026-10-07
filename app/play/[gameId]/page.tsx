import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { Spark } from "@/components/brand/spark";
import { buttonVariants } from "@/components/ui/button";
import { getDemoGame } from "@/lib/games/mock";

type Props = { params: Promise<{ gameId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const game = getDemoGame((await params).gameId);
  return game && game.visibility === "link"
    ? { title: `${game.title} · Play on GameSmith`, description: game.pitch }
    : { title: "Game not found · GameSmith" };
}

/**
 * Public play page. Anyone with the link can play; nobody sees the chat or
 * source. Private games 404 rather than revealing that they exist.
 * TODO(data): look up by share id, serve the published build from the sandbox domain.
 */
export default async function PlayPage({ params }: Props) {
  const { gameId } = await params;
  const game = getDemoGame(gameId);
  if (!game || game.visibility !== "link") notFound();

  return (
    <main className="dark flex h-dvh flex-col bg-background text-foreground">
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
        <iframe
          src="/preview-demo.html"
          title={`${game.title}, playable`}
          sandbox="allow-scripts allow-pointer-lock"
          allow="fullscreen; gamepad; autoplay"
          className="size-full rounded-xl border-0 bg-night ring-1 ring-border"
        />
      </div>
    </main>
  );
}
