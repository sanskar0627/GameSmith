const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Game ids are lowercase UUIDs. Everything named after one is validated first. */
export function isGameId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export const names = {
  container: (gameId: string) => `gs-sbx-${gameId}`,
  network: (gameId: string) => `gs-net-${gameId}`,
  volume: (gameId: string) => `gs-ws-${gameId}`,
};

export const LABEL = "dev.gamesmith.sandbox";
