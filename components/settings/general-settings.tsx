"use client";

import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { Check, ExternalLink } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { type ThemeChoice, useTheme } from "@/components/theme/theme";
import { cn } from "@/lib/utils";
import { SettingsSection } from "./settings-nav";

export function GeneralSettings() {
  return (
    <>
      <SettingsSection title="Profile" description="Your name and photo appear on games you share.">
        <ProfileCard />
      </SettingsSection>
      <SettingsSection title="Appearance" description="Applies to this browser. The game stage stays dark either way.">
        <ThemePicker />
      </SettingsSection>
      <SettingsSection title="Danger zone" tone="danger">
        <DangerZone />
      </SettingsSection>
    </>
  );
}

function ProfileCard() {
  const { user, isLoaded } = useUser();
  const { openUserProfile } = useClerk();
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
      {isLoaded && user ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.imageUrl} alt="" className="size-14 rounded-lg bg-muted object-cover" />
      ) : (
        <Skeleton className="size-14 rounded-lg" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{user?.fullName || user?.username || (isLoaded ? "Unnamed" : "Loading")}</p>
        <p className="truncate text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => openUserProfile()}>
        Manage account <ExternalLink data-icon="inline-end" />
      </Button>
    </div>
  );
}

const THEMES: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: "paper", label: "Paper", hint: "Bone and ink" },
  { value: "night", label: "Night", hint: "The forge after dark" },
  { value: "system", label: "System", hint: "Follow this device" },
];

function ThemePicker() {
  const [theme, setTheme] = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
      {THEMES.map((t) => {
        const selected = theme === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(t.value)}
            className={cn(
              "group overflow-hidden rounded-xl border bg-card text-left transition-colors",
              selected ? "border-ember/60 ring-1 ring-ember/40" : "border-border hover:border-foreground/25",
            )}
          >
            <ThemePreview kind={t.value} />
            <span className="flex items-center justify-between gap-2 px-3 py-2.5">
              <span>
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="block text-[12px] text-muted-foreground">{t.hint}</span>
              </span>
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-sm border",
                  selected ? "border-ember bg-ember text-ember-foreground" : "border-border",
                )}
              >
                {selected && <Check className="size-3" />}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Miniature app frame drawn with the real theme classes. */
function ThemePreview({ kind }: { kind: ThemeChoice }) {
  const frame = (dark: boolean) => (
    <div className={cn(dark ? "dark" : "light", "flex h-full flex-1 gap-1.5 bg-background p-2")}>
      <div className="w-1/4 rounded-sm bg-surface" />
      <div className="flex flex-1 flex-col gap-1">
        <div className="h-1.5 w-2/3 rounded-[1px] bg-foreground/70" />
        <div className="h-1 w-1/2 rounded-[1px] bg-muted-foreground/50" />
        <div className="mt-auto h-2.5 w-8 rounded-[2px] bg-ember" />
      </div>
    </div>
  );
  return (
    <div className="flex h-20 border-b border-hairline" aria-hidden>
      {kind === "paper" && frame(false)}
      {kind === "night" && frame(true)}
      {kind === "system" && (
        <>
          {frame(false)}
          {frame(true)}
        </>
      )}
    </div>
  );
}

const CONFIRM = "delete my account";

function DangerZone() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="max-w-md">
        <p className="text-sm font-medium">Delete account</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Removes your account, every game, its versions, sandboxes and share links. This can&rsquo;t be undone.
        </p>
      </div>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Delete account
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <DeleteAccountForm key={String(open)} onDone={() => setOpen(false)} />
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DeleteAccountForm({ onDone }: { onDone: () => void }) {
  const [typed, setTyped] = useState("");
  const match = typed.trim().toLowerCase() === CONFIRM;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!match) return;
        // TODO(data): server action that tears down sandboxes and data, then deletes the Clerk user.
        toast.add({ title: "Not connected yet", description: "Account deletion arrives with the backend. Nothing was deleted." });
        onDone();
      }}
      className="flex flex-col gap-4"
    >
      <AlertDialogHeader>
        <AlertDialogTitle>Delete your account?</AlertDialogTitle>
        <AlertDialogDescription>
          Every game, version and share link goes with it. Download anything you want to keep first.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <label className="flex flex-col gap-1.5 text-[13px]">
        <span className="text-muted-foreground">
          Type <span className="font-medium text-foreground">{CONFIRM}</span> to confirm
        </span>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus className="h-10" aria-label={`Type ${CONFIRM} to confirm`} />
      </label>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <Button type="submit" variant="destructive" disabled={!match}>
          Delete account
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
