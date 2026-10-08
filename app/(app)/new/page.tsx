import type { Metadata } from "next";
import { NewGameComposer } from "@/components/app/new-game-composer";
import { PageHeader } from "@/components/app/page-header";
import { Spark } from "@/components/brand/spark";

export const metadata: Metadata = { title: "New game · GameSmith" };

export default async function NewGamePage({ searchParams }: { searchParams: Promise<{ prompt?: string | string[] }> }) {
  const { prompt } = await searchParams;
  const initial = typeof prompt === "string" ? prompt.slice(0, 2000) : "";

  return (
    <>
      <PageHeader title="New game" />
      <div className="flex flex-1 items-start justify-center px-4 pt-[14vh] pb-16">
        <div className="flex w-full max-w-2xl flex-col items-center text-center">
          <Spark size={28} />
          <h2 className="mt-5 font-display text-display-md sm:text-display-lg">
            What should we <em className="text-ember-text">forge?</em>
          </h2>
          <p className="mt-3 mb-8 max-w-md text-[15px] text-muted-foreground">
            Describe the world, the goal, and what makes it hard. You can change anything after.
          </p>
          <NewGameComposer initialPrompt={initial} />
        </div>
      </div>
    </>
  );
}
