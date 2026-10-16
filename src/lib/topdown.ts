import type { TransportId } from "./types";

/**
 * Top-down map pointers. Plane, foot, train, balloon and airship are the assets from the
 * "Nassau New" Figma file; car, bus, motorcycle, bicycle and boat are drawn in the same style:
 * light grey fill, 1 px dark outline, round joins, nose pointing up.
 */
export interface TopIcon {
  w: number;
  h: number;
  /** turns with the direction of travel (balloons drift upright) */
  rotates: boolean;
  /** [path data, "fill" | "stroke" | "both", optional stroke width] */
  parts: [string, "fill" | "stroke" | "both", number?][];
}

const ICONS: Partial<Record<TransportId | "foot" | "wagon" | "loco", TopIcon>> = {
  // the lunar module from above: octagonal descent stage, four legs with round pads; stays upright
  plane: {
    w: 18, h: 18, rotates: false,
    parts: [
      ["M3.2 3.2L6.2 6.2M14.8 3.2L11.8 6.2M3.2 14.8L6.2 11.8M14.8 14.8L11.8 11.8", "stroke"],
      ["M3.2 1.9A1.3 1.3 0 1 1 3.2 4.5A1.3 1.3 0 1 1 3.2 1.9Z M14.8 1.9A1.3 1.3 0 1 1 14.8 4.5A1.3 1.3 0 1 1 14.8 1.9Z M3.2 13.5A1.3 1.3 0 1 1 3.2 16.1A1.3 1.3 0 1 1 3.2 13.5Z M14.8 13.5A1.3 1.3 0 1 1 14.8 16.1A1.3 1.3 0 1 1 14.8 13.5Z", "both"],
      ["M7.3 4.6H10.7L13.4 7.3V10.7L10.7 13.4H7.3L4.6 10.7V7.3Z", "both"],
      ["M7.6 7.6H10.4V10.4H7.6Z", "both"],
    ],
  },
  balloon: {
    w: 16, h: 16, rotates: false,
    parts: [
      ["M13.321 4.97953C13.321 8.35753 8.6407 12 8.00004 12C7.35937 12 2.6543 8.35753 2.6543 4.97953C2.6543 2.42686 5.0547 1.33334 8.00004 1.33334C10.9454 1.33334 13.321 2.42686 13.321 4.97953Z", "both"],
      ["M8.00004 12C8.61537 12 9.98764 8.35753 9.98764 4.97953C9.98764 2.42686 9.1047 1.33334 8.00004 1.33334M8.00004 12C7.3847 12 5.98764 8.35753 5.98764 4.97953C5.98764 2.42686 6.89537 1.33334 8.00004 1.33334", "stroke"],
      ["M6 13.3333C6 13.0233 6 12.868 6.034 12.7413C6.07946 12.5719 6.16869 12.4174 6.29273 12.2934C6.41676 12.1694 6.57125 12.0801 6.74067 12.0347C6.86867 12 7.024 12 7.33333 12H8.66667C8.97667 12 9.13133 12 9.25867 12.034C9.42809 12.0795 9.58257 12.1687 9.70661 12.2927C9.83064 12.4168 9.91987 12.5712 9.96533 12.7407C10 12.868 10 13.0233 10 13.3333C10 13.6433 10 13.7987 9.966 13.9253C9.92054 14.0948 9.83131 14.2492 9.70727 14.3733C9.58324 14.4973 9.42875 14.5865 9.25933 14.632C9.13133 14.6667 8.976 14.6667 8.66667 14.6667H7.33333C7.02333 14.6667 6.86867 14.6667 6.74133 14.6327C6.57191 14.5872 6.41743 14.498 6.29339 14.3739C6.16936 14.2499 6.08013 14.0954 6.03467 13.926C6 13.798 6 13.6427 6 13.3333Z", "both"],
    ],
  },
  airship: {
    w: 10, h: 21, rotates: true,
    parts: [
      ["M8.65583 7.42441C8.65583 13.6197 6.13909 20.3 5.01057 20.3C3.88204 20.3 1.31982 13.6197 1.31982 7.42441C1.31982 2.74282 3.98461 0.737305 5.01057 0.737305C6.03653 0.737305 8.65583 2.74282 8.65583 7.42441Z", "both"],
      ["M8.71507 15.6978L7.87285 13.9637H2.10245L1.26023 15.6978C1.02793 16.1761 0.907227 16.7009 0.907227 17.2326V18.991H6.30231H9.06807V17.2326C9.06807 16.7009 8.94737 16.1761 8.71507 15.6978Z", "both"],
      ["M4.98779 14.1196L4.98779 17.2332", "stroke"],
    ],
  },
  loco: {
    w: 6, h: 11, rotates: true,
    parts: [
      ["M1.26169 1.16071C1.40469 0.76425 1.78091 0.5 2.20238 0.5H2.91042C3.33188 0.5 3.7081 0.76425 3.8511 1.16071L3.96031 1.4635C4.39202 2.66045 4.61279 3.92322 4.61279 5.19565V9.04507C4.61279 9.59736 4.16508 10.0451 3.61279 10.0451H1.5C0.947715 10.0451 0.5 9.59736 0.5 9.04507V5.19565C0.5 3.92322 0.720769 2.66045 1.15248 1.4635L1.26169 1.16071Z", "both"],
      ["M2.01318 7.98282H3.2124", "stroke"],
      ["M2.03662 3.19098H3.07666", "stroke", 2],
    ],
  },
  wagon: {
    w: 6, h: 12, rotates: true,
    parts: [
      ["M1.5 1.787H3.613A1 1 0 0 1 4.613 2.787V10.332A1 1 0 0 1 3.613 11.332H1.5A1 1 0 0 1 0.5 10.332V2.787A1 1 0 0 1 1.5 1.787Z", "both"],
      ["M2.48486 0.5L2.48486 1.78748", "stroke"],
    ],
  },
  foot: {
    w: 5, h: 9, rotates: true,
    parts: [
      ["M1.00032 7.5V6.31C1.00032 5.25 0.485321 4.75 0.500321 3.5C0.515321 2.14 1.24532 0.5 2.75032 0.5C3.68532 0.5 4.00032 1.4 4.00032 2.25C4.00032 3.805 3.00032 5.08 3.00032 6.59V7.5C3.00032 7.76522 2.89496 8.01957 2.70743 8.20711C2.51989 8.39464 2.26554 8.5 2.00032 8.5C1.7351 8.5 1.48075 8.39464 1.29321 8.20711C1.10568 8.01957 1.00032 7.76522 1.00032 7.5Z", "both"],
      ["M1.00032 6H3.00032", "stroke"],
    ],
  },
  // ---- new, same style ----
  arrow: {
    w: 12, h: 14, rotates: true,
    parts: [["M6 0.8L11.2 13L6 10.2L0.8 13Z", "both"]],
  },
  // the lunar rover from above: four wheels at the corners, open frame, two seats, the dish up front
  car: {
    w: 12, h: 16, rotates: true,
    parts: [
      ["M1.2 2.2H3.4V5.6H1.2Z M8.6 2.2H10.8V5.6H8.6Z M1.2 10.4H3.4V13.8H1.2Z M8.6 10.4H10.8V13.8H8.6Z", "both"],
      ["M4 2.6H8V13.4H4Z", "both"],
      ["M4.6 7.2H5.8V9.4H4.6Z M6.2 7.2H7.4V9.4H6.2Z", "stroke", 0.7],
      ["M6 0.6A1.4 1.4 0 1 1 6 3.4A1.4 1.4 0 1 1 6 0.6Z", "both"],
    ],
  },
  boat: {
    w: 10, h: 20, rotates: true,
    parts: [
      ["M5 0.7C7.6 3 9.3 6.5 9.3 10.5V18A1.3 1.3 0 0 1 8 19.3H2A1.3 1.3 0 0 1 0.7 18V10.5C0.7 6.5 2.4 3 5 0.7Z", "both"],
      ["M3.6 9H6.4A0.8 0.8 0 0 1 7.2 9.8V13.2A0.8 0.8 0 0 1 6.4 14H3.6A0.8 0.8 0 0 1 2.8 13.2V9.8A0.8 0.8 0 0 1 3.6 9Z", "both"],
      ["M5 3.4V6", "stroke"],
    ],
  },
};

const cache = new Map<string, Path2D>();
const path = (d: string) => {
  let p = cache.get(d);
  if (!p) cache.set(d, (p = new Path2D(d)));
  return p;
};

export function topIcon(id: TransportId | "foot" | "wagon" | "loco"): TopIcon | null {
  return ICONS[id] ?? null;
}

export interface IconInk {
  fill: string;
  stroke: string;
}
/** Light icons with a dark outline on dark maps; inverted on bright maps. */
export function inkFor(brightMap: boolean): IconInk {
  return brightMap ? { fill: "#2B2B2B", stroke: "#F2F2F2" } : { fill: "#D9D9D9", stroke: "#0E0E0E" };
}

/** Draws an icon centred on 0,0, scaled so 1 design px = `scale` screen px. Nose points to -y. */
export function drawTopIcon(g: CanvasRenderingContext2D, icon: TopIcon, scale: number, ink: IconInk, alpha = 1) {
  g.save();
  g.globalAlpha *= alpha;
  g.scale(scale, scale);
  g.translate(-icon.w / 2, -icon.h / 2);
  g.lineJoin = "round";
  g.lineCap = "round";
  for (const [d, mode, width] of icon.parts) {
    const p = path(d);
    if (mode !== "stroke") {
      g.fillStyle = ink.fill;
      g.fill(p);
    }
    if (mode !== "fill") {
      g.lineWidth = width ?? 1;
      g.strokeStyle = ink.stroke;
      g.stroke(p);
    }
  }
  g.restore();
}
