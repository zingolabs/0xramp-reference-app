import { Fragment, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors, type Colors } from "@/constants/colors";

const ROW_HEIGHT = 44;
const GROUP_RADIUS = 12;
const GROUP_INSET = 20;
const ROW_INSET = 16;

type RowProps = {
  label: string;
  value?: string;
  destructive?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

export function ListGroup({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const colors = useColors();
  const rows = Array.isArray(children) ? children : [children];

  return (
    <View style={styles.group}>
      {title && (
        <Text style={[styles.groupTitle, { color: colors.textMuted }]}>{title}</Text>
      )}

      <View style={[styles.rows, { backgroundColor: colors.raised }]}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <View style={[styles.separator, { backgroundColor: colors.raisedEdge }]} />
            )}
            {row}
          </Fragment>
        ))}
      </View>

      {footer && <Text style={[styles.groupFooter, { color: colors.textMuted }]}>{footer}</Text>}
    </View>
  );
}

export function ListRow({ label, value, destructive, busy, disabled, onPress }: RowProps) {
  const colors = useColors();
  const content = <RowContent label={label} value={value} destructive={destructive} busy={busy} colors={colors} />;

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      android_ripple={{ color: colors.ripple }}
      style={({ pressed }) => [
        styles.row,
        pressed && process.env.EXPO_OS !== "android" && { backgroundColor: colors.controlFill },
      ]}
    >
      {content}
    </Pressable>
  );
}

function RowContent({
  label,
  value,
  destructive,
  busy,
  colors,
}: RowProps & { colors: Colors }) {
  return (
    <>
      <Text
        style={[
          styles.label,
          destructive && styles.destructiveLabel,
          { color: destructive ? colors.danger : colors.text },
        ]}
      >
        {label}
      </Text>
      {busy ? (
        <ActivityIndicator color={colors.textMuted} />
      ) : (
        value && (
          <Text numberOfLines={1} style={[styles.value, { color: colors.textMuted }]}>
            {value}
          </Text>
        )
      )}
    </>
  );
}

const styles = StyleSheet.create({
  group: {
    marginTop: 28,
  },
  groupTitle: {
    marginHorizontal: GROUP_INSET + ROW_INSET,
    marginBottom: 7,
    fontSize: 13,
    letterSpacing: 0.1,
  },
  rows: {
    marginHorizontal: GROUP_INSET,
    borderRadius: GROUP_RADIUS,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: ROW_INSET,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: ROW_INSET,
    paddingVertical: 11,
  },
  label: {
    fontSize: 17,
  },
  destructiveLabel: {
    flex: 1,
    textAlign: "center",
    fontWeight: "500",
  },
  value: {
    flexShrink: 1,
    fontSize: 17,
  },
  groupFooter: {
    marginHorizontal: GROUP_INSET + ROW_INSET,
    marginTop: 7,
    fontSize: 13,
    lineHeight: 18,
  },
});
