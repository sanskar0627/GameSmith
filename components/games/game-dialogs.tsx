"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Globe, Lock, Rocket } from "lucide-react";
import { PixelLoader } from "@/components/brand/pixel-loader";
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
          It leaves your library and its share link stops working. You can
          undo this right after.
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
  version,
  demo,
}: Base & {
  gameId: string;
  title: string;
  visibility: GameVisibility;
  onVisibilityChange: (v: GameVisibility) => void;
  /** Latest playable version; enables the Publish section. */
  version?: number;
  /** Demo workspaces show the section without calling the server. */
  demo?: boolean;
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
        {version !== undefined && open && <PublishSection gameId={gameId} version={version} demo={demo} />}
      </DialogContent>
    </Dialog>
  );
}

/* --- Publish ------------------------------------------------------------- */

type PublishState = {
  configured: boolean;
  published: null | { buildId: string; version: number; publishedAt: string; url: string; files: number; bytes: number };
};

function formatBytes(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`;
}

/**
 * Publishing: builds what's live in the sandbox and serves it on /play.
 * The share link above decides who besides the owner can open it.
 */
function PublishSection({ gameId, version, demo }: { gameId: string; version: number; demo?: boolean }) {
  const [state, setState] = useState<PublishState | null>(demo ? { configured: false, published: null } : null);
  const [busy, setBusy] = useState<"publish" | "unpublish" | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);

  useEffect(() => {
    if (demo) return;
    let alive = true;
    fetch(`/api/games/${gameId}/publish`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok) setState(body as PublishState);
        else setState({ configured: false, published: null });
      })
      .catch(() => alive && setState({ configured: false, published: null }));
    return () => {
      alive = false;
    };
  }, [gameId, demo]);

  const act = async (kind: "publish" | "unpublish") => {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/games/${gameId}/publish`, { method: kind === "publish" ? "POST" : "DELETE" });
      const body = (await res.json().catch(() => ({}))) as PublishState & { error?: string; detail?: string };
      if (!res.ok) setError({ message: body.error ?? "Publishing failed. Try again.", detail: body.detail });
      else setState(body);
    } catch {
      setError({ message: "Couldn\u2019t reach the server. Try again." });
    } finally {
      setBusy(null);
    }
  };

  const published = state?.published;
  const outdated = published && published.version < version;

  return (
    <section aria-label="Publish" className="flex flex-col gap-2.5 border-t border-hairline pt-4">
      <div className="flex items-start gap-3">
        <Rocket className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {published ? `v${published.version} is published` : "Not published yet"}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {state === null
              ? "Checking\u2026"
              : !state.configured && !published
                ? "Publishing isn\u2019t available on this server yet."
                : published
                  ? `${published.files} files, ${formatBytes(published.bytes)}. ${outdated ? `v${version} is newer.` : "Up to date."}`
                  : version === 0
                    ? "Save a playable version first."
                    : "Build what\u2019s in your preview and put it on the play page."}
          </p>
        </div>
      </div>
      {error && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          {error.message}
          {error.detail && (
            <pre className="mt-1.5 max-h-28 overflow-auto font-mono text-[11px] whitespace-pre-wrap opacity-80">{error.detail}</pre>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={published && !outdated ? "outline" : "ember"}
          disabled={!state?.configured || version === 0 || busy !== null}
          onClick={() => act("publish")}
        >
          {busy === "publish" ? <PixelLoader size="sm" label="Building" /> : <Rocket data-icon="inline-start" />}
          {busy === "publish" ? "Building\u2026" : published ? `Publish v${version}` : "Publish"}
        </Button>
        {published && (
          <>
            <a
              href={`/play/${gameId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted/50"
            >
              <ExternalLink className="size-3.5" /> Open play page
            </a>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => act("unpublish")}>
              {busy === "unpublish" ? "Unpublishing\u2026" : "Unpublish"}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
