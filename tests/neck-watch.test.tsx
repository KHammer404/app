import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const vision = vi.hoisted(() => ({
  resetAsync: vi.fn(async () => {}),
  analyzeFrameAsync: vi.fn(async (_base64: string, timestamp: number) => ({
    status: "tracking", timestamp, features: [0, 0, 0, 0, 0, 0],
  })),
}));
vi.mock("../src/swallow/native", () => ({ nativeVision: vision }));
import { useNeckWatch } from "../src/swallow/useNeckWatch";

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
