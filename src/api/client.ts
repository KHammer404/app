import Constants from "expo-constants";
import { deviceApi } from "../analysis/local";

import type { Meal } from "../utils/mealTime";

const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN ?? "dev-token";

function apiBase() {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  if (configured) return configured;
  // Expo Go에서는 Metro와 같은 기기의 8000번으로 붙는다
  const config = Constants.expoConfig as { hostUri?: string } | null;
  const go = Constants.expoGoConfig as { debuggerHost?: string } | null;
  const host = (config?.hostUri ?? go?.debuggerHost)?.split(":")[0];
  return host ? `http://${host}:8000` : "http://127.0.0.1:8000";
}

export const MEAL_SLOT: Record<Meal, string> = {
  아침: "breakfast",
  점심: "lunch",
  저녁: "dinner",
  간식: "snack",
};

export const SLOT_MEAL: Record<string, Meal> = {
  breakfast: "아침",
  lunch: "점심",
  dinner: "저녁",
  snack: "간식",
};

export type Analysis = {
  result_id?: string | null;
  event_id: string;
  state: string;
  phase: string;
  reason_codes: string[];
  warnings: string[];
  message_key: string;
  profile_learning?: boolean;
  spectrogram_url?: string | null;
  change_score?: number | null;
};

export type BaselineResult = {
  stable: boolean;
  passed_count: number;
  reason_codes: string[];
  warnings: string[];
  profile_learning?: boolean;
  quality_flag: string;
};

export type SwallowEvent = {
  id: string;
  prompt: boolean;
  merged: boolean;
  phase: string;
};

export type MealListItem = {
  id: string;
  meal: string | null;
  phase: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  swallow_count: number;
  caution_count: number;
  no_change_count: number;
};

export type AcousticChange = { mfcc_l2: number; cpp_delta: number };
export type VoiceMeasurement = {
  id: string;
  recorded_at: string;
  state: string;
  change_score: number | null;
  reason_codes: string[];
  acoustic?: AcousticChange;
};
export type ReportEvent = {
  id: string;
  detected_at: string;
  trigger: string;
  state: string | null;
  duration_seconds: number | null;
  reason_codes: string[];
  spectrogram_url: string | null;
  baseline_spectrogram_url: string | null;
  acoustic?: AcousticChange;
  measurements?: VoiceMeasurement[];
};

export type SessionReport = {
  session: MealListItem;
  baseline_quality_flag: string | null;
  model_version: string | null;
  unanalyzable_count: number;
  skipped_count: number;
  no_response_count: number;
  events: ReportEvent[];
  disclaimer: string;
};

export type TrendPoint = {
  label: string;
  swallow_count: number;
  no_change_ratio: number | null;
  caution_count: number;
};

type FilePayload = { uri: string; name: string; type: string };

export type WavClip = { uri: string; bytes?: Uint8Array | null };

function file(uri: string, name: string): FilePayload {
  const normalized =
    uri.startsWith("file:") || uri.startsWith("content:") || uri.startsWith("ph:") ? uri : `file://${uri}`;
  return { uri: normalized, name, type: "audio/wav" };
}

function ascii(value: string) {
  const out = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) out[index] = value.charCodeAt(index) & 0xff;
  return out;
}

function multipartWav(parts: { name: string; filename: string; data: Uint8Array }[]) {
  const boundary = `----swallow${Date.now().toString(16)}`;
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    chunks.push(
      ascii(
        `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: audio/wav\r\n\r\n`,
      ),
    );
    chunks.push(part.data);
    chunks.push(ascii("\r\n"));
  }
  chunks.push(ascii(`--${boundary}--\r\n`));
  const body = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function postWav<T>(path: string, parts: { name: string; filename: string; clip: WavClip }[]) {
  const binary = parts.every((part) => (part.clip.bytes?.byteLength ?? 0) > 44);
  if (binary) {
    const packed = multipartWav(
      parts.map((part) => ({ name: part.name, filename: part.filename, data: part.clip.bytes as Uint8Array })),
    );
    try {
      return await request<T>(path, {
        method: "POST",
        headers: { "Content-Type": packed.contentType },
        body: packed.body,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message !== "Network request failed" && message !== "REQUEST_FAILED") throw error;
    }
  }
  const body = new FormData();
  for (const part of parts) body.append(part.name, file(part.clip.uri, part.filename) as unknown as Blob);
  return request<T>(path, { method: "POST", body });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${API_TOKEN}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${apiBase()}${path}`, { ...init, headers });
  if (!response.ok) {
    let code = "REQUEST_FAILED";
    try {
      const body = await response.json();
      code = body?.error?.code ?? code;
    } catch {
      // 본문 없는 오류
    }
    throw new Error(code);
  }
  if (response.status === 204) return undefined as T;
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("json")) return undefined as T;
  return response.json() as Promise<T>;
}

export function assetUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${apiBase()}${path}`;
}

export function socketUrl(sessionId: string) {
  const base = apiBase().replace(/^http/, "ws");
  return `${base}/ws/sessions/${sessionId}?token=${encodeURIComponent(API_TOKEN)}`;
}

const serverApi = {
  consent(item: "voice_analysis" | "research_optional", granted: boolean) {
    return request("/me/consents", {
      method: "POST",
      body: JSON.stringify({ item, granted, guardian: false }),
    });
  },
  deleteData() {
    return request("/me/data", { method: "DELETE" });
  },
  startSession(meal: Meal) {
    return request<{ id: string; phase: string; meal: string | null; started_at: string }>(
      "/sessions",
      { method: "POST", body: JSON.stringify({ meal: MEAL_SLOT[meal] }) },
    );
  },
  endSession(id: string) {
    return request(`/sessions/${id}/end`, { method: "POST" });
  },
  baseline(id: string, clips: WavClip[]) {
    return postWav<BaselineResult>(
      `/sessions/${id}/baseline`,
      clips.map((clip, index) => ({ name: `clip_${index + 1}`, filename: `clip_${index + 1}.wav`, clip })),
    );
  },
  swallow(id: string, trigger: "auto" | "manual" | "periodic", confidence?: number, requestVoice = true) {
    return request<SwallowEvent>(`/sessions/${id}/swallow-events`, {
      method: "POST",
      body: JSON.stringify({
        trigger,
        detected_at: new Date().toISOString(),
        camera_confidence: confidence ?? null,
        request_voice: requestVoice,
      }),
    });
  },
  voice(eventId: string, clip: WavClip) {
    return postWav<Analysis>(`/events/${eventId}/voice-clip`, [{ name: "clip", filename: "clip.wav", clip }]);
  },
  skip(eventId: string) {
    return request<Analysis>(`/events/${eventId}/skip`, { method: "POST" });
  },
  resolve(eventId: string) {
    return request(`/events/${eventId}/resolve`, { method: "POST" });
  },
  home() {
    return request<{
      meal_count: number;
      swallow_count: number;
      caution_count: number;
      recent: MealListItem[];
    }>("/home/summary");
  },
  sessions() {
    return request<MealListItem[]>("/sessions");
  },
  report(id: string) {
    return request<SessionReport>(`/sessions/${id}/report`);
  },
  trend(period: "day" | "week" | "month") {
    return request<{ period: string; points: TrendPoint[] }>(`/reports/trend?period=${period}`);
  },
};

// Server mode is an explicit research/development opt-in; never fall back to
// uploading a voice clip when a device-side analysis fails.
export function isDeviceAnalysis() {
  return process.env.EXPO_PUBLIC_ANALYSIS_MODE !== "server";
}
export const api = new Proxy(serverApi, {
  get(target, key) {
    return Reflect.get(isDeviceAnalysis() ? deviceApi : target, key);
  },
});

export const REASON_TEXT: Record<string, string> = {
  VOICED_TOO_SHORT: "소리가 너무 짧아요. 조금 더 길게 아~ 해주세요.",
  TOO_QUIET: "조금 더 크게 아~ 해주세요.",
  CLIPPING: "소리가 너무 커요. 마이크에서 조금만 떨어져 주세요.",
  LOW_SNR: "주변이 시끄러워요. 조용한 곳에서 다시 해주세요.",
  NOT_SUSTAINED_VOWEL: "지속적인 아~ 발성을 충분히 확인하지 못했어요. 같은 자세로 다시 녹음해 주세요.",
  DECODE_FAILED: "녹음 파일을 읽지 못했어요. 다시 해주세요.",
  BASELINE_TOO_FEW: "기준 음성이 부족해요. 세 번 다시 녹음해 주세요.",
  BASELINE_UNSTABLE: "세 번의 목소리가 서로 달라요. 같은 크기로 다시 해주세요.",
  LEVEL_SHIFT: "목소리 크기가 기준과 달라요. 자리를 유지한 채 기준을 다시 녹음해 주세요.",
  NOISE_FLOOR_SHIFT: "주변 소음이 기준과 달라요. 조용한 곳에서 기준을 다시 녹음해 주세요.",
};

/** Low input level can cause all three quality checks to fail at once. */
export function recordingReasonText(codes: string[]) {
  if (codes.includes("TOO_QUIET")) return "마이크에 들어온 소리가 작아요. 마이크를 가리지 않았는지 확인하고, 조금 더 가까이에서 편안하게 아~ 해주세요.";
  const specific = [...new Set(codes)].filter((code) => code !== "BASELINE_TOO_FEW");
  return (specific.length ? specific : codes).map((code) => REASON_TEXT[code] ?? code).join(" ");
}
