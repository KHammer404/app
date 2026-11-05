import { SwallowWatch, downsample } from "../src/swallow/detect";
import { describe, expect, it } from "vitest";

function fill(width: number, height: number, value: number, neckDelta = 0) {
  const frame = new Float32Array(width * height);
  frame.fill(value);
  if (neckDelta) {
    const y0 = Math.floor(height * 0.55);
    const x0 = Math.floor(width * 0.28);
    const x1 = Math.floor(width * 0.72);
    for (let y = y0; y < height; y += 1) {
      for (let x = x0; x < x1; x += 1) frame[y * width + x] = value + neckDelta;
    }
  }
  return frame;
}

describe("목 움직임 삼킴 후보", () => {
  it("목만 움직였다가 돌아오면 후보를 낸다", () => {
    const watch = new SwallowWatch();
    const still = fill(20, 20, 0.4);
    expect(watch.push(still, 20, 20, 0).kind).toBe("idle");
    expect(watch.push(fill(20, 20, 0.4, 0.2), 20, 20, 200).kind).toBe("idle");
    expect(watch.push(still, 20, 20, 400).kind).toBe("idle");
    const found = watch.push(still, 20, 20, 700);
    expect(found.kind).toBe("swallow");
    if (found.kind === "swallow") expect(found.confidence).toBeGreaterThan(0.3);
  });

  it("얼굴과 목이 같이 움직이면 후보로 보지 않는다", () => {
    const watch = new SwallowWatch();
    watch.push(fill(20, 20, 0.4), 20, 20, 0);
    const shaken = fill(20, 20, 0.7);
    expect(watch.push(shaken, 20, 20, 200).kind).toBe("idle");
    expect(watch.push(fill(20, 20, 0.4), 20, 20, 500).kind).not.toBe("swallow");
  });

  it("어두운 화면은 목을 놓친 것으로 본다", () => {
    const watch = new SwallowWatch();
    expect(watch.push(fill(20, 20, 0.01), 20, 20, 0).kind).toBe("lost");
  });

  it("다운샘플 평균은 원본 밝기를 유지한다", () => {
    const rgba = new Uint8Array(4 * 4 * 4);
    rgba.fill(255);
    const gray = downsample(rgba, 4, 4, 2, 2);
    expect(gray.every((value) => value > 0.99)).toBe(true);
  });
});
