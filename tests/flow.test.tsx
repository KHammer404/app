import React, { useEffect, useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Screens from "../src/screens/Screens";

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  cameraGranted: true,
  microphoneGranted: true,
  route: "/",
  listeners: new Set<() => void>(),
  recorder: {
    prepareToRecordAsync: vi.fn(async () => {}),
    record: vi.fn(),
    stop: vi.fn(async () => {}),
  },
}));
vi.mock("expo-router", () => {
  const subscribe = (fn: () => void) => {
    mocks.listeners.add(fn);
    return () => mocks.listeners.delete(fn);
  };
  const useRoute = () => useSyncExternalStore(subscribe, () => mocks.route);
  return {
    router: {
      replace: (
        value: string | { pathname: string; params: Record<string, string> },
      ) => {
        mocks.route =
          typeof value === "string"
            ? value
            : `${value.pathname}?${new URLSearchParams(value.params)}`;
        mocks.listeners.forEach((fn) => fn());
      },
    },
    usePathname: () => useRoute().split("?")[0],
    useLocalSearchParams: () =>
      Object.fromEntries(new URLSearchParams(useRoute().split("?")[1])),
    Slot: () => {
      const path = useRoute().split("?")[0];
      const Component = (
        {
          "/": Screens.WelcomeScreen,
          "/home": Screens.HomeScreen,
          "/prepare": Screens.PrepareScreen,
          "/camera": Screens.CameraScreen,
          "/monitor": Screens.MonitorScreen,
          "/reports": Screens.ReportsScreen,
          "/report": Screens.ReportScreen,
          "/more": Screens.MoreScreen,
        } as Record<string, React.ComponentType>
      )[path];
      return <Component />;
    },
  };
});
vi.mock("expo-camera", () => ({
  useCameraPermissions: () => [
    { granted: mocks.cameraGranted },
    async () => ({ granted: mocks.cameraGranted }),
  ],
  CameraView: ({ onCameraReady }: { onCameraReady: () => void }) => {
    useEffect(() => onCameraReady(), []);
    return <div data-testid="camera" />;
  },
}));
vi.mock("expo-audio", () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  useAudioRecorder: () => mocks.recorder,
  AudioModule: {
    requestRecordingPermissionsAsync: async () => ({
      granted: mocks.microphoneGranted,
    }),
  },
  setAudioModeAsync: async () => {},
}));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("expo-blur", () => ({
  BlurView: () => null,
  BlurTargetView: () => null,
}));
vi.mock("@expo/vector-icons/Feather", () => ({ default: () => null }));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  SafeAreaView: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => mocks.storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mocks.storage.set(key, value);
    },
    removeItem: async (key: string) => {
      mocks.storage.delete(key);
    },
  },
}));
import App from "../App";
async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}
async function check(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("checkbox", { name }));
  });
}
async function tab(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("tab", { name }));
  });
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function mount() {
  await act(async () => {
    render(<App />);
  });
}
async function start() {
  await click("식사 모니터링 시작하기");
  await click("카메라/마이크 권한 설정하러 가기");
  await click("다음");
  await check("얼굴이 전부 잘 보여요");
  await check("목 부위가 전부 잘 보여요");
  await check("조명이 적절해요");
  await click("식사 모니터링 시작하기");
}
async function finish() {
  await click("식사 모니터링 종료하기");
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 2, 12, 0, 0));
  mocks.route = "/";
  mocks.storage.clear();
  mocks.storage.set("@samkim/fresh-start-2026-11-02", "done");
  mocks.storage.set("@samkim/profile", "테스트");
  mocks.cameraGranted = true;
  mocks.microphoneGranted = true;
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("새 디자인의 모니터링·보고서 흐름 (장치 입력 모의)", () => {
  it("여러 알림을 실제 시간 비율에 배치하고 선택한 알림의 시각을 보여준다", async () => {
    mocks.storage.set(
      "@samkim/records",
      JSON.stringify([
        {
          id: "timeline",
          meal: "저녁",
          date: new Date(2026, 10, 2, 19, 13, 0).toISOString(),
          seconds: 2400,
          durationMs: 2400000,
          alerts: 2,
          voices: 2,
          aspirationEvents: [
            { id: "second", offsetMs: 1920000 },
            { id: "first", offsetMs: 840000 },
          ],
        },
      ]),
    );
    mocks.route = "/report?id=timeline";
    await mount();
    expect(screen.getByText("흡인 신호 분석 결과")).toBeTruthy();
    expect(screen.getByText("식사 시작 후 14:00")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "흡인 알림 1, 19:27:00" }).style.left,
    ).toBe("35%");
    expect(
      screen.getByRole("button", { name: "흡인 알림 2, 19:45:00" }).style.left,
    ).toBe("80%");
    await click("2번 알림 상세");
    expect(screen.getByText("식사 시작 후 32:00")).toBeTruthy();
    expect(screen.getByText("19:45:00")).toBeTruthy();
    await click("흡인 알림 1, 19:27:00");
    expect(screen.getByText("식사 시작 후 14:00")).toBeTruthy();
  });
  it("기존 기록에는 알림 시각을 임의로 채워 넣지 않는다", async () => {
    mocks.storage.set(
      "@samkim/records",
      JSON.stringify([
        {
          id: "legacy",
          meal: "점심",
          date: new Date().toISOString(),
          seconds: 9,
          alerts: 1,
          voices: 0,
        },
      ]),
    );
    mocks.route = "/report?id=legacy";
    await mount();
    expect(screen.getByText("알림 시각 미기록")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /흡인 알림 1,/ })).toBeNull();
  });
  it("알림 없이 바로 종료한 0초 식사도 타임라인을 표시한다", async () => {
    await mount();
    await start();
    await finish();
    expect(screen.getByText("식사 타임라인")).toBeTruthy();
    expect(screen.getByText("흡인 알림 없음")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /흡인 알림 1,/ })).toBeNull();
  });

  it("더보기 팝업을 연속으로 열어도 이전 내용이 남지 않고 이름 저장이 바로 반영된다", async () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(
      false,
    );
    await mount();
    await tab("더보기");
    await click("개인정보 처리 안내");
    expect(
      screen.getByText(/이름과 식사 기록은 이 기기에 저장됩니다/),
    ).toBeTruthy();
    await click("확인");
    await advance(200);
    expect(
      screen.queryByText(/이름과 식사 기록은 이 기기에 저장됩니다/),
    ).toBeNull();
    await click("앱 버전");
    expect(screen.getByText("버전 0.2.0")).toBeTruthy();
    expect(
      screen.queryByText(/이름과 식사 기록은 이 기기에 저장됩니다/),
    ).toBeNull();
    await click("확인");
    await advance(200);
    await click("내 정보 수정");
    const field = screen.getByLabelText("새 이름") as HTMLInputElement;
    expect(field.value).toBe("테스트");
    fireEvent.change(field, { target: { value: "수정이름" } });
    await click("이름 저장하기");
    await advance(200);
    expect(mocks.storage.get("@samkim/profile")).toBe("수정이름");
    expect(screen.getByText("안녕하세요, 수정이름 님")).toBeTruthy();
  });

  it("현재 시간으로 식사를 추천하고 수동 선택은 카메라에서 돌아와도 유지한다", async () => {
    vi.setSystemTime(new Date(2026, 10, 2, 18, 55, 0));
    await mount();
    await click("식사 모니터링 시작하기");
    expect(
      screen.getByRole("radio", { name: "저녁" }).getAttribute("aria-checked"),
    ).toBe("true");
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "간식" }));
    });
    await click("카메라/마이크 권한 설정하러 가기");
    await click("다음");
    await tab("모니터링");
    expect(
      screen.getByRole("radio", { name: "간식" }).getAttribute("aria-checked"),
    ).toBe("true");
    await tab("홈");
    vi.setSystemTime(new Date(2026, 10, 3, 8, 0, 0));
    await click("식사 모니터링 시작하기");
    expect(
      screen.getByRole("radio", { name: "아침" }).getAttribute("aria-checked"),
    ).toBe("true");
  });
  it("녹음 상태와 진행 시간을 표시하고 종료 시 파형을 제거한다", async () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(
      false,
    );
    await mount();
    await start();
    await advance(5000);
    await click("발성 안내");
    const idle = screen.getByLabelText("발성 안내 파형")
      .firstElementChild as HTMLElement;
    const idleTransform = idle.style.transform;
    await advance(250);
    expect(idle.style.transform).toBe(idleTransform);
    await click("2초 발성 녹음 시작");
    expect(screen.getByText("목소리를 녹음하고 있어요")).toBeTruthy();
    expect(screen.getByLabelText("움직이는 녹음 파형")).toBeTruthy();
    await advance(1000);
    expect(
      screen
        .getByRole("progressbar", { name: "발성 녹음 진행" })
        .getAttribute("aria-valuenow"),
    ).toBe("1");
    await advance(1000);
    expect(screen.queryByLabelText("움직이는 녹음 파형")).toBeNull();
    expect(mocks.recorder.stop).toHaveBeenCalledTimes(1);
  });

  it("기존 사용자와 기록을 한 번 초기화하고 새 가입 정보는 다시 지우지 않는다", async () => {
    mocks.storage.delete("@samkim/fresh-start-2026-11-02");
    mocks.storage.set("@samkim/profile", "할림");
    mocks.storage.set(
      "@samkim/records",
      JSON.stringify([
        {
          id: "old",
          meal: "점심",
          date: new Date().toISOString(),
          seconds: 9,
          alerts: 1,
          voices: 0,
        },
      ]),
    );
    mocks.storage.set("@samkim/largeText", "true");
    mocks.storage.set("unrelated-data", "keep");
    mocks.route = "/home";
    await mount();
    expect(screen.getByLabelText("사용자 이름")).toBeTruthy();
    expect(mocks.storage.has("@samkim/profile")).toBe(false);
    expect(mocks.storage.has("@samkim/records")).toBe(false);
    expect(mocks.storage.has("@samkim/largeText")).toBe(false);
    expect(mocks.storage.get("unrelated-data")).toBe("keep");
    fireEvent.change(screen.getByLabelText("사용자 이름"), {
      target: { value: "새이름" },
    });
    await check("개인정보 수집 및 이용 동의");
    await check("카메라 및 마이크 권한 사용 동의");
    await click("삼킴지킴이 시작하기");
    cleanup();
    mocks.route = "/";
    await mount();
    expect(screen.getByText("안녕하세요, 새이름 님")).toBeTruthy();
    expect(mocks.storage.get("@samkim/profile")).toBe("새이름");
  });
  it("5초 알림 → 2초 발성 → 완료 팝업 → 즉시 보고서와 영구 저장", async () => {
    await mount();
    await start();
    await advance(4999);
    expect(screen.queryByText("흡인 알림")).toBeNull();
    await advance(1);
    expect(screen.getByText("흡인 알림")).toBeTruthy();
    await click("발성 안내");
    await click("2초 발성 녹음 시작");
    expect(mocks.recorder.record).toHaveBeenCalledTimes(1);
    await advance(1999);
    expect(mocks.recorder.stop).not.toHaveBeenCalled();
    await advance(1);
    expect(mocks.recorder.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByText("녹음 처리 중…")).toBeTruthy();
    await advance(800);
    expect(screen.getByText("녹음 완료")).toBeTruthy();
    await click("확인");
    await advance(6200);
    expect(screen.queryByText("흡인 알림")).toBeNull();
    await finish();
    const saved = JSON.parse(mocks.storage.get("@samkim/records")!);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      meal: "점심",
      alerts: 1,
      voices: 1,
      seconds: 14,
      durationMs: 14000,
      aspirationEvents: [{ id: expect.any(String), offsetMs: 5000 }],
    });
    expect(screen.getByText("발성 기록")).toBeTruthy();
    expect(screen.queryByText("정상적으로 삼킴을 완료했어요")).toBeNull();
    await click("홈으로 돌아가기");
    cleanup();
    mocks.route = "/";
    await mount();
    expect(screen.getByText("점심 식사")).toBeTruthy();
    await click("점심 식사 보고서 확인");
    expect(
      screen.getByRole("button", { name: "흡인 알림 1, 12:00:05" }),
    ).toBeTruthy();
  });
  it("종료 버튼 한 번으로 해당 식사의 보고서를 바로 표시하고 뒤늦은 알림을 취소한다", async () => {
    await mount();
    await start();
    await advance(2000);
    await click("식사 모니터링 종료하기");
    expect(screen.queryByText("정말 식사 모니터링을 종료할까요?")).toBeNull();
    expect(screen.getByText("발성 기록")).toBeTruthy();
    const records = JSON.parse(mocks.storage.get("@samkim/records")!);
    expect(records).toHaveLength(1);
    expect(mocks.route).toBe(`/report?id=${records[0].id}`);
    expect(records[0]).toMatchObject({ seconds: 2, alerts: 0, voices: 0 });
    expect(screen.queryByTestId("camera")).toBeNull();
    await advance(10000);
    expect(screen.queryByText("흡인 알림")).toBeNull();
    expect(JSON.parse(mocks.storage.get("@samkim/records")!)).toHaveLength(1);
  });
  it("마이크 권한이 거절되면 다음 단계로 이동할 수 없다", async () => {
    mocks.microphoneGranted = false;
    await mount();
    await click("식사 모니터링 시작하기");
    await click("카메라/마이크 권한 설정하러 가기");
    expect(screen.getByText("장치 권한이 필요해요")).toBeTruthy();
    await click("확인");
    expect(
      screen
        .getByRole("button", { name: "다음" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });
  it("카메라 셀프 확인 3개를 모두 선택해야 모니터링을 시작할 수 있다", async () => {
    await mount();
    await click("식사 모니터링 시작하기");
    await click("카메라/마이크 권한 설정하러 가기");
    await click("다음");
    expect(
      screen
        .getByRole("button", { name: "식사 모니터링 시작하기" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    await check("얼굴이 전부 잘 보여요");
    await check("목 부위가 전부 잘 보여요");
    expect(
      screen
        .getByRole("button", { name: "식사 모니터링 시작하기" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    await check("조명이 적절해요");
    expect(
      screen
        .getByRole("button", { name: "식사 모니터링 시작하기" })
        .getAttribute("aria-disabled"),
    ).not.toBe("true");
  });
  it("발성을 건너뛴 기록은 보고서 필터로 찾고 다시 열 수 있다", async () => {
    await mount();
    await start();
    await advance(5000);
    await click("발성 안내");
    await click("지금은 건너뛰기");
    await finish();
    expect(mocks.recorder.record).not.toHaveBeenCalled();
    expect(JSON.parse(mocks.storage.get("@samkim/records")!)[0]).toMatchObject({
      alerts: 1,
      voices: 0,
    });
    await tab("보고서");
    await click("아침 보고서");
    expect(screen.getByText("아직 기록된 식사가 없어요.")).toBeTruthy();
    await click("점심 보고서");
    await click("점심 식사 보고서 확인");
    expect(screen.getByText("발성 기록")).toBeTruthy();
  });
  it("첫 시작은 이름과 두 가지 동의가 모두 필요하다", async () => {
    mocks.storage.clear();
    await mount();
    const start = () =>
      screen.getByRole("button", { name: "삼킴지킴이 시작하기" });
    expect(start().getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByLabelText("사용자 이름"), {
      target: { value: "새사용자" },
    });
    await check("개인정보 수집 및 이용 동의");
    expect(start().getAttribute("aria-disabled")).toBe("true");
    await check("카메라 및 마이크 권한 사용 동의");
    await click("삼킴지킴이 시작하기");
    expect(mocks.storage.get("@samkim/profile")).toBe("새사용자");
    expect(screen.getByText("안녕하세요, 새사용자 님")).toBeTruthy();
  });
});
