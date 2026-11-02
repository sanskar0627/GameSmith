import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  PointsMaterial,
  type Scene,
  Vector3,
} from "three";

/** Additive spark bursts: feedback for pickups, hits and wins. */
export class Bursts {
  private readonly max: number;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly life: Float32Array;
  private readonly geometry = new BufferGeometry();
  private cursor = 0;
  readonly points: Points;

  constructor(scene: Scene, color: Color, max = 600) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.velocities = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    const material = new PointsMaterial({
      color,
      size: 0.18,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(this.geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(at: Vector3, count = 40, speed = 5) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const dir = new Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
      this.positions.set([at.x, at.y, at.z], i * 3);
      this.velocities.set([dir.x * speed, dir.y * speed, dir.z * speed], i * 3);
      this.life[i] = 0.6 + Math.random() * 0.5;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -9999;
        continue;
      }
      this.life[i] -= dt;
      this.velocities[i * 3 + 1] -= 9.8 * dt;
      for (let a = 0; a < 3; a++) this.positions[i * 3 + a] += this.velocities[i * 3 + a] * dt;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}
