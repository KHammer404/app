import { expect, it } from "vitest";
import { analyzedVoiceCount, voiceReportRows } from "../src/utils/voiceReport";
import type { ReportEvent } from "../src/api/client";
const event = (values: Partial<ReportEvent> = {}): ReportEvent => ({
  id: "e1", detected_at: "2026-11-14T00:00:00Z", trigger: "periodic", state: "no_response",
  duration_seconds: null, reason_codes: [], spectrogram_url: null, baseline_spectrogram_url: null, ...values,
});
it("preserves measurements and zero scores without counting rejected attempts as completed", () => {
  const rows = [event({ measurements: [
    { id: "m1", recorded_at: "2026-11-14T00:00:01Z", state: "no_change", change_score: 0, reason_codes: [] },
    { id: "m2", recorded_at: "2026-11-14T00:00:02Z", state: "unanalyzable", change_score: null, reason_codes: ["LOW_SNR"] },
  ] })];
  expect(analyzedVoiceCount(rows)).toBe(1);
  expect(voiceReportRows(rows).map((r) => r.score)).toEqual([0, null]);
  expect(voiceReportRows(rows)[1].reasons).toEqual(["LOW_SNR"]);
});
it("keeps historical acoustic deltas but never fabricates historical scores or recording times", () => {
  const events = [event({ state: "caution", acoustic: { mfcc_l2: 4, cpp_delta: -.3 } }), event({ id: "e2" })];
  const rows = voiceReportRows(events);
  expect(rows[0].acoustic?.cpp_delta).toBe(-.3);
  expect(rows[0].score).toBeNull();
  expect(rows[0].recordedAt).toBeUndefined();
  expect(rows[1].state).toBe("no_response");
  expect(analyzedVoiceCount(events)).toBe(1);
});
