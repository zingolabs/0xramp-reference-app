import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/glass-button";
import { PressableFeedback } from "@/components/pressable-feedback";
import { Sheet } from "@/components/sheet";
import { useColors } from "@/constants/colors";
import { HAS_FLOATING_SHEETS } from "@/constants/sheet";
import { toWalletError } from "@/wallet/wallet-backend";
import { useWallet } from "@/wallet/wallet-context";

const SHEET_BOTTOM_PADDING = (bottomInset: number) =>
  process.env.EXPO_OS === "android" ? 8 : HAS_FLOATING_SHEETS ? 24 : bottomInset + 16;

export default function SwitchWallet() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { switchWallet } = useWallet();
  const [switching, setSwitching] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function confirm() {
    setSwitching(true);
    setFailure(null);
    try {
      await switchWallet();
    } catch (error) {
      setSwitching(false);
      setFailure(toWalletError(error).reason);
    }
  }

  return (
    <Sheet>
      <View
        style={[
          styles.sheet,
          { paddingBottom: SHEET_BOTTOM_PADDING(insets.bottom) },
        ]}
      >
        <View style={styles.heading}>
          <SymbolView
            name={{ ios: "exclamationmark.triangle.fill", android: "warning", web: "warning" }}
            size={22}
            weight="semibold"
            tintColor={colors.danger}
          />
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            Switch wallet?
          </Text>
        </View>

        <Text style={[styles.body, { color: colors.text }]}>
          This wallet is removed from this device. Without its seed phrase you cannot open it again.
        </Text>

        {failure && (
          <Text selectable style={[styles.failure, { color: colors.warning }]}>
            {failure}
          </Text>
        )}

        <View style={styles.actions}>
          <GlassButton
            label="Switch wallet"
            onPress={confirm}
            busy={switching}
            tintColor={colors.danger}
            labelColor={colors.onAccent}
          />
          <PressableFeedback
            onPress={() => router.back()}
            disabled={switching}
            accessibilityLabel="Cancel"
            style={styles.cancel}
          >
            <Text style={[styles.cancelLabel, { color: colors.text }]}>Cancel</Text>
          </PressableFeedback>
        </View>
        </View>
    </Sheet>
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
  body: {
    fontSize: 16,
    lineHeight: 22,
  },
  failure: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    marginTop: 12,
    gap: 4,
  },
  cancel: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  cancelLabel: {
    fontSize: 17,
    fontWeight: "600",
  },
});
