import { fbm } from "./engine";

/**
 * Scenes are pure functions: (u, v, t, opts) -> tone in [0, 1].
 * u, v are normalized coords (0..1, v=0 is top), t is time in seconds.
 * Tone 0 maps to the first palette color, 1 to the last.
 */
export type SceneOptions = {
  seed: number;
  /** Aspect ratio (width / height) so noise is not stretched. */
  aspect: number;
};

export type Scene = (
  u: number,
  v: number,
  t: number,
  o: SceneOptions,
) => number;

/** Linear fade top -> bottom. Use for dissolving panel edges. */
const fade: Scene = (_u, v) => v;

/** Radial glow from center. */
const glow: Scene = (u, v, _t, o) => {
  const dx = (u - 0.5) * o.aspect;
  const dy = v - 0.5;
  return Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 1.6);
};

/** Drifting cloud bank, like the logo's halftone clouds. */
const clouds: Scene = (u, v, t, o) => {
  const n = fbm(u * 3 * o.aspect + t * 0.04, v * 3 + t * 0.01, o.seed, 5);
  return Math.max(0, Math.min(1, (n - 0.35) * 2.2));
};

/**
 * Horizon: night sky, a far mountain range, rolling hills, and a lit plain
 * with grass tufts that grow toward the viewer. The landscape of the
 * reference images, built from noise. Tones: sky 0-0.33, mountains
 * ~0.45-0.78, plain 0.8-1.
 */
type HorizonSun = { x: number; y: number; r: number };

function makeHorizon(sunDisc?: HorizonSun): Scene {
  return (u, v, t, o) => {
    const x = u * o.aspect;
    // Ridged noise gives peaks instead of blobs.
    const ridged = 1 - Math.abs(2 * fbm(x * 0.8 + 1.7, 0.3, o.seed, 5) - 1);
    // Portrait frames get more sky so type has room.
    const lift = o.aspect < 1 ? 0.18 * (1 - o.aspect) : 0;
    const far = 0.66 + lift - 0.2 * ridged * ridged;
    const near = 0.72 + lift - 0.05 * fbm(x * 2.2 + 8.3, 0.7, o.seed + 4, 4);
    if (v < far) {
      // A low sun behind the range, halftoning toward its base (the logo's sun).
    // It sits just above the ridge line and shrinks in portrait frames.
    if (sunDisc) {
      const r = sunDisc.r * Math.min(1, o.aspect);
      const dx = (u - sunDisc.x) * o.aspect;
      const dy = v - (sunDisc.y + lift);
      if (dx * dx + dy * dy < r * r) {
        const k = (dy + r) / (2 * r);
        return 0.92 - Math.pow(k, 1.6) * 0.55;
      }
    }
    // Sky stays dark so type can sit on it.
      const g = Math.pow(v / far, 3);
      const drift = fbm(x * 1.5 + t * 0.02, v * 6, o.seed + 2, 3);
      return 0.03 + 0.3 * g + 0.05 * (drift - 0.5);
    }
    if (v < near) {
      // Mountains: lighter than the sky, etched with noise, lit along the ridge.
      if (v - far < 0.01) return 0.78;
      const k = (v - far) / Math.max(0.001, near - far);
      const shade = fbm(x * 12, v * 16, o.seed + 6, 3);
      return 0.56 + 0.08 * k + 0.24 * (shade - 0.5);
    }
    // Plain: brightest, with sparse grass tufts that grow toward the viewer.
    const d = (v - near) / (1 - near);
    const tuft = fbm(x * (26 - 14 * d), v * (120 - 70 * d), o.seed + 11, 3);
    return 0.8 + 0.2 * d - (tuft > 0.66 ? 0.45 : 0);
  };
}

const horizon = makeHorizon();

/** Dawn: the horizon with an ember sun rising behind the far range. */
const dawn = makeHorizon({ x: 0.78, y: 0.52, r: 0.17 });

/**
 * Ember sun: solid at the top, breaking into halftone toward the bottom,
 * crossed by drifting cloud streaks. The sun from the logo.
 */
const sun: Scene = (u, v, t, o) => {
  const cx = 0.62;
  const cy = 0.48;
  const R = 0.3;
  const dx = (u - cx) * o.aspect;
  const dy = v - cy;
  let tone = 0;
  if (dx * dx + dy * dy < R * R) {
    const k = (dy + R) / (2 * R);
    tone = 1 - Math.pow(k, 1.7) * 0.9;
  }
  const cloud = fbm(u * 2.4 * o.aspect + t * 0.03, v * 10, o.seed, 4);
  const streak = v > 0.52 && v < 0.86 ? Math.max(0, cloud - 0.56) * 3 : 0;
  return Math.max(0, Math.min(1, tone - streak));
};

/** Forge: rising embers/heat, for "building the game" states. */
const forge: Scene = (u, v, t, o) => {
  const n = fbm(u * 4 * o.aspect, v * 3 + t * 0.35, o.seed, 4);
  const heat = Math.pow(v, 1.6);
  return Math.max(0, Math.min(1, heat * 0.9 + (n - 0.5) * 0.7));
};

export const SCENES = {
  fade,
  glow,
  clouds,
  horizon,
  dawn,
  sun,
  forge,
} satisfies Record<string, Scene>;
export type SceneName = keyof typeof SCENES;
