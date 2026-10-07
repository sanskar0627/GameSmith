/**
 * Dither engine: tiny, dependency-free ordered dithering.
 * Shared by <DitherField> (procedural scenes) and <DitherImage> (bitmaps).
 */

/** 8x8 Bayer matrix, normalized to [0, 1). */
export const BAYER8: Float32Array = (() => {
  const m = [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54,
    22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29,
    53, 21,
  ];
  return Float32Array.from(m, (v) => (v + 0.5) / 64);
})();

export type RGBA = [number, number, number, number];

/** Resolve any CSS color (hex, rgb, oklch, var()) to RGBA via the canvas. */
export function resolveColor(value: string, el: Element): RGBA {
  const v = value.trim();
  if (v === "transparent") return [0, 0, 0, 0];
  const css = v.startsWith("--") ? getComputedStyle(el).getPropertyValue(v).trim() : v;
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d");
  if (!ctx || !css) return [0, 0, 0, 255];
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

/** Map a value in [0,1] to a palette index with ordered dithering. */
export function ditherIndex(v: number, x: number, y: number, levels: number): number {
  const t = BAYER8[(y & 7) * 8 + (x & 7)];
  const s = Math.max(0, Math.min(1, v)) * (levels - 1);
  const base = Math.floor(s);
  return Math.min(levels - 1, base + (s - base > t ? 1 : 0));
}

/* --- Value noise ---------------------------------------------------------- */

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

export function noise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

export function fbm(x: number, y: number, seed = 0, octaves = 4): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise2(x * f, y * f, seed + i * 17);
    f *= 2;
    amp *= 0.5;
  }
  return v / (1 - Math.pow(0.5, octaves));
}
