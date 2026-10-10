import type { Metadata } from "next";
import { Workspace } from "@/components/workspace/workspace";
import { isDemoScenario } from "@/lib/workspace/mock";

export const metadata: Metadata = { title: "Workspace · GameSmith" };

/**
 * Game workspace. Until persistence lands every id opens the demo game.
 * TODO(data): load the game via requireGameAccess(gameId) and stream its
 * messages/build state instead of the demo snapshot.
 * Review states with ?demo=fresh|ask|building|thread|crash.
 */
export default async function GamePage({
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ demo?: string; prompt?: string | string[] }>;
}) {
  const { demo, prompt } = await searchParams;
  const scenario = isDemoScenario(demo) ? demo : "thread";
  const autoPrompt = typeof prompt === "string" && prompt.trim() ? prompt.slice(0, 2000) : undefined;
  return <Workspace key={`${scenario}:${autoPrompt ?? ""}`} scenario={scenario} autoPrompt={autoPrompt} />;
}
