import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import type { VerifyResult } from "@/lib/ai/verify";
import { parseKeyring, seal } from "@/lib/crypto/keyring";
import { db } from "@/lib/db";
import { providerKeys } from "@/lib/db/schema";
import {
  InvalidKeyError,
  KeyFormatError,
  KeyNotFoundError,
  keyContext,
  listProviderKeys,
  normalizeKey,
  readProviderKey,
  removeProviderKey,
  saveProviderKey,
  setProviderKeyEnabled,
} from "@/lib/server/keys";
import { softDeleteUser } from "@/lib/server/users";

import { createUser } from "./support/factories";

const KEY = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ-wxyz";
const ok = async (): Promise<VerifyResult> => ({ ok: true });
const rejected = async (): Promise<VerifyResult> => ({ ok: false, reason: "invalid" });
const down = async (): Promise<VerifyResult> => ({ ok: false, reason: "unreachable" });

async function rawRow(userId: string) {
  const [row] = await db().select().from(providerKeys).where(eq(providerKeys.userId, userId));
  return row;
}

describe("normalizeKey", () => {
  it("trims and rejects obviously wrong input", () => {
    expect(normalizeKey(`  ${KEY}\n`)).toBe(KEY);
    expect(() => normalizeKey("short")).toThrow(KeyFormatError);
    expect(() => normalizeKey("sk-has a space in the middle-xx")).toThrow(KeyFormatError);
    expect(() => normalizeKey("x".repeat(600))).toThrow(KeyFormatError);
    expect(() => normalizeKey("sk-ünïcödé-ünïcödé-ünïcödé")).toThrow(KeyFormatError);
  });
});

describe("saveProviderKey", () => {
  it("stores only ciphertext and the last 4 characters", async () => {
    await createUser("user_a");
    const summary = await saveProviderKey("user_a", "anthropic", KEY, { verify: ok });
    expect(summary).toMatchObject({ provider: "anthropic", last4: "wxyz", status: "valid", enabled: true, needsReentry: false });
    expect(JSON.stringify(summary)).not.toContain(KEY.slice(0, -4));

    const row = await rawRow("user_a");
    expect(JSON.stringify(row)).not.toContain(KEY);
    expect(row.keyVersion).toBe(2);
  });

  it("never stores a key the provider rejects", async () => {
    await createUser("user_a");
    await expect(saveProviderKey("user_a", "openai", KEY, { verify: rejected })).rejects.toBeInstanceOf(InvalidKeyError);
    expect(await listProviderKeys("user_a")).toHaveLength(0);
  });

  it("stores as unverified when the provider can't be reached", async () => {
    await createUser("user_a");
    const summary = await saveProviderKey("user_a", "fal", KEY, { verify: down });
    expect(summary).toMatchObject({ status: "unverified", verifiedAt: null });
  });

  it("replaces the previous key for the same provider", async () => {
    await createUser("user_a");
    await saveProviderKey("user_a", "anthropic", KEY, { verify: ok });
    await setProviderKeyEnabled("user_a", "anthropic", false);
    await saveProviderKey("user_a", "anthropic", `${KEY.slice(0, -4)}1234`, { verify: ok });
    const keys = await listProviderKeys("user_a");
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ last4: "1234", enabled: true });
  });

  it("hands verification the exact key, once", async () => {
    await createUser("user_a");
    const verify = vi.fn(ok);
    await saveProviderKey("user_a", "openrouter", `  ${KEY}  `, { verify });
    expect(verify).toHaveBeenCalledExactlyOnceWith("openrouter", KEY);
  });
});

describe("ownership", () => {
  it("lists, reads, toggles and removes only the caller's keys", async () => {
    await createUser("user_a");
    await createUser("user_b");
    await saveProviderKey("user_a", "anthropic", KEY, { verify: ok });

    expect(await listProviderKeys("user_b")).toHaveLength(0);
    expect(await readProviderKey("user_b", "anthropic")).toBeNull();
    await expect(setProviderKeyEnabled("user_b", "anthropic", false)).rejects.toBeInstanceOf(KeyNotFoundError);
    await expect(removeProviderKey("user_b", "anthropic")).rejects.toBeInstanceOf(KeyNotFoundError);
    expect(await readProviderKey("user_a", "anthropic")).toBe(KEY);
  });

  it("a ciphertext copied onto another user's row does not decrypt", async () => {
    await createUser("user_a");
    await createUser("user_b");
    await saveProviderKey("user_a", "anthropic", KEY, { verify: ok });
    await saveProviderKey("user_b", "anthropic", `${KEY.slice(0, -4)}bbbb`, { verify: ok });
    const stolen = await rawRow("user_a");
    await db()
      .update(providerKeys)
      .set({ ciphertext: stolen.ciphertext, iv: stolen.iv, tag: stolen.tag, keyVersion: stolen.keyVersion })
      .where(eq(providerKeys.userId, "user_b"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await readProviderKey("user_b", "anthropic")).toBeNull();
    expect(warn.mock.calls.flat().join(" ")).not.toContain(KEY);
    warn.mockRestore();
  });

  it("deleting a user destroys their keys", async () => {
    await createUser("user_a");
    await saveProviderKey("user_a", "anthropic", KEY, { verify: ok });
    await softDeleteUser("user_a");
    expect(await listProviderKeys("user_a")).toHaveLength(0);
  });
});

describe("readProviderKey", () => {
  it("returns nothing for switched-off or rejected keys", async () => {
    await createUser("user_a");
    await saveProviderKey("user_a", "anthropic", KEY, { verify: ok });
    await setProviderKeyEnabled("user_a", "anthropic", false);
    expect(await readProviderKey("user_a", "anthropic")).toBeNull();

    await setProviderKeyEnabled("user_a", "anthropic", true);
    await db().update(providerKeys).set({ status: "invalid" }).where(eq(providerKeys.userId, "user_a"));
    expect(await readProviderKey("user_a", "anthropic")).toBeNull();
  });

  it("re-encrypts rows sealed with an older keyring version", async () => {
    await createUser("user_a");
    await saveProviderKey("user_a", "openai", KEY, { verify: ok });
    // Re-seal with version 1 of the test keyring (see vitest.config.mts).
    const ring = parseKeyring(process.env.KEY_ENCRYPTION_KEYS!);
    const oldRing = { active: 1, keys: ring.keys };
    await db()
      .update(providerKeys)
      .set(seal(oldRing, KEY, keyContext("user_a", "openai")))
      .where(eq(providerKeys.userId, "user_a"));
    expect((await rawRow("user_a")).keyVersion).toBe(1);

    expect(await readProviderKey("user_a", "openai")).toBe(KEY);
    expect((await rawRow("user_a")).keyVersion).toBe(2);
    expect(await readProviderKey("user_a", "openai")).toBe(KEY);
  });

  it("flags keys sealed with a version no longer in the keyring", async () => {
    await createUser("user_a");
    await saveProviderKey("user_a", "openai", KEY, { verify: ok });
    await db().update(providerKeys).set({ keyVersion: 7 }).where(eq(providerKeys.userId, "user_a"));
    expect((await listProviderKeys("user_a"))[0].needsReentry).toBe(true);
  });
});
