"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ExternalLink,
  FileCode2,
  FileJson,
  FileText,
  MoreHorizontal,
  Plus,
  RotateCw,
  Save,
  TriangleAlert,
} from "lucide-react";
import { PixelLoader } from "@/components/brand/pixel-loader";
import { Spark } from "@/components/brand/spark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { toast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  decodeText,
  deleteFile,
  FilesApiError,
  listFiles,
  MAX_FILE_BYTES,
  readFile,
  renameFile,
  sandboxStatus,
  startSandbox,
  writeFile,
  type FileEntry,
} from "@/lib/games/files-api";
import { cn } from "@/lib/utils";
import { CodeEditor } from "./code-editor";
import { DeleteFileDialog, PathDialog } from "./editor-dialogs";

/**
 * The live editor (Phase 8): the game's real files from its sandbox, a
 * CodeMirror editor and the running preview side by side. Edits save on
 * their own shortly after you stop typing (or with Cmd/Ctrl+S); Vite in the
 * sandbox hot-reloads the preview.
 */

type Doc =
  | { status: "loading" }
  | { status: "binary" }
  | { status: "error"; message: string }
  | { status: "ready"; content: string; saved: string };

type Preview =
  | { state: "starting" }
  | { state: "running"; url: string }
  | { state: "unavailable"; message: string }
  | { state: "error"; message: string };

type DialogState = { kind: "create" } | { kind: "rename"; path: string } | { kind: "delete"; path: string } | null;

const AUTOSAVE_MS = 700;
/** package.json can't be renamed or deleted (the sandbox re-seeds without it). */
const LOCKED = new Set(["package.json"]);

const isDirty = (doc: Doc | undefined) => doc?.status === "ready" && doc.content !== doc.saved;

function messageOf(error: unknown): string {
  return error instanceof FilesApiError ? error.message : "Something went wrong. Try again.";
}

function sortFiles(files: FileEntry[]): FileEntry[] {
  return [...files].sort((a, b) => {
    const da = a.path.includes("/") ? 0 : 1;
    const db = b.path.includes("/") ? 0 : 1;
    return da - db || a.path.localeCompare(b.path);
  });
}

function defaultFile(files: FileEntry[]): string | null {
  return (
    files.find((f) => f.path === "src/main.ts")?.path ??
    files.find((f) => f.path.startsWith("src/"))?.path ??
    files[0]?.path ??
    null
  );
}

export function GameEditor({ gameId }: { gameId: string }) {
  const isMobile = useIsMobile();
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview>({ state: "starting" });
  const [active, setActive] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, Doc>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<DialogState>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<"code" | "preview">("code");

  const docsRef = useRef(docs);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inflight = useRef(new Map<string, Promise<boolean>>());

  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  /* --- Loading ---------------------------------------------------------- */

  const open = useCallback(
    async (path: string) => {
      setActive(path);
      if (docsRef.current[path] && docsRef.current[path].status !== "error") return;
      setDocs((d) => ({ ...d, [path]: { status: "loading" } }));
      try {
        const text = decodeText(await readFile(gameId, path));
        setDocs((d) => ({ ...d, [path]: text === null ? { status: "binary" } : { status: "ready", content: text, saved: text } }));
      } catch (error) {
        setDocs((d) => ({ ...d, [path]: { status: "error", message: messageOf(error) } }));
      }
    },
    [gameId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sandbox = await startSandbox(gameId);
        if (cancelled) return;
        setPreview(sandbox.running ? { state: "running", url: sandbox.previewUrl } : { state: "error", message: "The sandbox did not start." });
      } catch (error) {
        if (cancelled) return;
        const message = messageOf(error);
        const unavailable = error instanceof FilesApiError && error.status === 503;
        setPreview(unavailable ? { state: "unavailable", message } : { state: "error", message });
        if (unavailable) {
          setListError(message);
          return;
        }
      }
      try {
        const list = sortFiles(await listFiles(gameId));
        if (cancelled) return;
        setFiles(list);
        const first = defaultFile(list);
        if (first) void open(first);
      } catch (error) {
        if (!cancelled) setListError(messageOf(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, open]);

  /* --- Saving ----------------------------------------------------------- */

  /** A file restart can hand out a new preview link; keep the iframe on the live one. */
  const refreshPreview = useCallback(async () => {
    try {
      const sandbox = await sandboxStatus(gameId);
      if (sandbox.running) {
        setPreview((p) => (p.state === "running" && p.url === sandbox.previewUrl ? p : { state: "running", url: sandbox.previewUrl }));
      }
    } catch {
      /* the next save tries again */
    }
  }, [gameId]);

  const save = useCallback(
    async (path: string): Promise<boolean> => {
      clearTimeout(timers.current.get(path));
      timers.current.delete(path);
      const running = inflight.current.get(path);
      if (running) await running;

      const doc = docsRef.current[path];
      if (doc?.status !== "ready" || doc.content === doc.saved) return true;
      const sent = doc.content;
      if (new TextEncoder().encode(sent).byteLength > MAX_FILE_BYTES) {
        setFailed((f) => ({ ...f, [path]: true }));
        toast.add({ type: "error", title: "File too large", description: "Files can be up to 2 MB." });
        return false;
      }

      const attempt = (async () => {
        setSaving((s) => ({ ...s, [path]: true }));
        try {
          await writeFile(gameId, path, sent);
          setDocs((d) => {
            const current = d[path];
            return current?.status === "ready" ? { ...d, [path]: { ...current, saved: sent } } : d;
          });
          setFailed((f) => ({ ...f, [path]: false }));
          void refreshPreview();
          return true;
        } catch (error) {
          setFailed((f) => ({ ...f, [path]: true }));
          toast.add({ type: "error", title: `Couldn’t save ${path}`, description: messageOf(error) });
          return false;
        } finally {
          setSaving((s) => ({ ...s, [path]: false }));
          inflight.current.delete(path);
        }
      })();
      inflight.current.set(path, attempt);
      return attempt;
    },
    [gameId, refreshPreview],
  );

  const change = (path: string, content: string) => {
    setDocs((d) => {
      const current = d[path];
      return current?.status === "ready" ? { ...d, [path]: { ...current, content } } : d;
    });
    clearTimeout(timers.current.get(path));
    timers.current.set(
      path,
      setTimeout(() => void save(path), AUTOSAVE_MS),
    );
  };

  // Unsaved edits: flush timers on unmount, warn before leaving the page.
  useEffect(() => {
    const pending = timers.current;
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.values(docsRef.current).some(isDirty)) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      for (const [path, timer] of pending) {
        clearTimeout(timer);
        void save(path);
      }
    };
  }, [save]);

  /* --- File operations -------------------------------------------------- */

  const create = async (path: string) => {
    setDialog(null);
    try {
      await writeFile(gameId, path, "");
      setFiles((list) => sortFiles([...(list ?? []).filter((f) => f.path !== path), { path, size: 0, mtime: Date.now() }]));
      setDocs((d) => ({ ...d, [path]: { status: "ready", content: "", saved: "" } }));
      setActive(path);
      void refreshPreview();
    } catch (error) {
      toast.add({ type: "error", title: "Couldn’t create that file", description: messageOf(error) });
    }
  };

  const rename = async (from: string, to: string) => {
    setDialog(null);
    if (!(await save(from))) return;
    try {
      const moved = await renameFile(gameId, from, to);
      setFiles((list) => sortFiles((list ?? []).map((f) => (f.path === from ? { ...f, path: moved } : f))));
      setDocs((d) => {
        const { [from]: doc, ...rest } = d;
        return doc ? { ...rest, [moved]: doc } : rest;
      });
      setActive((a) => (a === from ? moved : a));
      toast.add({ title: "Renamed", description: `Now at ${moved}.` });
    } catch (error) {
      toast.add({ type: "error", title: "Couldn’t rename that file", description: messageOf(error) });
    }
  };

  const remove = async (path: string) => {
    setDialog(null);
    clearTimeout(timers.current.get(path));
    timers.current.delete(path);
    try {
      await deleteFile(gameId, path);
      const rest = (files ?? []).filter((f) => f.path !== path);
      setFiles(rest);
      setDocs((d) => {
        const next = { ...d };
        delete next[path];
        return next;
      });
      if (active === path) {
        const next = defaultFile(rest);
        setActive(null);
        if (next) void open(next);
      }
    } catch (error) {
      toast.add({ type: "error", title: "Couldn’t delete that file", description: messageOf(error) });
    }
  };

  /* --- Render ----------------------------------------------------------- */

  const dirty = useMemo(() => new Set(Object.keys(docs).filter((p) => isDirty(docs[p]))), [docs]);
  const paths = useMemo(() => (files ?? []).map((f) => f.path), [files]);

  if (listError && !files) {
    return <Notice title={preview.state === "unavailable" ? "Sandboxes aren’t running." : "Couldn’t load the files."} body={listError} />;
  }
  if (!files) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <PixelLoader label="Waking the sandbox" />
        Waking the sandbox…
      </div>
    );
  }

  const activeDoc = active ? docs[active] : undefined;
  const editor = (
    <EditorPane
      path={active}
      doc={activeDoc}
      saving={active ? !!saving[active] : false}
      failed={active ? !!failed[active] : false}
      onChange={(content) => active && change(active, content)}
      onSave={() => active && void save(active)}
      onRetry={() => active && void open(active)}
    />
  );
  const stage = <PreviewPane preview={preview} reloadKey={reloadKey} onReload={() => setReloadKey((k) => k + 1)} />;
  const tree = (
    <FileTree
      files={files}
      active={active}
      dirty={dirty}
      onOpen={(p) => {
        void open(p);
        setTab("code");
      }}
      onCreate={() => setDialog({ kind: "create" })}
      onRename={(path) => setDialog({ kind: "rename", path })}
      onDelete={(path) => setDialog({ kind: "delete", path })}
    />
  );

  return (
    <>
      {isMobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-hairline p-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">File</span>
              <select
                value={active ?? ""}
                onChange={(e) => {
                  void open(e.target.value);
                  setTab("code");
                }}
                className="h-9 w-full rounded-md border border-input bg-card px-2 font-mono text-[13px]"
              >
                {files.map((f) => (
                  <option key={f.path} value={f.path}>
                    {dirty.has(f.path) ? `● ${f.path}` : f.path}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="outline" size="icon" aria-label="New file" onClick={() => setDialog({ kind: "create" })}>
              <Plus />
            </Button>
          </div>
          <div role="tablist" aria-label="Editor view" className="grid shrink-0 grid-cols-2 gap-1 border-b border-hairline p-1.5">
            {(["code", "preview"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md text-sm font-medium transition-colors",
                  tab === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "code" ? "Code" : "Preview"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">{tab === "code" ? editor : stage}</div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
          {tree}
          <ResizablePanelGroup orientation="horizontal" className="min-h-0">
            <ResizablePanel defaultSize="55%" minSize={320}>
              {editor}
            </ResizablePanel>
            <ResizableHandle withHandle className="bg-hairline" />
            <ResizablePanel minSize={280}>{stage}</ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}

      <PathDialog
        open={dialog?.kind === "create" || dialog?.kind === "rename"}
        onOpenChange={(o) => !o && setDialog(null)}
        mode={dialog?.kind === "rename" ? "rename" : "create"}
        initial={dialog?.kind === "rename" ? dialog.path : "src/"}
        existing={paths}
        onSubmit={(path) => {
          if (dialog?.kind === "rename") void rename(dialog.path, path);
          else void create(path);
        }}
      />
      <DeleteFileDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        path={dialog?.kind === "delete" ? dialog.path : ""}
        onDelete={() => dialog?.kind === "delete" && void remove(dialog.path)}
      />
    </>
  );
}

/* --- Pieces -------------------------------------------------------------- */

const ICONS: Record<string, typeof FileCode2> = { json: FileJson, md: FileText, txt: FileText };

function iconFor(path: string) {
  return ICONS[path.slice(path.lastIndexOf(".") + 1).toLowerCase()] ?? FileCode2;
}

function FileTree({
  files,
  active,
  dirty,
  onOpen,
  onCreate,
  onRename,
  onDelete,
}: {
  files: FileEntry[];
  active: string | null;
  dirty: Set<string>;
  onOpen: (path: string) => void;
  onCreate: () => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, FileEntry[]>();
    for (const f of files) {
      const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
      map.set(dir, [...(map.get(dir) ?? []), f]);
    }
    return [...map.entries()];
  }, [files]);

  return (
    <nav aria-label="Files" className="flex min-h-0 flex-col border-r border-hairline bg-surface">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-hairline pr-1.5 pl-3">
        <span className="label-pixel text-muted-foreground">Files</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="New file" className="text-muted-foreground" onClick={onCreate} />
            }
          >
            <Plus />
          </TooltipTrigger>
          <TooltipContent>New file</TooltipContent>
        </Tooltip>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {files.length === 0 && <p className="px-2 py-3 text-[13px] text-muted-foreground">No files yet.</p>}
        {groups.map(([dir, items]) => (
          <div key={dir || "root"} className="mb-2">
            {dir && <p className="label-pixel truncate px-2 pt-2 pb-1 text-muted-foreground">{dir}/</p>}
            <ul>
              {items.map((f) => {
                const Icon = iconFor(f.path);
                const name = f.path.slice(f.path.lastIndexOf("/") + 1);
                const isActive = f.path === active;
                const locked = LOCKED.has(f.path);
                return (
                  <li key={f.path} className="group/file relative">
                    <button
                      type="button"
                      onClick={() => onOpen(f.path)}
                      aria-current={isActive ? "true" : undefined}
                      className={cn(
                        "relative flex w-full items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-left font-mono text-[12.5px] transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-ember"
                          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      <span className="truncate">{name}</span>
                      {dirty.has(f.path) && (
                        <>
                          <span aria-hidden className="ml-auto size-1.5 shrink-0 rounded-[1px] bg-ember" />
                          <span className="sr-only">, unsaved changes</span>
                        </>
                      )}
                    </button>
                    {!locked && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Actions for ${f.path}`}
                              className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground opacity-0 group-hover/file:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
                            />
                          }
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-36">
                          <DropdownMenuItem onClick={() => onRename(f.path)}>Rename</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => onDelete(f.path)}>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function EditorPane({
  path,
  doc,
  saving,
  failed,
  onChange,
  onSave,
  onRetry,
}: {
  path: string | null;
  doc: Doc | undefined;
  saving: boolean;
  failed: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
  onRetry: () => void;
}) {
  if (!path) {
    return <Notice title="Pick a file." body="Choose a file on the left, or make a new one." />;
  }
  const dirty = isDirty(doc);
  const status = saving ? "Saving…" : failed && dirty ? "Not saved" : dirty ? "Unsaved" : "Saved";

  return (
    <section aria-label={path} className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-hairline px-3">
        <span className="truncate font-mono text-[12.5px]">{path}</span>
        {doc?.status === "ready" && (
          <span
            role="status"
            className={cn(
              "label-pixel ml-auto flex shrink-0 items-center gap-1.5",
              failed && dirty ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {saving && <PixelLoader size="sm" label="Saving" />}
            {status}
          </span>
        )}
        {doc?.status === "ready" && (
          <Button variant="ghost" size="xs" onClick={onSave} disabled={!dirty || saving} className="text-muted-foreground">
            <Save data-icon="inline-start" /> Save
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 bg-card">
        {(!doc || doc.status === "loading") && (
          <div className="grid h-full place-items-center">
            <PixelLoader label="Opening file" />
          </div>
        )}
        {doc?.status === "binary" && <Notice title="Not a text file." body="Images and sounds can’t be edited here." />}
        {doc?.status === "error" && (
          <Notice
            title="Couldn’t open this file."
            body={doc.message}
            action={
              <Button variant="outline" size="sm" onClick={onRetry}>
                Try again
              </Button>
            }
          />
        )}
        {doc?.status === "ready" && (
          <CodeEditor docKey={path} value={doc.content} path={path} onChange={onChange} onSave={onSave} />
        )}
      </div>
    </section>
  );
}

function PreviewPane({ preview, reloadKey, onReload }: { preview: Preview; reloadKey: number; onReload: () => void }) {
  const url = preview.state === "running" ? preview.url : null;
  return (
    <section aria-label="Live preview" className="dark flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-hairline px-3">
        <span className="label-pixel flex items-center gap-1.5 text-muted-foreground">
          {preview.state === "starting" && (
            <>
              <PixelLoader size="sm" label="Starting" /> Starting
            </>
          )}
          {preview.state === "running" && (
            <>
              <span className="size-1.5 rounded-[1px] bg-ember" /> Live preview
            </>
          )}
          {(preview.state === "error" || preview.state === "unavailable") && (
            <>
              <TriangleAlert className="size-3" /> No preview
            </>
          )}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label="Reload preview" disabled={!url} onClick={onReload} className="text-muted-foreground">
            <RotateCw />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open preview in a new tab"
            disabled={!url}
            onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
            className="text-muted-foreground"
          >
            <ExternalLink />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 p-2">
        <div className="relative size-full overflow-hidden rounded-xl bg-night ring-1 ring-border">
          {url ? (
            <iframe
              key={`${url}-${reloadKey}`}
              src={url}
              title="Game preview"
              sandbox="allow-scripts allow-pointer-lock"
              allow="fullscreen; gamepad; autoplay"
              className="absolute inset-0 size-full border-0"
            />
          ) : preview.state === "starting" ? (
            <div className="grid size-full place-items-center">
              <PixelLoader label="Starting the game" />
            </div>
          ) : (
            <Notice title="The preview isn’t running." body={"message" in preview ? preview.message : ""} />
          )}
        </div>
      </div>
    </section>
  );
}

function Notice({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex size-full flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <Spark size={21} className="text-muted-foreground" />
      <p className="mt-4 font-display text-display-sm">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
