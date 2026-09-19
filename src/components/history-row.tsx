import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { StyleSheet, Text, View } from "react-native";

import type { Colors } from "@/constants/colors";
import { formatZec, isIncoming } from "@/wallet/history";
import type { HistoryEntry, HistoryKind } from "@/wallet/wallet-backend";

const PRESENTATION: Record<HistoryKind, { title: string; icon: SymbolViewProps["name"] }> = {
  received: {
    title: "Received",
    icon: { ios: "arrow.down.left", android: "south_west", web: "south_west" },
  },
  sent: {
    title: "Sent",
    icon: { ios: "arrow.up.right", android: "north_east", web: "north_east" },
  },
  shielded: {
    title: "Shielded",
    icon: { ios: "shield.lefthalf.filled", android: "shield", web: "shield" },
  },
};

const PENDING_ICON: SymbolViewProps["name"] = { ios: "clock", android: "schedule", web: "schedule" };

export const HISTORY_ROW_INSET = 20 + 36 + 14;

function formatWhen(timestampMs: number): string {
  const date = new Date(timestampMs);
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

export function historyEntryKey(entry: HistoryEntry): string {
  return `${entry.txid}:${entry.kind}`;
}

export function HistoryRow({ entry, colors }: { entry: HistoryEntry; colors: Colors }) {
  const { title, icon } = PRESENTATION[entry.kind];
  const incoming = isIncoming(entry.kind);
  const detail = entry.pending ? "Pending" : formatWhen(entry.timestampMs);
  const amount = `${incoming ? "+" : "−"}${formatZec(entry.zats)}`;

  return (
    <View
      accessible
      accessibilityLabel={`${title}, ${amount} ZEC, ${detail}`}
      style={[styles.row, entry.pending && styles.pending]}
    >
      <View style={[styles.chip, { backgroundColor: colors.raised, boxShadow: colors.chipShadow }]}>
        <SymbolView name={icon} size={16} weight="semibold" tintColor={colors.text} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <View style={styles.detailRow}>
          {entry.pending && (
            <SymbolView name={PENDING_ICON} size={12} weight="semibold" tintColor={colors.textMuted} />
          )}
          <Text numberOfLines={1} style={[styles.detail, { color: colors.textMuted }]}>
            {detail}
          </Text>
        </View>
      </View>

      <Text style={[styles.amount, { color: incoming ? colors.accentText : colors.text }]}>
        {amount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 64,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  pending: {
    opacity: 0.5,
  },
  chip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detail: {
    flexShrink: 1,
    fontSize: 13,
  },
  amount: {
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
