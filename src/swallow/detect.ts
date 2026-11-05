export type WatchResult =
  | { kind: "idle" }
  | { kind: "lost" }
  | { kind: "swallow"; confidence: number };

const NECK_Y = [0.55, 0.96];
const FACE_Y = [0.08, 0.42];
const MOUTH_Y = [0.4, 0.58];
const CROP_X = [0.28, 0.72];

export function downsample(
  rgba: Uint8Array,
  width: number,
  height: number,
  outWidth: number,
  outHeight: number,
): Float32Array {
  const out = new Float32Array(outWidth * outHeight);
  for (let y = 0; y < outHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor(((y + 0.5) * height) / outHeight));
    for (let x = 0; x < outWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(((x + 0.5) * width) / outWidth));
      const index = (sourceY * width + sourceX) * 4;
      out[y * outWidth + x] =
        (rgba[index] * 0.299 + rgba[index + 1] * 0.587 + rgba[index + 2] * 0.114) / 255;
    }
  }
  return out;
}

function regionMotion(
  previous: Float32Array,
  next: Float32Array,
  width: number,
  height: number,
  yRange: number[],
) {
  const y0 = Math.floor(height * yRange[0]);
  const y1 = Math.max(y0 + 1, Math.floor(height * yRange[1]));
  const x0 = Math.floor(width * CROP_X[0]);
  const x1 = Math.max(x0 + 1, Math.floor(width * CROP_X[1]));
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1 && y < height; y += 1) {
    for (let x = x0; x < x1 && x < width; x += 1) {
      const index = y * width + x;
      sum += Math.abs(next[index] - previous[index]);
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

function meanLuma(values: Float32Array) {
  let sum = 0;
  for (const value of values) sum += value;
  return values.length ? sum / values.length : 0;
}

export class SwallowWatch {
  private previous: Float32Array | null = null;
  private width = 0;
  private pulse = 0;
  private pulseFrames = 0;
  private pulseAt = 0;
  private cooldownUntil = 0;
  private mouthUntil = 0;

  push(frame: Float32Array, width: number, height: number, now: number): WatchResult {
    if (meanLuma(frame) < 0.08) return { kind: "lost" };
    if (!this.previous || this.width !== width || this.previous.length !== frame.length) {
      this.previous = frame;
      this.width = width;
      return { kind: "idle" };
    }
    const neck = regionMotion(this.previous, frame, width, height, NECK_Y);
    const face = regionMotion(this.previous, frame, width, height, FACE_Y);
    const mouth = regionMotion(this.previous, frame, width, height, MOUTH_Y);
    this.previous = frame;
    // 얼굴과 목이 같이 크면 카메라 흔들림
    if (face > 0.07 && neck > 0.05 && face > neck * 0.75) {
      this.pulse = 0;
      this.pulseFrames = 0;
      return { kind: "idle" };
    }
    // 입 주변이 계속 움직이면 씹기, 말하기로 보고 발성 요청을 미룸
    if (mouth > 0.06) {
      this.mouthUntil = now + 800;
      this.pulse = 0;
      this.pulseFrames = 0;
      return { kind: "idle" };
    }
    if (now < this.mouthUntil || now < this.cooldownUntil) return { kind: "idle" };
    if (neck > 0.045) {
      this.pulse = Math.max(this.pulse, neck);
      this.pulseFrames += 1;
      this.pulseAt = now;
      return { kind: "idle" };
    }
    const settled = this.pulse > 0.045 && now - this.pulseAt < 800 && this.pulseFrames > 0 && this.pulseFrames <= 5;
    if (settled) {
      const confidence = Math.max(0.35, Math.min(1, this.pulse / 0.12));
      this.pulse = 0;
      this.pulseFrames = 0;
      this.cooldownUntil = now + 2500;
      return { kind: "swallow", confidence };
    }
    if (this.pulse > 0 && now - this.pulseAt > 800) {
      this.pulse = 0;
      this.pulseFrames = 0;
    }
    return { kind: "idle" };
  }
}
