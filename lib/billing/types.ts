/**
 * Credits are "sparks": one unit of agent work (thinking, writing files,
 * building). Plans grant a monthly allowance that resets each cycle; packs
 * add sparks that never expire. See lib/billing/pricing.ts.
 */
export type PlanId = "free" | "forge" | "studio";
export type PackId = "pack_5k" | "pack_25k";
export type OfferId = Exclude<PlanId, "free"> | PackId;

export type Plan = {
  id: PlanId;
  name: string;
  priceMonthly: number; // USD
  sparks: number; // monthly allowance
  perks: string[];
};

export type Pack = {
  id: PackId;
  name: string;
  sparks: number;
  price: number; // USD, one-time
};

export type UsageSummary = {
  plan: PlanId;
  /** Spent from this period's allowance. */
  used: number;
  allowance: number;
  /** Left of this period's allowance. */
  granted: number;
  /** From packs. Never expires. */
  purchased: number;
  /** Held by runs that are still in progress. */
  reserved: number;
  resetsAt: string; // ISO
  /** The subscription ends at `resetsAt` instead of renewing. */
  cancelsAtPeriodEnd: boolean;
  byGame: { gameId: string; title: string; sparks: number }[];
};

export type PaymentRow = {
  id: string;
  description: string;
  amount: number; // minor units (cents)
  currency: string;
  sparks: number;
  status: "paid" | "refunded";
  createdAt: string;
};
