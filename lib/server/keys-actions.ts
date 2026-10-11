"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { ProviderKeySummary } from "@/lib/ai/keys";
import { PROVIDER_INFO, PROVIDERS } from "@/lib/ai/models";
import { ensureUser } from "@/lib/server/users";

import {
  InvalidKeyError,
  KeyFormatError,
  KeyNotFoundError,
  removeProviderKey,
  saveProviderKey,
  setProviderKeyEnabled,
} from "./keys";
import { RateLimiter } from "./rate-limit";

/**
 * Settings > API keys. The raw key arrives here once, is verified and
 * encrypted, and is never sent back: results carry only a summary
 * (provider, last 4, status). Errors never include the key, and failures
 * are logged without the input.
 */

export type KeyActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const provider = z.enum(PROVIDERS, { error: "Unknown provider" });
// Each save makes one request to the provider; cap how fast anyone can probe keys.
const saves = new RateLimiter(10, 10 * 60_000);

async function run<T>(label: string, fn: (userId: string) => Promise<T>): Promise<KeyActionResult<T>> {
  const user = await ensureUser();
  try {
    return { ok: true, data: await fn(user.id) };
  } catch (error) {
    if (error instanceof KeyFormatError) return { ok: false, error: error.message };
    if (error instanceof KeyNotFoundError) return { ok: false, error: "There's no key saved for that provider." };
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Invalid input" };
    if (error instanceof RateLimited) return { ok: false, error: "Too many attempts. Try again in a few minutes." };
    // Log the failure kind only: the input may contain a key.
    console.error(`[keys] ${label} failed: ${error instanceof Error ? error.name : "unknown error"}`);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

class RateLimited extends Error {}

export async function saveKeyAction(providerInput: string, key: string): Promise<KeyActionResult<ProviderKeySummary>> {
  return run("save", async (userId) => {
    const id = provider.parse(providerInput);
    if (typeof key !== "string") throw new KeyFormatError("Paste your key.");
    if (!saves.take(userId)) throw new RateLimited();
    try {
      const summary = await saveProviderKey(userId, id, key);
      refresh();
      return summary;
    } catch (error) {
      if (error instanceof InvalidKeyError) {
        throw new KeyFormatError(
          `${PROVIDER_INFO[id].label} didn't accept that key. Check it was copied in full and is still active.`,
        );
      }
      throw error;
    }
  });
}

export async function removeKeyAction(providerInput: string): Promise<KeyActionResult<null>> {
  return run("remove", async (userId) => {
    await removeProviderKey(userId, provider.parse(providerInput));
    refresh();
    return null;
  });
}

export async function setKeyEnabledAction(
  providerInput: string,
  enabled: boolean,
): Promise<KeyActionResult<ProviderKeySummary>> {
  return run("toggle", async (userId) => {
    const summary = await setProviderKeyEnabled(
      userId,
      provider.parse(providerInput),
      z.boolean().parse(enabled),
    );
    refresh();
    return summary;
  });
}
