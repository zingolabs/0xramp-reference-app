import { openAuthSessionAsync } from "expo-web-browser";

import type { Colors } from "@/constants/colors";
import { RAMP_RETURN_URL } from "@/ramp/config";

export async function openPane(url: string, colors: Colors): Promise<string | null> {
  const result = await openAuthSessionAsync(url, RAMP_RETURN_URL, {
    preferEphemeralSession: false,
    dismissButtonStyle: "done",
    controlsColor: colors.accentText,
    toolbarColor: colors.raised,
    secondaryToolbarColor: colors.canvas,
  });
  return result.type === "success" ? result.url : null;
}
