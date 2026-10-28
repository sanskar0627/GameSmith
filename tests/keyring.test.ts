import { describe, expect, it } from "vitest";

import { DecryptError, generateKeyringEntry, KeyringError, open, parseKeyring, seal } from "@/lib/crypto/keyring";

const ring = parseKeyring(`${generateKeyringEntry(2)},${generateKeyringEntry(1)}`);
const SECRET = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";

describe("parseKeyring", () => {
  it("uses the first entry as the active key", () => {
    expect(ring.active).toBe(2);
    expect([...ring.keys.keys()]).toEqual([2, 1]);
  });

  it("rejects malformed, short and duplicate entries", () => {
    expect(() => parseKeyring("")).toThrow(KeyringError);
    expect(() => parseKeyring("not-a-key")).toThrow(KeyringError);
    expect(() => parseKeyring(`1:${Buffer.alloc(16).toString("base64")}`)).toThrow(/32 bytes/);
    const entry = generateKeyringEntry(1);
    expect(() => parseKeyring(`${entry},${entry}`)).toThrow(/twice/);
  });
});

describe("seal / open", () => {
  const context = "gamesmith/provider-key/v1|user_a|anthropic";

  it("round-trips and never contains the plaintext", () => {
    const sealed = seal(ring, SECRET, context);
    expect(sealed.keyVersion).toBe(2);
    expect(JSON.stringify(sealed)).not.toContain(SECRET);
    expect(JSON.stringify(sealed)).not.toContain(Buffer.from(SECRET).toString("base64"));
    expect(open(ring, sealed, context)).toBe(SECRET);
  });

  it("uses a fresh IV every time", () => {
    const a = seal(ring, SECRET, context);
    const b = seal(ring, SECRET, context);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("refuses another user's or provider's context (ciphertext can't be moved)", () => {
    const sealed = seal(ring, SECRET, context);
    expect(() => open(ring, sealed, "gamesmith/provider-key/v1|user_b|anthropic")).toThrow(DecryptError);
    expect(() => open(ring, sealed, "gamesmith/provider-key/v1|user_a|openai")).toThrow(DecryptError);
  });

  it("detects tampering with ciphertext, tag or IV", () => {
    const sealed = seal(ring, SECRET, context);
    const flip = (b64: string) => {
      const bytes = Buffer.from(b64, "base64");
      bytes[0] ^= 1;
      return bytes.toString("base64");
    };
    expect(() => open(ring, { ...sealed, ciphertext: flip(sealed.ciphertext) }, context)).toThrow(DecryptError);
    expect(() => open(ring, { ...sealed, tag: flip(sealed.tag) }, context)).toThrow(DecryptError);
    expect(() => open(ring, { ...sealed, iv: flip(sealed.iv) }, context)).toThrow(DecryptError);
  });

  it("rejects a truncated auth tag", () => {
    const sealed = seal(ring, SECRET, context);
    const short = Buffer.from(sealed.tag, "base64").subarray(0, 4).toString("base64");
    expect(() => open(ring, { ...sealed, tag: short }, context)).toThrow(DecryptError);
  });

  it("decrypts rows from an older key version, and fails for unknown versions", () => {
    const old = parseKeyring(generateKeyringEntry(1));
    const oldRing = parseKeyring(`${generateKeyringEntry(2)},1:${old.keys.get(1)!.toString("base64")}`);
    const sealedByOld = seal(old, SECRET, context);
    expect(open(oldRing, sealedByOld, context)).toBe(SECRET);
    expect(() => open(ring, { ...sealedByOld, keyVersion: 9 }, context)).toThrow(DecryptError);
  });
});
