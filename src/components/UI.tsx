import React from "react";
import MotionPressable from "./MotionPressable";
import { Pressable, StyleSheet, Text, TextProps, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useApp } from "../state/AppState";
import { GRAY, INK, s, TEAL } from "./theme";
export type IconName = React.ComponentProps<typeof Feather>["name"];
export function Icon({
  name,
  color = INK,
  size = 23,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  return <Feather name={name} color={color} size={size} />;
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
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: IconName;
  danger?: boolean;
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
