/** Lightweight game record for lists (sidebar, library). */
export type GameStatus = "draft" | "building" | "ready" | "error";

export type GameSummary = {
  id: string;
  title: string;
  status: GameStatus;
  updatedAt: string; // ISO
  thumbnailUrl?: string | null;
};
