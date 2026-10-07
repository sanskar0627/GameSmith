import type { GameCard, GameFile, GameVersion } from "./types";

/**
 * DEMO DATA for the library until persistence lands.
 * TODO(data): replace with queries scoped to the signed-in user.
 */
// Relative to now so "edited 2h ago" always reads true.
const at = (daysAgo: number, hoursAgo = 0) => new Date(Date.now() - daysAgo * 86_400_000 - hoursAgo * 3_600_000).toISOString();

export const DEMO_GAMES: GameCard[] = [
  { id: "floating-islands", title: "Floating Islands", status: "ready", version: 4, genre: "Adventure", pitch: "A small knight hops across sky islands at dusk, gathering crystals before sunset.", updatedAt: at(0, 1), createdAt: at(5), visibility: "link", coverSeed: 10 },
  { id: "neon-canyon", title: "Neon Canyon Racer", status: "building", version: 2, genre: "Racing", pitch: "Low-poly racing through a neon canyon at night. Drift to charge your boost.", updatedAt: at(0, 3), createdAt: at(2), visibility: "private", coverSeed: 14 },
  { id: "fogbound", title: "Lighthouse vs Fog", status: "error", version: 3, genre: "Defense", pitch: "Keep the light turning while fog creatures creep up the cliffs.", updatedAt: at(1, 2), createdAt: at(6), visibility: "private", coverSeed: 23 },
  { id: "shell-farm", title: "Turtle-back Farm", status: "draft", version: 0, genre: "Cozy", pitch: "Plant, harvest and trade on the back of a giant sleeping turtle.", updatedAt: at(1, 6), createdAt: at(1), visibility: "private", coverSeed: 31 },
  { id: "meteor-dodge", title: "Meteor Dodge", status: "ready", version: 7, genre: "Arcade", pitch: "One button, a tiny ship, and a sky that keeps falling.", updatedAt: at(2, 0), createdAt: at(9), visibility: "link", coverSeed: 2 },
  { id: "ember-forge", title: "Ember Forge", status: "ready", version: 5, genre: "Crafting", pitch: "Heat, hammer and quench blades before the order bell rings.", updatedAt: at(4, 0), createdAt: at(12), visibility: "private", coverSeed: 19 },
  { id: "dune-riders", title: "Dune Riders", status: "ready", version: 2, genre: "Exploration", pitch: "Ride across a moonlit desert, following rumors of a buried city.", updatedAt: at(6, 0), createdAt: at(14), visibility: "link", coverSeed: 5 },
  { id: "tidal-maze", title: "Tidal Maze", status: "ready", version: 3, genre: "Puzzle", pitch: "The maze floods every 30 seconds. Learn the tides or swim.", updatedAt: at(9, 0), createdAt: at(20), visibility: "private", coverSeed: 8 },
];

export function getDemoGame(id: string): GameCard | undefined {
  return DEMO_GAMES.find((g) => g.id === id);
}

const VERSION_NOTES: [string, string][] = [
  ["First playable", "A knight crossing floating islands, collecting crystals before the sun sets."],
  ["Faster sentinels, health", "Make the sentinels faster and add a health bar."],
  ["Crash fixed", "The game crashed. Can you fix it?"],
  ["Nighttime + fireflies", "Make it nighttime with fireflies."],
  ["Double jump", "Add a double jump, but only after collecting 3 crystals."],
  ["Castle interior", "Make the castle more mysterious and let me walk inside."],
  ["Boss sentinel", "Add a boss at the castle gate."],
];

export function getDemoVersions(game: GameCard): GameVersion[] {
  return Array.from({ length: game.version }, (_, i) => {
    const [label, prompt] = VERSION_NOTES[i % VERSION_NOTES.length];
    return {
      version: i + 1,
      label,
      prompt,
      // Spread builds between creation and the last edit; the newest matches "edited …".
      createdAt: new Date(
        Date.parse(game.createdAt) +
          ((Date.parse(game.updatedAt) - Date.parse(game.createdAt)) * (game.version > 1 ? i / (game.version - 1) : 1)),
      ).toISOString(),
      status: game.status === "error" && i === game.version - 1 ? ("error" as const) : ("ready" as const),
      filesChanged: i === 0 ? 6 : 1 + ((i * 3) % 4),
    };
  }).reverse();
}

export const DEMO_FILES: GameFile[] = [
  {
    path: "src/main.ts",
    language: "ts",
    content: `import { createGame } from "@gamesmith/runtime";
import { buildWorld } from "./game/world";
import { spawnKnight } from "./game/knight";
import { placeCrystals } from "./game/crystals";
import { mountHud } from "./game/hud";

const game = createGame({
  canvas: document.querySelector("canvas")!,
  camera: { mode: "third-person", distance: 6 },
  lighting: "dusk",
});

const world = buildWorld(game);
const knight = spawnKnight(game, world.spawn);
const crystals = placeCrystals(game, world.islands);
const hud = mountHud(game, { crystals: crystals.total });

game.onTick((dt) => {
  knight.update(dt);
  crystals.update(dt, knight);
  hud.update({ crystals: crystals.collected, health: knight.health });
});

game.start();
`,
  },
  {
    path: "src/game/world.ts",
    language: "ts",
    content: `import type { Game } from "@gamesmith/runtime";

const ISLANDS = [
  { x: 0, y: 0, z: 0, radius: 8 },
  { x: 14, y: 2, z: -6, radius: 5 },
  { x: 26, y: 4, z: -2, radius: 4 },
  { x: 38, y: 3, z: -10, radius: 4 },
  { x: 52, y: 6, z: -8, radius: 7 }, // castle
];

export function buildWorld(game: Game) {
  const islands = ISLANDS.map((i) =>
    game.spawn("floating-island", { position: [i.x, i.y, i.z], radius: i.radius }),
  );
  game.spawn("castle", { position: [52, 6, -8] });
  game.fog({ color: "#2a1a14", near: 30, far: 90 });
  return { islands, spawn: [0, 1, 0] as const };
}
`,
  },
  {
    path: "src/game/knight.ts",
    language: "ts",
    content: `import type { Game, Vec3 } from "@gamesmith/runtime";

export function spawnKnight(game: Game, at: Vec3) {
  const knight = game.spawn("character", {
    position: at,
    model: "knight",
    controller: { speed: 5, jump: 7, dash: 12 },
  });
  let health = 3;
  return {
    get health() {
      return health;
    },
    hit() {
      health = Math.max(0, health - 1);
      if (health === 0) game.restartFromCheckpoint();
    },
    update(dt: number) {
      knight.controller.update(dt, game.input);
    },
  };
}
`,
  },
  {
    path: "src/game/crystals.ts",
    language: "ts",
    content: `import type { Game } from "@gamesmith/runtime";

export function placeCrystals(game: Game, islands: { position: number[] }[]) {
  const items = islands.flatMap((island, i) =>
    Array.from({ length: i === 0 ? 1 : 2 }, (_, k) =>
      game.spawn("pickup", { kind: "crystal", near: island, offset: k }),
    ),
  );
  let collected = 0;
  return {
    total: items.length,
    get collected() {
      return collected;
    },
    update(_dt: number, knight: { position?: number[] }) {
      for (const c of items) if (!c.taken && c.touches(knight)) (c.taken = true), collected++;
    },
  };
}
`,
  },
  {
    path: "src/game/hud.ts",
    language: "ts",
    content: `import type { Game } from "@gamesmith/runtime";

export function mountHud(game: Game, opts: { crystals: number }) {
  const hud = game.hud.panel({ corner: "top-left" });
  return {
    update(state: { crystals: number; health: number }) {
      hud.text(\`Crystals \${state.crystals}/\${opts.crystals}\`);
      hud.hearts(state.health);
    },
  };
}
`,
  },
  { path: "index.html", language: "html", content: `<!doctype html>\n<html lang="en">\n  <body>\n    <canvas></canvas>\n    <script type="module" src="/src/main.ts"></script>\n  </body>\n</html>\n` },
  {
    path: "game.json",
    language: "json",
    content: `{\n  "title": "Floating Islands",\n  "runtime": "@gamesmith/runtime@0.1",\n  "brief": {\n    "goal": "Collect every crystal and reach the castle gate before sunset.",\n    "controls": ["WASD move", "Space jump", "Shift dash"]\n  }\n}\n`,
  },
  { path: "README.md", language: "md", content: `# Floating Islands\n\nForged with GameSmith.\n\nA small knight hops across sky islands at dusk, gathering crystals before sunset.\n` },
];
