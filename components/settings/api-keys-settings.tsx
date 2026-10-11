"use client";

import { useId, useState, useTransition } from "react";
import { ExternalLink, KeyRound, Lock } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import type { ProviderKeySummary } from "@/lib/ai/keys";
import { PROVIDER_INFO, type ProviderId } from "@/lib/ai/models";
import { timeAgo } from "@/lib/format";
import { removeKeyAction, saveKeyAction, setKeyEnabledAction } from "@/lib/server/keys-actions";
import { cn } from "@/lib/utils";
import { SettingsSection } from "./settings-nav";

export type ProviderRow = {
  provider: ProviderId;
  key: ProviderKeySummary | null;
  /** The platform can run this provider's models on sparks. */
  platform: boolean;
};

export function ApiKeysSettings({ rows }: { rows: ProviderRow[] }) {
  const chat = rows.filter((r) => PROVIDER_INFO[r.provider].role === "chat");
  const assets = rows.filter((r) => PROVIDER_INFO[r.provider].role === "assets");
  return (
    <>
      <SettingsSection
        title="Your API keys"
        description="Runs on your own key cost 0 sparks. The provider bills you directly."
      >
        <p className="mb-4 flex max-w-lg items-start gap-2 text-[13px] text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          Keys are checked with the provider, then encrypted before they are stored. They are only used on our servers
          and never shown again, only their last 4 characters.
        </p>
        <div className="flex flex-col gap-3">
          {chat.map((row) => (
            <ProviderKeyCard key={row.provider} row={row} />
          ))}
        </div>
      </SettingsSection>
      <SettingsSection title="Game assets" description="Textures, sprites and sounds the agent generates for your games.">
        <div className="flex flex-col gap-3">
          {assets.map((row) => (
            <ProviderKeyCard key={row.provider} row={row} />
          ))}
        </div>
      </SettingsSection>
    </>
  );
}

function statusText(key: ProviderKeySummary): { text: string; tone: "ok" | "warn" | "bad" } {
  if (key.needsReentry) return { text: "Enter this key again", tone: "bad" };
  if (key.status === "invalid") return { text: "Rejected by the provider", tone: "bad" };
  if (key.status === "unverified") return { text: "Not verified yet", tone: "warn" };
  if (!key.verifiedAt || Date.now() - Date.parse(key.verifiedAt) < 60_000) return { text: "Verified just now", tone: "ok" };
  return { text: `Verified ${timeAgo(key.verifiedAt)}`, tone: "ok" };
}

function ProviderKeyCard({ row }: { row: ProviderRow }) {
  const info = PROVIDER_INFO[row.provider];
  const [key, setKey] = useState(row.key);
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();
  const titleId = useId();

  const fallback =
    info.role === "assets"
      ? row.platform
        ? "Without a key, assets are paid with sparks."
        : "Add a key to generate assets."
      : row.platform
        ? "Without a key, its models run on sparks."
        : "Its models need your key.";

  const toggle = (enabled: boolean) => {
    if (!key) return;
    const previous = key;
    setKey({ ...key, enabled });
    startTransition(async () => {
      const result = await setKeyEnabledAction(row.provider, enabled);
      if (result.ok) setKey(result.data);
      else {
        setKey(previous);
        toast.add({ type: "error", title: "Couldn’t update the key", description: result.error });
      }
    });
  };

  const remove = () => {
    startTransition(async () => {
      const result = await removeKeyAction(row.provider);
      setConfirmRemove(false);
      if (result.ok) {
        setKey(null);
        toast.add({ title: `${info.label} key removed` });
      } else toast.add({ type: "error", title: "Couldn’t remove the key", description: result.error });
    });
  };

  const status = key ? statusText(key) : null;

  return (
    <section aria-labelledby={titleId} className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
          <KeyRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-sm font-medium">
            {info.label}
          </h3>
          {key && status ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
              <span className="font-mono text-foreground" aria-label={`Key ending in ${key.last4}`}>
                ••••{key.last4}
              </span>
              <span
                className={cn(
                  status.tone === "bad" && "text-destructive",
                  status.tone === "warn" && "text-foreground",
                )}
                suppressHydrationWarning
              >
                {status.text}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] text-muted-foreground">Not set. {fallback}</p>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            {key ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={pending}>
                  Replace
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)} disabled={pending}>
                  Remove
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Add key
              </Button>
            )}
          </div>
        )}
      </div>

      {key && !editing && (
        <label className="flex items-center justify-between gap-4 border-t border-hairline px-4 py-3 text-[13px]">
          <span>
            <span className="block font-medium">Use for my games</span>
            <span className="block text-muted-foreground">
              {key.enabled ? "Runs on this provider use your key." : `Off: ${fallback.charAt(0).toLowerCase()}${fallback.slice(1)}`}
            </span>
          </span>
          <Switch checked={key.enabled} onCheckedChange={toggle} disabled={pending} aria-label={`Use my ${info.label} key`} />
        </label>
      )}

      {editing && (
        <KeyForm
          provider={row.provider}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setKey(saved);
            setEditing(false);
            toast.add(
              saved.status === "valid"
                ? { title: `${info.label} key saved`, description: "Verified with the provider." }
                : {
                    title: `${info.label} key saved`,
                    description: `We couldn't reach ${info.label} to check it. It will be used as is.`,
                  },
            );
          }}
        />
      )}

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove your {info.label} key?</AlertDialogTitle>
            <AlertDialogDescription>
              It is deleted from GameSmith. {fallback} The key itself stays active at {info.label}; revoke it there if
              you no longer need it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              Remove key
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function KeyForm({
  provider,
  onCancel,
  onSaved,
}: {
  provider: ProviderId;
  onCancel: () => void;
  onSaved: (key: ProviderKeySummary) => void;
}) {
  const info = PROVIDER_INFO[provider];
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = useId();
  const errorId = useId();

  return (
    <form
      className="flex flex-col gap-2 border-t border-hairline p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim() || pending) return;
        setError(null);
        startTransition(async () => {
          const result = await saveKeyAction(provider, value);
          if (result.ok) {
            setValue("");
            onSaved(result.data);
          } else setError(result.error);
        });
      }}
    >
      <label htmlFor={inputId} className="text-[13px] font-medium">
        {info.label} API key
      </label>
      <Input
        id={inputId}
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        autoFocus
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        placeholder="Paste your key"
        className="h-10 font-mono"
      />
      {error && (
        <p id={errorId} role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="ember" size="sm" disabled={!value.trim() || pending}>
          {pending ? "Checking…" : "Save and verify"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <a
          href={info.keysUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Get a key from {info.label} <ExternalLink className="size-3" />
        </a>
      </div>
    </form>
  );
}
