"use client";

import Link from "next/link";
import { ChevronDown, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PROVIDER_INFO, type ChatProviderId, type ModelAccess, type ModelOption } from "@/lib/ai/models";
import { cn } from "@/lib/utils";

const ORDER: ChatProviderId[] = ["anthropic", "openai", "openrouter"];

function accessLabel(access: ModelAccess): string {
  if (access.kind === "byok") return "Your key";
  if (access.kind === "credits") return "Sparks";
  return "Needs key";
}

/**
 * Model picker for the composers. Options come from the server
 * (listModelOptions), so availability reflects the user's saved keys.
 * Locked models stay visible but can't be picked; the footer links to
 * Settings > API keys.
 */
export function ModelPicker({
  options,
  value,
  onChange,
  disabled,
  className,
  side = "top",
}: {
  options: ModelOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  className?: string;
  /** Where the menu opens. The workspace composer sits at the bottom, so "top". */
  side?: "top" | "bottom";
}) {
  const current = options.find((o) => o.id === value);
  const groups = ORDER.map((provider) => ({
    provider,
    models: options.filter((o) => o.provider === provider),
  })).filter((g) => g.models.length > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={`Model: ${current?.label ?? "Choose a model"}`}
            className={cn("max-w-48 gap-1 px-2 text-[13px] text-muted-foreground", className)}
          />
        }
      >
        <span className="truncate">{current?.label ?? "Choose a model"}</span>
        <ChevronDown className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="start" className="w-96 max-w-[calc(100vw-2rem)]">
        <DropdownMenuRadioGroup value={value} onValueChange={(next: string) => onChange(next)}>
          {groups.map((group, i) => (
            <DropdownMenuGroup key={group.provider}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{PROVIDER_INFO[group.provider].label}</DropdownMenuLabel>
              {group.models.map((model) => {
                const locked = model.access.kind === "locked";
                return (
                  <DropdownMenuRadioItem
                    key={model.id}
                    value={model.id}
                    disabled={locked}
                    closeOnClick
                    className="items-start py-1.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{model.label}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">{model.blurb}</span>
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded-sm px-1.5 py-px font-pixel text-micro tracking-[0.08em] uppercase",
                        model.access.kind === "byok" && "bg-ember-soft text-ember-text",
                        model.access.kind === "credits" && "border border-border text-muted-foreground",
                        locked && "text-muted-foreground",
                      )}
                    >
                      {accessLabel(model.access)}
                    </span>
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href="/settings/keys" />}>
          <KeyRound /> Manage API keys
        </DropdownMenuLinkItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
