import type { AcousticChange, ReportEvent } from "../api/client";

export type VoiceReportRow = {
  id: string;
  eventId: string;
  requestedAt: string;
  recordedAt?: string;
  trigger: string;
  state: string;
  score: number | null;
  acoustic?: AcousticChange;
  reasons: string[];
};
const ANALYZED = ["no_change", "recheck", "caution"];
export function analyzedVoiceCount(events: ReportEvent[]) {
  return events.reduce((count, event) => count + (event.measurements?.length
    ? event.measurements.filter((row) => ANALYZED.includes(row.state) && Number.isFinite(row.change_score) && row.change_score !== null).length
    : event.acoustic || ANALYZED.includes(event.state ?? "") ? 1 : 0), 0);
}
export function voiceReportRows(events: ReportEvent[]): VoiceReportRow[] {
  return events.flatMap<VoiceReportRow>((event) => {
    const base = { eventId: event.id, requestedAt: event.detected_at, trigger: event.trigger };
    if (event.measurements?.length) return event.measurements.map((row) => ({
      ...base, id: row.id, recordedAt: row.recorded_at, state: row.state,
      score: row.change_score !== null && Number.isFinite(row.change_score) && row.change_score >= 0 ? row.change_score : null,
      acoustic: row.acoustic, reasons: row.reason_codes ?? [],
    }));
    // Older events contain only the last state and sometimes acoustic deltas.
    // Never invent a missing score or a recording timestamp from the request time.
    return [{ ...base, id: event.id, state: event.state ?? "pending", score: null,
      acoustic: event.acoustic, reasons: event.reason_codes ?? [] }];
  });
}
export const VOICE_STATE: Record<string, string> = {
  no_change: "변화 없음", recheck: "재확인", caution: "주의", unanalyzable: "분석 불가",
  skipped: "건너뜀", no_response: "미응답", pending: "확인 대기",
};
