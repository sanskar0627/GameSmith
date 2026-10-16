/**
 * Browser-side calls to the game file and sandbox routes
 * (app/api/games/[gameId]/...). Every route checks ownership on the server;
 * these helpers only shape requests and turn error bodies into messages.
 */

export type FileEntry = { path: string; size: number; mtime: number };

export type SandboxView = { running: false } | { running: true; previewUrl: string; startedAt: string };

export class FilesApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FilesApiError";
  }
}

/** Encodes each path segment, keeping the slashes. */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function call(url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new FilesApiError(0, "You seem to be offline. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new FilesApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return res;
}

const base = (gameId: string) => `/api/games/${encodeURIComponent(gameId)}`;

export async function startSandbox(gameId: string): Promise<SandboxView> {
  return (await call(`${base(gameId)}/sandbox`, { method: "POST" })).json();
}

export async function sandboxStatus(gameId: string): Promise<SandboxView> {
  return (await call(`${base(gameId)}/sandbox`)).json();
}

export async function listFiles(gameId: string): Promise<FileEntry[]> {
  return ((await (await call(`${base(gameId)}/files`)).json()) as { files: FileEntry[] }).files;
}

export async function readFile(gameId: string, path: string): Promise<Uint8Array> {
  return new Uint8Array(await (await call(`${base(gameId)}/files/${encodePath(path)}`)).arrayBuffer());
}

export async function writeFile(gameId: string, path: string, content: string): Promise<void> {
  await call(`${base(gameId)}/files/${encodePath(path)}`, { method: "PUT", body: content });
}

export async function deleteFile(gameId: string, path: string): Promise<void> {
  await call(`${base(gameId)}/files/${encodePath(path)}`, { method: "DELETE" });
}

export async function renameFile(gameId: string, from: string, to: string): Promise<string> {
  const res = await call(`${base(gameId)}/files/${encodePath(from)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to }),
  });
  return ((await res.json()) as { path: string }).path;
}

export function downloadUrl(gameId: string): string {
  return `${base(gameId)}/download`;
}

/** UTF-8 text, or null for binary files (images, audio) the editor can't show. */
export function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Same limit as the server (lib/server/sandbox/service.ts). */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
