import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/glass-button";
import { useColors } from "@/constants/colors";
import { HAS_FLOATING_SHEETS } from "@/constants/sheet";
import { useWallet } from "@/wallet/wallet-context";

const MONO_FONT = Platform.select({ ios: "Menlo", default: "monospace" });
const FLOATING_SHEET_BOTTOM_PADDING = 24;

export default function SyncError() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { syncState, retrySync } = useWallet();
  const [failure] = useState(() => ({
    code: syncState.errorCode,
    reason: syncState.errorReason,
  }));

  function retry() {
    router.back();
    retrySync();
  }

  return (
    <View
      style={[
        styles.sheet,
        { paddingBottom: HAS_FLOATING_SHEETS ? FLOATING_SHEET_BOTTOM_PADDING : insets.bottom + 16 },
      ]}
    >
      <View style={styles.heading}>
        <SymbolView
          name={{ ios: "exclamationmark.triangle.fill", android: "warning", web: "warning" }}
          size={22}
          weight="semibold"
          tintColor={colors.warning}
        />
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          Sync failed
        </Text>
      </View>

      <Text selectable style={[styles.reason, { color: colors.text }]}>
        {failure.reason ?? "The wallet could not sync with the indexer."}
      </Text>
      {failure.code && (
        <Text selectable style={[styles.code, { color: colors.textMuted }]}>
          {failure.code}
        </Text>
      )}

      <View style={styles.action}>
        <GlassButton
          label="Retry"
          onPress={retry}
          tintColor={colors.accent}
          labelColor={colors.onAccent}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingTop: 28,
    paddingHorizontal: 24,
    gap: 12,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  reason: {
    fontSize: 16,
    lineHeight: 22,
  },
  code: {
    fontFamily: MONO_FONT,
    fontSize: 13,
  },
  action: {
    marginTop: 12,
  },
});
