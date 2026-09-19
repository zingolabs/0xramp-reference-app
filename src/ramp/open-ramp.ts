import { createURL } from "expo-linking";
import { openAuthSessionAsync } from "expo-web-browser";

import type { Colors } from "@/constants/colors";

const RAMP_URL = "https://0xramp.app";
const RAMP_RETURN_PATH = "ramp";

export async function openRamp(colors: Colors): Promise<void> {
  await openAuthSessionAsync(RAMP_URL, createURL(RAMP_RETURN_PATH), {
    preferEphemeralSession: false,
    dismissButtonStyle: "done",
    controlsColor: colors.accentText,
    toolbarColor: colors.raised,
    secondaryToolbarColor: colors.canvas,
  });
}
