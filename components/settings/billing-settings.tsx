"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ExternalLink } from "lucide-react";
import { DitherProgress } from "@/components/brand/pixel-loader";
import { Spark } from "@/components/brand/spark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { OfferId, Pack, PaymentRow, Plan, UsageSummary } from "@/lib/billing/types";
import { openBillingPortalAction, startCheckoutAction } from "@/lib/server/billing/actions";
import { daysUntil } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SettingsSection } from "./settings-nav";

const fmt = (n: number) => n.toLocaleString("en-US");

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

export function BillingSettings({
  usage,
  plans,
  packs,
  payments,
}: {
  usage: UsageSummary;
  plans: Plan[];
  packs: Pack[];
  payments: PaymentRow[];
}) {
  const pct = usage.allowance > 0 ? Math.min(100, Math.round((usage.used / usage.allowance) * 100)) : 0;
  const days = daysUntil(usage.resetsAt);
  const max = Math.max(...usage.byGame.map((g) => g.sparks), 1);
  const current = plans.find((p) => p.id === usage.plan);
  const paid = usage.plan !== "free";
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  useCheckoutReturnToast();

  const go = (key: string, action: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>) => {
    setBusy(key);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        window.location.assign(result.url);
        return;
      }
      setBusy(null);
      toast.add({ type: "error", title: "Couldn’t open checkout", description: result.error });
    });
  };
  const checkout = (offer: OfferId) => go(offer, () => startCheckoutAction(offer));
  const portal = () => go("portal", () => openBillingPortalAction());

  const period = paid ? (usage.cancelsAtPeriodEnd ? "Plan ends" : "Renews") : "Resets";

  return (
    <>
      <SettingsSection title="This period" description="Sparks are units of agent work: thinking, writing files and building.">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="label-pixel text-muted-foreground">Allowance used</span>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="font-pixel text-4xl tabular-nums">{fmt(usage.used)}</span>
                <span className="text-sm text-muted-foreground">of {fmt(usage.allowance)}</span>
              </p>
            </div>
            <p className="text-[13px] text-muted-foreground" suppressHydrationWarning>
              {period} in {days} {days === 1 ? "day" : "days"} · {current?.name} plan
            </p>
          </div>
          <DitherProgress value={pct} className="mt-4 h-2" label="Allowance used this period" />
          <dl className="mt-5 grid gap-3 text-[13px] sm:grid-cols-3">
            <Stat label="Allowance left" value={fmt(usage.granted)} />
            <Stat label="Pack sparks" value={fmt(usage.purchased)} hint="Never expire" />
            <Stat label="Held by builds" value={fmt(usage.reserved)} hint="Unused sparks come back" />
          </dl>
          <div className="mt-6">
            <span className="label-pixel text-muted-foreground">By game</span>
            {usage.byGame.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">No sparks spent this period.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2.5">
                {usage.byGame.map((g) => (
                  <li key={g.gameId} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-[13px]">
                    <span className="truncate">{g.title}</span>
                    <span className="h-1.5 overflow-hidden rounded-[1px] bg-muted">
                      <span className="block h-full bg-ember/80" style={{ width: `${(g.sparks / max) * 100}%` }} />
                    </span>
                    <span className="font-pixel text-[12px] tabular-nums text-muted-foreground">{fmt(g.sparks)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Plans" description="Monthly allowance. Unused allowance doesn't roll over.">
        <ul className="grid gap-3 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.id === usage.plan;
            const featured = plan.id === "forge";
            return (
              <li
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-xl border bg-card p-5",
                  featured ? "border-ember/50 ring-1 ring-ember/30" : "border-border",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="label-pixel flex items-center gap-1.5 text-ember-text">
                    {featured && <Spark size={7} />} {plan.name}
                  </span>
                  {isCurrent && <Badge variant="pixel">Current</Badge>}
                </div>
                <p className="mt-3 flex items-baseline gap-1">
                  <span className="font-display text-display-md">${plan.priceMonthly}</span>
                  <span className="text-sm text-muted-foreground">/ month</span>
                </p>
                <ul className="mt-4 flex flex-1 flex-col gap-1.5 text-[13px]">
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /> {perk}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  {isCurrent ? (
                    <Button variant="outline" size="sm" className="w-full" disabled>
                      Your plan
                    </Button>
                  ) : plan.id === "free" || paid ? (
                    // Downgrades and switches between paid plans happen in Polar's portal.
                    <Button variant="outline" size="sm" className="w-full" onClick={portal} disabled={pending || !paid}>
                      {paid ? "Change in billing portal" : "Included"}
                    </Button>
                  ) : (
                    <Button
                      variant={featured ? "ember" : "outline"}
                      size="sm"
                      className="w-full"
                      disabled={pending}
                      onClick={() => checkout(plan.id as OfferId)}
                    >
                      {busy === plan.id ? "Opening checkout…" : `Upgrade to ${plan.name}`}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </SettingsSection>

      <SettingsSection title="Sparks packs" description="One-time top-ups for any plan. Pack sparks never expire.">
        <ul className="grid gap-3 sm:grid-cols-2">
          {packs.map((pack) => (
            <li key={pack.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
              <span>
                <span className="block text-sm font-medium">{pack.name}</span>
                <span className="block text-[13px] text-muted-foreground">${pack.price} one time</span>
              </span>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => checkout(pack.id)}>
                {busy === pack.id ? "Opening…" : "Buy"}
              </Button>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection title="Payments">
        {payments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No payments yet. They&rsquo;ll appear here after your first purchase.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-hairline rounded-xl border border-border bg-card">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-[13px]">
                  <span className="min-w-0">
                    <span className="block font-medium">{p.description}</span>
                    <span className="block text-muted-foreground" suppressHydrationWarning>
                      {new Date(p.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })} · {fmt(p.sparks)} sparks
                    </span>
                  </span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {p.status === "refunded" && <Badge variant="pixel">Refunded</Badge>}
                    {money(p.amount, p.currency)}
                  </span>
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" className="mt-3" onClick={portal} disabled={pending}>
              {busy === "portal" ? "Opening…" : "Invoices and payment method"} <ExternalLink data-icon="inline-end" />
            </Button>
          </>
        )}
      </SettingsSection>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-pixel text-lg tabular-nums">{value}</dd>
      {hint && <dd className="text-[12px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}

/** Back from Polar checkout: sparks arrive by webhook, usually within seconds. */
function useCheckoutReturnToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(false);
  useEffect(() => {
    if (params.get("checkout") !== "success" || shown.current) return;
    shown.current = true;
    toast.add({ title: "Payment received", description: "Your sparks will appear in a few seconds." });
    router.replace(pathname);
    // Pick up the webhook's changes.
    setTimeout(() => router.refresh(), 4000);
  }, [params, router, pathname]);
}
