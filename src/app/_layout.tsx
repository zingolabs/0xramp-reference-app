import { isGlassEffectAPIAvailable } from "expo-glass-effect";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useColors } from "@/constants/colors";
import { HAS_FLOATING_SHEETS } from "@/constants/sheet";
import { useWallet, WalletProvider } from "@/wallet/wallet-context";

SplashScreen.preventAutoHideAsync();

const SHEET_IS_NATIVE = process.env.EXPO_OS !== "android";

const SHEET_OPTIONS = SHEET_IS_NATIVE
  ? ({
      presentation: "formSheet",
      sheetAllowedDetents: "fitToContents",
      sheetGrabberVisible: true,
    } as const)
  : ({ presentation: "transparentModal", animation: "fade" } as const);
const HAS_SCROLL_EDGE_EFFECTS = process.env.EXPO_OS === "ios" && isGlassEffectAPIAvailable();

export default function RootLayout() {
  return (
    <GestureHandlerRootView>
      <WalletProvider>
        <RootStack />
      </WalletProvider>
    </GestureHandlerRootView>
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
              headerTransparent: process.env.EXPO_OS === "ios",
              headerBlurEffect: HAS_SCROLL_EDGE_EFFECTS ? undefined : "systemChromeMaterial",
              headerStyle:
                process.env.EXPO_OS === "ios" ? undefined : { backgroundColor: colors.recessed },
              scrollEdgeEffects: { top: "soft" },
              headerTintColor: colors.text,
              headerBackButtonDisplayMode: "minimal",
              contentStyle: { backgroundColor: colors.recessed },
            }}
          />
          <Stack.Screen
            name="switch-wallet"
            options={{
              ...SHEET_OPTIONS,
              contentStyle: {
                backgroundColor: SHEET_IS_NATIVE
                  ? HAS_FLOATING_SHEETS
                    ? "transparent"
                    : colors.raised
                  : "transparent",
              },
            }}
          />
          <Stack.Screen
            name="sync-error"
            options={{
              ...SHEET_OPTIONS,
              contentStyle: {
                backgroundColor: SHEET_IS_NATIVE
                  ? HAS_FLOATING_SHEETS
                    ? "transparent"
                    : colors.raised
                  : "transparent",
              },
            }}
          />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
