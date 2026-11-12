import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
import { createDeviceApi, calendarLabel } from "../src/analysis/local";
import { decodeWav, extractFeatures, transform } from "../src/analysis/dsp";
import { encodePcmWav } from "../src/audio/wav";

function wav(frequency = 200, amplitude = 0.2, rate = 32000, seconds = 2) {
  const count = Math.floor(rate * seconds), bytes = new Uint8Array(44 + count * 2), view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => [...value].forEach((character, i) => view.setUint8(at + i, character.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * frequency * i / rate) * amplitude * 32767), true);
  return bytes;
}
const clip = (frequency = 200, amplitude = 0.2) => ({ uri: "file:///private/voice.wav", bytes: wav(frequency, amplitude) });
function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); }, removeItem: async (key: string) => { values.delete(key); } };
  let time = new Date("2026-11-06T03:00:00Z").getTime();
  const api = createDeviceApi(storage, () => time);
  return { api, storage, values, advance: (ms: number) => { time += ms; } };
}

describe("device audio processing", () => {
  it("encodes the actual capture format and preserves split PCM chunks", () => {
    const original = wav(200, .2, 48000);
    const raw = original.slice(44);
    const encoded = encodePcmWav([raw.slice(0, 1000), raw.slice(1000)], 48000, 1);
    expect(decodeWav(encoded).rate).toBe(48000);
    expect(decodeWav(encoded).samples).toEqual(decodeWav(original).samples);
    expect(() => encodePcmWav([], 32000, 1)).toThrow("INVALID_AUDIO_FORMAT");
    expect(() => encodePcmWav([new Uint8Array(3)], 32000, 2)).toThrow("INVALID_AUDIO_FORMAT");
  });
  it("round trips a complex FFT and rejects invalid sizes", () => {
    const re = Float64Array.of(1, 2, -3, 4, 5, -6, 7, 8), im = new Float64Array(8), expected = re.slice();
    transform(re, im); transform(re, im, true);
    expected.forEach((value, i) => expect(re[i]).toBeCloseTo(value, 10));
    expect(() => transform(new Float64Array(3), new Float64Array(3))).toThrow("FFT_SIZE");
  });
  it("extracts finite features, rejects silence and decodes arbitrary RIFF chunks", () => {
    const result = extractFeatures(wav());
    expect(result.reasons).toEqual([]);
    expect(result.embedding).toHaveLength(256); expect(result.mfcc).toHaveLength(13);
    expect(Math.hypot(...result.embedding)).toBeCloseTo(1);
    expect(Number.isFinite(result.cpp)).toBe(true);
    expect(extractFeatures(wav(200, 0.001)).reasons).toContain("TOO_QUIET");
    const original = wav(), extended = new Uint8Array(original.length + 12);
    extended.set(original.subarray(0, 36)); extended.set([74, 85, 78, 75, 4, 0, 0, 0, 0, 0, 0, 0], 36); extended.set(original.subarray(36), 48);
    new DataView(extended.buffer).setUint32(4, extended.length - 8, true);
    expect(decodeWav(extended).samples).toEqual(decodeWav(original).samples);
    expect(() => decodeWav(original.subarray(0, original.length - 2))).toThrow("DECODE_FAILED");
    const resampled = extractFeatures(wav(200, 0.2, 48000));
    expect(resampled.reasons).toEqual([]);
    expect(resampled.embedding.every(Number.isFinite)).toBe(true);
  });
});

describe("offline meal lifecycle", () => {
  it("runs a complete meal with no network and persists no raw audio or baseline features", async () => {
    const { api, values } = setup();
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("OFFLINE"));
    try {
      await api.consent("voice_analysis", true);
      const meal = await api.startSession("점심");
      expect((await api.baseline(meal.id, [clip(), clip(), clip()])).stable).toBe(true);
      const event = await api.swallow(meal.id, "manual");
      expect((await api.voice(event.id, clip())).state).toBe("no_change");
      await api.endSession(meal.id);
      const report = await api.report(meal.id);
      expect(report.session.swallow_count).toBe(1);
      expect(report.session.no_change_count).toBe(1);
      expect((await api.trend("day")).points[0].no_change_ratio).toBe(1);
      expect((await api.home()).meal_count).toBe(1);
      const persisted = [...values.values()].join("");
      for (const forbidden of ["file:///", "RIFF", "embedding", '"mfcc":', "bytes"]) expect(persisted).not.toContain(forbidden);
      expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  });
  it("requires a valid baseline, deduplicates candidates, honors every-nth and excludes periodic checks", async () => {
    const { api, advance } = setup();
    await expect(api.startSession("아침")).rejects.toThrow("CONSENT_REQUIRED");
    await api.consent("voice_analysis", true);
    const meal = await api.startSession("아침");
    await expect(api.swallow(meal.id, "auto")).rejects.toThrow("BASELINE_REQUIRED");
    expect((await api.baseline(meal.id, [clip(200, 0), clip(200, 0), clip(200, 0)])).stable).toBe(false);
    await api.baseline(meal.id, [clip(), clip(), clip()]);
    expect((await api.swallow(meal.id, "auto", 0.8, false)).prompt).toBe(false);
    const event = await api.swallow(meal.id, "auto", 0.8);
    expect((await api.swallow(meal.id, "auto", 0.8)).merged).toBe(true);
    await api.skip(event.id);
    const periodic = await api.swallow(meal.id, "periodic");
    advance(11000);
    const next = await api.swallow(meal.id, "manual");
    expect((await api.report(meal.id)).events.find((row) => row.id === periodic.id)?.state).toBe("no_response");
    await api.endSession(meal.id);
    const report = await api.report(meal.id);
    expect(report.session.swallow_count).toBe(3);
    expect(report.skipped_count).toBe(2);
    expect(report.events.find((row) => row.id === next.id)?.state).toBe("skipped");
  });
  it("requests recheck before caution and locks the event until resolved", async () => {
    const { api } = setup();
    await api.consent("voice_analysis", true);
    const meal = await api.startSession("저녁");
    await api.baseline(meal.id, [clip(), clip(), clip()]);
    const event = await api.swallow(meal.id, "manual");
    expect((await api.voice(event.id, clip(380))).state).toBe("recheck");
    expect((await api.voice(event.id, clip(380))).state).toBe("caution");
    await expect(api.swallow(meal.id, "manual")).rejects.toThrow("WRONG_PHASE");
    await api.resolve(event.id);
    expect((await api.report(meal.id)).session.caution_count).toBe(1);
  });
  it("does not smooth away a new change or carry it into an unchanged recheck", async () => {
    const { api } = setup();
    await api.consent("voice_analysis", true);
    const meal = await api.startSession("점심");
    await api.baseline(meal.id, [clip(), clip(), clip()]);
    const first = await api.swallow(meal.id, "manual");
    expect((await api.voice(first.id, clip())).state).toBe("no_change");
    const changed = await api.swallow(meal.id, "manual");
    expect((await api.voice(changed.id, clip(380))).state).toBe("recheck");
    const recovered = await api.voice(changed.id, clip());
    expect(recovered.state).toBe("no_change");
    expect(recovered.change_score).toBeCloseTo(0);
  });
  it("restores history after restart, ends interrupted sessions and deletes data", async () => {
    const { api, storage } = setup();
    await api.consent("voice_analysis", true);
    const meal = await api.startSession("간식");
    await api.baseline(meal.id, [clip(), clip(), clip()]);
    await api.swallow(meal.id, "manual");
    const restored = createDeviceApi(storage);
    const report = await restored.report(meal.id);
    expect(report.session.ended_at).not.toBeNull();
    expect(report.no_response_count).toBe(1);
    await expect(restored.swallow(meal.id, "manual")).rejects.toThrow("WRONG_PHASE");
    await restored.deleteData();
    expect(await restored.sessions()).toEqual([]);
    await restored.consent("voice_analysis", false);
    await expect(restored.startSession("점심")).rejects.toThrow("CONSENT_REQUIRED");
  });
  it("distinguishes repeated quality failures and recovers an expired response", async () => {
    const { api, advance } = setup();
    await api.consent("voice_analysis", true);
    const meal = await api.startSession("점심");
    await api.baseline(meal.id, [clip(), clip(), clip()]);
    const event = await api.swallow(meal.id, "manual");
    const first = await api.voice(event.id, clip(200, .001));
    const second = await api.voice(event.id, clip(200, .001));
    expect(first.state).toBe("unanalyzable");
    expect(second.state).toBe("unanalyzable");
    expect(first.result_id).not.toBe(second.result_id);
    expect((await api.voice(event.id, clip(200, .001))).state).toBe("skipped");
    const late = await api.swallow(meal.id, "manual");
    advance(11000);
    expect((await api.voice(late.id, clip())).state).toBe("no_response");
  });
  it("uses ISO weeks across year boundaries", () => {
    expect(calendarLabel(new Date(2021, 0, 1), "week")).toBe("2020-W53");
    expect(calendarLabel(new Date(2026, 0, 5), "week")).toBe("2026-W02");
  });
});
