import { AmbientLight, Color, DirectionalLight, Fog, HemisphereLight, Scene } from "three";

import type { Palette } from "./palette";

/** Three-point-ish rig tinted by the palette: warm key, coloured sky bounce, soft fog for depth. */
export function addLightingRig(scene: Scene, palette: Palette, options: { fog?: boolean } = {}) {
  scene.background = palette.sky.clone();
  const hemi = new HemisphereLight(palette.sky.clone().offsetHSL(0, 0, 0.35), palette.ground, 1.1);
  const key = new DirectionalLight(new Color().setHSL(0.1, 0.6, 0.85), 2.2);
  key.position.set(6, 10, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const rim = new DirectionalLight(palette.accent, 0.8);
  rim.position.set(-6, 4, -6);
  const ambient = new AmbientLight(palette.primary, 0.15);
  scene.add(hemi, key, rim, ambient);
  if (options.fog !== false) scene.fog = new Fog(palette.sky, 18, 60);
  return { hemi, key, rim, ambient };
}
