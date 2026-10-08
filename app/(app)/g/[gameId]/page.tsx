import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace, type WorkspaceGame } from "@/components/workspace/workspace";
import { getDemoGame, getDemoVersions } from "@/lib/games/mock";
import type { GameCard } from "@/lib/games/types";
import { isDemoScenario } from "@/lib/workspace/mock";

export const metadata: Metadata = { title: "Workspace" };

/** The scratch game behind /new and the ?demo= review states. */
const DEMO_GAME: GameCard = {
  id: "demo",
  title: "Floating Islands",
  status: "ready",
  version: 2,
  genre: "Adventure",
  pitch: "",
  createdAt: new Date(Date.UTC(2026, 9, 9, 10)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 9, 9, 11)).toISOString(),
  visibility: "private",
  coverSeed: 11,
};

/**
 * Game workspace.
 * TODO(data): requireGameAccess(gameId), then load the game, its messages and
 * build state instead of demo data.
 * Review states with ?demo=fresh|ask|building|thread|crash, ?panel=versions.
 */
export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ demo?: string; prompt?: string | string[]; panel?: string }>;
}) {
  const { gameId } = await params;
  const { demo, prompt, panel } = await searchParams;
  const card = gameId === "demo" ? DEMO_GAME : getDemoGame(gameId);
  if (!card) notFound();

  const scenario = isDemoScenario(demo) ? demo : "thread";
  const autoPrompt = typeof prompt === "string" && prompt.trim() ? prompt.slice(0, 2000) : undefined;
  const game: WorkspaceGame = { id: card.id, title: card.title, visibility: card.visibility, isDemo: card.id === "demo" };

  return (
    <Workspace
      key={`${gameId}:${scenario}:${autoPrompt ?? ""}`}
      game={game}
      versions={getDemoVersions(card)}
      scenario={scenario}
      autoPrompt={autoPrompt}
      initialPanel={panel === "versions" ? "versions" : undefined}
    />
  );
}
