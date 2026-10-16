import { lookById } from "./mapStyles";
import type { Scene, TransportId } from "./types";

/**
 * Line colours that read well on the chosen map. A transport whose colour is "auto" takes the
 * palette for pale maps (strong, darker tones that stand out on Road atlas and other light
 * looks) or for dark maps (the bright signal colours). A picked colour is used as it is.
 */
const ON_BRIGHT: Record<TransportId, string> = {
  arrow: "#1F2937",
  walk: "#4338CA",
  bicycle: "#0F766E",
  motorcycle: "#C2410C",
  car: "#D7263D",
  bus: "#7E22CE",
  train: "#1E3A8A",
  boat: "#0B5394",
  plane: "#111111",
  balloon: "#BE185D",
  airship: "#475569",
};
const ON_DARK: Record<TransportId, string> = {
  arrow: "#E6FF4C",
  walk: "#4FD8EC",
  bicycle: "#0ABED7",
  motorcycle: "#F0592B",
  car: "#BAD70A",
  bus: "#C5A11F",
  train: "#B98CF2",
  boat: "#4FA3FF",
  plane: "#F0592B",
  balloon: "#F28C6B",
  airship: "#9FB3C8",
};

export const AUTO = "auto";

export function autoColor(themeId: string, t: TransportId): string {
  return (lookById(themeId).bright ? ON_BRIGHT : ON_DARK)[t];
}

export function lineColor(scene: Scene, t: TransportId): string {
  const c = scene.look.transports[t].color;
  return !c || c === AUTO ? autoColor(scene.look.theme, t) : c;
}
