import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { EmptyLibrary } from "@/components/games/empty-library";
import { Library } from "@/components/games/library";
import { listGames, toGameCard } from "@/lib/server/games/queries";
import { ensureUser } from "@/lib/server/users";

export const metadata: Metadata = { title: "Games" };

export default async function GamesPage() {
  const user = await ensureUser();
  const games = (await listGames(user.id)).map(toGameCard);

  return (
    <>
      <PageHeader title="Games" />
      {games.length > 0 ? <Library games={games} /> : <EmptyLibrary />}
    </>
  );
}
