import { expect, it } from "vitest";
import { overlayGeometry } from "../src/swallow/overlay";
import type { TrackingOverlay } from "../src/swallow/native";

function frame(): TrackingOverlay {
  const landmarks = Array.from({ length: 478 }, () => [.5, .5]);
  landmarks[234] = [.25, .4]; landmarks[454] = [.75, .4];
  landmarks[10] = [.5, .1]; landmarks[152] = [.5, .6];
  return { width: 320, height: 480, landmarks };
}
it("maps portrait landmarks into the square centered camera crop and preserves native neck bands", () => {
  const g = overlayGeometry(frame(), 320, 320)!;
  expect(g.points[10]).toEqual({ x: 160, y: -32 });
  expect(g.points[152]).toEqual({ x: 160, y: 208 });
  expect(g.neck).toHaveLength(3);
  expect(g.neck[0].x).toBeCloseTo(115.2);
  expect(g.neck[0].y).toBeCloseTo(198.4);
  expect(g.neck[0].width).toBeCloseTo(89.6);
  expect(g.neck[0].height).toBeCloseTo(51.2);
  expect(g.neck[2].y + g.neck[2].height).toBeCloseTo(352);
});
it("handles a landscape crop without reversing already mirrored capture coordinates", () => {
  const f = frame(); f.width = 480; f.height = 320;
  const g = overlayGeometry(f, 320, 320)!;
  expect(g.points[234].x).toBe(40);
  expect(g.points[454].x).toBe(280);
});
it("refuses missing or invalid geometry rather than drawing fabricated landmarks", () => {
  expect(overlayGeometry(frame(), 0, 320)).toBeNull();
  const f = frame(); f.landmarks[1] = [NaN, .5];
  expect(overlayGeometry(f, 320, 320)).toBeNull();
  expect(overlayGeometry({ ...frame(), landmarks: [] }, 320, 320)).toBeNull();
});
