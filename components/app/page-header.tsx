import type { ReactNode } from "react";
import Link from "next/link";
import { Spark } from "@/components/brand/spark";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Top bar for app pages: sidebar toggle, title (or breadcrumb), actions.
 * Pages own their header so the workspace can carry game-specific controls.
 */
export function PageHeader({
  title,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-hairline bg-background/85 px-3 backdrop-blur sm:px-4",
        className,
      )}
    >
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
      {/* Phones: the sidebar (and its wordmark) lives in a sheet, so keep the mark visible. */}
      <Link href="/games" aria-label="GameSmith home" className="rounded-sm p-1 md:hidden">
        <Spark size={14} />
      </Link>
      <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center" />
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        {eyebrow && <span className="label-pixel hidden text-muted-foreground sm:inline">{eyebrow}</span>}
        <h1 className="truncate text-sm font-medium">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
