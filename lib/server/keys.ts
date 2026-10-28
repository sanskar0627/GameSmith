import "server-only";

import { and, eq } from "drizzle-orm";

import { KEY_MAX_LENGTH, KEY_MIN_LENGTH, type ProviderKeySummary } from "@/lib/ai/keys";
import type { ProviderId } from "@/lib/ai/models";
import { verifyProviderKey, type VerifyResult } from "@/lib/ai/verify";
import { DecryptError, open, parseKeyring, seal, type Keyring } from "@/lib/crypto/keyring";
import { db, type Executor } from "@/lib/db";
import { providerKeys, type ProviderKeyRow } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";

/**
 * Users' own provider keys (BYOK). Plaintext keys exist only inside this
 * module and the code that makes a provider call. Everything returned to
 * pages and actions is a ProviderKeySummary.
 */

export class KeyFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyFormatError";
  }
}

/** The provider rejected the key. Nothing was saved. */
export class InvalidKeyError extends Error {
  constructor() {
    super("The provider rejected this key");
    this.name = "InvalidKeyError";
  }
}

export class KeyNotFoundError extends Error {
  constructor() {
    super("No key saved for this provider");
    this.name = "KeyNotFoundError";
  }
}

let cachedKeyring: { source: string; keyring: Keyring } | undefined;

function keyring(): Keyring {
  const source = serverEnv().KEY_ENCRYPTION_KEYS;
  if (cachedKeyring?.source !== source) cachedKeyring = { source, keyring: parseKeyring(source) };
  return cachedKeyring.keyring;
}

/** Additional authenticated data: binds a ciphertext to its owner and provider. */
export function keyContext(userId: string, provider: ProviderId): string {
  return `gamesmith/provider-key/v1|${userId}|${provider}`;
}

export function normalizeKey(raw: string): string {
  const key = raw.trim();
  if (key.length < KEY_MIN_LENGTH) throw new KeyFormatError("That key looks too short. Paste the whole key.");
  if (key.length > KEY_MAX_LENGTH) throw new KeyFormatError("That key is too long.");
  if (/\s/.test(key)) throw new KeyFormatError("Keys can't contain spaces or line breaks.");
  if (!/^[\x21-\x7e]+$/.test(key)) throw new KeyFormatError("That doesn't look like an API key.");
  return key;
}

export function toKeySummary(row: ProviderKeyRow, ring: Keyring = keyring()): ProviderKeySummary {
  return {
    provider: row.provider,
    last4: row.last4,
    status: row.status,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    enabled: row.enabled,
    needsReentry: !ring.keys.has(row.keyVersion),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listProviderKeys(userId: string, database: Executor = db()): Promise<ProviderKeySummary[]> {
  const rows = await database.select().from(providerKeys).where(eq(providerKeys.userId, userId));
  const ring = keyring();
  return rows.map((row) => toKeySummary(row, ring));
}

/**
 * Verifies, encrypts and stores a key (replacing any previous one for that
 * provider). A key the provider rejects is never stored. When the provider
 * cannot be reached the key is stored as "unverified".
 */
export async function saveProviderKey(
  userId: string,
  provider: ProviderId,
  raw: string,
  options: { verify?: (provider: ProviderId, key: string) => Promise<VerifyResult>; database?: Executor } = {},
): Promise<ProviderKeySummary> {
  const { verify = verifyProviderKey, database = db() } = options;
  const key = normalizeKey(raw);
  const result = await verify(provider, key);
  if (!result.ok && result.reason === "invalid") throw new InvalidKeyError();

  const ring = keyring();
  const sealed = seal(ring, key, keyContext(userId, provider));
  const fields = {
    ...sealed,
    last4: key.slice(-4),
    status: result.ok ? ("valid" as const) : ("unverified" as const),
    verifiedAt: result.ok ? new Date() : null,
    enabled: true,
  };
  const [row] = await database
    .insert(providerKeys)
    .values({ userId, provider, ...fields })
    .onConflictDoUpdate({
      target: [providerKeys.userId, providerKeys.provider],
      set: { ...fields, updatedAt: new Date() },
    })
    .returning();
  return toKeySummary(row, ring);
}

export async function removeProviderKey(userId: string, provider: ProviderId, database: Executor = db()) {
  const removed = await database
    .delete(providerKeys)
    .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, provider)))
    .returning({ id: providerKeys.id });
  if (removed.length === 0) throw new KeyNotFoundError();
}

export async function setProviderKeyEnabled(
  userId: string,
  provider: ProviderId,
  enabled: boolean,
  database: Executor = db(),
): Promise<ProviderKeySummary> {
  const [row] = await database
    .update(providerKeys)
    .set({ enabled })
    .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, provider)))
    .returning();
  if (!row) throw new KeyNotFoundError();
  return toKeySummary(row);
}

/**
 * The plaintext key for a run, or null when the user has no usable key for
 * this provider (none saved, switched off, rejected, or unreadable).
 * Server-side callers only (the agent worker). Never return this to a client.
 *
 * Rows sealed with an older keyring version are re-encrypted with the active
 * one on the way out (lazy rotation).
 */
export async function readProviderKey(
  userId: string,
  provider: ProviderId,
  database: Executor = db(),
): Promise<string | null> {
  const [row] = await database
    .select()
    .from(providerKeys)
    .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, provider)))
    .limit(1);
  if (!row || !row.enabled || row.status === "invalid") return null;

  const ring = keyring();
  const context = keyContext(userId, provider);
  let key: string;
  try {
    key = open(ring, row, context);
  } catch (error) {
    if (error instanceof DecryptError) {
      console.warn(`[keys] stored ${provider} key for a user could not be decrypted; it must be entered again`);
      return null;
    }
    throw error;
  }

  if (row.keyVersion !== ring.active) {
    // Only rewrite if nobody replaced the row in the meantime.
    await database
      .update(providerKeys)
      .set(seal(ring, key, context))
      .where(and(eq(providerKeys.id, row.id), eq(providerKeys.ciphertext, row.ciphertext)));
  }
  return key;
}
