import React, { useEffect, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  pressScale?: number;
};
export default function MotionPressable({
  style,
  pressScale = 0.975,
  disabled,
  onPressIn,
  onPressOut,
  ...props
}: Props) {
  const [press] = useState(() => new Animated.Value(0));
  const reduced = useReducedMotion();
  useEffect(() => {
    if (disabled) {
      press.stopAnimation();
      press.setValue(0);
    }
    return () => press.stopAnimation();
  }, [disabled, press]);
  function feedback(down: boolean) {
    if (disabled) return;
    if (reduced) {
      press.setValue(down ? 1 : 0);
      return;
    }
    Animated.timing(press, {
      toValue: down ? 1 : 0,
      duration: down ? 75 : 130,
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    }).start();
  }
  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        feedback(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        feedback(false);
        onPressOut?.(event);
      }}
      style={[
        style,
        {
          opacity: disabled
            ? 0.58
            : press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }),
          transform: [
            {
              scale: reduced
                ? 1
                : press.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, pressScale],
                  }),
            },
          ],
        },
      ]}
    />
  );
}
