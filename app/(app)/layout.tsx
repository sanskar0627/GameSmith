import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app/app-sidebar";
import { WelcomeDialog } from "@/components/app/welcome-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { demoUsage } from "@/lib/billing/mock";
import type { GameSummary } from "@/lib/games/types";
import { listRecentGames, toGameSummary } from "@/lib/server/games/queries";
import { ensureUser } from "@/lib/server/users";

/**
 * Signed-in app shell. Auth is checked here for every page in the group,
 * and again at each data access once games are persisted. `ensureUser`
 * redirects signed-out visitors and creates the user's row on first visit.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await ensureUser();
  // Restore the sidebar's open/collapsed state without a layout jump.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  const recentGames: GameSummary[] = (await listRecentGames(user.id)).map(toGameSummary);

  // TODO(data): the user's metered usage for this billing cycle.
  const { used, allowance } = demoUsage();
  const sparks = { used, allowance };

  return (
    <TooltipProvider>
      <Toaster>
        <SidebarProvider defaultOpen={sidebarOpen}>
          <AppSidebar games={recentGames} sparks={sparks} />
          <SidebarInset id="main" className="min-w-0 bg-background">{children}</SidebarInset>
          <WelcomeDialog />
        </SidebarProvider>
      </Toaster>
    </TooltipProvider>
  );
}
