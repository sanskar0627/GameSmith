/** Game records shared by the sidebar, library, workspace and play page. */
export type GameStatus = "draft" | "building" | "ready" | "error";

export type GameVisibility = "private" | "link";

/** Lightweight record for lists (sidebar, library). */
export type GameSummary = {
  id: string;
  title: string;
  status: GameStatus;
  updatedAt: string; // ISO
  thumbnailUrl?: string | null;
};

/** Library card: summary plus what the grid shows. */
export type GameCard = GameSummary & {
  pitch: string;
  genre: string;
  version: number;
  createdAt: string; // ISO
  visibility: GameVisibility;
  /** Seed for the generated cover when there is no screenshot yet. */
  coverSeed: number;
};

export type GameVersion = {
  version: number;
  label: string;
  prompt: string;
  createdAt: string; // ISO
  status: "ready" | "error";
  filesChanged: number;
  /** A saved snapshot exists, so this version can be restored. */
  restorable: boolean;
};

export type GameFile = {
  path: string;
  language: "ts" | "html" | "json" | "md" | "css";
  content: string;
};
