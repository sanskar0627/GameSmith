import type { Metadata } from "next";
import { Suspense } from "react";
import { BillingSettings } from "@/components/settings/billing-settings";
import { PACKS, PLANS } from "@/lib/billing/pricing";
import { getUsageSummary, listPayments } from "@/lib/server/billing/summary";
import { ensureUser } from "@/lib/server/users";

export const metadata: Metadata = { title: "Usage & billing" };

export default async function BillingPage() {
  const user = await ensureUser();
  const [usage, payments] = await Promise.all([getUsageSummary(user.id), listPayments(user.id)]);
  return (
    // useSearchParams (checkout return) needs a Suspense boundary.
    <Suspense>
      <BillingSettings usage={usage} plans={PLANS} packs={PACKS} payments={payments} />
    </Suspense>
  );
}
