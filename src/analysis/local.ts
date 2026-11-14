import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Analysis, BaselineResult, MealListItem, SessionReport, SwallowEvent, TrendPoint, WavClip } from "../api/client";
import type { Meal } from "../utils/mealTime";
import { distance, extractFeatures, FEATURE_VERSION, type Features } from "./dsp";

const KEY = "@samkim/device-analysis/v1";
const DISCLAIMER = "개인 기준 대비 음성 변화 기록입니다. 흡인을 진단하지 않으며, 변화 없음은 흡인이 없다는 뜻이 아닙니다.";
const SLOTS: Record<Meal, string> = { 아침: "breakfast", 점심: "lunch", 저녁: "dinner", 간식: "snack" };
type Storage = Pick<typeof AsyncStorage, "getItem" | "setItem" | "removeItem">;
type Event = SessionReport["events"][number] & { deadline: number | null; attempts: number; confidence?: number };
type DeviceSession = { summary: MealListItem; events: Event[]; open: string | null; baselineQuality: string | null; score: number | null; streak: number };
type Database = { version: 1; consent: boolean; sessions: DeviceSession[] };
const blank = (): Database => ({ version: 1, consent: false, sessions: [] });
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };

/** Every API used by the meal flow is fulfilled locally. No fetch/WebSocket,
 * raw audio persistence, or server fallback is permitted in this adapter.
 */
export function createDeviceApi(storage: Storage, now = () => Date.now()) {
  let database: Database | null = null;
  let loading: Promise<Database> | null = null;
  let serial: Promise<unknown> = Promise.resolve();
  let counter = 0;
  const baselines = new Map<string, Features & { spread: number }>();
  const id = () => `device-${now().toString(36)}-${(++counter).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  async function load() {
    if (database) return database;
    if (!loading) loading = (async () => {
      const raw = await storage.getItem(KEY);
      if (!raw) return (database = blank());
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1 ||
          !("sessions" in parsed) || !Array.isArray(parsed.sessions) || !("consent" in parsed) || typeof parsed.consent !== "boolean") throw new Error("LOCAL_DATA_INVALID");
      // Never pretend an interrupted session still has its in-memory baseline.
      const restored = parsed as Database;
      for (const session of restored.sessions) {
        if (!session.summary || !Array.isArray(session.events)) throw new Error("LOCAL_DATA_INVALID");
        if (!session.summary.ended_at) {
          const last = session.events.at(-1)?.detected_at ?? session.summary.started_at;
          session.summary.ended_at = last;
          session.summary.phase = "ENDED";
          session.open = null;
          for (const event of session.events) if (event.deadline != null) { event.state = "no_response"; event.deadline = null; }
        }
      }
      database = restored;
      return restored;
    })().catch((error) => { loading = null; throw error; });
    return loading;
  }
  function transaction<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
    const pending = serial.then(async () => {
      const current = await load();
      const draft = JSON.parse(JSON.stringify(current)) as Database;
      const result = await fn(draft);
      await storage.setItem(KEY, JSON.stringify(draft));
      database = draft;
      return result;
    });
    serial = pending.catch(() => {});
    return pending;
  }
  function session(db: Database, sid: string, active = false) {
    const value = db.sessions.find((row) => row.summary.id === sid);
    if (!value) throw new Error("NOT_FOUND");
    if (active && value.summary.ended_at) throw new Error("WRONG_PHASE");
    return value;
  }
  function locate(db: Database, eid: string) {
    const meal = db.sessions.find((row) => row.events.some((event) => event.id === eid));
    if (!meal) throw new Error("NOT_FOUND");
    if (meal.summary.ended_at) throw new Error("WRONG_PHASE");
    return { meal, event: meal.events.find((event) => event.id === eid)! };
  }
  function terminal(meal: DeviceSession, event: Event, state: string) {
    event.state = state; event.deadline = null; meal.open = null; meal.summary.phase = "TRACKING"; meal.streak = 0;
  }
  function expire(meal: DeviceSession) {
    const event = meal.events.find((row) => row.id === meal.open);
    if (event?.deadline != null && now() > event.deadline) terminal(meal, event, "no_response");
  }
  function output(meal: DeviceSession, event: Event, reasons: string[] = [], warnings: string[] = []): Analysis {
    return { result_id: id(), event_id: event.id, state: event.state ?? "unanalyzable", phase: meal.summary.phase, reason_codes: reasons,
      warnings, message_key: event.state ?? "unanalyzable", profile_learning: true,
      change_score: ["no_change", "recheck", "caution"].includes(event.state ?? "") ? event.measurements?.at(-1)?.change_score ?? null : null };
  }
  function summary(meal: DeviceSession): MealListItem {
    return { ...meal.summary,
      duration_seconds: Math.max(0, ((meal.summary.ended_at ? Date.parse(meal.summary.ended_at) : now()) - Date.parse(meal.summary.started_at)) / 1000),
      swallow_count: meal.events.filter((row) => row.trigger !== "periodic").length,
      caution_count: meal.events.filter((row) => row.state === "caution").length,
      no_change_count: meal.events.filter((row) => row.state === "no_change").length };
  }
  function features(clip: WavClip, baseline?: Features) {
    if (!clip.bytes) throw new Error("DECODE_FAILED");
    return extractFeatures(clip.bytes, baseline);
  }
  const api = {
    async consent(item: "voice_analysis" | "research_optional", granted: boolean) {
      return transaction((db) => {
        if (item === "voice_analysis") { db.consent = granted; if (!granted) baselines.clear(); }
      });
    },
    async deleteData() {
      return transaction((db) => { db.sessions = []; baselines.clear(); });
    },
    async startSession(meal: Meal) {
      return transaction((db) => {
        if (!db.consent) throw new Error("CONSENT_REQUIRED");
        if (db.sessions.some((row) => !row.summary.ended_at)) throw new Error("SESSION_ACTIVE");
        const item: MealListItem = { id: id(), meal: SLOTS[meal], phase: "BASELINE", started_at: new Date(now()).toISOString(),
          ended_at: null, duration_seconds: 0, swallow_count: 0, caution_count: 0, no_change_count: 0 };
        db.sessions.unshift({ summary: item, events: [], open: null, baselineQuality: null, score: null, streak: 0 });
        return { ...item };
      });
    },
    async baseline(sid: string, clips: WavClip[]): Promise<BaselineResult> {
      return transaction((db) => {
        if (!db.consent) throw new Error("CONSENT_REQUIRED");
        const meal = session(db, sid, true);
        if (meal.open) throw new Error("WRONG_PHASE");
        const usable: Features[] = [], reasons: string[] = [], warnings: string[] = [];
        if (clips.length !== 3) throw new Error("BASELINE_TOO_FEW");
        for (const clip of clips) {
          try {
            const result = features(clip);
            if (result.reasons.length) reasons.push(...result.reasons); else usable.push(result);
            warnings.push(...result.warnings);
          } catch (error) { reasons.push(error instanceof Error ? error.message : "DECODE_FAILED"); }
        }
        if (usable.length < 2) reasons.push("BASELINE_TOO_FEW");
        if (usable.length >= 2) {
          const embedding = usable[0].embedding.map((_, i) => median(usable.map((row) => row.embedding[i])));
          const spread = Math.sqrt(usable.reduce((sum, row) => sum + distance(row.embedding, embedding) ** 2, 0) / usable.length);
          if (spread > 0.12) reasons.push("BASELINE_UNSTABLE");
          if (!reasons.length) {
            baselines.set(sid, { ...usable[0], embedding, spread,
              mfcc: usable[0].mfcc.map((_, i) => median(usable.map((row) => row.mfcc[i]))),
              cpp: median(usable.map((row) => row.cpp)), inputDb: median(usable.map((row) => row.inputDb)), noiseDb: median(usable.map((row) => row.noiseDb)) });
          }
        }
        const stable = !reasons.length;
        meal.baselineQuality = stable ? "ok" : "unstable";
        meal.summary.phase = stable ? "TRACKING" : "BASELINE";
        if (!stable) baselines.delete(sid);
        return { stable, passed_count: usable.length, reason_codes: [...new Set(reasons)], warnings: [...new Set(warnings)], quality_flag: meal.baselineQuality, profile_learning: true };
      });
    },
    async swallow(sid: string, trigger: "auto" | "manual" | "periodic", confidence?: number, requestVoice = true): Promise<SwallowEvent> {
      return transaction((db) => {
        const meal = session(db, sid, true);
        expire(meal);
        if (!db.consent) throw new Error("CONSENT_REQUIRED");
        if (!baselines.has(sid) || meal.summary.phase === "BASELINE") throw new Error("BASELINE_REQUIRED");
        if (meal.open) {
          const current = meal.events.find((row) => row.id === meal.open)!;
          if (meal.summary.phase !== "AWAITING_RESOLVE" && now() - Date.parse(current.detected_at) <= 1500) return { id: current.id, prompt: false, merged: true, phase: meal.summary.phase };
          throw new Error("WRONG_PHASE");
        }
        const event: Event = { id: id(), detected_at: new Date(now()).toISOString(), trigger, confidence,
          state: null, duration_seconds: null, reason_codes: [], spectrogram_url: null, baseline_spectrogram_url: null,
          deadline: requestVoice ? now() + 10000 : null, attempts: 0 };
        meal.events.push(event); meal.open = requestVoice ? event.id : null;
        meal.summary.phase = requestVoice ? "AWAITING_VOICE" : "TRACKING";
        return { id: event.id, prompt: requestVoice, merged: false, phase: meal.summary.phase };
      });
    },
    async voice(eid: string, clip: WavClip): Promise<Analysis> {
      return transaction((db) => {
        const { meal, event } = locate(db, eid);
        const wasOpen = meal.open === eid;
        expire(meal);
        if (!db.consent) throw new Error("CONSENT_REQUIRED");
        if (wasOpen && event.state === "no_response") return output(meal, event);
        if (meal.open !== eid || !["AWAITING_VOICE", "RECHECK"].includes(meal.summary.phase)) throw new Error("WRONG_PHASE");
        const baseline = baselines.get(meal.summary.id);
        if (!baseline) throw new Error("BASELINE_REQUIRED");
        let current: Features;
        try { current = features(clip, baseline); }
        catch (error) { current = { ...baseline, reasons: [error instanceof Error ? error.message : "DECODE_FAILED"], warnings: [] }; }
        // A microphone/noise shift confounds comparison; request a new baseline.
        const reasons = [...current.reasons, ...current.warnings];
        if (reasons.length) {
          event.attempts++; event.reason_codes = reasons;
          if (event.attempts >= 3) terminal(meal, event, "skipped");
          else { event.state = "unanalyzable"; event.deadline = now() + 10000; }
          (event.measurements ??= []).push({ id: id(), recorded_at: new Date(now()).toISOString(),
            state: event.state!, change_score: null, reason_codes: [...reasons] });
          return output(meal, event, reasons, current.warnings);
        }
        const raw = distance(current.embedding, baseline.embedding) / Math.max(0.04, baseline.spread);
        // A single large change must not be diluted by earlier unchanged swallows.
        const score = raw;
        const wasRecheck = meal.summary.phase === "RECHECK";
        meal.score = score;
        event.acoustic = { mfcc_l2: distance(current.mfcc, baseline.mfcc), cpp_delta: current.cpp - baseline.cpp };
        if (score >= 3) { event.state = wasRecheck ? "caution" : "recheck"; meal.streak = 0; }
        else if (score >= 1) { meal.streak++; event.state = meal.streak >= 2 ? "recheck" : "no_change"; if (event.state === "recheck") meal.streak = 0; }
        else { event.state = "no_change"; meal.streak = 0; }
        (event.measurements ??= []).push({ id: id(), recorded_at: new Date(now()).toISOString(),
          state: event.state, change_score: score, reason_codes: [], acoustic: { ...event.acoustic } });
        event.reason_codes = [];
        if (event.state === "caution") { meal.summary.phase = "AWAITING_RESOLVE"; event.deadline = null; }
        else if (event.state === "recheck") { meal.summary.phase = "RECHECK"; event.deadline = now() + 10000; }
        else { meal.summary.phase = "TRACKING"; meal.open = null; event.deadline = null; }
        return output(meal, event);
      });
    },
    async skip(eid: string): Promise<Analysis> {
      return transaction((db) => {
        const { meal, event } = locate(db, eid);
        const wasOpen = meal.open === eid;
        expire(meal);
        if (wasOpen && event.state === "no_response") return output(meal, event);
        if (meal.open !== eid || meal.summary.phase === "AWAITING_RESOLVE") throw new Error("WRONG_PHASE");
        terminal(meal, event, "skipped");
        return output(meal, event);
      });
    },
    async resolve(eid: string) {
      return transaction((db) => {
        const { meal } = locate(db, eid);
        if (meal.open !== eid || meal.summary.phase !== "AWAITING_RESOLVE") throw new Error("WRONG_PHASE");
        meal.open = null; meal.summary.phase = "TRACKING";
        return { event_id: eid, phase: "TRACKING" };
      });
    },
    async endSession(sid: string) {
      return transaction((db) => {
        const meal = session(db, sid, true);
        expire(meal);
        const event = meal.events.find((row) => row.id === meal.open);
        if (event && event.deadline != null) terminal(meal, event, "skipped");
        meal.open = null; meal.summary.ended_at = new Date(now()).toISOString(); meal.summary.phase = "ENDED";
        baselines.delete(sid);
        return summary(meal);
      });
    },
    async sessions() { await serial; return (await load()).sessions.map(summary); },
    async report(sid: string): Promise<SessionReport> {
      await serial;
      const meal = session(await load(), sid);
      return { session: summary(meal), baseline_quality_flag: meal.baselineQuality, model_version: FEATURE_VERSION,
        unanalyzable_count: meal.events.filter((row) => row.state === "unanalyzable").length,
        skipped_count: meal.events.filter((row) => row.state === "skipped").length,
        no_response_count: meal.events.filter((row) => row.state === "no_response").length,
        events: meal.events.map((row) => ({ ...row, reason_codes: [...row.reason_codes],
          acoustic: row.acoustic ? { ...row.acoustic } : undefined,
          measurements: row.measurements?.map((item) => ({ ...item, reason_codes: [...item.reason_codes],
            acoustic: item.acoustic ? { ...item.acoustic } : undefined })) })), disclaimer: DISCLAIMER };
    },
    async home() {
      const rows = await api.sessions();
      const today = new Date(now()).toDateString(), daily = rows.filter((row) => new Date(row.started_at).toDateString() === today);
      return { meal_count: daily.length, swallow_count: daily.reduce((sum, row) => sum + row.swallow_count, 0),
        caution_count: daily.reduce((sum, row) => sum + row.caution_count, 0), recent: rows.slice(0, 5) };
    },
    async trend(period: "day" | "week" | "month") {
      const buckets = new Map<string, TrendPoint & { analyzed: number; unchanged: number }>();
      for (const row of (await api.sessions()).reverse()) {
        const label = calendarLabel(new Date(row.started_at), period);
        const point = buckets.get(label) ?? { label, swallow_count: 0, caution_count: 0, no_change_ratio: null, analyzed: 0, unchanged: 0 };
        point.swallow_count += row.swallow_count; point.caution_count += row.caution_count;
        point.analyzed += row.no_change_count + row.caution_count; point.unchanged += row.no_change_count;
        point.no_change_ratio = point.analyzed ? point.unchanged / point.analyzed : null;
        buckets.set(label, point);
      }
      return { period, points: [...buckets.values()].map(({ analyzed: _a, unchanged: _u, ...point }) => point) };
    },
  };
  return api;
}

export function calendarLabel(date: Date, period: "day" | "week" | "month") {
  const year = date.getFullYear(), month = String(date.getMonth() + 1).padStart(2, "0");
  if (period === "month") return `${year}-${month}`;
  if (period === "day") return `${year}-${month}-${String(date.getDate()).padStart(2, "0")}`;
  const day = new Date(Date.UTC(year, date.getMonth(), date.getDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const week = Math.ceil(((day.getTime() - Date.UTC(day.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const deviceApi = createDeviceApi(AsyncStorage);
