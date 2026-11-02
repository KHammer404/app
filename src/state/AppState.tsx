import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState as NativeAppState } from "react-native";
import { router, usePathname } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCameraPermissions } from "expo-camera";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";

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
};
export type Popup = "alert" | "voice" | "processing" | "done" | null;
export const meals: Meal[] = ["아침", "점심", "저녁", "간식"];
export const PROFILE = "@samkim/profile",
  RECORDS = "@samkim/records";
// One-time reset requested for the existing prototype data. Future signups persist.
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
  const r = value as MealRecord;
  return (
    typeof r.id === "string" &&
    meals.includes(r.meal) &&
    Number.isFinite(Date.parse(r.date)) &&
    [r.seconds, r.alerts, r.voices].every((n) => Number.isFinite(n) && n >= 0)
  );
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
    [voices, setVoices] = useState(0);
  const [popup, setPopup] = useState<Popup>(null),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [voiceSeconds, setVoiceSeconds] = useState(0);
  const [info, setInfo] = useState<{
      title: string;
      body: string;
      action?: "delete" | "name" | "text";
    } | null>(null),
    [largeText, setLargeText] = useState(false);
  const started = useRef(0),
    recordingRef = useRef(false),
    voiceBusy = useRef(false),
    ending = useRef(false),
    mounted = useRef(true);
  const aspirationEvents = useRef<AspirationEvent[]>([]);
  const previousPath = useRef(path);
  useEffect(() => {
    // Refresh the suggestion for a new preparation flow, but keep a manual
    // selection when returning from the camera self-check screen.
    if (path === "/prepare" && previousPath.current !== "/camera") {
      setMeal(mealForTime());
    }
    previousPath.current = path;
  }, [path]);
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    processingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const notify = useCallback(
    (title: string, body: string) => setInfo({ title, body }),
    [],
  );
  const clearVoiceTimers = useCallback(() => {
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
    if (processingTimer.current) clearTimeout(processingTimer.current);
  }, []);
  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        if ((await AsyncStorage.getItem(FRESH_START)) !== "done") {
          await Promise.all(
            [PROFILE, RECORDS, "@samkim/largeText"].map((key) =>
              AsyncStorage.removeItem(key),
            ),
          );
          await AsyncStorage.setItem(FRESH_START, "done");
        }
        const [profile, history, textSize] = await Promise.all([
          AsyncStorage.getItem(PROFILE),
          AsyncStorage.getItem(RECORDS),
          AsyncStorage.getItem("@samkim/largeText"),
        ]);
        if (profile) setName(profile);
        if (history) {
          const data: unknown = JSON.parse(history);
          if (Array.isArray(data)) setRecords(data.filter(validRecord));
        }
        setLargeText(textSize === "true");
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
    };
  }, [notify, clearVoiceTimers]);
  useEffect(() => {
    if (!loaded) return;
    if (!name && path !== "/") router.replace("/");
    else if (name && path === "/") router.replace("/home");
    else if (running && path !== "/monitor") router.replace("/monitor");
    else if (!running && path === "/monitor") router.replace("/prepare");
  }, [loaded, name, path, running]);
  const stopVoice = useCallback(
    async (success: boolean) => {
      if (!recordingRef.current) return;
      recordingRef.current = false;
      try {
        await recorder.stop();
        if (!mounted.current) return;
        setRecording(false);
        if (success) {
          setVoiceSeconds(2);
          setVoices((v) => v + 1);
          setPopup("processing");
          processingTimer.current = setTimeout(() => {
            if (mounted.current) setPopup("done");
          }, 800);
        } else setPopup("voice");
      } catch {
        if (mounted.current) {
          setRecording(false);
          setPopup("voice");
          notify(
            "녹음을 완료하지 못했어요",
            "마이크 연결을 확인하고 다시 녹음해 주세요.",
          );
        }
      }
    },
    [recorder, notify],
  );
  useEffect(() => {
    const sub = NativeAppState.addEventListener("change", (state) => {
      setActive(state === "active");
      if (state !== "active") {
        clearVoiceTimers();
        setPopup((p) => (p === "processing" ? "done" : p));
        if (recordingRef.current) void stopVoice(false);
      }
    });
    return () => sub.remove();
  }, [clearVoiceTimers, stopVoice]);
  useEffect(() => {
    if (!running || !active) return;
    const tick = setInterval(
      () => setSeconds(Math.floor((Date.now() - started.current) / 1000)),
      200,
    );
    return () => clearInterval(tick);
  }, [running, active]);
  useEffect(() => {
    if (!running || !active || alerts > 0) return;
    const alarm = setTimeout(
      () => {
        const firedAt = Date.now();
        aspirationEvents.current = [
          { id: `aspiration-${firedAt}`, offsetMs: firedAt - started.current },
        ];
        setAlerts(1);
        setPopup("alert");
      },
      Math.max(0, 5000 - (Date.now() - started.current)),
    );
    return () => clearTimeout(alarm);
  }, [running, active, alerts]);
  useEffect(() => {
    if (!recording) return;
    const tick = setInterval(
      () => setVoiceSeconds((v) => Math.min(2, v + 1)),
      1000,
    );
    return () => clearInterval(tick);
  }, [recording]);
  async function saveName(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await AsyncStorage.setItem(PROFILE, trimmed);
      setName(trimmed);
      setInfo(null);
      router.replace("/home");
    } catch {
      notify(
        "이름을 저장하지 못했어요",
        "저장 공간을 확인하고 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function permissions() {
    setBusy(true);
    try {
      const camera = await requestCamera();
      const audio = await AudioModule.requestRecordingPermissionsAsync();
      setMic(audio.granted);
      if (!camera.granted || !audio.granted)
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
  function begin() {
    if (
      !cameraPermission?.granted ||
      !mic ||
      !cameraReady ||
      !checks.every(Boolean)
    )
      return;
    started.current = Date.now();
    ending.current = false;
    aspirationEvents.current = [];
    setSeconds(0);
    setAlerts(0);
    setVoices(0);
    setVoiceSeconds(0);
    setPopup(null);
    setRunning(true);
    router.replace("/monitor");
  }
  async function startVoice() {
    if (voiceBusy.current || recordingRef.current) return;
    voiceBusy.current = true;
    setBusy(true);
    clearVoiceTimers();
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      setRecording(true);
      setVoiceSeconds(0);
      voiceTimer.current = setTimeout(() => void stopVoice(true), VOICE_MS);
    } catch {
      notify(
        "녹음을 시작할 수 없어요",
        "마이크 권한과 연결을 확인하고 다시 시도해 주세요.",
      );
    } finally {
      voiceBusy.current = false;
      setBusy(false);
    }
  }
  async function finish() {
    if (ending.current || voiceBusy.current || recordingRef.current) return;
    ending.current = true;
    setBusy(true);
    clearVoiceTimers();
    setRunning(false);
    setPopup(null);
    const endedAt = Date.now();
    const durationMs = endedAt - started.current;
    const item: MealRecord = {
      id: String(endedAt),
      meal,
      date: new Date(started.current).toISOString(),
      seconds: Math.floor(durationMs / 1000),
      alerts,
      voices,
      durationMs,
      aspirationEvents: [...aspirationEvents.current],
    };
    const next = [item, ...records];
    setRecords(next);
    router.replace({ pathname: "/report", params: { id: item.id } });
    try {
      await AsyncStorage.setItem(RECORDS, JSON.stringify(next));
    } catch {
      notify(
        "기록 저장 실패",
        "현재 화면에서는 확인할 수 있지만 앱을 닫으면 이번 기록이 사라질 수 있어요.",
      );
    } finally {
      setBusy(false);
      ending.current = false;
    }
  }
  async function deleteRecords() {
    try {
      await AsyncStorage.removeItem(RECORDS);
      setRecords([]);
      setInfo(null);
    } catch {
      notify("삭제 실패", "저장 공간 접근 권한을 확인해 주세요.");
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
    popup,
    setPopup,
    busy,
    recording,
    voiceSeconds,
    info,
    setInfo,
    largeText,
    notify,
    saveName,
    permissions,
    begin,
    startVoice,
    finish,
    deleteRecords,
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
