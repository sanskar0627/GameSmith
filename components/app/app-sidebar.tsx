"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Plus } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { Spark } from "@/components/brand/spark";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { GameSummary } from "@/lib/games/types";
import { AccountMenu } from "./account-menu";
import { GameNavItem } from "./game-nav-item";

const NAV = [{ href: "/games", label: "Games", icon: LayoutGrid }] as const;

/** Active marker: a 2px ember bar on the left edge, nothing else. */
const navItemClass =
  "relative data-active:bg-sidebar-accent data-active:font-medium before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-ember before:opacity-0 data-active:before:opacity-100 group-data-[collapsible=icon]:before:hidden";

export function AppSidebar({ games }: { games: GameSummary[] }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="gap-3 px-3 pt-4 pb-2 group-data-[collapsible=icon]:px-2">
        <Link
          href="/games"
          aria-label="GameSmith"
          className="flex h-8 items-center rounded-sm px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <Wordmark height={15} className="group-data-[collapsible=icon]:hidden" />
          <Spark size={14} className="hidden group-data-[collapsible=icon]:block" title="GameSmith" />
        </Link>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Quiet on purpose: ember belongs to the one forge action in the content. */}
            <SidebarMenuButton
              tooltip="New game"
              isActive={pathname === "/new"}
              render={<Link href="/new" />}
              className="h-9 border border-sidebar-border bg-background/70 font-medium hover:bg-sidebar-accent data-active:border-ember/40 data-active:bg-sidebar-accent group-data-[collapsible=icon]:size-8!"
            >
              <Plus className="text-ember-text" />
              <span className="group-data-[collapsible=icon]:hidden">New game</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    tooltip={label}
                    isActive={pathname === href}
                    render={<Link href={href} />}
                    className={navItemClass}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="label-pixel text-muted-foreground">Recent</SidebarGroupLabel>
          <SidebarGroupContent>
            {games.length > 0 ? (
              <SidebarMenu>
                {games.map((g) => (
                  <GameNavItem key={g.id} game={g} active={pathname === `/g/${g.id}`} />
                ))}
              </SidebarMenu>
            ) : (
              <p className="px-2 py-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Games you forge will show up here.
              </p>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <AccountMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
