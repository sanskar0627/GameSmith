"use client";

import { DitherField } from "@/components/dither/dither-field";
import { DitherImage } from "@/components/dither/dither-image";
import type { SceneName } from "@/components/dither/scenes";
import { cn } from "@/lib/utils";

const SCENES: SceneName[] = ["horizon", "dawn", "sun", "clouds", "glow"];
const PALETTE = [
  "--color-night",
  "--color-ember-900",
  "--ember",
  "--color-ember-200",
];

/**
 * Game cover. A real screenshot is dithered into the house palette (and
 * revealed on hover). Before the first screenshot exists, a generated
 * landscape from the game's seed stands in, so every card has a cover.
 */
export function GameCover({
  title,
  thumbnailUrl,
  seed,
  className,
}: {
  title: string;
  thumbnailUrl?: string | null;
  seed: number;
  className?: string;
}) {
  return (
    <div className={cn("dark relative overflow-hidden bg-night", className)}>
      {thumbnailUrl ? (
        <DitherImage
          src={thumbnailUrl}
          alt={`${title} screenshot`}
          pixel={2}
          palette={PALETTE}
          reveal
          className="absolute inset-0"
        />
      ) : (
        <div className="absolute inset-0" aria-hidden>
          <DitherField
            scene={SCENES[seed % SCENES.length]}
            seed={seed}
            pixel={3}
            palette={PALETTE}
          />
        </div>
      )}
    </div>
  );
}
