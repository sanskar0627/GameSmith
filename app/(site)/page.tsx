import { currentUser } from "@clerk/nextjs/server";
import { Show, SignUpButton } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import { Spark } from "@/components/brand/spark";
import { DitherField } from "@/components/dither/dither-field";
import { Button } from "@/components/ui/button";

/**
 * Minimal home. A real landing and the signed-in workspace come later;
 * this keeps the first impression on-brand in the meantime.
 */
export default async function Home() {
  const user = await currentUser();

  return (
    <main className="dark relative isolate flex flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 -z-10">
        <DitherField scene="dawn" seed={4} pixel={3} palette={["--dither-ink", "--color-ember-900", "--ember", "--color-ember-200"]} />
      </div>
      <section className="mx-auto w-full max-w-6xl px-4 pt-[12vh] pb-[45vh] sm:px-8">
        <p className="label-pixel mb-5 flex items-center gap-2 text-ember-text">
          <Spark size={14} /> {user ? `Welcome back${user.firstName ? `, ${user.firstName}` : ""}` : "AI game forge"}
        </p>
        <h1 className="max-w-3xl font-display text-display-lg text-foreground sm:text-display-2xl">
          Describe a world. <em className="text-ember">We&rsquo;ll forge it.</em>
        </h1>
        <p className="mt-6 max-w-md text-[15px] leading-relaxed text-bone-400">
          Type an idea. GameSmith designs it, builds it in real code, and hands you a playable 3D game you can keep shaping in
          conversation.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Show when="signed-out">
            <SignUpButton>
              <Button variant="ember" size="lg">
                Start forging <ArrowRight data-icon="inline-end" />
              </Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <span className="label-pixel rounded-sm border border-border px-2 py-1.5 text-muted-foreground">
              Workspace opening soon
            </span>
          </Show>
        </div>
      </section>
    </main>
  );
}
