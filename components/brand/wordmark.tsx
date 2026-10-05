import { cn } from "@/lib/utils";

/**
 * GameSmith pixel wordmark, redrawn on the logo's pixel grid.
 * "Game" is ink (currentColor), "Smith" and the spark (the dot of the i)
 * are ember. Set `tone="mono"` for single-color use (stamps, overlays).
 *
 * Grid: 69 x 15 cells. Height drives size; width follows the ratio.
 */
const W = 69;
const H = 15;
const INK = "M2 5h6v1h-6zM1 6h8v1h-8zM0 7h4v1h-4zM7 7h3v1h-3zM0 8h3v1h-3zM13 8h4v1h-4zM19 8h7v1h-7zM29 8h4v1h-4zM0 9h3v1h-3zM6 9h5v1h-5zM16 9h2v1h-2zM19 9h8v1h-8zM28 9h2v1h-2zM32 9h2v1h-2zM0 10h3v1h-3zM6 10h5v1h-5zM13 10h5v1h-5zM19 10h2v1h-2zM22 10h2v1h-2zM25 10h2v1h-2zM28 10h6v1h-6zM0 11h3v1h-3zM8 11h3v1h-3zM12 11h2v1h-2zM16 11h2v1h-2zM19 11h2v1h-2zM22 11h2v1h-2zM25 11h2v1h-2zM28 11h2v1h-2zM0 12h4v1h-4zM8 12h3v1h-3zM12 12h2v1h-2zM16 12h2v1h-2zM19 12h2v1h-2zM22 12h2v1h-2zM25 12h2v1h-2zM28 12h2v1h-2zM1 13h10v1h-10zM12 13h6v1h-6zM19 13h2v1h-2zM22 13h2v1h-2zM25 13h2v1h-2zM28 13h6v1h-6zM2 14h6v1h-6zM9 14h2v1h-2zM13 14h5v1h-5zM19 14h2v1h-2zM22 14h2v1h-2zM25 14h2v1h-2zM29 14h4v1h-4z";
const EMBER = "M55 0h1v1h-1zM55 1h1v1h-1zM54 2h3v1h-3zM52 3h7v1h-7zM54 4h3v1h-3zM36 5h7v1h-7zM55 5h1v1h-1zM62 5h2v1h-2zM35 6h9v1h-9zM55 6h1v1h-1zM58 6h2v1h-2zM62 6h2v1h-2zM35 7h3v1h-3zM42 7h2v1h-2zM58 7h2v1h-2zM62 7h2v1h-2zM35 8h3v1h-3zM45 8h7v1h-7zM54 8h2v1h-2zM57 8h4v1h-4zM62 8h6v1h-6zM35 9h8v1h-8zM45 9h8v1h-8zM54 9h2v1h-2zM58 9h2v1h-2zM62 9h7v1h-7zM36 10h8v1h-8zM45 10h2v1h-2zM48 10h2v1h-2zM51 10h2v1h-2zM54 10h2v1h-2zM58 10h2v1h-2zM62 10h2v1h-2zM67 10h2v1h-2zM41 11h3v1h-3zM45 11h2v1h-2zM48 11h2v1h-2zM51 11h2v1h-2zM54 11h2v1h-2zM58 11h2v1h-2zM62 11h2v1h-2zM67 11h2v1h-2zM35 12h2v1h-2zM41 12h3v1h-3zM45 12h2v1h-2zM48 12h2v1h-2zM51 12h2v1h-2zM54 12h2v1h-2zM58 12h2v1h-2zM62 12h2v1h-2zM67 12h2v1h-2zM35 13h9v1h-9zM45 13h2v1h-2zM48 13h2v1h-2zM51 13h2v1h-2zM54 13h2v1h-2zM58 13h2v1h-2zM62 13h2v1h-2zM67 13h2v1h-2zM36 14h7v1h-7zM45 14h2v1h-2zM48 14h2v1h-2zM51 14h2v1h-2zM54 14h2v1h-2zM59 14h2v1h-2zM62 14h2v1h-2zM67 14h2v1h-2z";

type WordmarkProps = {
  /** Rendered height in px. Use multiples of 15 for perfectly crisp pixels. */
  height?: number;
  tone?: "duo" | "mono";
  className?: string;
  title?: string;
};

export function Wordmark({
  height = 30,
  tone = "duo",
  className,
  title = "GameSmith",
}: WordmarkProps) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      height={height}
      width={(height * W) / H}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      <path d={INK} fill="currentColor" />
      <path d={EMBER} fill={tone === "duo" ? "var(--ember)" : "currentColor"} />
    </svg>
  );
}
