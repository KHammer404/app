import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const vision = vi.hoisted(() => ({
  resetAsync: vi.fn(async () => {}),
  analyzeFrameAsync: vi.fn(async (_base64: string, timestamp: number) => ({
    status: "tracking", timestamp, features: [0, 0, 0, 0, 0, 0],
  })),
}));
vi.mock("../src/swallow/native", () => ({ nativeVision: vision }));
import { useNeckWatch } from "../src/swallow/useNeckWatch";
import type { NativeMotion } from "../src/swallow/native";

beforeEach(() => {
  vision.analyzeFrameAsync.mockImplementation(async (_base64: string, timestamp: number) => ({
    status: "tracking", timestamp, features: [0, 0, 0, 0, 0, 0],
  }));
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it("tracks through the native module without classifier weights and only requests periodic voice checks", async () => {
  vi.useFakeTimers();
  const onSwallow = vi.fn();
  const camera = { current: { takePictureAsync: vi.fn(async () => ({ base64: "local-frame" })) } };
  const { result, unmount } = renderHook(() => useNeckWatch(camera, true, onSwallow, 2000));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(vision.analyzeFrameAsync).toHaveBeenCalled();
  expect(onSwallow).not.toHaveBeenCalled();
  expect(result.current).toContain("자동 감지는 아직 준비 중");
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(onSwallow).toHaveBeenCalledExactlyOnceWith("periodic");
  unmount();
  const count = vision.analyzeFrameAsync.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(vision.analyzeFrameAsync).toHaveBeenCalledTimes(count);
});


it("keeps the label stable during short tracking losses and reports sustained loss and recovery", async () => {
  vi.useFakeTimers();
  const camera = { current: { takePictureAsync: vi.fn(async () => ({ base64: "local-frame" })) } };
  const { result, unmount } = renderHook(() => useNeckWatch(camera, true, vi.fn(), 20000));
  const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
  await advance(1000);
  const normal = result.current;
  let status = "lost";
  vision.analyzeFrameAsync.mockImplementation(async (_base64, timestamp) => ({ status, timestamp, features: [0, 0, 0, 0, 0, 0] }));
  for (let i = 0; i < 5; i++) {
    status = "lost"; await advance(500);
    status = "tracking"; await advance(500);
    expect(result.current).toBe(normal);
  }
  status = "lost"; await advance(1750);
  expect(result.current).toBe("얼굴과 목이 보이지 않아요");
  // Rewarming the tracker is not evidence that tracking has recovered.
  status = "warming"; await advance(125);
  expect(result.current).toBe("얼굴과 목이 보이지 않아요");
  status = "tracking"; await advance(500);
  expect(result.current).toBe("얼굴과 목이 보이지 않아요");
  await advance(1500);
  expect(result.current).toBe(normal);
  unmount();
});

it("resets the displayed status when monitoring resumes", async () => {
  vi.useFakeTimers();
  vision.analyzeFrameAsync.mockImplementation(async (_base64, timestamp) => ({ status: "lost", timestamp, features: [0, 0, 0, 0, 0, 0] }));
  const camera = { current: { takePictureAsync: vi.fn(async () => ({ base64: "local-frame" })) } };
  const { result, rerender } = renderHook(({ enabled }) => useNeckWatch(camera, enabled, vi.fn()), { initialProps: { enabled: true } });
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(result.current).toBe("얼굴과 목이 보이지 않아요");
  rerender({ enabled: false });
  expect(result.current).toBeNull();
  rerender({ enabled: true });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(result.current).toContain("자동 감지는 아직 준비 중");
});

it("publishes real tracking frames and clears the overlay when capture stalls or stops", async () => {
  vi.useFakeTimers();
  const onFrame = vi.fn();
  const captured: NativeMotion & { features: number[] } = { status: "tracking", timestamp: 1, features: [0,0,0,0,0,0],
    overlay: { width: 320, height: 480, landmarks: Array.from({ length: 478 }, () => [.5,.5]) } };
  vision.analyzeFrameAsync.mockResolvedValue(captured);
  const camera = { current: { takePictureAsync: vi.fn(async (): Promise<{ base64: string }> => ({ base64: "local-frame" })) } };
  const { rerender, unmount } = renderHook(({ enabled }) =>
    useNeckWatch(camera, enabled, vi.fn(), 20000, onFrame), { initialProps: { enabled: true } });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(onFrame).toHaveBeenLastCalledWith(captured);
  camera.current.takePictureAsync.mockImplementation(() => new Promise(() => {}));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(onFrame).toHaveBeenLastCalledWith(null);
  rerender({ enabled: false });
  expect(onFrame).toHaveBeenLastCalledWith(null);
  unmount();
});
