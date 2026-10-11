import type { ModelSpec } from "@/lib/ai/models";

import type { Pack, Plan, PlanId } from "./types";

/**
 * Sparks: GameSmith's credit unit. Safe to import on the client.
 *
 * 1 spark covers SPARK_COST_MICRO_USD of model cost at the provider's list
 * price. Plans and packs sell sparks at roughly 2x that, which is the margin
 * that pays for sandboxes, storage and payment fees.
 *
 * PROPOSED NUMBERS. Change them here (and the Polar products) before launch.
 */
export const SPARK_COST_MICRO_USD = 500; // $0.0005 of model cost per spark

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Spark",
    priceMonthly: 0,
    sparks: 2_000,
    perks: ["2,000 sparks every month", "Share links", "Bring your own API keys"],
  },
  {
    id: "forge",
    name: "Forge",
    priceMonthly: 20,
    sparks: 20_000,
    perks: ["20,000 sparks every month", "Everything in Spark", "Top up with sparks packs"],
  },
  {
    id: "studio",
    name: "Studio",
    priceMonthly: 60,
    sparks: 80_000,
    perks: ["80,000 sparks every month", "Everything in Forge", "Best value per spark"],
  },
];

export const PACKS: Pack[] = [
  { id: "pack_5k", name: "5,000 sparks", sparks: 5_000, price: 5 },
  { id: "pack_25k", name: "25,000 sparks", sparks: 25_000, price: 20 },
];

export function getPlan(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

/** Monthly allowance for a plan. */
export function planAllowance(id: PlanId): number {
  return getPlan(id).sparks;
}

export type TokenUsage = { inputTokens: number; outputTokens: number };

/**
 * Provider cost of one model call in micro-USD at list price. Long-context
 * pricing applies to the whole call when its prompt crosses the threshold
 * (Anthropic and OpenAI both bill this way).
 */
export function costMicroUsd(spec: ModelSpec, usage: TokenUsage): number {
  const input = Math.max(0, Math.floor(usage.inputTokens));
  const output = Math.max(0, Math.floor(usage.outputTokens));
  const long = spec.longContext && input > spec.longContext.above ? spec.longContext : null;
  const inPrice = long ? long.input : spec.price.input;
  const outPrice = long ? long.output : spec.price.output;
  // price is micro-USD per million tokens.
  return Math.ceil((input * inPrice + output * outPrice) / 1_000_000);
}

/** Sparks for a cost, always rounded up so a non-zero call costs at least 1 spark. */
export function sparksForCost(costMicro: number): number {
  return costMicro <= 0 ? 0 : Math.ceil(costMicro / SPARK_COST_MICRO_USD);
}

/** The most one run may spend: a long agent session on this model. */
export const RUN_BUDGET_TOKENS: TokenUsage = { inputTokens: 400_000, outputTokens: 40_000 };

export function runBudgetSparks(spec: ModelSpec): number {
  return sparksForCost(costMicroUsd(spec, RUN_BUDGET_TOKENS));
}

/** A run won't start with less than this available: not enough for one useful step. */
export const MIN_RUN_SPARKS = 20;
