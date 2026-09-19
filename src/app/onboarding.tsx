import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AsciiPlanet } from "@/components/ascii-art";
import { GlassButton } from "@/components/glass-button";
import { PressableFeedback } from "@/components/pressable-feedback";
import { useColors } from "@/constants/colors";
import { toWalletError } from "@/wallet/wallet-backend";
import { useWallet } from "@/wallet/wallet-context";
import { walletErrorMessage } from "@/wallet/wallet-error-message";

export default function Onboarding() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { createWallet } = useWallet();
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    try {
      await createWallet();
    } catch (error) {
      setCreating(false);
      Alert.alert("Could not create wallet", walletErrorMessage(toWalletError(error)));
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.hero}>
        <AsciiPlanet />
      </View>

      <View style={styles.actions}>
        <GlassButton
          label="Create wallet"
          onPress={create}
          busy={creating}
          tintColor={colors.accent}
          labelColor={colors.onAccent}
        />
        <PressableFeedback
          onPress={() => router.push("/restore")}
          disabled={creating}
          style={styles.secondary}
        >
          <Text style={[styles.secondaryLabel, { color: colors.accentText }]}>Import</Text>
        </PressableFeedback>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    paddingHorizontal: 28,
    gap: 8,
  },
  secondary: {
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryLabel: {
    fontSize: 17,
    fontWeight: "600",
  },
});
