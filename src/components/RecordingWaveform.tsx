import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { TEAL } from "./theme";
import { T } from "./UI";

const HEIGHTS = [
  12, 28, 48, 34, 16, 24, 42, 60, 36, 18, 30, 50, 34, 14, 28, 52, 38, 20, 44,
  60, 32, 16, 28, 12,
];
const nativeDriver = Platform.OS !== "web";

/** Recording activity indicator, not an audio amplitude measurement. */
export default function RecordingWaveform({
  recording,
  seconds,
  durationMs,
}: {
  recording: boolean;
  seconds: number;
  durationMs: number;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [bars] = useState(() => HEIGHTS.map(() => new Animated.Value(0.22)));
  const [pulse] = useState(() => new Animated.Value(1));
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduceMotion(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);
  useEffect(() => {
    if (!recording || reduceMotion) {
      bars.forEach((bar) => bar.setValue(recording ? 0.55 : 0.22));
      pulse.setValue(1);
      return;
    }
    const loops = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: 0.55 + (i % 4) * 0.15,
            duration: 150 + (i % 5) * 45,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: nativeDriver,
            isInteraction: false,
          }),
          Animated.timing(bar, {
            toValue: 0.15 + (i % 3) * 0.08,
            duration: 180 + (i % 4) * 55,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: nativeDriver,
            isInteraction: false,
          }),
        ]),
        { iterations: -1, resetBeforeIteration: false },
      ),
    );
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 500,
          useNativeDriver: nativeDriver,
          isInteraction: false,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 500,
          useNativeDriver: nativeDriver,
          isInteraction: false,
        }),
      ]),
    );
    loops.forEach((loop) => loop.start());
    blink.start();
    return () => {
      loops.forEach((loop) => loop.stop());
      blink.stop();
    };
  }, [recording, reduceMotion, bars, pulse]);
  useEffect(() => {
    progress.setValue(0);
    if (!recording || reduceMotion) return;
    const fill = Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: false,
      isInteraction: false,
    });
    fill.start();
    return () => fill.stop();
  }, [recording, reduceMotion, durationMs, progress]);
  useEffect(() => {
    if (recording && reduceMotion)
      progress.setValue(Math.min(1, (seconds * 1000) / durationMs));
  }, [recording, reduceMotion, seconds, durationMs, progress]);
  return (
    <View style={styles.root}>
      <View style={styles.status}>
        <Animated.View
          style={[styles.dot, { opacity: recording ? pulse : 0.3 }]}
        />
        <T accessibilityLiveRegion="polite" style={styles.statusText}>
          {recording ? "목소리를 녹음하고 있어요" : "녹음 준비"}
        </T>
      </View>
      <T
        accessibilityLabel={`녹음 ${seconds}초 / ${durationMs / 1000}초`}
        style={styles.time}
      >
        {`00:${String(seconds).padStart(2, "0")}`}
        <T
          style={styles.total}
        >{` / 00:${String(durationMs / 1000).padStart(2, "0")}`}</T>
      </T>
      <View
        accessibilityLabel={recording ? "움직이는 녹음 파형" : "발성 안내 파형"}
        style={[styles.wave, !recording && { opacity: 0.45 }]}
      >
        {HEIGHTS.map((height, i) => (
          <Animated.View
            key={i}
            style={[styles.bar, { height, transform: [{ scaleY: bars[i] }] }]}
          />
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
        <Animated.View
          style={[
            styles.fill,
            {
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
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
    gap: 4,
  },
  bar: { width: 5, borderRadius: 2, backgroundColor: TEAL },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "#E2EFF0",
    marginHorizontal: 20,
  },
  fill: { height: 4, borderRadius: 2, backgroundColor: TEAL },
});
