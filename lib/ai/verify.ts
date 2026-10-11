import "server-only";

import type { ProviderId } from "./models";

/**
 * Checks a provider key with a free, read-only request (listing models or
 * reading key info). No tokens are spent. The key is only ever placed in a
 * request header; it never appears in a URL, a log line or an error.
 */

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "invalid" }
  /** The provider could not answer (down, timeout, rate limited). The key may be fine. */
  | { ok: false; reason: "unreachable" };

type Probe = { url: string; headers: (key: string) => Record<string, string> };

const PROBES: Record<ProviderId, Probe> = {
  anthropic: {
    url: "https://api.anthropic.com/v1/models?limit=1",
    headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  openrouter: {
    // Returns the key's own info; 401 when the key is missing, invalid or disabled.
    url: "https://openrouter.ai/api/v1/key",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  fal: {
    url: "https://api.fal.ai/v1/models?limit=1",
    headers: (key) => ({ authorization: `Key ${key}` }),
  },
};

export const VERIFY_TIMEOUT_MS = 10_000;

export async function verifyProviderKey(
  provider: ProviderId,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifyResult> {
  const probe = PROBES[provider];
  let status: number;
  try {
    const response = await fetchImpl(probe.url, {
      method: "GET",
      headers: { accept: "application/json", ...probe.headers(key) },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
    status = response.status;
    // Drain the body so the connection can be reused; its content is not needed.
    await response.body?.cancel().catch(() => {});
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (status >= 200 && status < 300) return { ok: true };
  if (status === 401 || status === 403) return { ok: false, reason: "invalid" };
  return { ok: false, reason: "unreachable" };
}

/** Exposed for tests: the probe a provider uses, without the key. */
export function probeUrl(provider: ProviderId): string {
  return PROBES[provider].url;
}
