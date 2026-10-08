import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { requireUser } from "@/lib/auth";
import type { GameSummary } from "@/lib/games/types";

/**
 * Signed-in app shell. Auth is checked here for every page in the group,
 * and again at each data access once games are persisted.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();
  // Restore the sidebar's open/collapsed state without a layout jump.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  // TODO(data): load the user's recent games once persistence lands.
  const recentGames: GameSummary[] = [];

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar games={recentGames} />
        <SidebarInset className="min-w-0 bg-background">{children}</SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
