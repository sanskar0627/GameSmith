import type { Metadata } from "next";
import { BillingSettings } from "@/components/settings/billing-settings";
import { demoUsage, PLANS } from "@/lib/billing/mock";

export const metadata: Metadata = { title: "Usage & billing" };

export default function BillingPage() {
  // TODO(data): read the user's plan and metered usage.
  return <BillingSettings usage={demoUsage()} plans={PLANS} />;
}
