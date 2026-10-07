"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BUILD_STEPS, CAMERA_ASK, DEMO_BRIEF, FIRST_BUILD_TOOLS } from "@/lib/workspace/mock";
import type {
  AgentActivity,
  Attachment,
  BuildState,
  BuildStep,
  ChatMessage,
  MessagePart,
  ToolPart,
  WorkspaceSnapshot,
} from "@/lib/workspace/types";

/**
 * DEMO AGENT. A scripted stand-in for the real agent so every workspace state
 * can be designed and reviewed. Same return shape the real hook will have:
 * { messages, build, activity, send, answer, approveBrief, stop }.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const now = () => new Date().toISOString();

const VERB: Record<ToolPart["tool"], string> = {
  list_files: "Listing",
  read_file: "Reading",
  write_file: "Writing",
  replace_text: "Editing",
  delete_file: "Deleting",
};

type Options = { autoPrompt?: string; resumeBuild?: boolean };

export function useMockAgent(initial: WorkspaceSnapshot, { autoPrompt, resumeBuild }: Options = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [build, setBuild] = useState<BuildState>(initial.build);
  const [activity, setActivity] = useState<AgentActivity>(initial.activity);

  const runRef = useRef(0);
  const buildRef = useRef(build);
  useEffect(() => {
    buildRef.current = build;
  }, [build]);

  /* --- message helpers -------------------------------------------------- */

  const push = useCallback((m: ChatMessage) => setMessages((ms) => [...ms, m]), []);

  const patchMessage = useCallback((id: string, fn: (parts: MessagePart[]) => MessagePart[]) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, parts: fn(m.parts) } : m)));
  }, []);

  const addPart = useCallback(
    (id: string, part: MessagePart) => patchMessage(id, (parts) => [...parts, part]),
    [patchMessage],
  );

  const setLastPart = useCallback(
    (id: string, part: MessagePart) => patchMessage(id, (parts) => [...parts.slice(0, -1), part]),
    [patchMessage],
  );

  /** Starts a cancellable run. `alive()` turns false when stopped or superseded. */
  const begin = useCallback(() => {
    const id = ++runRef.current;
    return () => runRef.current === id;
  }, []);

  const streamText = useCallback(
    async (msgId: string, text: string, alive: () => boolean) => {
      addPart(msgId, { type: "text", text: "", streaming: true });
      for (let i = 3; i <= text.length + 2; i += 3) {
        if (!alive()) return false;
        setLastPart(msgId, { type: "text", text: text.slice(0, i), streaming: i < text.length });
        await sleep(16);
      }
      setLastPart(msgId, { type: "text", text });
      return alive();
    },
    [addPart, setLastPart],
  );

  const think = useCallback(
    async (msgId: string, text: string, ms: number, alive: () => boolean) => {
      setActivity({ state: "thinking" });
      addPart(msgId, { type: "reasoning", text, streaming: true });
      await sleep(ms);
      if (!alive()) return false;
      setLastPart(msgId, { type: "reasoning", text, seconds: Math.max(1, Math.round(ms / 1000)) });
      return true;
    },
    [addPart, setLastPart],
  );

  /** Runs tool calls one by one while advancing build steps. */
  const runTools = useCallback(
    async (
      msgId: string,
      tools: Omit<ToolPart, "state">[],
      steps: string[],
      version: number,
      previousVersion: number | undefined,
      alive: () => boolean,
    ) => {
      const toSteps = (active: number): BuildStep[] =>
        steps.map((label, i) => ({ label, state: i < active ? "done" : i === active ? "active" : "pending" }));
      setBuild({ status: "building", version, steps: toSteps(0), previousVersion });

      for (let i = 0; i < tools.length; i++) {
        if (!alive()) return false;
        const tool = tools[i];
        setActivity({ state: "working", detail: `${VERB[tool.tool]} ${tool.path}` });
        addPart(msgId, { ...tool, state: "running" });
        setBuild({
          status: "building",
          version,
          steps: toSteps(Math.min(steps.length - 2, Math.floor(((i + 1) / tools.length) * (steps.length - 1)))),
          previousVersion,
        });
        await sleep(tool.tool === "read_file" || tool.tool === "list_files" ? 420 : 760);
        if (!alive()) return false;
        setLastPart(msgId, { ...tool, state: "done" });
      }
      setActivity({ state: "working", detail: "Starting the game" });
      setBuild({ status: "building", version, steps: toSteps(steps.length - 1), previousVersion });
      await sleep(1100);
      if (!alive()) return false;
      setBuild({ status: "ready", version });
      return true;
    },
    [addPart, setLastPart],
  );

  /* --- flows ------------------------------------------------------------- */

  const firstPrompt = useCallback(
    async (text: string) => {
      const alive = begin();
      push({ id: uid("u"), role: "user", createdAt: now(), parts: [{ type: "text", text }] });
      const id = uid("a");
      push({ id, role: "assistant", createdAt: now(), parts: [] });
      if (!(await think(id, "Platformer at dusk. Camera choice drives controls and spacing.", 1600, alive))) return;
      if (!(await streamText(id, "Love this. Floating islands at sunset is a great stage for a platformer. One decision before I plan it:", alive)))
        return;
      addPart(id, { ...CAMERA_ASK, id: uid("ask") });
      setActivity({ state: "waiting" });
    },
    [addPart, begin, push, streamText, think],
  );

  const answer = useCallback(
    async (askId: string, value: string) => {
      const alive = begin();
      setMessages((ms) =>
        ms.map((m) => ({ ...m, parts: m.parts.map((p) => (p.type === "ask" && p.id === askId ? { ...p, answer: value } : p)) })),
      );
      push({ id: uid("u"), role: "user", createdAt: now(), parts: [{ type: "text", text: value }] });
      const id = uid("a");
      push({ id, role: "assistant", createdAt: now(), parts: [] });
      setActivity({ state: "thinking" });
      await sleep(700);
      if (!alive()) return;
      if (!(await streamText(id, `${value} it is. Here's the plan. Approve it and I'll start building, or tell me what to change.`, alive)))
        return;
      addPart(id, { type: "brief", brief: DEMO_BRIEF, status: "proposed" });
      setActivity({ state: "waiting" });
    },
    [addPart, begin, push, streamText],
  );

  const finishFirstBuild = useCallback(
    async (id: string, tools: Omit<ToolPart, "state">[], alive: () => boolean) => {
      if (!(await runTools(id, tools, BUILD_STEPS, 1, undefined, alive))) return;
      if (
        !(await streamText(
          id,
          "Your first version is ready. Five islands, eight crystals, two sentinels. Try the long jump on island three: it should feel tight but fair.",
          alive,
        ))
      )
        return;
      addPart(id, { type: "checkpoint", version: 1, label: "First playable" });
      setActivity({ state: "idle" });
    },
    [addPart, runTools, streamText],
  );

  const approveBrief = useCallback(async () => {
    const alive = begin();
    setMessages((ms) =>
      ms.map((m) => ({ ...m, parts: m.parts.map((p) => (p.type === "brief" ? { ...p, status: "approved" as const } : p)) })),
    );
    const id = uid("a");
    push({ id, role: "assistant", createdAt: now(), parts: [] });
    await finishFirstBuild(id, FIRST_BUILD_TOOLS, alive);
  }, [begin, finishFirstBuild, push]);

  const iterate = useCallback(
    async (text: string, attachments?: Attachment[]) => {
      const alive = begin();
      const current = buildRef.current;
      const prev = current.status === "ready" || current.status === "crashed" ? current.version : undefined;
      const version = (prev ?? 0) + 1;
      push({ id: uid("u"), role: "user", createdAt: now(), parts: [{ type: "text", text }], attachments });
      const id = uid("a");
      push({ id, role: "assistant", createdAt: now(), parts: [] });

      const fixing = attachments?.some((a) => a.kind === "runtime-error");
      const reasoning = fixing
        ? "The HUD reads the knight before it spawns. Guard the first frame."
        : "Find where this lives, change the smallest thing, rebuild.";
      if (!(await think(id, reasoning, 1300, alive))) return;

      const tools: Omit<ToolPart, "state">[] = fixing
        ? [
            { type: "tool", id: uid("t"), tool: "read_file", path: "src/game/hud.ts" },
            { type: "tool", id: uid("t"), tool: "replace_text", path: "src/game/hud.ts", added: 3, removed: 1 },
          ]
        : [
            { type: "tool", id: uid("t"), tool: "read_file", path: "src/game/world.ts" },
            { type: "tool", id: uid("t"), tool: "replace_text", path: "src/game/world.ts", added: 9, removed: 4 },
          ];
      if (!(await runTools(id, tools, ["Applying changes", "Rebuilding", "Reloading preview"], version, prev, alive))) return;

      const summary = fixing
        ? "Fixed. The health bar was drawn before the knight existed on the first frame. It now waits for the knight to spawn."
        : `Done. I made that change: “${text.length > 80 ? `${text.slice(0, 80)}…` : text}”. Give it a spin and tell me how it feels.`;
      if (!(await streamText(id, summary, alive))) return;
      addPart(id, { type: "checkpoint", version, label: fixing ? "Crash fixed" : "Your change" });
      setActivity({ state: "idle" });
    },
    [addPart, begin, push, runTools, streamText, think],
  );

  const send = useCallback(
    (text: string, attachments?: Attachment[]) => {
      const hasHistory = messages.length > 0;
      if (!hasHistory) return void firstPrompt(text);
      // While a question or brief is pending, free text counts as the answer/changes.
      const pendingAsk = [...messages].reverse().flatMap((m) => m.parts).find((p) => p.type === "ask" && !p.answer);
      if (pendingAsk && pendingAsk.type === "ask") return void answer(pendingAsk.id, text);
      return void iterate(text, attachments);
    },
    [answer, firstPrompt, iterate, messages],
  );

  const stop = useCallback(() => {
    runRef.current++;
    const b = buildRef.current;
    const live = b.status === "building" ? b.previousVersion : b.status === "ready" || b.status === "crashed" ? b.version : undefined;
    setMessages((ms) => {
      const last = ms[ms.length - 1];
      if (!last || last.role !== "assistant") return ms;
      const edited = last.parts.some((p) => p.type === "tool" && p.state === "done" && p.tool !== "read_file" && p.tool !== "list_files");
      const parts = last.parts.map((p): MessagePart => {
        if (p.type === "tool" && p.state === "running") return { ...p, state: "error", error: "Stopped" };
        if ((p.type === "text" || p.type === "reasoning") && p.streaming) return { ...p, streaming: false };
        return p;
      });
      // Say exactly what is true: what is live, and where partial edits went.
      const text = live
        ? `Stopped. v${live} is still live${edited ? "; edits made so far will go into the next build." : "."}`
        : `Stopped before the first build${edited ? ". Edits made so far are kept for the next run." : "."}`;
      return [...ms.slice(0, -1), { ...last, parts: [...parts, { type: "notice", text }] }];
    });
    setBuild((cur) =>
      cur.status === "building" ? (cur.previousVersion ? { status: "ready", version: cur.previousVersion } : { status: "empty" }) : cur,
    );
    setActivity({ state: "idle" });
  }, []);

  // Runs once. No cleanup cancel: under StrictMode the effect mounts twice and
  // a cancel would kill the first run while the guard blocks a restart.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Start from a timer (a beat before the agent "picks up"), not the effect body.
    setTimeout(() => {
      if (autoPrompt) {
        void firstPrompt(autoPrompt);
      } else if (resumeBuild) {
        const last = initial.messages[initial.messages.length - 1];
        if (!last) return;
        const done = last.parts.filter((p) => p.type === "tool" && p.state === "done").length;
        // Drop the in-flight row; the resumed run re-adds it.
        patchMessage(last.id, (parts) => parts.filter((p) => !(p.type === "tool" && p.state === "running")));
        void finishFirstBuild(last.id, FIRST_BUILD_TOOLS.slice(done), begin());
      }
    }, 350);
    // Demo bootstrap runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { messages, build, activity, send, answer, approveBrief, stop };
}

