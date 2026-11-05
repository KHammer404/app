import { voiceRequest, parseCaregiver, DEFAULT_CAREGIVER } from "../src/settings/caregiver";
import { describe, expect, it } from "vitest";

describe("보호자 발성 요청", () => {
  it("수동과 주기 요청은 항상 발성을 연다", () => {
    expect(voiceRequest(DEFAULT_CAREGIVER, "manual", undefined, 0).request).toBe(true);
    expect(voiceRequest(DEFAULT_CAREGIVER, "periodic", undefined, 3).request).toBe(true);
  });

  it("2회마다면 자동 감지의 짝수 번째만 발성을 연다", () => {
    const settings = { ...DEFAULT_CAREGIVER, everyNth: 2 as const };
    const first = voiceRequest(settings, "auto", 0.9, 0);
    const second = voiceRequest(settings, "auto", 0.9, first.autoCount);
    expect(first.request).toBe(false);
    expect(second.request).toBe(true);
  });

  it("또렷한 움직임만 고르면 낮은 신뢰도는 발성 없이 센다", () => {
    const settings = { ...DEFAULT_CAREGIVER, confidentOnly: true };
    const quiet = voiceRequest(settings, "auto", 0.4, 0);
    expect(quiet).toEqual({ request: false, autoCount: 0 });
  });

  it("깨진 설정은 기본값으로 되돌린다", () => {
    expect(parseCaregiver("not-json")).toEqual(DEFAULT_CAREGIVER);
    expect(parseCaregiver(JSON.stringify({ everyNth: 9, periodicSeconds: 5 })).everyNth).toBe(1);
  });
});
