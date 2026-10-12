import type { Camera, Object3D } from "three";

/**
 * "Juice": small motions that make every action feel good.
 * Call `juice.update(dt)` once per frame.
 */
type Tween = { t: number; duration: number; step: (k: number) => void; done?: () => void };

const tweens: Tween[] = [];
let shake = 0;
let hitStop = 0;

export const ease = {
  outCubic: (k: number) => 1 - (1 - k) ** 3,
  outBack: (k: number) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2,
  inOutSine: (k: number) => -(Math.cos(Math.PI * k) - 1) / 2,
};

export const juice = {
  tween(duration: number, step: (k: number) => void, done?: () => void) {
    tweens.push({ t: 0, duration, step, done });
  },
  /** Squash on impact, then spring back. */
  squash(object: Object3D, amount = 0.3, duration = 0.25) {
    const base = object.scale.clone();
    juice.tween(duration, (k) => {
      const s = Math.sin(k * Math.PI) * amount * (1 - k);
      object.scale.set(base.x * (1 + s), base.y * (1 - s), base.z * (1 + s));
    }, () => object.scale.copy(base));
  },
  /** Pop in from nothing. */
  popIn(object: Object3D, duration = 0.35) {
    const target = object.scale.clone();
    object.scale.setScalar(0.001);
    juice.tween(duration, (k) => object.scale.copy(target).multiplyScalar(Math.max(0.001, ease.outBack(k))));
  },
  shake(strength = 0.3) {
    shake = Math.max(shake, strength);
  },
  /** Freeze the game for a few frames on big hits. */
  hitStop(seconds = 0.06) {
    hitStop = Math.max(hitStop, seconds);
  },
  /** Returns the dt the game should use (0 during hit-stop). */
  update(dt: number, camera?: Camera): number {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t = Math.min(tw.duration, tw.t + dt);
      tw.step(tw.t / tw.duration);
      if (tw.t >= tw.duration) {
        tweens.splice(i, 1);
        tw.done?.();
      }
    }
    if (camera && shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake = Math.max(0, shake - dt * 1.5);
    }
    if (hitStop > 0) {
      hitStop -= dt;
      return 0;
    }
    return dt;
  },
};
