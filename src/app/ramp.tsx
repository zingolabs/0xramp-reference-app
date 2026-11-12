import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/glass-button";
import { PressableFeedback } from "@/components/pressable-feedback";
import { Sheet } from "@/components/sheet";
import { useColors, type Colors } from "@/constants/colors";
import { HAS_FLOATING_SHEETS } from "@/constants/sheet";
import { RAMP_API_BASE_URL, RAMP_ATTRIBUTION } from "@/ramp/config";
import { useRamp } from "@/ramp/ramp-context";

const MONO_FONT = Platform.select({ ios: "Menlo", default: "monospace" });
const COPIED_RESET_MS = 1_500;
const ADDRESS_PREFIX_LENGTH = 2;
const ADDRESS_HEAD_LENGTH = 6;
const ADDRESS_TAIL_LENGTH = 6;
const ADDRESS_PREFIX_GAP = 6;
const SHEET_BOTTOM_PADDING = (bottomInset: number) =>
  process.env.EXPO_OS === "android" ? 8 : HAS_FLOATING_SHEETS ? 24 : bottomInset + 16;

export default function Ramp() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const ramp = useRamp();
  const [copied, setCopied] = useState(false);

  async function copyRefundAddress() {
    if (!ramp.refundAddress) {
      return;
    }
    await Clipboard.setStringAsync(ramp.refundAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  const origin = new URL(RAMP_API_BASE_URL).host;
  const primaryLabel = ramp.session ? "Reopen 0xramp" : "Open 0xramp";

  return (
    <Sheet>
      <View style={[styles.sheet, { paddingBottom: SHEET_BOTTOM_PADDING(insets.bottom) }]}>
        <View style={styles.heading}>
          <SymbolView
            name={{ ios: "banknote", android: "payments", web: "payments" }}
            size={22}
            weight="semibold"
            tintColor={colors.accentText}
          />
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            Sell ZEC
          </Text>
        </View>

        <Text style={[styles.body, { color: colors.text }]}>
          The sale runs on {origin} in your browser. Copy this refund address first: 0xramp asks for it before a sale.
        </Text>

        <PressableFeedback
          onPress={copyRefundAddress}
          disabled={!ramp.refundAddress}
          accessibilityLabel="Copy refund address"
          style={[styles.addressRow, { backgroundColor: colors.controlFill }]}
        >
          {ramp.refundAddress ? (
            <ShortAddress address={ramp.refundAddress} colors={colors} />
          ) : (
            <Text numberOfLines={1} style={[styles.address, { color: colors.textMuted }]}>
              Deriving a transparent address…
            </Text>
          )}
          <Text style={[styles.copy, { color: colors.accentText }]}>{copied ? "Copied" : "Copy"}</Text>
        </PressableFeedback>

        {ramp.message && (
          <Text selectable style={[styles.message, { color: colors.textMuted }]}>
            {ramp.message}
          </Text>
        )}

        {ramp.pendingSend && (
          <PressableFeedback
            onPress={() => router.push("/ramp-send")}
            accessibilityLabel="Show the waiting send request"
            style={[styles.addressRow, { backgroundColor: colors.controlFill }]}
          >
            <Text style={[styles.copy, { color: colors.warning }]}>A send request is waiting for confirmation</Text>
          </PressableFeedback>
        )}

        {ramp.phase === "idle" && ramp.archive.length > 0 && (
          <View style={styles.archive}>
            <Text style={[styles.archiveTitle, { color: colors.textMuted }]}>Previous sessions</Text>
            {ramp.archive.map((session) => (
              <PressableFeedback
                key={session.sessionRef}
                onPress={() => void ramp.resumeArchived(session.sessionRef)}
                disabled={ramp.busy}
                accessibilityLabel={`Reopen session ${session.sessionRef}`}
                style={[styles.addressRow, { backgroundColor: colors.controlFill }]}
              >
                <Text numberOfLines={1} style={[styles.address, { color: colors.text }]}>
                  {session.sessionRef.slice(0, 8)}… · until {new Date(session.expiresAt).toLocaleDateString()}
                </Text>
                <Text style={[styles.copy, { color: colors.accentText }]}>Reopen</Text>
              </PressableFeedback>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          <GlassButton
            label={primaryLabel}
            onPress={() => void ramp.open()}
            busy={ramp.busy}
            disabled={ramp.phase !== "idle" && ramp.phase !== "active"}
            tintColor={colors.accent}
            labelColor={colors.onAccent}
          />
          {ramp.session && (
            <PressableFeedback
              onPress={() => void ramp.refreshStatus()}
              disabled={ramp.busy}
              accessibilityLabel="Check status"
              style={styles.secondary}
            >
              <Text style={[styles.secondaryLabel, { color: colors.text }]}>Check status</Text>
            </PressableFeedback>
          )}
          {(ramp.session || ramp.phase === "blocked") && (
            <PressableFeedback
              onPress={() => void ramp.forget()}
              disabled={ramp.busy}
              accessibilityLabel="Forget session"
              style={styles.secondary}
            >
              <Text style={[styles.secondaryLabel, { color: colors.danger }]}>Forget session</Text>
            </PressableFeedback>
          )}
        </View>

        <Text style={[styles.attribution, { color: colors.textMuted }]}>{RAMP_ATTRIBUTION}</Text>
      </View>
    </Sheet>
  );
}

function ShortAddress({ address, colors }: { address: string; colors: Colors }) {
  const prefix = address.slice(0, ADDRESS_PREFIX_LENGTH);
  const rest = address.slice(ADDRESS_PREFIX_LENGTH);
  const shortened =
    rest.length > ADDRESS_HEAD_LENGTH + ADDRESS_TAIL_LENGTH
      ? `${rest.slice(0, ADDRESS_HEAD_LENGTH)}…${rest.slice(-ADDRESS_TAIL_LENGTH)}`
      : rest;

  return (
    <Text accessibilityLabel={address} numberOfLines={1} style={[styles.address, { color: colors.text }]}>
      <Text style={[styles.addressPrefix, { color: colors.accentText }]}>{prefix}</Text>
      <View style={styles.addressGap} />
      {shortened}
    </Text>
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
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderCurve: "continuous",
  },
  address: {
    flex: 1,
    fontFamily: MONO_FONT,
    fontSize: 15,
    lineHeight: 20,
  },
  addressPrefix: {
    fontWeight: "700",
  },
  addressGap: {
    width: ADDRESS_PREFIX_GAP,
  },
  copy: {
    fontSize: 15,
    fontWeight: "600",
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
  },
  archive: {
    gap: 8,
  },
  archiveTitle: {
    fontSize: 13,
  },
  actions: {
    marginTop: 12,
    gap: 4,
  },
  secondary: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  secondaryLabel: {
    fontSize: 17,
    fontWeight: "600",
  },
  attribution: {
    textAlign: "center",
    fontSize: 13,
  },
});
