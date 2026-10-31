"use server";

import { z } from "zod";

import { ensureUser } from "@/lib/server/users";

import { createCheckoutUrl, createPortalUrl, PaymentsNotConfiguredError } from "./polar";

/**
 * Billing actions return a Polar-hosted URL for the browser to open. They
 * never change sparks: only the verified webhook does that.
 */

export type BillingActionResult = { ok: true; url: string } | { ok: false; error: string };

const offer = z.enum(["forge", "studio", "pack_5k", "pack_25k"], { error: "Unknown offer" });

async function run(label: string, fn: (user: { id: string; email: string | null }) => Promise<string>) {
  const user = await ensureUser();
  try {
    return { ok: true, url: await fn(user) } satisfies BillingActionResult;
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError) {
      return { ok: false, error: "Payments aren't set up on this server yet." } satisfies BillingActionResult;
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "Invalid input" } satisfies BillingActionResult;
    }
    console.error(`[billing] ${label} failed`, error);
    return { ok: false, error: "Couldn't reach the payment provider. Try again." } satisfies BillingActionResult;
  }
}

export async function startCheckoutAction(offerId: string): Promise<BillingActionResult> {
  return run("checkout", (user) => createCheckoutUrl({ userId: user.id, email: user.email, offer: offer.parse(offerId) }));
}

export async function openBillingPortalAction(): Promise<BillingActionResult> {
  return run("portal", (user) => createPortalUrl(user.id));
}
