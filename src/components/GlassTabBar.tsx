import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import {
  GlassContainer,
  GlassView,
  isGlassEffectAPIAvailable,
} from "expo-glass-effect";
import { router } from "expo-router";
import { Icon } from "./UI";
import { INK, s, TEAL } from "./theme";

const TABS = [
  ["home", "home", "홈"],
  ["prepare", "activity", "모니터링"],
  ["reports", "file-text", "보고서"],
  ["more", "grid", "더보기"],
] as const;
type Tab = (typeof TABS)[number][0];

function liquidGlass() {
  if (Platform.OS !== "ios") return false;
  try {
    return isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

export default function GlassTabBar({ selected }: { selected: Tab }) {
  const index = Math.max(0, TABS.findIndex(([target]) => target === selected));
  const [position] = useState(() => new Animated.Value(index));
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const glass = liquidGlass();
  const cell = width > 0 ? width / TABS.length : 0;
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduceMotion(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
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
      stiffness: 320,
      damping: 28,
      mass: 0.8,
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
    slide.start();
    return () => slide.stop();
  }, [index, position, reduceMotion]);
  const lens =
    cell > 0 ? (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.lens,
          {
            width: cell - 8,
            transform: [
              {
                translateX: position.interpolate({
                  inputRange: [0, TABS.length - 1],
                  outputRange: [4, 4 + cell * (TABS.length - 1)],
                }),
              },
            ],
          },
        ]}
      >
        {glass ? (
          <GlassView
            pointerEvents="none"
            isInteractive
            glassEffectStyle="clear"
            style={styles.lensFill}
          />
        ) : (
          <View style={styles.lensFallback} />
        )}
      </Animated.View>
    ) : null;
  const items = TABS.map(([target, icon, label], item) => {
    const active = selected === target;
    const scale = position.interpolate({
      inputRange: [item - 1, item, item + 1],
      outputRange: [1, 1.08, 1],
      extrapolate: "clamp",
    });
    return (
      <Pressable
        key={target}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        aria-selected={active}
        onPress={() => router.replace(`/${target}`)}
        style={styles.item}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Icon name={icon} color={active ? TEAL : INK} size={23} />
        </Animated.View>
        <Animated.Text
          style={[
            s.navText,
            active && { color: TEAL, fontWeight: "700" },
            { opacity: position.interpolate({
              inputRange: [item - 1, item, item + 1],
              outputRange: [0.72, 1, 0.72],
              extrapolate: "clamp",
            }) },
          ]}
        >
          {label}
        </Animated.Text>
      </Pressable>
    );
  });
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View
        accessibilityRole="tablist"
        accessibilityLabel="하단 메뉴"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={styles.bar}
      >
        {glass ? (
          <GlassContainer pointerEvents="box-none" spacing={8} style={styles.fill}>
            <GlassView pointerEvents="none" glassEffectStyle="regular" style={styles.fill} />
            {lens}
            <View style={styles.row}>{items}</View>
          </GlassContainer>
        ) : (
          <>
            <BlurView pointerEvents="none" tint="light" intensity={70} style={styles.fill} />
            <View pointerEvents="none" style={styles.fallbackTint} />
            {lens}
            <View style={styles.row}>{items}</View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 8,
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  bar: {
    height: 64,
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: Platform.OS === "ios" ? "transparent" : "rgba(255,255,255,0.72)",
  },
  fill: { ...StyleSheet.absoluteFill, borderRadius: 32 },
  row: { flex: 1, flexDirection: "row" },
  lens: {
    position: "absolute",
    top: 4,
    bottom: 4,
    borderRadius: 28,
    overflow: "hidden",
  },
  lensFill: { flex: 1, borderRadius: 28 },
  lensFallback: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  fallbackTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
});
