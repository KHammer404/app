import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ trigger: null as null | ((event: { id: string }) => void),
  start: vi.fn(async () => {}), stop: vi.fn(async () => {}), ready: vi.fn(async (_value: boolean) => {}),
  complete: vi.fn(async (_id: string, _accepted: boolean) => {}) }));
vi.mock("../src/remote/native", () => ({ nativeRemote: {
  startAsync: mock.start, stopAsync: mock.stop, setReadyAsync: mock.ready, completeAsync: mock.complete,
  addListener: (_event: string, listener: typeof mock.trigger) => { mock.trigger = listener; return {remove: () => { mock.trigger = null; }}; },
} }));
import { useRemoteSwallow } from "../src/remote/useRemoteSwallow";
it("binds USB input automatically, rejects busy state, and counts each request once", async () => {
  const swallow = vi.fn(async () => true);
  const { rerender, unmount } = renderHook(({ ready }) => useRemoteSwallow(true, ready, swallow), {initialProps:{ready:false}});
  await act(async () => { mock.trigger!({id:"busy"}); });
  expect(swallow).not.toHaveBeenCalled(); expect(mock.complete).toHaveBeenCalledWith("busy", false);
  rerender({ready:true});
  await act(async () => { mock.trigger!({id:"one"}); mock.trigger!({id:"one"}); });
  expect(swallow).toHaveBeenCalledTimes(1); expect(mock.complete).toHaveBeenCalledWith("one", true);
  unmount(); expect(mock.trigger).toBeNull(); expect(mock.stop).toHaveBeenCalled();
});
