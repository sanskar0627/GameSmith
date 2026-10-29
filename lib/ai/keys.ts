import type { ProviderId } from "./models";

/** What the browser may know about a saved key. Never the key itself. */
export type ProviderKeySummary = {
  provider: ProviderId;
  last4: string;
  status: "valid" | "invalid" | "unverified";
  verifiedAt: string | null;
  /** Off = runs use sparks even though a key is saved. */
  enabled: boolean;
  /** Encrypted with a key that is no longer in the keyring. Must be entered again. */
  needsReentry: boolean;
  updatedAt: string;
};

/** Usable for runs right now. */
export function isUsableKey(key: ProviderKeySummary | undefined): boolean {
  return !!key && key.enabled && key.status !== "invalid" && !key.needsReentry;
}

export const KEY_MIN_LENGTH = 16;
export const KEY_MAX_LENGTH = 512;
