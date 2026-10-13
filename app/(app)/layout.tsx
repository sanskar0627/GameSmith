import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { requireUser } from "@/lib/auth";
import { DEMO_GAMES } from "@/lib/games/mock";
import type { GameSummary } from "@/lib/games/types";

/**
 * Signed-in app shell. Auth is checked here for every page in the group,
 * and again at each data access once games are persisted.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();
  // Restore the sidebar's open/collapsed state without a layout jump.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  // TODO(data): load the user's 5 most recently edited games.
  const recentGames: GameSummary[] = [...DEMO_GAMES]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 5)
    .map(({ id, title, status, updatedAt, thumbnailUrl }) => ({ id, title, status, updatedAt, thumbnailUrl }));

  return (
    <TooltipProvider>
      <Toaster>
        <SidebarProvider defaultOpen={sidebarOpen}>
          <AppSidebar games={recentGames} />
          <SidebarInset className="min-w-0 bg-background">{children}</SidebarInset>
        </SidebarProvider>
      </Toaster>
    </TooltipProvider>
  );
}
