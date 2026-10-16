"use client";

import { useState } from "react";
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

type Base = { open: boolean; onOpenChange: (open: boolean) => void };

/** Same shape the server accepts (lib/server/sandbox/service.ts normalizeFilePath). */
export function cleanPath(raw: string): string | null {
  const parts = raw.trim().split("/").filter((p) => p !== "" && p !== ".");
  if (parts.length === 0 || parts.some((p) => p === "..") || raw.includes("\\")) return null;
  return parts.join("/");
}

/** New file and rename share one form: a path field. */
export function PathDialog({
  open,
  onOpenChange,
  mode,
  initial,
  existing,
  onSubmit,
}: Base & {
  mode: "create" | "rename";
  initial: string;
  /** Paths already taken, to say so before the server does. */
  existing: string[];
  onSubmit: (path: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <PathForm
          key={open ? `${mode}:${initial}` : "closed"}
          mode={mode}
          initial={initial}
          existing={existing}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

function PathForm({
  mode,
  initial,
  existing,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "rename";
  initial: string;
  existing: string[];
  onCancel: () => void;
  onSubmit: (path: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const path = cleanPath(value);
  const taken = path !== null && path !== initial && existing.includes(path);
  const unchanged = mode === "rename" && path === initial;
  const folderOnly = value.trim().endsWith("/");
  const error = taken ? "A file with that name already exists." : value.trim() && !path ? "That isn’t a valid path." : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (path && !taken && !unchanged && !folderOnly) onSubmit(path);
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{mode === "create" ? "New file" : "Rename file"}</DialogTitle>
        <DialogDescription>
          {mode === "create"
            ? "Use slashes for folders, like src/enemies.ts."
            : "Change the name or move it to another folder."}
        </DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-1.5 text-[13px]">
        <span className="sr-only">File path</span>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          maxLength={512}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "path-error" : undefined}
          className="h-10 font-mono text-[13px]"
        />
        {error && (
          <span id="path-error" className="text-destructive">
            {error}
          </span>
        )}
      </label>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!path || taken || unchanged || folderOnly}>
          {mode === "create" ? "Create" : "Rename"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteFileDialog({
  open,
  onOpenChange,
  path,
  onDelete,
}: Base & { path: string; onDelete: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {path.slice(path.lastIndexOf("/") + 1)}?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-mono text-[13px]">{path}</span> is removed from the game. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={onDelete}>
            Delete file
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
