import type { Metadata } from "next";
import Link from "next/link";
import { DitherField } from "@/components/dither/dither-field";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main id="main" className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6 pb-40 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-56">
        <DitherField scene="clouds" pixel={3} seed={12} palette={["transparent", "--dither-mid"]} bias={-0.1} />
      </div>
      <p className="font-pixel text-6xl text-ember-text tabular-nums sm:text-7xl">404</p>
      <h1 className="mt-5 font-display text-display-md sm:text-display-lg">This world wasn&rsquo;t forged.</h1>
      <p className="mt-2 max-w-sm text-[15px] text-muted-foreground">
        The link may be old, or the game was made private. Nothing here but fog.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Link href="/games" className={buttonVariants()}>
          Your games
        </Link>
        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          Home
        </Link>
      </div>
    </main>
  );
}
