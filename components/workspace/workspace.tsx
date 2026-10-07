"use client";

import { useRef, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Spark } from "@/components/brand/spark";
import { Badge } from "@/components/ui/badge";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { demoSnapshot, type DemoScenario } from "@/lib/workspace/mock";
import type { BriefPart } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";
import { ChatThread } from "./chat/chat-thread";
import { Composer } from "./chat/composer";
import { PreviewPanel } from "./preview/preview-panel";
import { useMockAgent } from "./use-mock-agent";

/**
 * The game workspace: conversation on the left, the playable game on the
 * right. Phones get Chat / Play tabs. Driven by the demo agent for now;
 * the real agent hook will return the same shape.
 */
export function Workspace({ scenario, autoPrompt }: { scenario: DemoScenario; autoPrompt?: string }) {
  const [initial] = useState(() => demoSnapshot(autoPrompt ? "fresh" : scenario));
  const { messages, build, activity, send, answer, approveBrief, stop } = useMockAgent(initial, {
    autoPrompt,
    resumeBuild: !autoPrompt && scenario === "building",
  });
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<"chat" | "play">("chat");
  const [seenVersion, setSeenVersion] = useState<number | null>(null);

  const busy = activity.state === "thinking" || activity.state === "working";
  const crash = build.status === "crashed" ? build.error : undefined;
  const liveVersion = build.status === "ready" ? build.version : null;
  const unseen = isMobile && tab === "chat" && liveVersion !== null && liveVersion !== seenVersion;

  // Viewing Play (or leaving it) marks the live version as seen.
  const selectTab = (next: "chat" | "play") => {
    if (next === "play" || tab === "play") setSeenVersion(liveVersion);
    setTab(next);
  };

  const approvedBrief = [...messages]
    .reverse()
    .flatMap((m) => [...m.parts].reverse())
    .find((p): p is BriefPart => p.type === "brief" && p.status === "approved");
  const title = approvedBrief?.brief.title ?? "Untitled game";

  const fixCrash = () => {
    if (!crash) return;
    send("The game crashed. Can you fix it?", [{ kind: "runtime-error", message: crash.message }]);
    selectTab("chat");
  };

  const chat = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {messages.length === 0 ? <EmptyThread /> : (
        <ChatThread
          messages={messages}
          busy={busy}
          onAnswer={(id, v) => void answer(id, v)}
          onApproveBrief={() => {
            void approveBrief();
            if (isMobile) selectTab("play");
          }}
          onReviseBrief={() => composerRef.current?.focus()}
        />
      )}
      <Composer ref={composerRef} activity={activity} hasMessages={messages.length > 0} crash={crash} onSend={send} onStop={stop} />
    </div>
  );

  const preview = <PreviewPanel build={build} onFix={fixCrash} />;

  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <PageHeader
        title={title}
        actions={
          <Tooltip>
            <TooltipTrigger render={<Badge variant="pixel" className="cursor-default" />}>
              <Spark size={7} /> Demo agent
            </TooltipTrigger>
            <TooltipContent>Responses are scripted until the real agent is connected.</TooltipContent>
          </Tooltip>
        }
      />

      {isMobile ? (
        <>
          <div role="tablist" aria-label="Workspace view" className="grid shrink-0 grid-cols-2 gap-1 border-b border-hairline p-1.5">
            {(["chat", "play"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => selectTab(t)}
                className={cn(
                  "relative flex h-8 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors",
                  tab === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "chat" ? "Chat" : "Play"}
                {t === "play" && unseen && <span aria-label="New version" className="size-1.5 rounded-[1px] bg-ember" />}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">{tab === "chat" ? chat : preview}</div>
        </>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="42%" minSize={360} maxSize="62%">
            {chat}
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-hairline" />
          <ResizablePanel minSize={320}>{preview}</ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}

function EmptyThread() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
      <Spark size={28} />
      <p className="mt-4 font-display text-display-sm">Start with one sentence.</p>
      <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">The world, the goal, and what makes it hard.</p>
    </div>
  );
}
