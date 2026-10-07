import { formatDistanceToNowStrict } from "date-fns";

/** "2h ago", "3d ago". Short, for dense metadata rows. */
export function timeAgo(iso: string) {
  const s = formatDistanceToNowStrict(new Date(iso), { roundingMethod: "floor" });
  return (
    s
      .replace(/ seconds?/, "s")
      .replace(/ minutes?/, "m")
      .replace(/ hours?/, "h")
      .replace(/ days?/, "d")
      .replace(/ months?/, "mo")
      .replace(/ years?/, "y") + " ago"
  );
}
