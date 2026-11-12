import { Image } from "expo-image";
import qrcode from "qrcode-generator";
import { StyleSheet, View } from "react-native";

const QUIET_ZONE = 4;
const DARK = "#000000";
const LIGHT = "#FFFFFF";

function qrSvg(value: string): string {
  const code = qrcode(0, "M");
  code.addData(value, "Byte");
  code.make();
  const count = code.getModuleCount();
  const size = count + QUIET_ZONE * 2;
  let path = "";
  for (let row = 0; row < count; row += 1) {
    let col = 0;
    while (col < count) {
      if (!code.isDark(row, col)) {
        col += 1;
        continue;
      }
      const start = col;
      while (col < count && code.isDark(row, col)) {
        col += 1;
      }
      path += `M${start + QUIET_ZONE} ${row + QUIET_ZONE}h${col - start}v1h-${col - start}z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="${LIGHT}"/>` +
    `<path d="${path}" fill="${DARK}"/>` +
    `</svg>`
  );
}

export function QrCode({ value, size, label }: { value: string; size: number; label: string }) {
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(value))}`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={[styles.frame, { width: size, height: size }]}>
      <Image source={{ uri }} contentFit="contain" recyclingKey={value} style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: "center",
    overflow: "hidden",
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: LIGHT,
  },
  image: {
    flex: 1,
  },
});
