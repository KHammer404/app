// 기기 안에서만 삼킴 후보를 낸다.
// 얼굴 상자(턱·광대)로 목 ROI를 잡고, Lucas-Kanade 광류로 머리 움직임을 뺀 뒤
// 1D-CNN과 dilation TCN이 후두의 상승-하강 펄스를 고른다.
// Expo Go에는 MediaPipe·OpenCV 네이티브 런타임이 없어 같은 단계를 JS로 실행한다.

export type WatchNote = "watch" | "mouth" | "turn";
export type WatchResult =
  | { kind: "idle"; note: WatchNote }
  | { kind: "lost" }
  | { kind: "swallow"; confidence: number };

const WINDOW_MS = 2000;
const BINS = 8;
const FEATURES = 6;

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

type Box = { x0: number; y0: number; x1: number; y1: number };
type Sample = { t: number; f: number[] };

function meanLuma(values: Float32Array) {
  let sum = 0;
  for (const value of values) sum += value;
  return values.length ? sum / values.length : 0;
}

function gradients(frame: Float32Array, width: number, height: number) {
  const mag = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const gx = frame[index + 1] - frame[index - 1];
      const gy = frame[index + width] - frame[index - width];
      mag[index] = Math.abs(gx) + Math.abs(gy);
    }
  }
  return mag;
}

/** 정면 얼굴의 턱·광대 경계. MediaPipe chin(152), jaw(234/454)에 해당하는 상자. */
function findFace(mag: Float32Array, width: number, height: number): Box | null {
  const xStart = Math.floor(width * 0.1);
  const xEnd = Math.ceil(width * 0.9);
  const yStart = Math.floor(height * 0.02);
  const yEnd = Math.floor(height * 0.64);
  let max = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) max = Math.max(max, mag[y * width + x]);
  }
  if (max < 0.06) return null;
  const threshold = max * 0.34;
  let x0 = width;
  let x1 = 0;
  let y0 = height;
  let y1 = 0;
  let count = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      if (mag[y * width + x] < threshold) continue;
      count += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (count < 16 || x1 - x0 < width * 0.16 || y1 - y0 < height * 0.12) return null;
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

function clipBox(box: Box, width: number, height: number): Box {
  return {
    x0: Math.max(1, Math.floor(box.x0)),
    y0: Math.max(1, Math.floor(box.y0)),
    x1: Math.min(width - 1, Math.ceil(box.x1)),
    y1: Math.min(height - 1, Math.ceil(box.y1)),
  };
}

function neckBox(face: Box, height: number): Box | null {
  const faceH = face.y1 - face.y0;
  const faceW = face.x1 - face.x0;
  const y0 = face.y1 - Math.floor(faceH * 0.08);
  const y1 = Math.min(height - 2, y0 + Math.floor(faceH * 0.7));
  const x0 = face.x0 + Math.floor(faceW * 0.22);
  const x1 = face.x1 - Math.floor(faceW * 0.22);
  if (y1 - y0 < 4 || x1 - x0 < 4) return null;
  return { x0, y0, x1, y1 };
}

function mouthBox(face: Box): Box {
  const faceH = face.y1 - face.y0;
  const faceW = face.x1 - face.x0;
  return {
    x0: face.x0 + Math.floor(faceW * 0.28),
    x1: face.x1 - Math.floor(faceW * 0.28),
    y0: face.y0 + Math.floor(faceH * 0.58),
    y1: face.y0 + Math.floor(faceH * 0.86),
  };
}

function headBox(face: Box): Box {
  return {
    x0: face.x0,
    x1: face.x1,
    y0: face.y0,
    y1: face.y0 + Math.floor((face.y1 - face.y0) * 0.62),
  };
}

function band(box: Box, index: number): Box {
  const span = box.y1 - box.y0;
  const y0 = box.y0 + Math.floor((span * index) / 3);
  const y1 = box.y0 + Math.floor((span * (index + 1)) / 3);
  return { ...box, y0, y1: Math.max(y0 + 2, y1) };
}

function lucasKanade(
  previous: Float32Array,
  next: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
) {
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;
  let e = 0;
  let count = 0;
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx <= 0 || yy <= 0 || xx >= width - 1 || yy >= height - 1) continue;
      const index = yy * width + xx;
      const ix = (previous[index + 1] - previous[index - 1]) * 0.5;
      const iy = (previous[index + width] - previous[index - width]) * 0.5;
      const it = next[index] - previous[index];
      a += ix * ix;
      b += ix * iy;
      c += iy * iy;
      d += ix * it;
      e += iy * it;
      count += 1;
    }
  }
  const det = a * c - b * b;
  if (count < 8 || det < 1e-4) return null;
  const vx = Math.max(-8, Math.min(8, (-d * c + b * e) / det));
  const vy = Math.max(-8, Math.min(8, (b * d - a * e) / det));
  return { vx, vy };
}

function flowIn(previous: Float32Array, next: Float32Array, width: number, height: number, box: Box) {
  let sx = 0;
  let sy = 0;
  let sm = 0;
  let count = 0;
  for (let y = box.y0 + 1; y < box.y1 - 1; y += 2) {
    for (let x = box.x0 + 1; x < box.x1 - 1; x += 2) {
      const flow = lucasKanade(previous, next, width, height, x, y);
      if (!flow) continue;
      sx += flow.vx;
      sy += flow.vy;
      sm += Math.hypot(flow.vx, flow.vy);
      count += 1;
    }
  }
  if (count < 3) return { vx: 0, vy: 0, mag: 0 };
  return { vx: sx / count, vy: sy / count, mag: sm / count };
}

function regionDiff(previous: Float32Array, next: Float32Array, width: number, box: Box) {
  let sum = 0;
  let count = 0;
  for (let y = box.y0; y < box.y1; y += 1) {
    for (let x = box.x0; x < box.x1; x += 1) {
      const index = y * width + x;
      sum += Math.abs(next[index] - previous[index]);
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

function squash(value: number) {
  const scaled = value / 1.6;
  const exp = Math.exp(Math.max(-8, Math.min(8, scaled * 2)));
  return (exp - 1) / (exp + 1);
}

function conv(series: number[][], channel: number, kernel: number[], dilation = 1) {
  let best = 0;
  const reach = (kernel.length - 1) * dilation;
  for (let index = 0; index + reach < series.length; index += 1) {
    let sum = 0;
    for (let tap = 0; tap < kernel.length; tap += 1) {
      sum += series[index + tap * dilation][channel] * kernel[tap];
    }
    if (sum > best) best = sum;
  }
  return best;
}

/** 후두가 올라갔다 내려오는 짧은 수직 펄스. 1D-CNN과 dilation 2 TCN. */
function classify(series: number[][]) {
  const rise = [0.15, -1.05, 0.75];
  const larynx = conv(series, 0, rise);
  const head = conv(series, 5, rise);
  const mouth = conv(series, 4, [0.34, 0.33, 0.33]);
  const cnn = Math.max(0, larynx) - 0.85 * Math.max(0, head) - 0.65 * Math.max(0, mouth);
  const tcn = conv(series, 0, rise, 2);
  return { cnn, tcn };
}

function resample(history: Sample[], now: number) {
  const bins: number[][] = [];
  const width = WINDOW_MS / BINS;
  let last = new Array<number>(FEATURES).fill(0);
  for (let index = 0; index < BINS; index += 1) {
    const start = now - WINDOW_MS + index * width;
    const end = index === BINS - 1 ? now + 1 : start + width;
    let hit: Sample | undefined;
    for (let cursor = history.length - 1; cursor >= 0; cursor -= 1) {
      const sample = history[cursor];
      if (sample.t >= start && sample.t < end) {
        hit = sample;
        break;
      }
    }
    if (hit) last = hit.f;
    bins.push(last);
  }
  return bins;
}

export class SwallowWatch {
  private previous: Float32Array | null = null;
  private width = 0;
  private history: Sample[] = [];
  private cooldownUntil = 0;
  private missed = 0;

  push(frame: Float32Array, width: number, height: number, now: number): WatchResult {
    if (meanLuma(frame) < 0.08) {
      this.noteMiss();
      return { kind: "lost" };
    }
    const face = findFace(gradients(frame, width, height), width, height);
    if (!face) {
      this.noteMiss();
      return { kind: "lost" };
    }
    this.missed = 0;
    const fitted = clipBox(face, width, height);
    const center = (fitted.x0 + fitted.x1) / 2 / width;
    if (Math.abs(center - 0.5) > 0.22) return { kind: "idle", note: "turn" };
    const neck = neckBox(fitted, height);
    if (!neck) return { kind: "lost" };
    if (!this.previous || this.width !== width || this.previous.length !== frame.length) {
      this.previous = frame.slice();
      this.width = width;
      return { kind: "idle", note: "watch" };
    }
    const head = flowIn(this.previous, frame, width, height, headBox(fitted));
    const upper = flowIn(this.previous, frame, width, height, band(neck, 0));
    const middle = flowIn(this.previous, frame, width, height, band(neck, 1));
    const lower = flowIn(this.previous, frame, width, height, band(neck, 2));
    const mouth = regionDiff(this.previous, frame, width, mouthBox(fitted));
    this.previous = frame.slice();
    // 화면에서 위쪽(y 감소) 이동을 음수로 둔다. 후두 상승이 음수 펄스다.
    const features = [
      squash(-(upper.vy - head.vy)),
      squash(-(middle.vy - head.vy)),
      squash(-(lower.vy - head.vy)),
      squash(upper.mag),
      squash(mouth / 0.05),
      squash(-head.vy),
    ];
    this.history.push({ t: now, f: features });
    this.history = this.history.filter((sample) => now - sample.t <= WINDOW_MS);
    if (features[4] > 0.62) return { kind: "idle", note: "mouth" };
    if (now < this.cooldownUntil || this.history.length < 2) return { kind: "idle", note: "watch" };
    const decision = classify(resample(this.history, now));
    if (decision.cnn < 0.62) return { kind: "idle", note: "watch" };
    const confidence = Math.max(0.35, Math.min(1, decision.cnn / 1.35 + (decision.tcn > 0.4 ? 0.05 : 0)));
    this.cooldownUntil = now + 2500;
    this.history = [];
    return { kind: "swallow", confidence };
  }

  private noteMiss() {
    this.missed += 1;
    if (this.missed > 4) this.reset();
  }

  private reset() {
    this.previous = null;
    this.history = [];
    this.missed = 0;
  }
}
