import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { BlurTargetView, BlurView } from "expo-blur";
import { router } from "expo-router";
import { Icon, T } from "./UI";
import { INK, s, TEAL } from "./theme";

const TABS = [
  ["home", "home", "홈"],
  ["prepare", "activity", "모니터링"],
  ["reports", "file-text", "보고서"],
  ["more", "grid", "더보기"],
] as const;
type Tab = (typeof TABS)[number][0];
const INSET = 6;
export default function GlassTabBar({ selected }: { selected: Tab }) {
  const index = TABS.findIndex(([target]) => target === selected);
  const [position] = useState(() => new Animated.Value(index));
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const blurTargetRef = useRef<React.ComponentRef<typeof View> | null>(null);
  const cellWidth = Math.max(0, (width - INSET * 2) / TABS.length);
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
    if (reduceMotion) {
      position.setValue(index);
      return;
    }
    const slide = Animated.spring(position, {
      toValue: index,
      stiffness: 280,
      damping: 25,
      mass: 0.85,
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
    slide.start();
    return () => slide.stop();
  }, [index, position, reduceMotion]);
  return (
    <View style={s.navWrap}>
      <View
        accessibilityRole="tablist"
        accessibilityLabel="하단 메뉴"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={styles.bar}
      >
        <BlurTargetView
          ref={blurTargetRef}
          pointerEvents="none"
          style={styles.backdrop}
        />
        <BlurView
          pointerEvents="none"
          blurTarget={blurTargetRef}
          blurMethod="dimezisBlurViewSdk31Plus"
          tint="light"
          intensity={45}
          style={styles.barBlur}
        />
        {cellWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.capsule,
              {
                width: cellWidth - 2,
                transform: [
                  {
                    translateX: position.interpolate({
                      inputRange: [0, TABS.length - 1],
                      outputRange: [0, cellWidth * (TABS.length - 1)],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.capsuleSurface}>
              <BlurView
                blurTarget={blurTargetRef}
                blurMethod="dimezisBlurViewSdk31Plus"
                tint="light"
                intensity={30}
                style={styles.capsuleBlur}
              />
              <View style={styles.tealTint} />
            </View>
          </Animated.View>
        )}
        {TABS.map(([target, icon, label]) => (
          <Pressable
            key={target}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: selected === target }}
            aria-selected={selected === target}
            onPress={() => router.replace(`/${target}`)}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.65 }]}
          >
            <Icon
              name={icon}
              color={selected === target ? TEAL : INK}
              size={24}
            />
            <T
              style={[
                s.navText,
                selected === target && { color: TEAL, fontWeight: "700" },
              ]}
            >
              {label}
            </T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    padding: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.95)",
    borderRadius: 50,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,.45)",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    backgroundColor: "#ECF2F1",
  },
  barBlur: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    overflow: "hidden",
  },
  capsule: {
    position: "absolute",
    left: INSET + 1,
    top: INSET,
    bottom: INSET,
    borderRadius: 999,
    overflow: "hidden",
    isolation: "isolate",
    backgroundColor: "rgba(255,255,255,.5)",
  },
  capsuleSurface: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.9)",
  },
  capsuleBlur: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    overflow: "hidden",
  },
  tealTint: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    backgroundColor: "rgba(39,143,156,.13)",
  },
  item: {
    flex: 1,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 63,
  },
});
