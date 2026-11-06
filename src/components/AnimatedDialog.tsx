import React, { useEffect, useState } from "react";
import { Animated, Easing, Modal } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { s } from "./theme";

type Props = React.PropsWithChildren<{
  visible: boolean;
  onRequestClose: () => void;
  onShow?: () => void;
  overlayColor?: string;
}>;
export default function AnimatedDialog({
  visible,
  onRequestClose,
  onShow,
  overlayColor = "#0009",
  children,
}: Props) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!visible) return;
    if (reduced) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [visible, reduced, progress]);
  if (!visible) return null;
  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onRequestClose}
      onShow={onShow}
    >
      <Animated.View style={[s.overlay, { backgroundColor: overlayColor, opacity: progress }]}>
        <Animated.View
          accessibilityViewIsModal
          style={[
            s.modal,
            {
              maxHeight: "85%",
              transform: [
                {
                  translateY: reduced
                    ? 0
                    : progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [12, 0],
                      }),
                },
                {
                  scale: reduced
                    ? 1
                    : progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.98, 1],
                      }),
                },
              ],
            },
          ]}
        >
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
