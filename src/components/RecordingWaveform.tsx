import React from "react";
import { StyleSheet, View } from "react-native";
import { TEAL } from "./theme";
import { T } from "./UI";

const SLOTS = 40;

export default function RecordingWaveform({
  recording,
  seconds,
  durationMs,
  levels,
}: {
  recording: boolean;
  seconds: number;
  durationMs: number;
  levels: number[];
}) {
  const shown = (recording ? levels : []).slice(-SLOTS);
  const padded = Array.from({ length: SLOTS }, (_, index) =>
    index < shown.length ? shown[index] : 0.04,
  );
  return (
    <View style={styles.root}>
      <View style={styles.status}>
        <View style={[styles.dot, { opacity: recording ? 1 : 0.3 }]} />
        <T accessibilityLiveRegion="polite" style={styles.statusText}>
          {recording ? "목소리를 녹음하고 있어요" : "녹음 준비"}
        </T>
      </View>
      <T
        accessibilityLabel={`녹음 ${seconds}초 / ${durationMs / 1000}초`}
        style={styles.time}
      >
        {`00:${String(seconds).padStart(2, "0")}`}
        <T style={styles.total}>{` / 00:${String(durationMs / 1000).padStart(2, "0")}`}</T>
      </T>
      <View
        accessibilityLabel={recording ? "움직이는 녹음 파형" : "발성 안내 파형"}
        style={styles.wave}
      >
        {padded.map((level, index) => (
          <View key={index} style={styles.slot}>
            <View
              style={[
                styles.bar,
                {
                  height: Math.max(3, Math.min(1, level) * 68),
                  opacity: recording ? 1 : 0.35,
                },
              ]}
            />
          </View>
        ))}
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="발성 녹음 진행"
        accessibilityValue={{ min: 0, max: durationMs / 1000, now: seconds }}
        aria-valuemin={0}
        aria-valuemax={durationMs / 1000}
        aria-valuenow={seconds}
        style={styles.track}
      >
        <View
          style={[
            styles.fill,
            { width: `${Math.min(100, (seconds * 1000 * 100) / durationMs)}%` },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: "stretch", gap: 14, paddingVertical: 5 },
  status: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: TEAL },
  statusText: { fontSize: 14, color: TEAL, lineHeight: 22 },
  time: {
    fontSize: 26,
    fontWeight: "700",
    color: TEAL,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  total: { fontSize: 15, fontWeight: "400", color: "#888" },
  wave: {
    height: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  slot: { width: 4, height: 72, alignItems: "center", justifyContent: "center" },
  bar: { width: 4, borderRadius: 2, backgroundColor: TEAL },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "#E2EFF0",
    marginHorizontal: 20,
  },
  fill: { height: 4, borderRadius: 2, backgroundColor: TEAL },
});
