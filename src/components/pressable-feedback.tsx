import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { css, cubicBezier, useReducedMotion } from "react-native-reanimated";

import { useColors } from "@/constants/colors";

type Props = {
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  hitSlop?: PressableProps["hitSlop"];
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

export function PressableFeedback(props: Props) {
  return process.env.EXPO_OS === "android" ? (
    <RipplePressable {...props} />
  ) : (
    <ScalePressable {...props} />
  );
}

function RipplePressable({
  onPress,
  disabled = false,
  busy = false,
  accessibilityLabel,
  hitSlop = 12,
  style,
  children,
}: Props) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      hitSlop={hitSlop}
      android_ripple={{ color: colors.ripple, foreground: true }}
      style={[style, rippleStyles.clip]}
    >
      {children}
    </Pressable>
  );
}

function ScalePressable({
  onPress,
  disabled = false,
  busy = false,
  accessibilityLabel,
  hitSlop = 12,
  style,
  children,
}: Props) {
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={hitSlop}
      pressRetentionOffset={16}
    >
      <Animated.View
        style={[scaleStyles.base, style, pressed && (reduced ? scaleStyles.dimmed : scaleStyles.pressed)]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

const rippleStyles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
});

const scaleStyles = css.create({
  base: {
    opacity: 1,
    transform: [{ scale: 1 }],
    transitionProperty: ["transform", "opacity"],
    transitionDuration: "120ms",
    transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
  },
  pressed: { transform: [{ scale: 0.97 }] },
  dimmed: { opacity: 0.6 },
});
