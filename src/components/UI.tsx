import React from "react";
import MotionPressable from "./MotionPressable";
import { Pressable, StyleSheet, Text, TextProps, View } from "react-native";
import { useApp } from "../state/AppState";
import { GRAY, INK, s, TEAL } from "./theme";

const GLYPH = {
  home: 0xe9b2,
  activity: 0xeaa2,
  "file-text": 0xe873,
  grid: 0xe9b0,
  bell: 0xe7f5,
  check: 0xe668,
  "alert-triangle": 0xf083,
  coffee: 0xefef,
  clock: 0xefd6,
  "minus-circle": 0xf08f,
  "chevron-right": 0xe5cc,
  video: 0xe04b,
  mic: 0xe31d,
  user: 0xf0d3,
  type: 0xe245,
  shield: 0xe9e0,
  database: 0xf20e,
  "volume-2": 0xe050,
  "help-circle": 0xe8fd,
  info: 0xe88e,
  "alert-circle": 0xf8b6,
} as const;

export type IconName = keyof typeof GLYPH;

export function Icon({
  name,
  color = INK,
  size = 23,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  return (
    <Text
      allowFontScaling={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        fontFamily: "MaterialSymbolsOutlined",
        fontSize: size,
        lineHeight: size,
        width: size,
        height: size,
        color,
        textAlign: "center",
      }}
    >
      {String.fromCodePoint(GLYPH[name])}
    </Text>
  );
}
export function T({ style, ...props }: TextProps) {
  const { largeText } = useApp();
  return (
    <Text
      {...props}
      style={[
        style,
        largeText && {
          fontSize: (StyleSheet.flatten(style)?.fontSize ?? 17) * 1.15,
          lineHeight:
            (StyleSheet.flatten(style)?.lineHeight ??
              (StyleSheet.flatten(style)?.fontSize ?? 17) * 1.5) * 1.15,
        },
      ]}
    />
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  icon,
  danger = false,
  compact = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: IconName;
  danger?: boolean;
  compact?: boolean;
}) {
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.secondary,
        danger && { backgroundColor: "#E94849" },
        compact && { alignSelf: "center", minWidth: 112, paddingHorizontal: 28 },
      ]}
    >
      {icon && <Icon name={icon} color={secondary ? GRAY : "white"} />}
      <T style={[s.buttonText, secondary && { color: GRAY }]}>{title}</T>
    </MotionPressable>
  );
}
export function Check({
  label,
  checked,
  onPress,
  square = false,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  square?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onPress}
      style={s.checkRow}
    >
      <View
        style={[
          s.checkCircle,
          square && { borderRadius: 4 },
          checked && s.checkedCircle,
        ]}
      >
        {checked && <Icon name="check" color="white" size={16} />}
      </View>
      <T style={s.checkText}>{label}</T>
    </Pressable>
  );
}
export function Empty({
  text = "아직 기록된 식사가 없어요.",
}: {
  text?: string;
}) {
  return (
    <View style={s.empty}>
      <Icon name="file-text" color={TEAL} size={32} />
      <T style={s.caption}>{text}</T>
    </View>
  );
}
