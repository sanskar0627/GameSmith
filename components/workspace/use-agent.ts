"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { applyPartEvent, emptyAssistant, type RunEvent } from "@/lib/workspace/events";
import type {
  AgentActivity,
  Attachment,
  BuildState,
  ChatMessage,
  RuntimeError,
  WorkspaceSnapshot,
} from "@/lib/workspace/types";

/**
 * The real agent for saved games. Same shape as the demo hook
 * (use-mock-agent.ts): { messages, build, activity, send, answer,
 * approveBrief, stop }. Each action starts a run on the server
 * (POST /api/games/:id/runs) and follows its events over SSE.
 */

type StartBody =
  | { kind: "prompt"; text: string; attachments?: Attachment[] }
  | { kind: "answer"; askId: string; value: string }
  | { kind: "approve" }
  | { kind: "resume" };

type Options = {
  /** A run already in progress (page loaded mid-run): follow it. */
  activeRunId?: string | null;
  /** The saved first prompt has no answer yet: start a run for it. */
  autoResume?: boolean;
};

export function useAgent(gameId: string, initial: WorkspaceSnapshot, { activeRunId, autoResume }: Options = {}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [build, setBuild] = useState<BuildState>(initial.build);
  const [activity, setActivity] = useState<AgentActivity>(
    activeRunId ? { state: "thinking" } : initial.activity,
  );

  const source = useRef<EventSource | null>(null);
  const runId = useRef<string | null>(null);
  const assistantId = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const apply = useCallback((event: RunEvent) => {
    switch (event.type) {
      case "start":
        assistantId.current = event.messageId;
        setMessages((ms) => (ms.some((m) => m.id === event.messageId) ? ms : [...ms, emptyAssistant(event)]));
        break;
      case "part":
      case "delta": {
        const id = assistantId.current;
        if (!id) return;
        setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, parts: applyPartEvent(m.parts, event) } : m)));
        break;
      }
      case "activity":
        setActivity(event.activity);
        break;
      case "build":
        setBuild(event.build);
        break;
      case "done":
        break;
    }
  }, []);

  const follow = useCallback(
    (id: string) => {
      source.current?.close();
      runId.current = id;
      const es = new EventSource(`/api/games/${encodeURIComponent(gameId)}/runs/${encodeURIComponent(id)}/events`);
      source.current = es;
      es.onmessage = (e) => {
        const event = JSON.parse(e.data) as RunEvent;
        apply(event);
        if (event.type === "done") {
          es.close();
          if (source.current === es) source.current = null;
          runId.current = null;
          // New versions, sparks used, game status.
          router.refresh();
        }
      };
      es.onerror = () => {
        // The browser reconnects on its own (with Last-Event-ID); only a refused stream ends here.
        if (es.readyState === EventSource.CLOSED) {
          if (source.current === es) source.current = null;
          runId.current = null;
          setActivity({ state: "idle" });
        }
      };
    },
    [apply, gameId, router],
  );

  const start = useCallback(
    async (body: StartBody) => {
      setActivity({ state: "thinking" });
      let res: Response;
      try {
        res = await fetch(`/api/games/${encodeURIComponent(gameId)}/runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        setActivity({ state: "idle" });
        toast.add({ type: "error", title: "You seem to be offline", description: "Check your connection and try again." });
        return false;
      }
      const data = (await res.json().catch(() => ({}))) as {
        runId?: string;
        userMessage?: ChatMessage | null;
        error?: string;
        code?: string;
      };
      if (res.status === 409 && data.runId) {
        follow(data.runId);
        return false;
      }
      if (!res.ok || !data.runId) {
        setActivity({ state: "idle" });
        toast.add({
          type: "error",
          title: res.status === 402 ? "Out of sparks" : "Smith couldn’t start",
          description: data.error ?? "Something went wrong. Try again.",
          ...(res.status === 402 || data.code === "needs-key"
            ? {
                actionProps: {
                  children: res.status === 402 ? "Get sparks" : "Add a key",
                  onClick: () => router.push(res.status === 402 ? "/settings/billing" : "/settings/keys"),
                },
              }
            : {}),
        });
        return false;
      }
      if (data.userMessage) {
        const message = data.userMessage;
        setMessages((ms) => [...ms.filter((m) => !m.id.startsWith("pending-")), message]);
      }
      follow(data.runId);
      return true;
    },
    [follow, gameId, router],
  );

  const answer = useCallback(
    async (askId: string, value: string) => {
      setMessages((ms) =>
        ms.map((m) => ({ ...m, parts: m.parts.map((p) => (p.type === "ask" && p.id === askId ? { ...p, answer: value } : p)) })),
      );
      const ok = await start({ kind: "answer", askId, value });
      if (!ok) {
        setMessages((ms) =>
          ms.map((m) => ({
            ...m,
            parts: m.parts.map((p) => (p.type === "ask" && p.id === askId ? { ...p, answer: undefined } : p)),
          })),
        );
      }
    },
    [start],
  );

  const approveBrief = useCallback(async () => {
    const mark = (status: "approved" | "proposed") =>
      setMessages((ms) => ms.map((m) => ({ ...m, parts: m.parts.map((p) => (p.type === "brief" ? { ...p, status } : p)) })));
    mark("approved");
    if (!(await start({ kind: "approve" }))) mark("proposed");
  }, [start]);

  const send = useCallback(
    (text: string, attachments?: Attachment[]) => {
      // While a question is open, free text answers it.
      const lastAssistant = [...messagesRef.current].reverse().find((m) => m.role === "assistant");
      const pending = lastAssistant?.parts.find((p) => p.type === "ask" && !p.answer);
      if (pending && pending.type === "ask" && !attachments?.length) return void answer(pending.id, text);
      // Show the message right away; the server's copy replaces it.
      const optimistic: ChatMessage = {
        id: `pending-${Date.now()}`,
        role: "user",
        createdAt: new Date().toISOString(),
        parts: [{ type: "text", text }],
        attachments,
      };
      setMessages((ms) => [...ms, optimistic]);
      void start({ kind: "prompt", text, attachments }).then((ok) => {
        if (!ok) setMessages((ms) => ms.filter((m) => m.id !== optimistic.id));
      });
    },
    [answer, start],
  );

  const stop = useCallback(() => {
    const id = runId.current;
    if (!id) return;
    setActivity({ state: "working", detail: "Stopping" });
    void fetch(`/api/games/${encodeURIComponent(gameId)}/runs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  }, [gameId]);

  /** The preview reported a crash: offer "Ask Smith to fix it". */
  const reportCrash = useCallback((error: RuntimeError) => {
    setBuild((b) => (b.status === "ready" || b.status === "crashed" ? { status: "crashed", version: b.version, error } : b));
  }, []);

  /** Hot reload succeeded after a crash. */
  const clearCrash = useCallback(() => {
    setBuild((b) => (b.status === "crashed" ? { status: "ready", version: b.version } : b));
  }, []);

  // Attach once: follow the running run, or answer the saved first prompt.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // From a timer, not the effect body: starting sets state.
    setTimeout(() => {
      if (activeRunId) follow(activeRunId);
      else if (autoResume) void start({ kind: "resume" });
    }, 0);
    // Bootstrap runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => source.current?.close(), []);

  return { messages, build, activity, send, answer, approveBrief, stop, reportCrash, clearCrash };
}
