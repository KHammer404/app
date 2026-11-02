import { describe, expect, it } from "vitest";
import { mealForTime } from "../src/utils/mealTime";
describe("기기 현지 시간의 식사 기본 선택 경계", () => {
  it.each([
    [4, 59, "간식"],
    [5, 0, "아침"],
    [10, 59, "아침"],
    [11, 0, "점심"],
    [16, 59, "점심"],
    [17, 0, "저녁"],
    [21, 59, "저녁"],
    [22, 0, "간식"],
    [0, 0, "간식"],
  ] as const)("%i시 %i분에는 %s을 선택한다", (hour, minute, expected) => {
    expect(mealForTime(new Date(2026, 10, 2, hour, minute))).toBe(expected);
  });
});
