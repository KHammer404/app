export type AspirationEvent = { id: string; offsetMs: number };
type TimelineRecord = {
  seconds: number;
  durationMs?: number;
  aspirationEvents?: AspirationEvent[];
};
export function timelineDuration(record: TimelineRecord): number {
  const ms = record.durationMs ?? record.seconds * 1000;
  return Number.isFinite(ms) ? Math.max(0, ms) : 0;
}
export function timelineEvents(record: TimelineRecord): AspirationEvent[] {
  const duration = timelineDuration(record);
  if (!Array.isArray(record.aspirationEvents)) return [];
  return record.aspirationEvents
    .filter(
      (event) =>
        event &&
        typeof event.id === "string" &&
        Number.isFinite(event.offsetMs) &&
        event.offsetMs >= 0 &&
        event.offsetMs <= duration,
    )
    .slice()
    .sort((a, b) => a.offsetMs - b.offsetMs);
}
export function eventPosition(offsetMs: number, durationMs: number): number {
  return durationMs > 0 ? Math.min(1, Math.max(0, offsetMs / durationMs)) : 0;
}
export function elapsedLabel(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function timelineClock(date: Date): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
