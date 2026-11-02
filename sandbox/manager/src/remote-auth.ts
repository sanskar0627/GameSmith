import type { PreviewAuth } from "./proxy.js";

/**
 * Preview checks for the proxy container: asks the manager API and caches
 * the answer briefly so page loads (dozens of module requests) cost one call.
 * Activity is reported at most every 30 seconds per game.
 */
export class RemotePreviewAuth implements PreviewAuth {
  private readonly cache = new Map<string, { ok: boolean; until: number }>();
  private readonly lastTouch = new Map<string, number>();

  constructor(
    private readonly managerUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async ask(gameId: string, secret: string): Promise<boolean> {
    const res = await this.fetchImpl(`${this.managerUrl}/v1/preview/check`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ gameId, secret }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    return ((await res.json()) as { ok?: boolean }).ok === true;
  }

  async check(gameId: string, secret: string): Promise<boolean> {
    const key = `${gameId}:${secret}`;
    const hit = this.cache.get(key);
    if (hit && hit.until > this.now()) {
      if (hit.ok) this.touch(gameId);
      return hit.ok;
    }
    const ok = await this.ask(gameId, secret).catch(() => false);
    this.cache.set(key, { ok, until: this.now() + (ok ? 10_000 : 2_000) });
    if (ok) this.lastTouch.set(gameId, this.now());
    if (this.cache.size > 5000) this.cache.clear();
    return ok;
  }

  touch(gameId: string): void {
    const last = this.lastTouch.get(gameId) ?? 0;
    if (this.now() - last < 30_000) return;
    this.lastTouch.set(gameId, this.now());
    // Any check marks the sandbox active; the secret is in the cache key.
    const entry = [...this.cache.entries()].find(([k, v]) => k.startsWith(`${gameId}:`) && v.ok);
    if (entry) void this.ask(gameId, entry[0].slice(gameId.length + 1)).catch(() => {});
  }
}
