import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope for secrets at rest (users' provider API keys).
 *
 * The keyring comes from KEY_ENCRYPTION_KEYS: "<version>:<base64 32 bytes>"
 * entries separated by commas, newest first. The first entry encrypts; every
 * entry can decrypt. To rotate: prepend a new version, deploy, and rows are
 * re-encrypted as they are next used (see lib/server/keys.ts).
 *
 * Every ciphertext is bound to a context string (additional authenticated
 * data). Decrypting with a different context fails, so a row copied to
 * another user or provider is useless.
 */

export type Keyring = { active: number; keys: ReadonlyMap<number, Buffer> };

export type Sealed = { ciphertext: string; iv: string; tag: string; keyVersion: number };

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
// Pinned so a truncated tag (which Node would otherwise accept) is rejected.
const TAG_BYTES = 16;

export class KeyringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyringError";
  }
}

/** Thrown when a ciphertext fails authentication (tampered, wrong context or unknown key). */
export class DecryptError extends Error {
  constructor() {
    super("Secret could not be decrypted");
    this.name = "DecryptError";
  }
}

export function parseKeyring(value: string): Keyring {
  const entries = value
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (entries.length === 0) throw new KeyringError("KEY_ENCRYPTION_KEYS is empty");

  const keys = new Map<number, Buffer>();
  let active: number | undefined;
  for (const entry of entries) {
    const match = /^(\d{1,6}):([A-Za-z0-9+/]+={0,2})$/.exec(entry);
    if (!match) throw new KeyringError('KEY_ENCRYPTION_KEYS entries must look like "1:<base64 key>"');
    const version = Number(match[1]);
    const key = Buffer.from(match[2], "base64");
    if (key.length !== 32) throw new KeyringError(`Key version ${version} must be 32 bytes (got ${key.length})`);
    if (keys.has(version)) throw new KeyringError(`Key version ${version} appears twice`);
    keys.set(version, key);
    active ??= version;
  }
  return { active: active!, keys };
}

export function seal(keyring: Keyring, plaintext: string, context: string): Sealed {
  const key = keyring.keys.get(keyring.active)!;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: keyring.active,
  };
}

export function open(keyring: Keyring, sealed: Sealed, context: string): string {
  const key = keyring.keys.get(sealed.keyVersion);
  if (!key) throw new DecryptError();
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(sealed.iv, "base64"), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    // Never surface the underlying error: it could hint at which check failed.
    throw new DecryptError();
  }
}

/** A fresh keyring entry, e.g. for tests. The README shows the shell one-liner. */
export function generateKeyringEntry(version: number): string {
  return `${version}:${randomBytes(32).toString("base64")}`;
}
