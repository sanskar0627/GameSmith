import { Color } from "three";

/**
 * Vivid, harmonious palettes. Games should pick one and commit to it.
 * Never use the GameSmith interface colours (bone, ink, ember) in a game.
 */
export type Palette = {
  sky: Color;
  ground: Color;
  primary: Color;
  secondary: Color;
  accent: Color;
  glow: Color;
};

export type Harmony = "complementary" | "triadic" | "analogous" | "split";

/** Deterministic palette from a seed, so a game keeps its colours across reloads. */
export function makePalette(seed: number, harmony: Harmony = "triadic"): Palette {
  const base = ((seed * 137.508) % 360 + 360) % 360;
  const offsets: Record<Harmony, [number, number, number]> = {
    complementary: [0, 180, 30],
    triadic: [0, 120, 240],
    analogous: [0, 30, -30],
    split: [0, 150, 210],
  };
  const [a, b, c] = offsets[harmony].map((o) => (base + o + 360) % 360);
  const hsl = (h: number, s: number, l: number) => new Color().setHSL(h / 360, s, l);
  return {
    sky: hsl(a, 0.55, 0.18),
    ground: hsl(b, 0.45, 0.32),
    primary: hsl(a, 0.85, 0.58),
    secondary: hsl(b, 0.8, 0.55),
    accent: hsl(c, 0.95, 0.62),
    glow: hsl(c, 1, 0.75),
  };
}

/** Named palettes for quick starts. */
export const PRESETS = {
  sunsetIslands: makePalette(7, "split"),
  neonNight: makePalette(3, "triadic"),
  candyMeadow: makePalette(11, "analogous"),
  deepSea: makePalette(5, "complementary"),
} satisfies Record<string, Palette>;
