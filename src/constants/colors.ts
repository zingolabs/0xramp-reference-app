import { useColorScheme } from "react-native";

const light = {
  canvas: "#F5F5F5",
  text: "#1C1C1E",
  textMuted: "#6E6E73",
  accent: "#239B56",
  accentText: "#239B56",
  onAccent: "#FFFFFF",
  warning: "#D97706",
  danger: "#D70015",
  raised: "#FFFFFF",
  raisedShade: "#F6F6F8",
  raisedEdge: "rgba(0, 0, 0, 0.07)",
  raisedShadow: "0 1px 1px rgba(0, 0, 0, 0.02), 0 8px 20px -12px rgba(0, 0, 0, 0.12)",
  recessed: "#EDEDF0",
  chipShadow: "0 1px 2px rgba(0, 0, 0, 0.08)",
  controlFill: "#EDEDF0",
  ripple: "rgba(0, 0, 0, 0.12)",
};

const dark: typeof light = {
  canvas: "#000000",
  text: "#F5F5F7",
  textMuted: "#98989F",
  accent: "#239B56",
  accentText: "#5CC98A",
  onAccent: "#FFFFFF",
  warning: "#FF9F0A",
  danger: "#FF453A",
  raised: "#1C1C1E",
  raisedShade: "#161618",
  raisedEdge: "rgba(255, 255, 255, 0.08)",
  raisedShadow: "0 14px 28px -14px rgba(0, 0, 0, 0.9)",
  recessed: "#000000",
  chipShadow: "0 0 0 1px rgba(255, 255, 255, 0.06)",
  controlFill: "#2C2C2E",
  ripple: "rgba(255, 255, 255, 0.16)",
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}
