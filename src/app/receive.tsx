import * as Clipboard from "expo-clipboard";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { Platform, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/glass-button";
import { PressableFeedback } from "@/components/pressable-feedback";
import { QrCode } from "@/components/qr-code";
import { Sheet } from "@/components/sheet";
import { useColors } from "@/constants/colors";
import { HAS_FLOATING_SHEETS } from "@/constants/sheet";
import { walletBackend } from "@/wallet/backend";
import { toWalletError } from "@/wallet/wallet-backend";

const MONO_FONT = Platform.select({ ios: "Menlo", default: "monospace" });
const ADDRESS_PREFIX_LENGTH = 2;
const ADDRESS_PREFIX_GAP = 6;
const COPIED_RESET_MS = 1_500;
const QR_SIZE = 240;
const SHEET_BOTTOM_PADDING = (bottomInset: number) =>
  process.env.EXPO_OS === "android" ? 8 : HAS_FLOATING_SHEETS ? 24 : bottomInset + 16;

export default function Receive() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [address, setAddress] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let current = true;
    walletBackend.unifiedAddress().then(
      (next) => {
        if (current) {
          setAddress(next);
        }
      },
      (error) => {
        if (current) {
          setFailure(toWalletError(error).reason);
        }
      },
    );
    return () => {
      current = false;
    };
  }, []);

  async function copy() {
    if (!address) {
      return;
    }
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  function share() {
    if (address) {
      void Share.share({ message: address });
    }
  }

  return (
    <Sheet>
      <View style={[styles.sheet, { paddingBottom: SHEET_BOTTOM_PADDING(insets.bottom) }]}>
        <View style={styles.heading}>
          <SymbolView
            name={{ ios: "arrow.down.left", android: "call_received", web: "call_received" }}
            size={22}
            weight="semibold"
            tintColor={colors.accentText}
          />
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            Receive
          </Text>
        </View>

        <Text style={[styles.body, { color: colors.text }]}>
          Send ZEC to this shielded address. It arrives as pending and becomes spendable after a few confirmations.
        </Text>

        {address ? (
          <QrCode value={address} size={QR_SIZE} label="QR code of the shielded address" />
        ) : (
          <View style={[styles.qrPlaceholder, { backgroundColor: colors.controlFill }]} />
        )}

        <View style={[styles.addressBox, { backgroundColor: colors.controlFill }]}>
          {address ? (
            <Text selectable accessibilityLabel={address} style={[styles.address, { color: colors.text }]}>
              <Text style={[styles.addressPrefix, { color: colors.accentText }]}>
                {address.slice(0, ADDRESS_PREFIX_LENGTH)}
              </Text>
              <View style={styles.addressGap} />
              {address.slice(ADDRESS_PREFIX_LENGTH)}
            </Text>
          ) : (
            <Text style={[styles.address, { color: failure ? colors.warning : colors.textMuted }]}>
              {failure ?? "Deriving the address…"}
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          <GlassButton
            label={copied ? "Copied" : "Copy address"}
            onPress={() => void copy()}
            disabled={!address}
            tintColor={colors.accent}
            labelColor={colors.onAccent}
          />
          <PressableFeedback
            onPress={share}
            disabled={!address}
            accessibilityLabel="Share address"
            style={styles.secondary}
          >
            <Text style={[styles.secondaryLabel, { color: colors.text }]}>Share</Text>
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
  qrPlaceholder: {
    alignSelf: "center",
    width: QR_SIZE,
    height: QR_SIZE,
    borderRadius: 16,
    borderCurve: "continuous",
  },
  addressBox: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderCurve: "continuous",
  },
  address: {
    fontFamily: MONO_FONT,
    fontSize: 14,
    lineHeight: 20,
  },
  addressPrefix: {
    fontWeight: "700",
  },
  addressGap: {
    width: ADDRESS_PREFIX_GAP,
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
});
