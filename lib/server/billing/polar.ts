import "server-only";

import { createPolar, type Polar } from "@polar-sh/sdk/2026-10";

import { PACKS, PLANS } from "@/lib/billing/pricing";
import type { OfferId } from "@/lib/billing/types";
import { serverEnv } from "@/lib/env";

/**
 * Polar is the merchant of record: it hosts checkout, charges tax and pays
 * out (Stripe is invite-only in India). Each offer is a Polar product whose
 * id comes from the environment. Sparks are granted only by the verified
 * order.paid webhook, never by the checkout redirect.
 */

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super("Payments are not configured");
    this.name = "PaymentsNotConfiguredError";
  }
}

export type OfferInfo =
  | { kind: "subscription"; id: Exclude<OfferId, `pack_${string}`>; sparks: number }
  | { kind: "pack"; id: Extract<OfferId, `pack_${string}`>; sparks: number };

export const OFFERS: Record<OfferId, OfferInfo> = {
  forge: { kind: "subscription", id: "forge", sparks: PLANS.find((p) => p.id === "forge")!.sparks },
  studio: { kind: "subscription", id: "studio", sparks: PLANS.find((p) => p.id === "studio")!.sparks },
  pack_5k: { kind: "pack", id: "pack_5k", sparks: PACKS.find((p) => p.id === "pack_5k")!.sparks },
  pack_25k: { kind: "pack", id: "pack_25k", sparks: PACKS.find((p) => p.id === "pack_25k")!.sparks },
};

export function productIds(): Record<OfferId, string | undefined> {
  const env = serverEnv();
  return {
    forge: env.POLAR_PRODUCT_FORGE,
    studio: env.POLAR_PRODUCT_STUDIO,
    pack_5k: env.POLAR_PRODUCT_PACK_5K,
    pack_25k: env.POLAR_PRODUCT_PACK_25K,
  };
}

/** Which offer a Polar product is, or null for products GameSmith doesn't sell. */
export function offerForProduct(productId: string | null | undefined): OfferInfo | null {
  if (!productId) return null;
  const ids = productIds();
  const offer = (Object.keys(ids) as OfferId[]).find((id) => ids[id] === productId);
  return offer ? OFFERS[offer] : null;
}

let client: { token: string; polar: Polar } | undefined;

export function polar(): Polar {
  const env = serverEnv();
  if (!env.POLAR_ACCESS_TOKEN) throw new PaymentsNotConfiguredError();
  if (client?.token !== env.POLAR_ACCESS_TOKEN) {
    client = {
      token: env.POLAR_ACCESS_TOKEN,
      polar: createPolar({ accessToken: env.POLAR_ACCESS_TOKEN, environment: env.POLAR_SERVER, timeout: 15 }),
    };
  }
  return client.polar;
}

/** Hosted checkout for one offer. The user is linked by external customer id. */
export async function createCheckoutUrl(input: { userId: string; email: string | null; offer: OfferId }) {
  const productId = productIds()[input.offer];
  if (!productId) throw new PaymentsNotConfiguredError();
  const base = serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const checkout = await polar().checkouts.create({
    products: [productId],
    external_customer_id: input.userId,
    customer_email: input.email ?? undefined,
    metadata: { offer: input.offer },
    success_url: `${base}/settings/billing?checkout=success`,
    return_url: `${base}/settings/billing`,
  });
  return checkout.url;
}

/** Polar's customer portal: invoices, payment method, cancel or change plan. */
export async function createPortalUrl(userId: string) {
  const base = serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const session = await polar().customerSessions.create({
    external_customer_id: userId,
    return_url: `${base}/settings/billing`,
  });
  return session.customer_portal_url;
}
