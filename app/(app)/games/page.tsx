import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Spark } from "@/components/brand/spark";
import { EmptyLibrary } from "@/components/games/empty-library";
import { Library } from "@/components/games/library";
import { Badge } from "@/components/ui/badge";
import { DEMO_GAMES } from "@/lib/games/mock";

export const metadata: Metadata = { title: "Games · GameSmith" };

export default function GamesPage() {
  // TODO(data): load the signed-in user's games (owner or org) instead of demo data.
  const games = DEMO_GAMES;

  return (
    <>
      <PageHeader
        title="Games"
        actions={
          games.length > 0 && (
            <Badge variant="pixel" title="Sample games until persistence is connected">
              <Spark size={7} /> Demo data
            </Badge>
          )
        }
      />
      {games.length > 0 ? <Library initialGames={games} /> : <EmptyLibrary />}
    </>
  );
}
