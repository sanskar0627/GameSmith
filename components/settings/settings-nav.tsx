"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings", label: "General" },
  { href: "/settings/billing", label: "Usage & billing" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:px-0">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative shrink-0 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              active && "md:before:absolute md:before:inset-y-2 md:before:left-0 md:before:w-0.5 md:before:rounded-full md:before:bg-ember",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsSection({
  title,
  description,
  children,
  tone,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  tone?: "danger";
}) {
  return (
    <section className="border-b border-hairline py-8 first:pt-0 last:border-0">
      <h2 className={cn("font-display text-display-sm", tone === "danger" && "text-destructive")}>{title}</h2>
      {description && <p className="mt-1 max-w-lg text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
