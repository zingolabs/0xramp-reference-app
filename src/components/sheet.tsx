import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  SlideInDown,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { useColors } from "@/constants/colors";

const PANEL_RADIUS = 28;
const GRABBER_WIDTH = 32;
const GRABBER_HEIGHT = 4;
const SCRIM_OPACITY = 0.45;
const DISMISS_FRACTION = 0.3;
const FLING_VELOCITY = 900;
const UPWARD_RESISTANCE = 0.15;
const PANEL_OVERHANG = 160;
const ENTER_EASING = Easing.bezier(0.05, 0.7, 0.1, 1);
const EXIT_EASING = Easing.bezier(0.4, 0, 1, 1);
const PANEL_ENTERING = SlideInDown.duration(300).easing(ENTER_EASING.factory());

export function Sheet({ children }: { children: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduced = useReducedMotion();
  const dragY = useSharedValue(0);
  const panelHeight = useSharedValue(0);

  function close() {
    router.back();
  }

  function measure(event: LayoutChangeEvent) {
    panelHeight.set(event.nativeEvent.layout.height - PANEL_OVERHANG);
  }

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      dragY.set(
        event.translationY > 0 ? event.translationY : event.translationY * UPWARD_RESISTANCE,
      );
    })
    .onEnd((event) => {
      const height = Math.max(panelHeight.get(), 1);
      const committed =
        event.velocityY > FLING_VELOCITY || event.translationY > height * DISMISS_FRACTION;

      if (committed) {
        dragY.set(
          withTiming(height, { duration: 180, easing: EXIT_EASING }, (finished) => {
            if (finished) {
              scheduleOnRN(close);
            }
          }),
        );
        return;
      }

      dragY.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: event.velocityY }));
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.get() }],
  }));

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      dragY.get(),
      [0, Math.max(panelHeight.get(), 1)],
      [SCRIM_OPACITY, 0],
      Extrapolation.CLAMP,
    ),
  }));

  if (process.env.EXPO_OS !== "android") {
    return children;
  }

  return (
    <View style={styles.screen}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={close}
        style={styles.dismissArea}
      />

      <GestureDetector gesture={pan}>
        <Animated.View style={panelStyle}>
          <Animated.View
            entering={reduced ? undefined : PANEL_ENTERING}
            onLayout={measure}
            style={[
              styles.panel,
              {
                backgroundColor: colors.raised,
                paddingBottom: insets.bottom + 8 + PANEL_OVERHANG,
                marginBottom: -PANEL_OVERHANG,
              },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.textMuted }]} />
            {children}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    backgroundColor: "#000000",
  },
  dismissArea: {
    flex: 1,
  },
  panel: {
    paddingTop: 10,
    borderTopLeftRadius: PANEL_RADIUS,
    borderTopRightRadius: PANEL_RADIUS,
    borderCurve: "continuous",
  },
  grabber: {
    alignSelf: "center",
    width: GRABBER_WIDTH,
    height: GRABBER_HEIGHT,
    borderRadius: GRABBER_HEIGHT / 2,
    opacity: 0.4,
  },
});
