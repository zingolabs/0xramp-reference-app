import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, type ReactNode } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/glass-button";
import { PressableFeedback } from "@/components/pressable-feedback";
import { Sheet } from "@/components/sheet";
import { useColors, type Colors } from "@/constants/colors";
import { HAS_FLOATING_SHEETS } from "@/constants/sheet";
import { useRamp, type PendingSend } from "@/ramp/ramp-context";
import { formatZec } from "@/wallet/history";

const MONO_FONT = Platform.select({ ios: "Menlo", default: "monospace" });
const SHEET_BOTTOM_PADDING = (bottomInset: number) =>
  process.env.EXPO_OS === "android" ? 8 : HAS_FLOATING_SHEETS ? 24 : bottomInset + 16;

export default function RampSend() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const ramp = useRamp();
  const pending = ramp.pendingSend;
  const latest = useRef(ramp);
  latest.current = ramp;
  const closed = useRef(false);

  useEffect(() => {
    if (pending === null && !closed.current) {
      closed.current = true;
      if (router.canGoBack()) {
        router.back();
      }
    }
  }, [pending, router]);

  useEffect(
    () => () => {
      const current = latest.current.pendingSend;
      if (current && !current.sending) {
        void latest.current.declineSend();
      }
    },
    [],
  );

  return (
    <Sheet>
      <View style={[styles.sheet, { paddingBottom: SHEET_BOTTOM_PADDING(insets.bottom) }]}>
        <View style={styles.heading}>
          <SymbolView
            name={{ ios: "paperplane.fill", android: "send", web: "send" }}
            size={22}
            weight="semibold"
            tintColor={colors.accentText}
          />
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            Confirm sale deposit
          </Text>
        </View>

        {pending ? <Details pending={pending} colors={colors} /> : null}

        {ramp.message && (
          <Text selectable style={[styles.message, { color: colors.textMuted }]}>
            {ramp.message}
          </Text>
        )}

        <View style={styles.actions}>
          <GlassButton
            label="Send ZEC"
            onPress={() => void ramp.confirmSend()}
            busy={pending?.sending ?? false}
            disabled={pending === null || pending.proposal === null}
            tintColor={colors.accent}
            labelColor={colors.onAccent}
          />
          <PressableFeedback
            onPress={() => void ramp.declineSend()}
            disabled={pending === null || pending.sending}
            accessibilityLabel="Decline"
            style={styles.cancel}
          >
            <Text style={[styles.cancelLabel, { color: colors.text }]}>Decline</Text>
          </PressableFeedback>
        </View>
      </View>
    </Sheet>
  );
}

function Details({ pending, colors }: { pending: PendingSend; colors: Colors }) {
  const amountZats = Number(pending.request.amountZat);
  const deadline = new Date(pending.deadline).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <View style={styles.details}>
      <Text style={[styles.body, { color: colors.text }]}>
        0xramp asks for exactly {formatZec(amountZats)} ZEC at its deposit address. Confirm before {deadline}.
      </Text>
      <Row label="To" colors={colors}>
        <Text selectable numberOfLines={2} style={[styles.address, { color: colors.text }]}>
          {pending.request.address}
        </Text>
      </Row>
      <Row label="Amount" colors={colors}>
        <Text style={[styles.value, { color: colors.text }]}>{formatZec(amountZats)} ZEC</Text>
      </Row>
      <Row label="Network fee" colors={colors}>
        {pending.proposal ? (
          <Text style={[styles.value, { color: colors.text }]}>{formatZec(pending.proposal.feeZats)} ZEC</Text>
        ) : pending.proposalError ? (
          <Text selectable style={[styles.value, { color: colors.warning }]}>
            {pending.proposalError}
          </Text>
        ) : (
          <ActivityIndicator color={colors.textMuted} />
        )}
      </Row>
      {pending.proposal && (
        <Row label="Total" colors={colors}>
          <Text style={[styles.value, styles.total, { color: colors.text }]}>
            {formatZec(pending.proposal.totalZats)} ZEC
          </Text>
        </Row>
      )}
    </View>
  );
}

function Row({ label, colors, children }: { label: string; colors: Colors; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.rowValue}>{children}</View>
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
  body: {
    fontSize: 16,
    lineHeight: 22,
  },
  details: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  rowValue: {
    flex: 1,
    alignItems: "flex-end",
  },
  label: {
    fontSize: 15,
  },
  value: {
    fontSize: 15,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  total: {
    fontWeight: "600",
  },
  address: {
    fontFamily: MONO_FONT,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "right",
  },
  message: {
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
