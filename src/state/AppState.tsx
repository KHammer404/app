import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState as NativeAppState, Vibration } from "react-native";
import { router, usePathname } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCameraPermissions } from "expo-camera";

import { api, assetUrl, REASON_TEXT, SLOT_MEAL, socketUrl, type SessionReport } from "../api/client";
import {
  CAREGIVER_KEY,
  DEFAULT_CAREGIVER,
  parseCaregiver,
  voiceRequest,
  type CaregiverSettings,
} from "../settings/caregiver";
import { ensureMic, useWavCapture } from "../audio/recordWav";
import { mealForTime, type Meal } from "../utils/mealTime";
import type { AspirationEvent } from "../utils/mealTimeline";

export type { Meal } from "../utils/mealTime";
export type MealRecord = {
  id: string;
  meal: Meal;
  date: string;
  seconds: number;
  alerts: number;
  voices: number;
  durationMs?: number;
  aspirationEvents?: AspirationEvent[];
  swallows?: number;
  unanalyzable?: number;
  skipped?: number;
  noResponse?: number;
  disclaimer?: string;
  spectrogramUrls?: string[];
};
export type Popup =
  | "baseline"
  | "voice"
  | "analyzing"
  | "no_change"
  | "recheck"
  | "caution"
  | "unanalyzable"
  | null;
export const meals: Meal[] = ["아침", "점심", "저녁", "간식"];
export const PROFILE = "@samkim/profile",
  RECORDS = "@samkim/records";
export const FRESH_START = "@samkim/fresh-start-2026-11-02";
export const VOICE_MS = 2000;
export const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, "0")}초`;
export const clock = (date: Date) =>
  `${date.getHours()}시 ${String(date.getMinutes()).padStart(2, "0")}분`;
export function dayLabel(value: string) {
  const date = new Date(value),
    today = new Date(),
    yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const prefix =
    date.toDateString() === today.toDateString()
      ? "오늘, "
      : date.toDateString() === yesterday.toDateString()
        ? "어제, "
        : "";
  return `${prefix}${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function validRecord(value: unknown): value is MealRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as MealRecord;
  return (
    typeof record.id === "string" &&
    meals.includes(record.meal) &&
    Number.isFinite(Date.parse(record.date)) &&
    [record.seconds, record.alerts, record.voices].every((n) => Number.isFinite(n) && n >= 0)
  );
}

function reportToRecord(report: SessionReport): MealRecord {
  const start = new Date(report.session.started_at).getTime();
  const caution = report.events.filter((event) => event.state === "caution");
  const voiced = report.events.filter(
    (event) => event.state && !["skipped", "no_response"].includes(event.state),
  );
  return {
    id: report.session.id,
    meal: SLOT_MEAL[report.session.meal ?? ""] ?? "점심",
    date: report.session.started_at,
    seconds: Math.max(0, Math.round(report.session.duration_seconds)),
    alerts: report.session.caution_count,
    voices: voiced.length,
    durationMs: Math.max(0, report.session.duration_seconds * 1000),
    swallows: report.session.swallow_count,
    unanalyzable: report.unanalyzable_count,
    skipped: report.skipped_count,
    noResponse: report.no_response_count,
    disclaimer: report.disclaimer,
    aspirationEvents: caution.map((event) => ({
      id: event.id,
      offsetMs: Math.max(0, new Date(event.detected_at).getTime() - start),
    })),
    spectrogramUrls: [
      ...new Set(
        report.events
          .flatMap((event) => [event.baseline_spectrogram_url, event.spectrogram_url])
          .map((path) => assetUrl(path))
          .filter((url): url is string => Boolean(url)),
      ),
    ],
  };
}

function useAppController() {
  const path = usePathname();
  const [loaded, setLoaded] = useState(false),
    [name, setName] = useState(""),
    [records, setRecords] = useState<MealRecord[]>([]);
  const [meal, setMeal] = useState<Meal>(() => mealForTime()),
    [checks, setChecks] = useState([false, false, false]);
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [mic, setMic] = useState(false),
    [cameraReady, setCameraReady] = useState(false),
    [active, setActive] = useState(true);
  const [running, setRunning] = useState(false),
    [seconds, setSeconds] = useState(0),
    [alerts, setAlerts] = useState(0),
    [voices, setVoices] = useState(0),
    [swallows, setSwallows] = useState(0);
  const [popup, setPopup] = useState<Popup>(null),
    [baselineStep, setBaselineStep] = useState(1),
    [reasonText, setReasonText] = useState(""),
    [learning, setLearning] = useState(false),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [voiceSeconds, setVoiceSeconds] = useState(0),
    [levels, setLevels] = useState<number[]>([]);
  const [info, setInfo] = useState<{
      title: string;
      body: string;
      action?: "delete" | "name" | "text";
    } | null>(null),
    [largeText, setLargeText] = useState(false),
    [settings, setSettings] = useState<CaregiverSettings>(DEFAULT_CAREGIVER);
  const settingsRef = useRef(settings);
  const autoSeen = useRef(0);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const started = useRef(0),
    recordingRef = useRef(false),
    levelAt = useRef(0),
    voiceBusy = useRef(false),
    ending = useRef(false),
    mounted = useRef(true),
    modeRef = useRef<"baseline" | "voice">("baseline"),
    sessionRef = useRef<string | null>(null),
    eventRef = useRef<string | null>(null),
    clipsRef = useRef<string[]>([]),
    socketRef = useRef<WebSocket | null>(null);
  const previousPath = useRef(path);
  const capture = useWavCapture((level) => {
    if (!recordingRef.current) return;
    const now = Date.now();
    if (now - levelAt.current < 50) return;
    levelAt.current = now;
    setLevels((previous) => {
      const next = previous.length >= 40 ? previous.slice(1) : previous.slice();
      next.push(level);
      return next;
    });
  });
  useEffect(() => {
    if (path === "/prepare" && previousPath.current !== "/camera") setMeal(mealForTime());
    previousPath.current = path;
  }, [path]);
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    voiceWait = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((title: string, body: string) => setInfo({ title, body }), []);
  const clearVoiceTimers = useCallback(() => {
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
    if (voiceWait.current) clearTimeout(voiceWait.current);
  }, []);
  const refreshRecords = useCallback(async () => {
    try {
      const reportIds = await api.sessions();
      const next: MealRecord[] = [];
      for (const item of reportIds) {
        try {
          next.push(reportToRecord(await api.report(item.id)));
        } catch {
          next.push({
            id: item.id,
            meal: SLOT_MEAL[item.meal ?? ""] ?? "점심",
            date: item.started_at,
            seconds: Math.max(0, Math.round(item.duration_seconds)),
            alerts: item.caution_count,
            voices: item.no_change_count,
            swallows: item.swallow_count,
            durationMs: Math.max(0, item.duration_seconds * 1000),
          });
        }
      }
      if (mounted.current) setRecords(next);
    } catch {
      // 오프라인, 기기 캐시 유지
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        if ((await AsyncStorage.getItem(FRESH_START)) !== "done") {
          await Promise.all(
            [PROFILE, RECORDS, "@samkim/largeText", CAREGIVER_KEY].map((key) => AsyncStorage.removeItem(key)),
          );
          await AsyncStorage.setItem(FRESH_START, "done");
        }
        const [profile, history, textSize, caregiver] = await Promise.all([
          AsyncStorage.getItem(PROFILE),
          AsyncStorage.getItem(RECORDS),
          AsyncStorage.getItem("@samkim/largeText"),
          AsyncStorage.getItem(CAREGIVER_KEY),
        ]);
        if (profile) setName(profile);
        if (history) {
          const data: unknown = JSON.parse(history);
          if (Array.isArray(data)) setRecords(data.filter(validRecord));
        }
        setLargeText(textSize === "true");
        setSettings(parseCaregiver(caregiver));
        await refreshRecords();
      } catch {
        notify(
          "저장 정보를 확인해 주세요",
          "저장된 정보를 일부 불러오지 못했어요. 새 식사는 기록할 수 있어요.",
        );
      } finally {
        setLoaded(true);
      }
    })();
    return () => {
      mounted.current = false;
      clearVoiceTimers();
      socketRef.current?.close();
    };
  }, [notify, clearVoiceTimers, refreshRecords]);
  useEffect(() => {
    if (!loaded) return;
    if (!name && path !== "/") router.replace("/");
    else if (name && path === "/") router.replace("/home");
    else if (running && path !== "/monitor") router.replace("/monitor");
    else if (!running && path === "/monitor") router.replace("/prepare");
  }, [loaded, name, path, running]);
  const applied = useRef("");
  const applyAnalysis = useCallback((result: { state: string; reason_codes?: string[]; profile_learning?: boolean }) => {
    const token = `${eventRef.current}:${result.state}:${(result.reason_codes ?? []).join(",")}`;
    if (applied.current === token) return;
    applied.current = token;
    const reason = (result.reason_codes ?? []).map((code) => REASON_TEXT[code] ?? code).join(" ");
    setReasonText(reason);
    if (result.profile_learning) setLearning(true);
    if (result.state === "no_change") {
      setVoices((value) => value + 1);
      setPopup("no_change");
    } else if (result.state === "recheck") {
      modeRef.current = "voice";
      setPopup("recheck");
    } else if (result.state === "caution") {
      setAlerts((value) => value + 1);
      setVoices((value) => value + 1);
      setPopup("caution");
      if (settingsRef.current.haptic && typeof Vibration.vibrate === "function")
        Vibration.vibrate([0, 280, 120, 280]);
    } else if (result.state === "unanalyzable") {
      modeRef.current = "voice";
      setPopup("unanalyzable");
    } else {
      setPopup(null);
    }
  }, []);
  const openSocket = useCallback(
    (sessionId: string) => {
      socketRef.current?.close();
      try {
        const socket = new WebSocket(socketUrl(sessionId));
        socketRef.current = socket;
        socket.onmessage = (message) => {
          const payload = JSON.parse(String(message.data)) as {
            type: string;
            event_id?: string;
            state?: string;
            reason_codes?: string[];
            open_event_id?: string | null;
            phase?: string;
          };
          if (payload.type === "PROMPT_VOICE" && payload.event_id) {
            eventRef.current = payload.event_id;
            modeRef.current = "voice";
            setPopup("voice");
          } else if (payload.type === "RESULT" && payload.state) {
            applyAnalysis({ state: payload.state, reason_codes: payload.reason_codes });
          } else if (payload.type === "ALERT") {
            setPopup("caution");
          } else if (payload.type === "RESYNC" && payload.open_event_id) {
            eventRef.current = payload.open_event_id;
            if (payload.phase === "AWAITING_VOICE" || payload.phase === "RECHECK") {
              modeRef.current = "voice";
              setPopup("voice");
            }
            if (payload.phase === "AWAITING_RESOLVE") setPopup("caution");
          }
        };
      } catch {
        socketRef.current = null;
      }
    },
    [applyAnalysis],
  );
  const stopVoice = useCallback(
    async (success: boolean) => {
      if (!recordingRef.current) return;
      recordingRef.current = false;
      clearVoiceTimers();
      let uri = "";
      try {
        const captured = await capture.end();
        uri = captured.uri;
      } catch {
        if (mounted.current) {
          setRecording(false);
          notify("녹음을 완료하지 못했어요", "마이크 연결을 확인하고 다시 녹음해 주세요.");
        }
        return;
      }
      if (!mounted.current) return;
      setRecording(false);
      setVoiceSeconds(2);
      if (!success || !sessionRef.current) return;
      if (modeRef.current === "baseline") {
        clipsRef.current.push(uri);
        if (clipsRef.current.length < 3) {
          setBaselineStep(clipsRef.current.length + 1);
          setVoiceSeconds(0);
          return;
        }
        const clips = clipsRef.current.splice(0);
        const sessionId = sessionRef.current;
        setBaselineStep(1);
        setVoiceSeconds(0);
        setPopup(null);
        try {
          const baseline = await api.baseline(sessionId, clips);
          if (!mounted.current) return;
          setLearning(Boolean(baseline.profile_learning));
          if (!baseline.stable) {
            modeRef.current = "baseline";
            setPopup("baseline");
            notify(
              "기준 음성을 다시 녹음해 주세요",
              baseline.reason_codes.map((code) => REASON_TEXT[code] ?? code).join(" ") ||
                "세 번의 아~가 고르지 않아요.",
            );
          }
        } catch {
          modeRef.current = "baseline";
          setPopup("baseline");
          notify("기준 음성을 보내지 못했어요", "서버 연결을 확인하고 다시 녹음해 주세요.");
        }
        return;
      }
      const eventId = eventRef.current;
      if (!eventId) return;
      setPopup("analyzing");
      try {
        const result = await api.voice(eventId, uri);
        if (mounted.current) applyAnalysis(result);
      } catch {
        if (mounted.current) {
          setPopup("voice");
          notify("발성을 분석하지 못했어요", "서버 연결을 확인하고 다시 녹음해 주세요.");
        }
      }
    },
    [applyAnalysis, capture, clearVoiceTimers, notify],
  );
  useEffect(() => {
    const sub = NativeAppState.addEventListener("change", (state) => {
      setActive(state === "active");
      if (state !== "active" && recordingRef.current) void stopVoice(false);
    });
    return () => sub.remove();
  }, [stopVoice]);
  useEffect(() => {
    if (!running || !active) return;
    const tick = setInterval(
      () => setSeconds(Math.floor((Date.now() - started.current) / 1000)),
      200,
    );
    return () => clearInterval(tick);
  }, [running, active]);
  useEffect(() => {
    if (!recording) return;
    const tick = setInterval(() => setVoiceSeconds((value) => Math.min(2, value + 1)), 1000);
    return () => clearInterval(tick);
  }, [recording]);
  async function saveName(value: string, research = false) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await AsyncStorage.setItem(PROFILE, trimmed);
      setName(trimmed);
      setInfo(null);
      try {
        await api.consent("voice_analysis", true);
        if (research) await api.consent("research_optional", true);
      } catch {
        notify(
          "동의 저장은 서버에 닿지 않았어요",
          "이름은 이 기기에 저장됐어요. 식사 시작 전에 서버 연결을 확인해 주세요.",
        );
      }
      router.replace("/home");
    } catch {
      notify("이름을 저장하지 못했어요", "저장 공간을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  async function permissions() {
    setBusy(true);
    try {
      const camera = await requestCamera();
      const granted = await ensureMic();
      setMic(granted);
      if (!camera.granted || !granted)
        notify(
          "장치 권한이 필요해요",
          "카메라와 마이크를 허용해 주세요. 이미 거절했다면 브라우저 주소창 또는 기기 설정에서 권한을 변경할 수 있어요.",
        );
    } catch {
      notify(
        "장치 연결을 확인해 주세요",
        "다른 앱이 장치를 사용 중인지 확인해 주세요. 노트북에서는 localhost 또는 HTTPS로 접속해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function begin() {
    if (!cameraPermission?.granted || !mic || !cameraReady || !checks.every(Boolean) || voiceBusy.current)
      return;
    autoSeen.current = 0;
    voiceBusy.current = true;
    setBusy(true);
    try {
      const session = await api.startSession(meal);
      sessionRef.current = session.id;
      eventRef.current = null;
      clipsRef.current = [];
      started.current = Date.now();
      ending.current = false;
      setSeconds(0);
      setAlerts(0);
      setVoices(0);
      setSwallows(0);
      setBaselineStep(1);
      setReasonText("");
      modeRef.current = "baseline";
      setPopup("baseline");
      setRunning(true);
      openSocket(session.id);
      router.replace("/monitor");
    } catch {
      notify("식사를 시작하지 못했어요", "서버 주소와 연결을 확인해 주세요.");
    } finally {
      voiceBusy.current = false;
      setBusy(false);
    }
  }
  async function startVoice() {
    if (voiceBusy.current || recordingRef.current) return;
    if (popup !== "baseline" && popup !== "voice" && popup !== "recheck" && popup !== "unanalyzable")
      return;
    voiceBusy.current = true;
    setBusy(true);
    clearVoiceTimers();
    try {
      await capture.begin();
      recordingRef.current = true;
      setRecording(true);
      setVoiceSeconds(0);
      setLevels([]);
      levelAt.current = 0;
      if (popup !== "baseline") modeRef.current = "voice";
      voiceTimer.current = setTimeout(() => void stopVoice(true), VOICE_MS);
    } catch {
      notify("녹음을 시작할 수 없어요", "마이크 권한과 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      voiceBusy.current = false;
      setBusy(false);
    }
  }
  const voicePrompted = useRef<string | null>(null);
  useEffect(() => {
    if (popup !== "voice") {
      voicePrompted.current = null;
      return;
    }
    const eventId = eventRef.current ?? "voice";
    if (voicePrompted.current === eventId || recordingRef.current || voiceBusy.current) return;
    voicePrompted.current = eventId;
    void startVoice();
  }, [popup]);
  async function redoVoice() {
    if (popup !== "voice" && popup !== "recheck" && popup !== "unanalyzable") return;
    if (recordingRef.current) await stopVoice(false);
    setVoiceSeconds(0);
    setLevels([]);
    await startVoice();
  }
  async function markSwallow(trigger: "auto" | "manual" | "periodic" = "manual", confidence?: number) {
    if (!sessionRef.current || popup === "baseline" || popup === "analyzing" || popup === "caution") return;
    if (recordingRef.current) return;
    const choice = voiceRequest(settingsRef.current, trigger, confidence, autoSeen.current);
    try {
      const event = await api.swallow(sessionRef.current, trigger, confidence, choice.request);
      if (!event.merged) autoSeen.current = choice.autoCount;
      setSwallows((value) => value + (event.merged ? 0 : 1));
      if (!event.prompt) return;
      eventRef.current = event.id;
      modeRef.current = "voice";
      setReasonText("");
      setPopup("voice");
      clearVoiceTimers();
      voiceWait.current = setTimeout(() => {
        if (!mounted.current || recordingRef.current) return;
        setPopup((current) => (current === "voice" ? null : current));
      }, 10000);
    } catch (error) {
      notify("삼킴을 기록하지 못했어요", error instanceof Error ? error.message : "다시 시도해 주세요.");
    }
  }
  async function skipVoice() {
    if (recordingRef.current) await stopVoice(false);
    const eventId = eventRef.current;
    if (!eventId || recordingRef.current) {
      setPopup(null);
      return;
    }
    clearVoiceTimers();
    try {
      const result = await api.skip(eventId);
      applyAnalysis(result);
    } catch {
      setPopup(null);
    }
  }
  async function resolveCaution() {
    const eventId = eventRef.current;
    if (!eventId) {
      setPopup(null);
      return;
    }
    try {
      await api.resolve(eventId);
      setPopup(null);
    } catch {
      notify("처치 완료를 저장하지 못했어요", "서버 연결을 확인하고 다시 눌러 주세요.");
    }
  }
  async function finish() {
    if (ending.current || voiceBusy.current || recordingRef.current) return;
    ending.current = true;
    setBusy(true);
    clearVoiceTimers();
    setRunning(false);
    setPopup(null);
    socketRef.current?.close();
    const sessionId = sessionRef.current;
    const fallback: MealRecord = {
      id: sessionId ?? String(Date.now()),
      meal,
      date: new Date(started.current || Date.now()).toISOString(),
      seconds: Math.floor((Date.now() - (started.current || Date.now())) / 1000),
      alerts,
      voices,
      swallows,
      durationMs: Date.now() - (started.current || Date.now()),
    };
    let item = fallback;
    try {
      if (sessionId) {
        await api.endSession(sessionId);
        item = reportToRecord(await api.report(sessionId));
      }
    } catch {
      notify("식사 기록을 서버에서 닫지 못했어요", "이번 화면의 기록은 이 기기에 남겨 둘게요.");
    }
    const next = [item, ...records.filter((record) => record.id !== item.id)];
    setRecords(next);
    router.replace({ pathname: "/report", params: { id: item.id } });
    try {
      await AsyncStorage.setItem(RECORDS, JSON.stringify(next));
    } catch {
      notify("기록 저장 실패", "현재 화면에서는 확인할 수 있지만 앱을 닫으면 이번 기록이 사라질 수 있어요.");
    } finally {
      sessionRef.current = null;
      setBusy(false);
      ending.current = false;
    }
  }
  async function deleteRecords() {
    try {
      await api.deleteData();
    } catch {
      notify("서버 기록을 지우지 못했어요", "이 기기의 목록만 지웠어요. 연결 후 다시 시도해 주세요.");
    }
    try {
      await AsyncStorage.removeItem(RECORDS);
      setRecords([]);
      setInfo(null);
    } catch {
      notify("삭제 실패", "저장 공간 접근 권한을 확인해 주세요.");
    }
  }
  async function saveSettings(next: CaregiverSettings) {
    setSettings(next);
    try {
      await AsyncStorage.setItem(CAREGIVER_KEY, JSON.stringify(next));
    } catch {
      notify("설정 저장 실패", "잠시 후 다시 시도해 주세요.");
    }
  }
  async function changeTextSize(value: boolean) {
    try {
      await AsyncStorage.setItem("@samkim/largeText", String(value));
      setLargeText(value);
      setInfo(null);
    } catch {
      notify("설정 저장 실패", "잠시 후 다시 시도해 주세요.");
    }
  }
  return {
    loaded,
    name,
    records,
    meal,
    setMeal,
    checks,
    setChecks,
    cameraPermission,
    mic,
    cameraReady,
    setCameraReady,
    active,
    running,
    seconds,
    alerts,
    voices,
    swallows,
    popup,
    setPopup,
    baselineStep,
    reasonText,
    learning,
    busy,
    recording,
    voiceSeconds,
    levels,
    info,
    setInfo,
    largeText,
    settings,
    notify,
    saveName,
    permissions,
    begin,
    startVoice,
    redoVoice,
    markSwallow,
    skipVoice,
    resolveCaution,
    finish,
    deleteRecords,
    saveSettings,
    changeTextSize,
  };
}

type AppController = ReturnType<typeof useAppController>;
const Context = createContext<AppController | null>(null);
export function AppProvider({ children }: React.PropsWithChildren) {
  const value = useAppController();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("AppProvider is required");
  return value;
}
