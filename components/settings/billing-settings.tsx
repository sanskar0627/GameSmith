"use client";

import { Check } from "lucide-react";
import { DitherProgress } from "@/components/brand/pixel-loader";
import { Spark } from "@/components/brand/spark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { Plan, UsageSummary } from "@/lib/billing/types";
import { daysUntil } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SettingsSection } from "./settings-nav";

const fmt = (n: number) => n.toLocaleString("en-US");

export function BillingSettings({ usage, plans }: { usage: UsageSummary; plans: Plan[] }) {
  const pct = Math.min(100, Math.round((usage.used / usage.allowance) * 100));
  const days = daysUntil(usage.resetsAt);
  const max = Math.max(...usage.byGame.map((g) => g.sparks), 1);
  const current = plans.find((p) => p.id === usage.plan);

  return (
    <>
      <SettingsSection title="This month" description="Sparks are units of agent work: thinking, writing files and building.">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="label-pixel text-muted-foreground">Sparks used</span>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="font-pixel text-4xl tabular-nums">{fmt(usage.used)}</span>
                <span className="text-sm text-muted-foreground">of {fmt(usage.allowance)}</span>
              </p>
            </div>
            <p className="text-[13px] text-muted-foreground" suppressHydrationWarning>
              Resets in {days} {days === 1 ? "day" : "days"} · {current?.name} plan
            </p>
          </div>
          <DitherProgress value={pct} className="mt-4 h-2" label="Sparks used this month" />
          <div className="mt-6">
            <span className="label-pixel text-muted-foreground">By game</span>
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
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Plans" description="Change or cancel anytime. Unused sparks don't roll over.">
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
                <p className="mt-1 text-sm text-muted-foreground">{fmt(plan.sparks)} sparks a month</p>
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
                  ) : (
                    <Button
                      variant={featured ? "ember" : "outline"}
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        // TODO(data): open checkout for this plan.
                        toast.add({ title: "Billing isn't connected yet", description: `Upgrading to ${plan.name} arrives with payments.` })
                      }
                    >
                      Upgrade to {plan.name}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </SettingsSection>

      <SettingsSection title="Invoices">
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No invoices yet. They&rsquo;ll appear here after your first payment.
        </p>
      </SettingsSection>
    </>
  );
}
