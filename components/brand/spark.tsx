import { cn } from "@/lib/utils";

/**
 * The GameSmith spark: the 4-point pixel star from the logo (the dot of the
 * "i" in Smith, the stars over the castle). It is the brand's only glyph and
 * marks AI / agent moments. Use sparingly.
 *
 * `twinkle` animates the outer tips in steps, for "thinking" states.
 */
type SparkProps = {
  size?: number;
  twinkle?: boolean;
  className?: string;
  title?: string;
};

// 7x7 grid, same drawing as the dot of the i in the wordmark:
// a 3x3 core, 1px arms, 1px tips.
const CORE = "M2 2h3v3h-3z";
const ARMS = "M1 3h1v1h-1zM5 3h1v1h-1zM3 1h1v1h-1zM3 5h1v1h-1z";
const TIPS = "M0 3h1v1h-1zM6 3h1v1h-1zM3 0h1v1h-1zM3 6h1v1h-1z";

export function Spark({ size = 14, twinkle = false, className, title }: SparkProps) {
  return (
    <svg
      viewBox="0 0 7 7"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill="currentColor"
      className={cn("shrink-0 text-ember", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={CORE} />
      <path d={ARMS} className={twinkle ? "animate-pixel-blink [animation-delay:200ms]" : undefined} />
      <path d={TIPS} className={twinkle ? "animate-pixel-blink" : undefined} />
    </svg>
  );
}
