"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { ArrowUpRight, ChevronsUpDown, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { type ThemeChoice, useTheme } from "@/components/theme/theme";
import { SITE } from "@/lib/site";

/**
 * Account row at the foot of the sidebar. Opens a menu with profile,
 * theme, the creator's links and sign out. Uses Clerk for identity, our menu for the look.
 */
export function AccountMenu() {
  const { user, isLoaded } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const { isMobile } = useSidebar();
  const [theme, setTheme] = useTheme();

  const name = user?.fullName || user?.username || "Your account";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="group/account gap-2.5 data-popup-open:bg-sidebar-accent" />
            }
          >
            {isLoaded && user ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.imageUrl} alt="" className="size-8 shrink-0 rounded-md bg-sidebar-accent object-cover" />
            ) : (
              <Skeleton className="size-8 shrink-0 rounded-md" />
            )}
            <span className="grid flex-1 text-left leading-tight">
              <span className="truncate text-[13px] font-medium">{isLoaded ? name : "Loading"}</span>
              {/* Muted grey is 4.3:1 on the accent fill, so darken it while hovered or open. */}
              <span className="truncate text-xs text-muted-foreground group-hover/account:text-foreground/75 group-data-popup-open/account:text-foreground/75">
                {email}
              </span>
            </span>
            <span className="sr-only">, account menu</span>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "top" : "right"}
            align="end"
            sideOffset={8}
            className="min-w-60"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="label-pixel text-muted-foreground">Signed in as</DropdownMenuLabel>
              <div className="truncate px-2 pb-2 text-[13px]">{email || name}</div>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openUserProfile()}>
              <UserRound /> Account & security
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="label-pixel text-muted-foreground">Theme</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeChoice)}>
                <DropdownMenuRadioItem value="paper">
                  <Sun /> Paper
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="night">
                  <Moon /> Night
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <Monitor /> System
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="label-pixel text-muted-foreground">About GameSmith</DropdownMenuLabel>
              {SITE.links.map((link) => (
                <DropdownMenuLinkItem
                  key={link.id}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  closeOnClick
                >
                  {link.label}
                  <span className="sr-only">: {link.description} (opens in a new tab)</span>
                  <ArrowUpRight className="ml-auto text-muted-foreground" aria-hidden />
                </DropdownMenuLinkItem>
              ))}
              <p className="px-1.5 pt-1 pb-1.5 text-xs text-muted-foreground">{SITE.attribution}</p>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/" })}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
