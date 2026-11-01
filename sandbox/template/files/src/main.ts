import {
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Timer,
  Vector2,
  WebGLRenderer,
} from "three";

import { addLightingRig, Bursts, juice, PRESETS, sfx } from "./kit";

/**
 * Starter scene. The agent replaces this with the game; the kit in ./kit
 * stays available for palettes, lighting, juice, particles and sound.
 */
const palette = PRESETS.sunsetIslands;
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 4, 10);
camera.lookAt(0, 1, 0);
addLightingRig(scene, palette);

const ground = new Mesh(new PlaneGeometry(60, 60), new MeshStandardMaterial({ color: palette.ground, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const gems = [palette.primary, palette.secondary, palette.accent].map((color, i) => {
  const gem = new Mesh(
    new IcosahedronGeometry(0.8, 0),
    new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, flatShading: true }),
  );
  gem.position.set((i - 1) * 2.8, 1.4, 0);
  gem.castShadow = true;
  scene.add(gem);
  juice.popIn(gem, 0.5 + i * 0.1);
  return gem;
});

const bursts = new Bursts(scene, palette.glow);
const raycaster = new Raycaster();
const pointer = new Vector2();
window.addEventListener("pointerdown", (event) => {
  pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const [hit] = raycaster.intersectObjects(gems);
  if (!hit) return;
  juice.squash(hit.object, 0.35);
  juice.shake(0.25);
  bursts.emit(hit.point, 50);
  sfx.pickup();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const home = camera.position.clone();
const timer = new Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = juice.update(Math.min(timer.getDelta(), 0.05), camera);
  const t = timer.getElapsed();
  gems.forEach((gem, i) => {
    gem.rotation.y += dt * (0.6 + i * 0.2);
    gem.position.y = 1.4 + Math.sin(t * 2 + i) * 0.25;
  });
  bursts.update(dt);
  camera.position.lerp(home, 0.1);
  renderer.render(scene, camera);
});
