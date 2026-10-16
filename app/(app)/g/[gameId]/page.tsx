import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace, type WorkspaceGame } from "@/components/workspace/workspace";
import { pickInitialModel } from "@/lib/ai/models";
import { getDemoVersions } from "@/lib/games/mock";
import type { GameCard } from "@/lib/games/types";
import { listModelOptions } from "@/lib/server/ai/access";
import { activeRun } from "@/lib/server/agent/service";
import { GameNotFoundError, requireGameAccessFor } from "@/lib/server/games/access";
import { listMessages, listVersions, toChatMessage, toGameVersion } from "@/lib/server/games/queries";
import { ensureUser } from "@/lib/server/users";
import { demoSnapshot, isDemoScenario } from "@/lib/workspace/mock";
import type { ChatMessage, WorkspaceSnapshot } from "@/lib/workspace/types";

type Props = {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ demo?: string; panel?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gameId } = await params;
  if (gameId === "demo") return { title: "Workspace (review)" };
  const user = await ensureUser();
  const game = await requireGameAccessFor(gameId, user.id, "write").catch(() => null);
  return { title: game?.title ?? "Workspace" };
}

/**
 * Game workspace. Owner only: anyone else gets a 404.
 *
 * `/g/demo?demo=fresh|ask|building|thread|crash` is a design-review route that
 * renders the scripted fixtures in lib/workspace/mock.ts. It stores nothing.
 */
export default async function GamePage({ params, searchParams }: Props) {
  const { gameId } = await params;
  const { demo, panel } = await searchParams;
  const initialPanel = panel === "versions" ? "versions" : undefined;

  const user = await ensureUser();
  const models = await listModelOptions(user.id);

  if (gameId === "demo") {
    const scenario = isDemoScenario(demo) ? demo : "thread";
    return (
      <Workspace
        key={`demo:${scenario}`}
        game={{
          id: "demo",
          title: "Floating Islands",
          visibility: "private",
          modelId: pickInitialModel(models),
          isDemo: true,
        }}
        models={models}
        versions={getDemoVersions(REVIEW_GAME)}
        initial={demoSnapshot(scenario)}
        resumeBuild={scenario === "building"}
        initialPanel={initialPanel}
      />
    );
  }

  const game = await requireGameAccessFor(gameId, user.id, "write").catch((error: unknown) => {
    if (error instanceof GameNotFoundError) notFound();
    throw error;
  });
  const [thread, versions, runId] = await Promise.all([
    listMessages(game.id),
    listVersions(game.id),
    activeRun(user.id, game.id),
  ]);
  const messages = thread.map(toChatMessage);

  // A prompt the agent has not answered yet (e.g. the first one, saved when the
  // game was created) starts a run on load, unless one is already going.
  const last = messages.at(-1);
  const pending = !runId && last?.role === "user" ? textOf(last) : undefined;
  const initial: WorkspaceSnapshot = {
    messages,
    build: game.currentVersion > 0 ? { status: "ready", version: game.currentVersion } : { status: "empty" },
    activity: { state: "idle" },
  };
  const workspaceGame: WorkspaceGame = {
    id: game.id,
    title: game.title,
    visibility: game.visibility,
    // Keep the saved choice even if it is locked right now: the picker shows why.
    modelId: game.modelId ?? pickInitialModel(models),
    isDemo: false,
  };

  return (
    <Workspace
      key={game.id}
      game={workspaceGame}
      versions={versions.map(toGameVersion)}
      models={models}
      initial={initial}
      autoPrompt={pending}
      activeRunId={runId}
      initialPanel={initialPanel}
    />
  );
}

function textOf(message: ChatMessage): string | undefined {
  const text = message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("\n")
    .trim();
  return text || undefined;
}

/** Fixture behind /g/demo's version history. */
const REVIEW_GAME: GameCard = {
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
