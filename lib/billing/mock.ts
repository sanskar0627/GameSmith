import type { Plan, UsageSummary } from "./types";

/**
 * DEMO plans and usage until billing is connected.
 * TODO(data): plans from the billing provider; usage metered per agent run.
 */
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Spark",
    priceMonthly: 0,
    sparks: 2_000,
    perks: ["3 active games", "Share links", "Community support"],
  },
  {
    id: "forge",
    name: "Forge",
    priceMonthly: 20,
    sparks: 20_000,
    perks: ["Unlimited games", "Version history forever", "Priority builds", "Export source"],
  },
  {
    id: "studio",
    name: "Studio",
    priceMonthly: 60,
    sparks: 80_000,
    perks: ["Everything in Forge", "Shared workspace", "Custom domains for games"],
  },
];

export function demoUsage(): UsageSummary {
  const resets = new Date();
  resets.setUTCDate(resets.getUTCDate() + 11);
  return {
    plan: "free",
    used: 1_280,
    allowance: 2_000,
    resetsAt: resets.toISOString(),
    byGame: [
      { gameId: "floating-islands", title: "Floating Islands", sparks: 540 },
      { gameId: "neon-canyon", title: "Neon Canyon Racer", sparks: 310 },
      { gameId: "meteor-dodge", title: "Meteor Dodge", sparks: 220 },
      { gameId: "fogbound", title: "Lighthouse vs Fog", sparks: 160 },
      { gameId: "shell-farm", title: "Turtle-back Farm", sparks: 50 },
    ],
  };
}
