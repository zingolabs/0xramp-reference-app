import { isGlassEffectAPIAvailable } from "expo-glass-effect";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";

import { useColors } from "@/constants/colors";
import { HAS_FLOATING_SHEETS } from "@/constants/sheet";
import { useWallet, WalletProvider } from "@/wallet/wallet-context";

SplashScreen.preventAutoHideAsync();

const ANDROID_SHEET_CORNER_RADIUS = 28;
const HAS_SCROLL_EDGE_EFFECTS = process.env.EXPO_OS === "ios" && isGlassEffectAPIAvailable();

export default function RootLayout() {
  return (
    <WalletProvider>
      <RootStack />
    </WalletProvider>
  );
}

function RootStack() {
  const { status, hasWallet } = useWallet();
  const colors = useColors();
  const base = useColorScheme() === "dark" ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: colors.canvas, card: colors.canvas },
  };

  useEffect(() => {
    if (status !== "checking") {
      SplashScreen.hide();
    }
  }, [status]);

  if (status === "checking") {
    return null;
  }

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!hasWallet}>
          <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
          <Stack.Screen
            name="restore"
            options={{
              headerShown: true,
              title: "Import",
              headerTransparent: true,
              headerShadowVisible: false,
              headerTintColor: colors.text,
              headerBackButtonDisplayMode: "minimal",
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={hasWallet}>
          <Stack.Screen
            name="index"
            options={{
              animation: "fade",
              headerShown: true,
              title: "",
              headerShadowVisible: false,
              headerTransparent: true,
              contentStyle: { backgroundColor: colors.recessed },
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              headerShown: true,
              title: "Settings",
              headerShadowVisible: false,
              headerTransparent: true,
              headerBlurEffect: HAS_SCROLL_EDGE_EFFECTS ? undefined : "systemChromeMaterial",
              scrollEdgeEffects: { top: "soft" },
              headerTintColor: colors.text,
              headerBackButtonDisplayMode: "minimal",
              contentStyle: { backgroundColor: colors.recessed },
            }}
          />
          <Stack.Screen
            name="switch-wallet"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: "fitToContents",
              sheetGrabberVisible: true,
              sheetCornerRadius:
                process.env.EXPO_OS === "android" ? ANDROID_SHEET_CORNER_RADIUS : undefined,
              contentStyle: { backgroundColor: HAS_FLOATING_SHEETS ? "transparent" : colors.raised },
            }}
          />
          <Stack.Screen
            name="sync-error"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: "fitToContents",
              sheetGrabberVisible: true,
              sheetCornerRadius:
                process.env.EXPO_OS === "android" ? ANDROID_SHEET_CORNER_RADIUS : undefined,
              contentStyle: { backgroundColor: HAS_FLOATING_SHEETS ? "transparent" : colors.raised },
            }}
          />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
