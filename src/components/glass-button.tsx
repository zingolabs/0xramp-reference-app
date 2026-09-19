import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { PressableFeedback } from "@/components/pressable-feedback";
import type { Colors } from "@/constants/colors";

type Props = {
  label: string;
  onPress?: () => void;
  tintColor: string;
  labelColor: string;
  busy?: boolean;
  disabled?: boolean;
};

const HAS_GLASS = isGlassEffectAPIAvailable();
const CAPTION_HIT_SLOP = { top: 8, left: 8, right: 8, bottom: 32 };

export function GlassButton({
  label,
  onPress,
  tintColor,
  labelColor,
  busy = false,
  disabled = false,
}: Props) {
  const content = busy ? (
    <ActivityIndicator color={labelColor} />
  ) : (
    <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
  );

  if (!HAS_GLASS) {
    return (
      <PressableFeedback
        onPress={onPress}
        busy={busy}
        disabled={disabled}
        accessibilityLabel={label}
        style={[styles.shape, { backgroundColor: tintColor }]}
      >
        {content}
      </PressableFeedback>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
    >
      <GlassView isInteractive tintColor={tintColor} style={styles.shape}>
        {content}
      </GlassView>
    </Pressable>
  );
}

type IconProps = {
  label: string;
  icon: SymbolViewProps["name"];
  colors: Colors;
  prominent?: boolean;
  onPress?: () => void;
};

export function GlassIconButton({ label, icon, colors, prominent = false, onPress }: IconProps) {
  const symbol = (
    <SymbolView
      name={icon}
      size={22}
      weight="medium"
      tintColor={prominent ? colors.onAccent : colors.text}
    />
  );
  const caption = (
    <Text
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.caption, { color: colors.text }]}
    >
      {label}
    </Text>
  );

  if (!HAS_GLASS) {
    return (
      <View style={styles.iconAction}>
        <PressableFeedback
          onPress={onPress}
          accessibilityLabel={label}
          hitSlop={CAPTION_HIT_SLOP}
          style={[
            styles.circle,
            { backgroundColor: prominent ? colors.accent : colors.controlFill },
          ]}
        >
          {symbol}
        </PressableFeedback>
        {caption}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.iconAction}
    >
      <GlassView
        isInteractive
        tintColor={prominent ? colors.accent : undefined}
        style={styles.circle}
      >
        {symbol}
      </GlassView>
      {caption}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shape: {
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 17,
    fontWeight: "600",
  },
  iconAction: {
    width: 72,
    alignItems: "center",
    gap: 8,
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    fontSize: 13,
    fontWeight: "500",
  },
});
