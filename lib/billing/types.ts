/**
 * Credits are "sparks": one unit of agent work (thinking, writing files,
 * building). Plans grant a monthly allowance that resets each cycle.
 */
export type PlanId = "free" | "forge" | "studio";

export type Plan = {
  id: PlanId;
  name: string;
  priceMonthly: number; // USD
  sparks: number; // monthly allowance
  perks: string[];
};

export type UsageSummary = {
  plan: PlanId;
  used: number;
  allowance: number;
  resetsAt: string; // ISO
  byGame: { gameId: string; title: string; sparks: number }[];
};
