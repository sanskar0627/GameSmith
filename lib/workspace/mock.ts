import type { AskPart, BuildStep, ChatMessage, GameBrief, ToolPart, WorkspaceSnapshot } from "./types";

/**
 * DEMO DATA. Stands in for the agent until the backend lands.
 * Scenarios let every workspace state be reviewed at /g/demo?demo=<name>.
 */
export type DemoScenario = "fresh" | "ask" | "building" | "thread" | "crash";

export const DEMO_TITLE = "Floating Islands";

export const DEMO_BRIEF: GameBrief = {
  title: "Floating Islands",
  pitch: "A small knight hops across sky islands at dusk, gathering crystals before the sun goes down.",
  loop: "Explore an island, collect crystals, jump the gap to the next one.",
  goal: "Collect every crystal and reach the castle gate before sunset.",
  challenge: "Patrolling sentinels and crumbling platforms. Falling sends you back to the last checkpoint.",
  controls: [
    { keys: ["W", "A", "S", "D"], action: "Move" },
    { keys: ["Space"], action: "Jump" },
    { keys: ["Shift"], action: "Dash" },
  ],
  world: "Five islands linked by gaps and bridges, a castle on the last one.",
  style: "Low-poly, warm dusk light, ember sun, soft fog below the islands.",
  feel: "Calm and floaty, with tense jumps.",
};

export const CAMERA_ASK: AskPart = {
  type: "ask",
  id: "ask-camera",
  question: "How should the camera follow the knight?",
  hint: "This changes controls and level design the most, so I want to get it right first.",
  options: [
    { id: "third", label: "Third person", description: "Behind the shoulder. Best for platforming." },
    { id: "iso", label: "Isometric", description: "Angled from above. Easier to read gaps." },
    { id: "first", label: "First person", description: "Most immersive, hardest jumps." },
  ],
};

export const BUILD_STEPS = [
  "Reading the brief",
  "Shaping the islands",
  "Writing the knight",
  "Placing crystals and sentinels",
  "Starting the sandbox",
];

export function stepsAt(active: number): BuildStep[] {
  return BUILD_STEPS.map((label, i) => ({
    label,
    state: i < active ? "done" : i === active ? "active" : "pending",
  }));
}

export const FIRST_BUILD_TOOLS: Omit<ToolPart, "state">[] = [
  { type: "tool", id: "t1", tool: "list_files", path: "/" },
  { type: "tool", id: "t2", tool: "read_file", path: "runtime/README.md" },
  { type: "tool", id: "t3", tool: "write_file", path: "src/game/world.ts", added: 86 },
  { type: "tool", id: "t4", tool: "write_file", path: "src/game/knight.ts", added: 54 },
  { type: "tool", id: "t5", tool: "write_file", path: "src/game/crystals.ts", added: 41 },
  { type: "tool", id: "t6", tool: "replace_text", path: "src/main.ts", added: 6, removed: 2 },
];

const t = (min: number) => new Date(Date.UTC(2026, 9, 9, 10, min)).toISOString();

const PROMPT = "A knight crossing floating islands, collecting crystals before the sun sets.";

const firstExchange: ChatMessage[] = [
  { id: "m1", role: "user", createdAt: t(0), parts: [{ type: "text", text: PROMPT }] },
  {
    id: "m2",
    role: "assistant",
    createdAt: t(0),
    parts: [
      { type: "reasoning", text: "Platformer at dusk. Camera choice drives controls and spacing.", seconds: 3 },
      { type: "text", text: "Love this. Floating islands at sunset is a great stage for a platformer. One decision before I plan it:" },
      { ...CAMERA_ASK },
    ],
  },
];

const briefExchange: ChatMessage[] = [
  { id: "m3", role: "user", createdAt: t(1), parts: [{ type: "text", text: "Third person" }] },
  {
    id: "m4",
    role: "assistant",
    createdAt: t(1),
    parts: [
      { type: "text", text: "Third person it is. Here's the plan. Approve it and I'll start building, or tell me what to change." },
      { type: "brief", brief: DEMO_BRIEF, status: "approved" },
    ],
  },
];

const firstBuild: ChatMessage[] = [
  {
    id: "m5",
    role: "assistant",
    createdAt: t(2),
    parts: [
      ...FIRST_BUILD_TOOLS.map((p) => ({ ...p, state: "done" as const })),
      {
        type: "text",
        text: "Your first version is ready. Five islands, eight crystals, two sentinels. Try the long jump on island three: it should feel tight but fair.",
      },
      { type: "checkpoint", version: 1, label: "First playable" },
    ],
  },
];

const iteration: ChatMessage[] = [
  { id: "m6", role: "user", createdAt: t(6), parts: [{ type: "text", text: "Make the sentinels faster and add a health bar." }] },
  {
    id: "m7",
    role: "assistant",
    createdAt: t(6),
    parts: [
      { type: "reasoning", text: "Speed lives in sentinels.ts. Health needs player state plus a HUD element.", seconds: 4 },
      { type: "tool", id: "t7", tool: "read_file", path: "src/game/sentinels.ts", state: "done" },
      { type: "tool", id: "t8", tool: "replace_text", path: "src/game/sentinels.ts", state: "done", added: 2, removed: 2 },
      { type: "tool", id: "t9", tool: "write_file", path: "src/game/health.ts", state: "done", added: 38 },
      { type: "tool", id: "t10", tool: "replace_text", path: "src/game/hud.ts", state: "done", added: 14, removed: 1 },
      { type: "text", text: "Sentinels now patrol 40% faster, and you have three hearts shown top-left. Touching a sentinel costs one." },
      { type: "checkpoint", version: 2, label: "Faster sentinels, health" },
    ],
  },
];

export function demoSnapshot(scenario: DemoScenario): WorkspaceSnapshot {
  switch (scenario) {
    case "fresh":
      return { messages: [], build: { status: "empty" }, activity: { state: "idle" } };
    case "ask":
      return { messages: firstExchange, build: { status: "empty" }, activity: { state: "waiting" } };
    case "building":
      return {
        messages: [
          ...withAnswer(firstExchange),
          ...briefExchange,
          {
            id: "m5",
            role: "assistant",
            createdAt: t(2),
            parts: [
              ...FIRST_BUILD_TOOLS.slice(0, 3).map((p) => ({ ...p, state: "done" as const })),
              { ...FIRST_BUILD_TOOLS[3], state: "running" as const },
            ],
          },
        ],
        build: { status: "building", version: 1, steps: stepsAt(2) },
        activity: { state: "working", detail: "Writing src/game/knight.ts" },
      };
    case "crash":
      return {
        messages: [...withAnswer(firstExchange), ...briefExchange, ...firstBuild, ...iteration],
        build: {
          status: "crashed",
          version: 2,
          error: {
            message: "TypeError: Cannot read properties of undefined (reading 'position')",
            stack: "at updateHealthBar (src/game/hud.ts:42:18)\nat tick (src/main.ts:61:5)",
            file: "src/game/hud.ts",
            line: 42,
          },
        },
        activity: { state: "idle" },
      };
    case "thread":
    default:
      return {
        messages: [...withAnswer(firstExchange), ...briefExchange, ...firstBuild, ...iteration],
        build: { status: "ready", version: 2 },
        activity: { state: "idle" },
      };
  }
}

function withAnswer(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) => (p.type === "ask" ? { ...p, answer: "Third person" } : p)),
  }));
}

export function isDemoScenario(v: unknown): v is DemoScenario {
  return v === "fresh" || v === "ask" || v === "building" || v === "thread" || v === "crash";
}
