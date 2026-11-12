import { RAMP_RETURN_URL } from "@/ramp/config";

export type RampLinkKind = "handoff" | "return";

export function rampLinkKind(url: string): RampLinkKind | null {
  if (url !== RAMP_RETURN_URL && !url.startsWith(`${RAMP_RETURN_URL}?`)) {
    return null;
  }
  const query = url.slice(RAMP_RETURN_URL.length + 1).split("#")[0] ?? "";
  return new URLSearchParams(query).has("requestId") ? "handoff" : "return";
}
