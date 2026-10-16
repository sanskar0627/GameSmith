import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { SandboxClient } from "@/lib/server/sandbox/client";

import { ASK_TOOL, BRIEF_TOOL } from "./history";

/**
 * The agent's tools. File tools run against the game's sandbox (the run
 * already checked ownership). ask_player and propose_brief have no execute:
 * calling one ends the turn and the player's response comes back as the tool
 * result in the next run. checkpoint saves a playable version.
 */

const MAX_READ_CHARS = 60_000;
/** The sandbox needs it to start (see sandbox/template/entrypoint.sh). */
const LOCKED = new Set(["package.json", "vite.config.ts"]);

const path = z.string().min(1).max(256).describe("Path relative to the project root, like src/main.ts");

export type CheckpointResult = { version: number; label: string };

export type ToolDeps = {
  gameId: string;
  sandbox: SandboxClient;
  /** Saves a version (snapshot + game_versions row). */
  checkpoint: (label: string) => Promise<CheckpointResult>;
};

export type FileChange = { added: number; removed: number };

/** Lines added and removed, by multiset difference (cheap, good enough for a badge). */
export function lineChange(before: string, after: string): FileChange {
  const count = new Map<string, number>();
  for (const line of before.split("\n")) count.set(line, (count.get(line) ?? 0) + 1);
  let added = 0;
  for (const line of after.split("\n")) {
    const n = count.get(line) ?? 0;
    if (n > 0) count.set(line, n - 1);
    else added++;
  }
  let removed = 0;
  for (const n of count.values()) removed += n;
  if (before === "") removed = 0;
  return { added, removed };
}

const decoder = new TextDecoder();

async function readText(sandbox: SandboxClient, gameId: string, file: string): Promise<string | null> {
  try {
    return decoder.decode(await sandbox.readFile(gameId, file));
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}

export function agentTools(deps: ToolDeps) {
  const { gameId, sandbox } = deps;
  const guard = (file: string) => {
    if (LOCKED.has(file.replace(/^\.\//, ""))) throw new Error(`${file} is managed by GameSmith. Leave it as it is.`);
  };

  return {
    list_files: tool({
      description: "List the project's source files (no node_modules or build output).",
      inputSchema: z.object({}),
      execute: async () => ({ files: (await sandbox.listFiles(gameId)).map((f) => f.path) }),
    }),
    read_file: tool({
      description: "Read one text file.",
      inputSchema: z.object({ path }),
      execute: async ({ path: file }) => {
        const text = await readText(sandbox, gameId, file);
        if (text === null) throw new Error(`${file} does not exist.`);
        return text.length > MAX_READ_CHARS
          ? { path: file, content: text.slice(0, MAX_READ_CHARS), truncated: true }
          : { path: file, content: text };
      },
    }),
    write_file: tool({
      description: "Create or overwrite a file with its complete content. Folders are created as needed.",
      inputSchema: z.object({ path, content: z.string().max(400_000) }),
      execute: async ({ path: file, content }) => {
        guard(file);
        const before = (await readText(sandbox, gameId, file)) ?? "";
        await sandbox.writeFile(gameId, file, new TextEncoder().encode(content));
        return { path: file, ...lineChange(before, content) };
      },
    }),
    replace_text: tool({
      description:
        "Replace exact text in a file. `find` must match the file exactly once (copy it from read_file), unless `all` is true.",
      inputSchema: z.object({ path, find: z.string().min(1), replace: z.string(), all: z.boolean().optional() }),
      execute: async ({ path: file, find, replace, all }) => {
        guard(file);
        const before = await readText(sandbox, gameId, file);
        if (before === null) throw new Error(`${file} does not exist.`);
        const matches = before.split(find).length - 1;
        if (matches === 0) throw new Error(`The text to find is not in ${file}. Read the file again and copy it exactly.`);
        if (matches > 1 && !all) throw new Error(`The text appears ${matches} times in ${file}. Include more context or set all.`);
        const after = all ? before.split(find).join(replace) : before.replace(find, () => replace);
        await sandbox.writeFile(gameId, file, new TextEncoder().encode(after));
        return { path: file, replaced: all ? matches : 1, ...lineChange(before, after) };
      },
    }),
    delete_file: tool({
      description: "Delete one file.",
      inputSchema: z.object({ path }),
      execute: async ({ path: file }) => {
        guard(file);
        await sandbox.deleteFile(gameId, file);
        return { path: file, deleted: true };
      },
    }),
    [ASK_TOOL]: tool({
      description:
        "Ask the player ONE design question with 2 to 4 concrete options, then stop and wait. Only when the answer changes what you build.",
      inputSchema: z.object({
        question: z.string().min(1).max(200),
        hint: z.string().max(200).optional(),
        options: z
          .array(z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(60), description: z.string().max(140).optional() }))
          .min(2)
          .max(4),
      }),
    }),
    [BRIEF_TOOL]: tool({
      description: "Propose the plan for the first build, then stop and wait for the player to approve or change it.",
      inputSchema: z.object({
        brief: z.object({
          title: z.string().min(1).max(60),
          pitch: z.string().min(1).max(280),
          loop: z.string().max(280),
          goal: z.string().max(200),
          challenge: z.string().max(200),
          controls: z.array(z.object({ keys: z.array(z.string().max(20)).min(1).max(4), action: z.string().max(60) })).max(8),
          world: z.string().max(280),
          style: z.string().max(140),
          feel: z.string().max(140),
        }),
      }),
    }),
    checkpoint: tool({
      description: "Save the current files as a new playable version, after the change works. Give it a short label.",
      inputSchema: z.object({ label: z.string().min(1).max(60) }),
      execute: async ({ label }) => deps.checkpoint(label),
    }),
  } satisfies ToolSet;
}

export type AgentTools = ReturnType<typeof agentTools>;

export const FILE_TOOLS = new Set(["list_files", "read_file", "write_file", "replace_text", "delete_file"]);
