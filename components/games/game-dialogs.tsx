"use client";

import { useState } from "react";
import { Check, Copy, Globe, Lock } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { GameVisibility } from "@/lib/games/types";
import { cn } from "@/lib/utils";

type Base = { open: boolean; onOpenChange: (open: boolean) => void };

/* --- Rename -------------------------------------------------------------- */

export function RenameDialog({
  open,
  onOpenChange,
  title,
  onRename,
}: Base & { title: string; onRename: (t: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Keyed so the field resets to the current title each time it opens. */}
        <RenameForm
          key={open ? title : "closed"}
          title={title}
          onCancel={() => onOpenChange(false)}
          onRename={onRename}
        />
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  title,
  onCancel,
  onRename,
}: {
  title: string;
  onCancel: () => void;
  onRename: (t: string) => void;
}) {
  const [value, setValue] = useState(title);
  const clean = value.trim().slice(0, 60);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (clean) onRename(clean);
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>
          Rename game
        </DialogTitle>
        <DialogDescription>
          Shown in your library and on the share page.
        </DialogDescription>
      </DialogHeader>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={60}
        autoFocus
        aria-label="Game title"
        className="h-10"
      />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!clean || clean === title}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

/* --- Delete -------------------------------------------------------------- */

export function DeleteDialog({
  open,
  onOpenChange,
  title,
  onDelete,
}: Base & { title: string; onDelete: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <DeleteForm
          key={open ? title : "closed"}
          title={title}
          onDelete={onDelete}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteForm({
  title,
  onDelete,
}: {
  title: string;
  onDelete: () => void;
}) {
  const [typed, setTyped] = useState("");
  const match = typed.trim() === title;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (match) onDelete();
      }}
      className="flex flex-col gap-4"
    >
      <AlertDialogHeader>
        <AlertDialogTitle>
          Delete &ldquo;{title}&rdquo;?
        </AlertDialogTitle>
        <AlertDialogDescription>
          This removes the game, its files, every version and its share link. It
          can&rsquo;t be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <label className="flex flex-col gap-1.5 text-[13px]">
        <span className="text-muted-foreground">
          Type <span className="font-medium text-foreground">{title}</span> to
          confirm
        </span>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          className="h-10"
          aria-label={`Type ${title} to confirm`}
        />
      </label>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <Button type="submit" variant="destructive" disabled={!match}>
          Delete game
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

/* --- Share --------------------------------------------------------------- */

export function ShareDialog({
  open,
  onOpenChange,
  gameId,
  title,
  visibility,
  onVisibilityChange,
}: Base & {
  gameId: string;
  title: string;
  visibility: GameVisibility;
  onVisibilityChange: (v: GameVisibility) => void;
}) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window === "undefined"
      ? `/play/${gameId}`
      : `${window.location.origin}/play/${gameId}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the field stays selectable */
    }
  };

  const options: {
    value: GameVisibility;
    icon: typeof Lock;
    label: string;
    hint: string;
  }[] = [
    {
      value: "private",
      icon: Lock,
      label: "Private",
      hint: "Only you can open it.",
    },
    {
      value: "link",
      icon: Globe,
      label: "Anyone with the link",
      hint: "They can play it. They can't see your chat or files.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Share &ldquo;{title}&rdquo;
          </DialogTitle>
          <DialogDescription>
            Share the playable game. Your conversation and source stay private.
          </DialogDescription>
        </DialogHeader>
        <div
          role="radiogroup"
          aria-label="Who can play"
          className="flex flex-col gap-1.5"
        >
          {options.map(({ value, icon: Icon, label, hint }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={visibility === value}
              onClick={() => onVisibilityChange(value)}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                visibility === value
                  ? "border-ember/60 bg-ember-soft/50"
                  : "border-border hover:bg-muted/50",
              )}
            >
              <Icon className="mt-0.5 size-4 text-muted-foreground" />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {hint}
                </span>
              </span>
            </button>
          ))}
        </div>
        {visibility === "link" && (
          <div className="flex gap-2">
            <Input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Share link"
              className="h-9 font-mono text-[12.5px]"
            />
            <Button onClick={copy} variant="outline" className="h-9 shrink-0">
              {copied ? (
                <Check data-icon="inline-start" />
              ) : (
                <Copy data-icon="inline-start" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
