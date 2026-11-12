import { rampLinkKind } from "@/ramp/links";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    return rampLinkKind(path) === null ? path : null;
  } catch {
    return path;
  }
}
