import { cn } from "@/lib/utils";

/**
 * Pixel loader: a 3x3 grid of cells lit in a spiral, stepped (no easing),
 * like an 8-bit progress glyph. Use for short waits inside controls.
 * For long, generative work (building a game) use <DitherField animated />.
 */
const ORDER = [0, 1, 2, 5, 8, 7, 6, 3, 4];

type PixelLoaderProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
};

const CELL = { sm: "size-[3px] gap-[1px]", md: "size-1 gap-px", lg: "size-1.5 gap-0.5" } as const;

export function PixelLoader({ size = "md", className, label = "Loading" }: PixelLoaderProps) {
  const [cell, gap] = CELL[size].split(" ");
  return (
    <span role="status" aria-label={label} className={cn("inline-grid grid-cols-3 text-ember", gap, className)}>
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={cn(cell, "bg-current animate-pixel-blink")}
          style={{ animationDelay: `${(ORDER.indexOf(i) * 1200) / 9}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * Dither progress bar. Determinate: solid fill with a dithered leading edge.
 * Indeterminate: a marching dither band.
 */
type DitherProgressProps = {
  value?: number; // 0..100, omit for indeterminate
  className?: string;
  label?: string;
};

export function DitherProgress({ value, className, label = "Progress" }: DitherProgressProps) {
  const indeterminate = value === undefined;
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : pct}
      className={cn("relative h-1.5 w-full overflow-hidden bg-muted", className)}
    >
      {indeterminate ? (
        <div className="absolute inset-0 bg-ember dither-50 animate-dither-march [--dither-cell:8px]" />
      ) : (
        <div className="absolute inset-y-0 left-0 flex transition-[width] duration-500 ease-forge" style={{ width: `${pct}%` }}>
          <div className="h-full flex-1 bg-ember" />
          <div className="h-full w-2 bg-ember dither-50 [--dither-cell:6px]" />
          <div className="h-full w-2 bg-ember dither-25 [--dither-cell:6px]" />
        </div>
      )}
    </div>
  );
}
