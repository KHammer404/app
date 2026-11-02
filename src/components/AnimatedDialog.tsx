import React, { useEffect, useState } from "react";
import { Animated, Easing, Modal, Platform } from "react-native";
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
  const [presented, setPresented] = useState(visible);
  const [progress] = useState(() => new Animated.Value(0));
  // Keep the last contents while fading out, so closing never flashes an empty card.
  const [last, setLast] = useState({ children, overlayColor });
  useEffect(() => {
    if (reduced) {
      progress.setValue(visible ? 1 : 0);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setPresented(false);
    });
    return () => animation.stop();
  }, [visible, reduced, progress]);
  // Track changed props during render so opening does not wait for a second
  // effect pass; retain the previous card only for its short exit transition.
  if (visible && !presented) setPresented(true);
  if (!visible && reduced && presented) setPresented(false);
  if (
    visible &&
    (last.children !== children || last.overlayColor !== overlayColor)
  ) {
    setLast({ children, overlayColor });
  }
  if (!presented || (!visible && reduced)) return null;
  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onRequestClose}
      onShow={onShow}
    >
      <Animated.View
        style={[
          s.overlay,
          {
            backgroundColor: visible ? overlayColor : last.overlayColor,
            opacity: progress,
          },
        ]}
      >
        <Animated.View
          accessibilityViewIsModal
          pointerEvents={visible ? "auto" : "none"}
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
          {visible ? children : last.children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
