import type { SignIn } from "@clerk/nextjs";
import type { ComponentProps } from "react";

type Appearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>;

/**
 * Clerk, flattened into the GameSmith page. The shadcn base theme (set on
 * <ClerkProvider>) already maps Clerk onto our tokens; this removes the card
 * chrome and applies our type and states, so the form reads as part of the
 * page rather than an embedded widget.
 */
export const authAppearance: Appearance = {
  options: {
    logoPlacement: "none",
    socialButtonsVariant: "blockButton",
    socialButtonsPlacement: "top",
  },
  variables: {
    borderRadius: "0.375rem",
    fontFamily: "var(--font-geist-sans)",
    fontSize: "0.875rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full max-w-none rounded-none border-0 bg-transparent shadow-none",
    card: "gap-7 border-0 bg-transparent p-0 shadow-none",
    header: "items-start gap-2 text-left",
    headerTitle: "font-display text-display-md font-normal tracking-normal text-foreground",
    headerSubtitle: "text-sm text-muted-foreground",
    socialButtonsBlockButton:
      "h-10 rounded-md border border-border bg-card shadow-none transition-colors hover:bg-muted",
    dividerLine: "bg-border",
    dividerText: "font-pixel text-micro uppercase tracking-[0.08em] text-muted-foreground",
    formFieldLabel: "text-[13px] font-medium text-foreground",
    formFieldInput: "h-10 rounded-md border-input bg-card shadow-none",
    formButtonPrimary: "h-10 rounded-md text-sm font-medium shadow-none",
    formFieldAction: "text-ember-text hover:text-ember-text/80",
    footer: "mt-1 bg-none p-0 [background:none]",
    footerActionText: "text-sm text-muted-foreground",
    footerActionLink: "font-medium text-ember-text hover:text-ember-text/80",
    identityPreviewEditButton: "text-ember-text",
    otpCodeFieldInput: "border-input font-mono",
  },
};
