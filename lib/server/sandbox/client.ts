import "server-only";

/**
 * HTTP client for the sandbox manager (sandbox/manager). Server-side only:
 * it carries the shared token. Callers must check game ownership first
 * (lib/server/sandbox/service.ts does).
 */

export class SandboxError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SandboxError";
  }
}

export type SandboxStatus =
  | { running: true; previewPath: string; startedAt: number; lastActive: number }
  | { running: false };

export type SandboxFile = { path: string; size: number; mtime: number };

/** Encodes each path segment, keeping the slashes. */
export function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export class SandboxClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request(method: string, path: string, body?: BodyInit, timeoutMs = 90_000): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
        method,
        headers: { authorization: `Bearer ${this.token}` },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new SandboxError(503, "The sandbox service is unreachable.");
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new SandboxError(res.status, data.error ?? `Sandbox service error (${res.status})`);
    }
    return res;
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.request(method, path, body === undefined ? undefined : JSON.stringify(body));
    return (await res.json()) as T;
  }

  status(gameId: string) {
    return this.json<SandboxStatus>("GET", `/v1/sandboxes/${gameId}`);
  }

  start(gameId: string, restore?: string) {
    return this.json<SandboxStatus>("POST", `/v1/sandboxes/${gameId}/start`, restore ? { restore } : {});
  }

  stop(gameId: string, snapshot = true) {
    return this.json<SandboxStatus>("POST", `/v1/sandboxes/${gameId}/stop`, { snapshot });
  }

  snapshot(gameId: string, name: string) {
    return this.json<{ bytes: number }>("POST", `/v1/sandboxes/${gameId}/snapshots`, { name });
  }

  copySnapshot(from: string, to: string) {
    return this.json<{ copied: boolean }>("POST", "/v1/snapshots/copy", { from, to });
  }

  async listFiles(gameId: string): Promise<SandboxFile[]> {
    return (await this.json<{ files: SandboxFile[] }>("GET", `/v1/sandboxes/${gameId}/files`)).files;
  }

  async readFile(gameId: string, path: string): Promise<Uint8Array> {
    const res = await this.request("GET", `/v1/sandboxes/${gameId}/files/${encodePath(path)}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async writeFile(gameId: string, path: string, data: Uint8Array) {
    await this.request("PUT", `/v1/sandboxes/${gameId}/files/${encodePath(path)}`, data as BodyInit);
  }

  async deleteFile(gameId: string, path: string) {
    await this.request("DELETE", `/v1/sandboxes/${gameId}/files/${encodePath(path)}`);
  }

  /** gzip tar of the game's source (Phase 8 download). */
  async archive(gameId: string): Promise<ReadableStream<Uint8Array>> {
    const res = await this.request("GET", `/v1/sandboxes/${gameId}/archive`);
    if (!res.body) throw new SandboxError(502, "Empty archive");
    return res.body;
  }
}
