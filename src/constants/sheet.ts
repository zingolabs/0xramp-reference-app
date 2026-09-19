import { isGlassEffectAPIAvailable } from "expo-glass-effect";

export const HAS_FLOATING_SHEETS = process.env.EXPO_OS === "ios" && isGlassEffectAPIAvailable();
