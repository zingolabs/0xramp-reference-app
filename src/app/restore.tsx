import { useHeaderHeight } from "expo-router/react-navigation";
import { useState, type ReactNode } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/glass-button";
import { useColors, type Colors } from "@/constants/colors";
import { toWalletError } from "@/wallet/wallet-backend";
import { useWallet } from "@/wallet/wallet-context";
import { walletErrorMessage } from "@/wallet/wallet-error-message";

const FIELD_RADIUS = 16;

function seedWords(seedPhrase: string): string[] {
  return seedPhrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function wordCountHint(count: number): string | undefined {
  if (count === 0) {
    return undefined;
  }
  return count === 1 ? "1 word" : `${count} words`;
}

export default function Restore() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { restoreWallet } = useWallet();
  const [seedPhrase, setSeedPhrase] = useState("");
  const [birthday, setBirthday] = useState("");
  const [restoring, setRestoring] = useState(false);

  const words = seedWords(seedPhrase);
  const complete = words.length > 0 && birthday.length > 0;

  async function restore() {
    setRestoring(true);
    try {
      await restoreWallet(words.join(" "), Number(birthday));
    } catch (error) {
      setRestoring(false);
      Alert.alert("Could not import wallet", walletErrorMessage(toWalletError(error)));
    }
  }

  const inputStyle = [
    styles.input,
    {
      color: colors.text,
      backgroundColor: colors.raised,
      borderColor: colors.raisedEdge,
      boxShadow: colors.chipShadow,
    },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: headerHeight + 12, paddingBottom: insets.bottom + 16 },
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={[styles.intro, { color: colors.textMuted }]}>
        Enter the seed phrase and the birthday of the wallet. The wallet then scans the chain from
        its birthday.
      </Text>

      <Field
        label="Seed phrase"
        hint={wordCountHint(words.length)}
        colors={colors}
      >
        <TextInput
          value={seedPhrase}
          onChangeText={setSeedPhrase}
          editable={!restoring}
          multiline
          placeholder="Words separated by spaces"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          importantForAutofill="no"
          textAlignVertical="top"
          accessibilityLabel="Seed phrase"
          style={[inputStyle, styles.seedInput]}
        />
      </Field>

      <Field
        label="Birthday height"
        hint="The block height where the wallet's history begins."
        colors={colors}
      >
        <TextInput
          value={birthday}
          onChangeText={(text) => setBirthday(text.replace(/\D/g, ""))}
          editable={!restoring}
          keyboardType="number-pad"
          placeholder="Block height"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          autoComplete="off"
          importantForAutofill="no"
          accessibilityLabel="Birthday height"
          style={[inputStyle, styles.birthdayInput]}
        />
      </Field>

      <View style={styles.spacer} />

      <GlassButton
        label="Import"
        onPress={restore}
        busy={restoring}
        disabled={!complete}
        tintColor={complete ? colors.accent : colors.controlFill}
        labelColor={complete ? colors.onAccent : colors.textMuted}
      />
    </ScrollView>
  );
}

function Field({
  label,
  hint,
  colors,
  children,
}: {
  label: string;
  hint?: string;
  colors: Colors;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {children}
      {hint && <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    gap: 24,
  },
  intro: {
    fontSize: 15,
    lineHeight: 21,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: FIELD_RADIUS,
    borderCurve: "continuous",
    paddingHorizontal: 16,
    fontSize: 17,
  },
  seedInput: {
    minHeight: 132,
    paddingTop: 14,
    paddingBottom: 14,
    lineHeight: 24,
  },
  birthdayInput: {
    height: 52,
    fontVariant: ["tabular-nums"],
  },
  hint: {
    fontSize: 13,
  },
  spacer: {
    flex: 1,
  },
});
