import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type ColorSchemeName,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AsciiEmptyOrbit } from "@/components/ascii-art";
import { GlassIconButton } from "@/components/glass-button";
import { HISTORY_ROW_INSET, HistoryRow, historyEntryKey } from "@/components/history-row";
import { PressableFeedback } from "@/components/pressable-feedback";
import { useColors, type Colors } from "@/constants/colors";
import { useMaterialSymbolSource } from "@/hooks/use-material-symbol-source";
import { openRamp } from "@/ramp/open-ramp";
import { formatZec } from "@/wallet/history";
import type { Balance, SyncState } from "@/wallet/wallet-backend";
import { useWallet } from "@/wallet/wallet-context";

const PANEL_RADIUS = 28;
const PANEL_GRADIENT = {
  dark: require("../../assets/images/panel-gradient-dark.png"),
  light: require("../../assets/images/panel-gradient-light.png"),
};
const BALANCE_ACCESSORY_WIDTH = 28;
const WARNING_ICON: SymbolViewProps["name"] = {
  ios: "exclamationmark.triangle.fill",
  android: "warning",
  web: "warning",
};
const UNSHIELDED_ICON: SymbolViewProps["name"] = {
  ios: "shield.slash",
  android: "remove_moderator",
  web: "remove_moderator",
};

export default function Home() {
  const colors = useColors();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const { balance, history, syncState } = useWallet();
  const androidSettingsIcon = useMaterialSymbolSource("settings");

  async function startRamp() {
    try {
      await openRamp(colors);
    } catch {
      Alert.alert("Could not open 0xramp", "Check your connection and try again.");
    }
  }

  return (
    <>
      {(process.env.EXPO_OS === "ios" || androidSettingsIcon) && (
        <Stack.Toolbar key={scheme ?? "unspecified"} placement="right">
          <Stack.Toolbar.Button
            icon={process.env.EXPO_OS === "ios" ? "gearshape" : androidSettingsIcon}
            tintColor={colors.text}
            accessibilityLabel="Settings"
            onPress={() => router.push("/settings")}
          />
        </Stack.Toolbar>
      )}

      <View style={styles.screen}>
        <Summary
          colors={colors}
          scheme={scheme}
          balance={balance}
          syncState={syncState}
          topInset={headerHeight}
          onShowSyncError={() => router.push("/sync-error")}
          onOpenRamp={startRamp}
        />

        <FlatList
          data={history}
          keyExtractor={historyEntryKey}
          renderItem={({ item }) => <HistoryRow entry={item} colors={colors} />}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.raisedEdge }]} />
          )}
          alwaysBounceVertical
          overScrollMode="always"
          style={styles.history}
          contentContainerStyle={[styles.historyContent, { paddingBottom: insets.bottom }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AsciiEmptyOrbit />
              {syncState.firstSyncComplete && (
                <Text style={[styles.emptyLabel, { color: colors.textMuted }]}>
                  No transactions yet
                </Text>
              )}
            </View>
          }
        />
      </View>
    </>
  );
}

function Summary({
  colors,
  scheme,
  balance,
  syncState,
  topInset,
  onShowSyncError,
  onOpenRamp,
}: {
  scheme: ColorSchemeName;
  colors: Colors;
  balance: Balance;
  syncState: SyncState;
  topInset: number;
  onShowSyncError: () => void;
  onOpenRamp: () => void;
}) {
  const formatted = formatZec(balance.spendableZats);
  const settled = syncState.firstSyncComplete;
  const failed = syncState.phase === "failed";

  return (
    <View
      style={[
        styles.summary,
        {
          paddingTop: topInset,
          backgroundColor: colors.raised,
          experimental_backgroundImage:
            process.env.EXPO_OS === "android"
              ? undefined
              : `linear-gradient(to bottom, ${colors.raised}, ${colors.raisedShade})`,
          borderColor: colors.raisedEdge,
          boxShadow: colors.raisedShadow,
        },
      ]}
    >
      {process.env.EXPO_OS === "android" && (
        <Image
          source={scheme === "dark" ? PANEL_GRADIENT.dark : PANEL_GRADIENT.light}
          contentFit="fill"
          style={styles.panelGradient}
        />
      )}

      <View style={styles.balanceRow}>
        <View style={styles.balanceAccessory} />
        <Text
          accessibilityLabel={`Balance ${formatted} ZEC${settled ? "" : ", syncing"}`}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.balance, { color: colors.text }, !settled && styles.unsettled]}
        >
          {formatted}
          <Text style={[styles.unit, { color: colors.textMuted }]}> ZEC</Text>
        </Text>
        <View style={styles.balanceAccessory}>
          {failed ? (
            <PressableFeedback onPress={onShowSyncError} accessibilityLabel="Sync failed, show details">
              <SymbolView name={WARNING_ICON} size={22} weight="semibold" tintColor={colors.warning} />
            </PressableFeedback>
          ) : (
            !settled && <ActivityIndicator color={colors.textMuted} />
          )}
        </View>
      </View>

      {balance.unshieldedZats > 0 && (
        <View
          accessible
          accessibilityLabel={`Unshielded ${formatZec(balance.unshieldedZats)} ZEC`}
          style={styles.unshielded}
        >
          <SymbolView name={UNSHIELDED_ICON} size={13} weight="semibold" tintColor={colors.textMuted} />
          <Text style={[styles.unshieldedAmount, { color: colors.textMuted }]}>
            {formatZec(balance.unshieldedZats)}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <GlassIconButton
          label="Add"
          icon={{ ios: "plus", android: "add", web: "add" }}
          colors={colors}
          prominent
          onPress={onOpenRamp}
        />
        <GlassIconButton
          label="Receive"
          icon={{ ios: "qrcode.viewfinder", android: "qr_code_scanner", web: "qr_code_scanner" }}
          colors={colors}
        />
        <GlassIconButton
          label="Send"
          icon={{ ios: "paperplane", android: "send", web: "send" }}
          colors={colors}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  summary: {
    zIndex: 1,
    overflow: "hidden",
    alignItems: "center",
    paddingBottom: 32,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: PANEL_RADIUS,
    borderBottomRightRadius: PANEL_RADIUS,
    borderCurve: "continuous",
  },
  panelGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  balanceAccessory: {
    width: BALANCE_ACCESSORY_WIDTH,
    alignItems: "center",
  },
  balance: {
    flexShrink: 1,
    fontSize: 56,
    fontWeight: "700",
    letterSpacing: -1.5,
    fontVariant: ["tabular-nums"],
  },
  unsettled: {
    opacity: 0.4,
  },
  unshielded: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  unshieldedAmount: {
    fontSize: 13,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  unit: {
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: 0,
  },
  actions: {
    flexDirection: "row",
    gap: 20,
    marginTop: 24,
  },
  history: {
    marginTop: -PANEL_RADIUS,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: HISTORY_ROW_INSET,
  },
  historyContent: {
    flexGrow: 1,
    paddingTop: PANEL_RADIUS,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingBottom: 48,
  },
  emptyLabel: {
    fontSize: 15,
  },
});
