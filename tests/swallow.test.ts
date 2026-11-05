import { SwallowWatch, downsample } from "../src/swallow/detect";
import { describe, expect, it } from "vitest";

const W = 48;
const H = 64;

function portrait(shiftNeck = 0) {
  const frame = new Float32Array(W * H);
  frame.fill(0.22);
  for (let y = 8; y < 36; y += 1) {
    for (let x = 14; x < 34; x += 1) {
      const dx = (x - 24) / 10;
      const dy = (y - 20) / 13;
      if (dx * dx + dy * dy > 1) continue;
      frame[y * W + x] = 0.52 + ((x * 3 + y) % 5) * 0.06;
    }
  }
  for (let y = 34; y < 58; y += 1) {
    const source = y + shiftNeck;
    for (let x = 18; x < 30; x += 1) {
      frame[y * W + x] = 0.34 + (Math.abs(source) % 4 === 0 ? 0.28 : 0);
    }
  }
  return frame;
}

function shiftAll(frame: Float32Array, dx: number) {
  const next = new Float32Array(W * H);
  next.fill(0.22);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const from = x - dx;
      if (from < 0 || from >= W) continue;
      next[y * W + x] = frame[y * W + from];
    }
  }
  return next;
}

describe("삼킴 후보", () => {
  it("목만 올라갔다 내려오면 후보를 낸다", () => {
    const watch = new SwallowWatch();
    const still = portrait(0);
    expect(watch.push(still, W, H, 0).kind).toBe("idle");
    expect(watch.push(portrait(3), W, H, 280).kind).toBe("idle");
    const found = watch.push(still, W, H, 560);
    expect(found.kind).toBe("swallow");
    if (found.kind === "swallow") expect(found.confidence).toBeGreaterThan(0.3);
  });

  it("얼굴과 목이 같이 움직이면 후보로 보지 않는다", () => {
    const watch = new SwallowWatch();
    const still = portrait(0);
    watch.push(still, W, H, 0);
    expect(watch.push(shiftAll(still, 3), W, H, 280).kind).not.toBe("swallow");
    expect(watch.push(still, W, H, 560).kind).not.toBe("swallow");
  });

  it("어두운 화면은 목을 놓친 것으로 본다", () => {
    const watch = new SwallowWatch();
    const dark = new Float32Array(W * H);
    dark.fill(0.02);
    expect(watch.push(dark, W, H, 0).kind).toBe("lost");
  });

  it("다운샘플 평균은 원본 밝기를 유지한다", () => {
    const rgba = new Uint8Array(4 * 4 * 4);
    rgba.fill(255);
    const gray = downsample(rgba, 4, 4, 2, 2);
    expect(gray.every((value) => value > 0.99)).toBe(true);
  });
});
