import React from "react";
import { StyleSheet, View } from "react-native";
import { overlayGeometry, type Point } from "../swallow/overlay";
import type { NativeMotion } from "../swallow/native";

const OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
const DETAILS = [[33,160,158,133,153,144,33], [263,387,385,362,380,373,263], [61,40,0,270,291,321,17,91,61], [168,6,1]];
const COLORS = ["#6EF2CF", "#FFD86A", "#78B9FF"];
function Line({ a, b, color }: { a: Point; b: Point; color: string }) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < .1) return null;
  return <View style={{ position: "absolute", left: (a.x + b.x - length) / 2,
    top: (a.y + b.y) / 2, height: 1.5, width: length, backgroundColor: color,
    transform: [{ rotate: `${Math.atan2(b.y - a.y, b.x - a.x)}rad` }] }} />;
}
export default function CameraTrackingOverlay({ motion, width, height }: {
  motion: NativeMotion | null; width: number; height: number;
}) {
  if (!motion?.overlay || !["tracking", "warming"].includes(motion.status)) return null;
  const geometry = overlayGeometry(motion.overlay, width, height);
  if (!geometry) return null;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityLabel="얼굴 윤곽과 목 세 영역 추적 표시">
    {[OVAL, ...DETAILS].map((path, row) => path.slice(1).map((index, i) =>
      <Line key={`${row}-${i}`} a={geometry.points[path[i]]} b={geometry.points[index]} color="#6EF2CF" />))}
    {[...new Set([...OVAL, ...DETAILS.flat()])].map((index) => <View key={index} style={{
      position: "absolute", left: geometry.points[index].x - 2, top: geometry.points[index].y - 2,
      width: 4, height: 4, borderRadius: 2, backgroundColor: "#D5FFF1",
    }} />)}
    <View style={{ position: "absolute", left: geometry.head.x, top: geometry.head.y,
      width: geometry.head.width, height: geometry.head.height, borderWidth: 1,
      borderColor: "#D5FFF177", borderStyle: "dashed" }} />
    {geometry.neck.map((box, i) => {
      const velocity = motion.features?.[i] ?? 0;
      // Exaggerated direction indicator only; never a swallow decision.
      const length = Math.min(28, Math.abs(velocity) * 80);
      const a = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const b = { x: a.x, y: a.y - Math.sign(velocity) * length };
      return <React.Fragment key={i}>
        <View style={{ position: "absolute", left: box.x, top: box.y, width: box.width,
          height: box.height, borderWidth: 1.5, borderColor: COLORS[i] }} />
        {length > 2 && <>
          <Line a={a} b={b} color={COLORS[i]} />
          <Line a={b} b={{ x: b.x - 4, y: b.y + Math.sign(velocity) * 5 }} color={COLORS[i]} />
          <Line a={b} b={{ x: b.x + 4, y: b.y + Math.sign(velocity) * 5 }} color={COLORS[i]} />
        </>}
      </React.Fragment>;
    })}
  </View>;
}
