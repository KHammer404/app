import type { TrackingOverlay } from "./native";

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };

/** Match the camera's centered FILL crop. Captured pixels and preview are mirrored together. */
export function overlayGeometry(frame: TrackingOverlay, width: number, height: number) {
  if (![frame.width, frame.height, width, height].every((n) => Number.isFinite(n) && n > 0) ||
      frame.landmarks.length < 455 || frame.landmarks.some((p) => p.length < 2 || !p.slice(0, 2).every(Number.isFinite))) return null;
  const scale = Math.max(width / frame.width, height / frame.height);
  const dx = (width - frame.width * scale) / 2, dy = (height - frame.height * scale) / 2;
  const point = (x: number, y: number): Point => ({ x: x * frame.width * scale + dx, y: y * frame.height * scale + dy });
  const points = frame.landmarks.map((p) => point(p[0], p[1]));
  const left = Math.min(frame.landmarks[234][0], frame.landmarks[454][0]);
  const right = Math.max(frame.landmarks[234][0], frame.landmarks[454][0]);
  const top = frame.landmarks[10][1], chin = frame.landmarks[152][1];
  const fw = right - left, fh = chin - top, center = (left + right) / 2;
  if (fw <= 0 || fh <= 0) return null;
  const box = (x0: number, y0: number, x1: number, y1: number): Box => {
    const a = point(x0, y0), b = point(x1, y1);
    return { ...a, width: b.x - a.x, height: b.y - a.y };
  };
  const neckTop = chin - fh * .04, neckHeight = fh * .64;
  return {
    points,
    head: box(left + fw * .15, top, right - fw * .15, top + fh * .35),
    neck: Array.from({ length: 3 }, (_, band) => box(center - fw * .28,
      neckTop + neckHeight * band / 3, center + fw * .28, neckTop + neckHeight * (band + 1) / 3)),
  };
}
