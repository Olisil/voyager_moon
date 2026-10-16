import type { LineStyle, TransportId } from "./types";

export interface Transport {
  id: TransportId;
  label: string;
  color: string;
  line: LineStyle;
  /** Relative speed: legs share the travel time by length ÷ speed. */
  speed: number;
  /** Plane-style glyphs turn with the heading; the rest stay upright and face left or right. */
  rotates: boolean;
  /** Flights follow great circles and ignore smoothing. */
  flight: boolean;
  /** Draws a white pictogram centred on 0,0 within radius r, facing right (or up when it rotates). */
  glyph: (g: CanvasRenderingContext2D, r: number, bg: string, fg: string) => void;
}


function wheel(g: CanvasRenderingContext2D, x: number, y: number, rr: number, bg: string, fg: string) {
  g.beginPath();
  g.arc(x, y, rr, 0, Math.PI * 2);
  g.fillStyle = fg;
  g.fill();
  g.beginPath();
  g.arc(x, y, rr * 0.42, 0, Math.PI * 2);
  g.fillStyle = bg;
  g.fill();
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

export const TRANSPORTS = {
  car: {
    id: "car",
    label: "Lunar rover",
    color: "#BAD70A",
    line: "solid",
    speed: 1,
    rotates: false,
    flight: false,
    // the Apollo rover from the side: open frame, two seats, mesh wheels, the dish antenna up front
    glyph(g, r, bg, fg) {
      g.fillStyle = fg;
      g.strokeStyle = fg;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.fillRect(-0.64 * r, -0.02 * r, 1.28 * r, 0.12 * r);
      g.fillRect(-0.34 * r, -0.26 * r, 0.12 * r, 0.26 * r);
      g.fillRect(0.0 * r, -0.26 * r, 0.12 * r, 0.26 * r);
      g.lineWidth = 0.07 * r;
      g.beginPath();
      g.moveTo(0.42 * r, -0.02 * r);
      g.lineTo(0.42 * r, -0.42 * r);
      g.stroke();
      g.beginPath();
      g.ellipse(0.42 * r, -0.5 * r, 0.2 * r, 0.07 * r, -0.3, 0, Math.PI * 2);
      g.fill();
      wheel(g, -0.4 * r, 0.28 * r, 0.2 * r, bg, fg);
      wheel(g, 0.4 * r, 0.28 * r, 0.2 * r, bg, fg);
    },
  },
  motorcycle: {
    id: "motorcycle",
    label: "Motorcycle",
    color: "#F0592B",
    line: "solid",
    speed: 1,
    rotates: false,
    flight: false,
    glyph(g, r, _bg, fg) {
      g.strokeStyle = fg;
      g.lineWidth = 0.13 * r;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      g.arc(-0.4 * r, 0.2 * r, 0.22 * r, 0, Math.PI * 2);
      g.arc(0.42 * r, 0.2 * r, 0.22 * r, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = fg;
      g.beginPath();
      g.moveTo(-0.3 * r, -0.08 * r);
      g.lineTo(0.12 * r, -0.12 * r);
      g.lineTo(0.22 * r, 0.12 * r);
      g.lineTo(-0.12 * r, 0.14 * r);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(0.42 * r, 0.2 * r);
      g.lineTo(0.22 * r, -0.36 * r);
      g.lineTo(0.06 * r, -0.4 * r);
      g.stroke();
      g.beginPath();
      g.arc(-0.06 * r, -0.36 * r, 0.12 * r, 0, Math.PI * 2);
      g.fill();
    },
  },
  bicycle: {
    id: "bicycle",
    label: "Bicycle",
    color: "#0ABED7",
    line: "solid",
    speed: 0.7,
    rotates: false,
    flight: false,
    glyph(g, r, _bg, fg) {
      g.strokeStyle = fg;
      g.lineWidth = 0.11 * r;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      g.arc(-0.38 * r, 0.18 * r, 0.24 * r, 0, Math.PI * 2);
      g.moveTo(0.62 * r, 0.18 * r);
      g.arc(0.38 * r, 0.18 * r, 0.24 * r, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(-0.38 * r, 0.18 * r);
      g.lineTo(-0.08 * r, -0.2 * r);
      g.lineTo(0.26 * r, -0.2 * r);
      g.lineTo(0.38 * r, 0.18 * r);
      g.moveTo(-0.08 * r, -0.2 * r);
      g.lineTo(0.04 * r, 0.18 * r);
      g.lineTo(0.26 * r, -0.2 * r);
      g.moveTo(-0.16 * r, -0.32 * r);
      g.lineTo(0.0 * r, -0.32 * r);
      g.moveTo(0.26 * r, -0.2 * r);
      g.lineTo(0.22 * r, -0.4 * r);
      g.lineTo(0.36 * r, -0.4 * r);
      g.stroke();
    },
  },
  walk: {
    id: "walk",
    label: "Moonwalk",
    color: "#E6E6E6",
    line: "dotted",
    speed: 0.5,
    rotates: false,
    flight: false,
    glyph(g, r, _bg, fg) {
      g.fillStyle = fg;
      g.strokeStyle = fg;
      g.lineWidth = 0.14 * r;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      g.arc(0.06 * r, -0.5 * r, 0.13 * r, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(0.02 * r, -0.28 * r);
      g.lineTo(-0.06 * r, 0.12 * r);
      g.lineTo(0.2 * r, 0.56 * r);
      g.moveTo(-0.06 * r, 0.12 * r);
      g.lineTo(-0.26 * r, 0.56 * r);
      g.moveTo(-0.3 * r, -0.04 * r);
      g.lineTo(-0.12 * r, -0.24 * r);
      g.lineTo(0.08 * r, -0.2 * r);
      g.lineTo(0.28 * r, -0.02 * r);
      g.stroke();
    },
  },
  bus: {
    id: "bus",
    label: "Bus",
    color: "#C5A11F",
    line: "solid",
    speed: 0.9,
    rotates: false,
    flight: false,
    glyph(g, r, bg, fg) {
      g.fillStyle = fg;
      rr(g, -0.64 * r, -0.42 * r, 1.28 * r, 0.62 * r, 0.12 * r);
      g.fill();
      g.fillStyle = bg;
      for (let i = 0; i < 4; i++) g.fillRect((-0.54 + i * 0.27) * r, -0.32 * r, 0.2 * r, 0.2 * r);
      wheel(g, -0.36 * r, 0.24 * r, 0.15 * r, bg, fg);
      wheel(g, 0.38 * r, 0.24 * r, 0.15 * r, bg, fg);
    },
  },
  train: {
    id: "train",
    label: "Train",
    color: "#B98CF2",
    line: "solid",
    speed: 1.3,
    rotates: false,
    flight: false,
    glyph(g, r, bg, fg) {
      g.fillStyle = fg;
      rr(g, -0.66 * r, -0.3 * r, 0.9 * r, 0.5 * r, 0.06 * r);
      g.fill();
      rr(g, -0.66 * r, -0.52 * r, 0.42 * r, 0.3 * r, 0.04 * r);
      g.fill();
      g.beginPath();
      g.moveTo(0.24 * r, -0.2 * r);
      g.lineTo(0.62 * r, 0.04 * r);
      g.lineTo(0.62 * r, 0.2 * r);
      g.lineTo(0.24 * r, 0.2 * r);
      g.closePath();
      g.fill();
      g.fillRect(0.02 * r, -0.5 * r, 0.12 * r, 0.22 * r);
      g.fillStyle = bg;
      g.fillRect(-0.58 * r, -0.46 * r, 0.26 * r, 0.16 * r);
      for (const x of [-0.46, -0.1, 0.28]) wheel(g, x * r, 0.28 * r, 0.13 * r, bg, fg);
    },
  },
  boat: {
    id: "boat",
    label: "Boat",
    color: "#4FA3FF",
    line: "dashed",
    speed: 0.8,
    rotates: false,
    flight: false,
    glyph(g, r, bg, fg) {
      g.fillStyle = fg;
      g.beginPath();
      g.moveTo(-0.66 * r, 0.02 * r);
      g.lineTo(0.66 * r, 0.02 * r);
      g.lineTo(0.42 * r, 0.34 * r);
      g.lineTo(-0.5 * r, 0.34 * r);
      g.closePath();
      g.fill();
      rr(g, -0.36 * r, -0.26 * r, 0.6 * r, 0.24 * r, 0.04 * r);
      g.fill();
      g.fillRect(-0.14 * r, -0.5 * r, 0.14 * r, 0.26 * r);
      g.fillStyle = bg;
      for (const x of [-0.28, -0.06, 0.12]) g.fillRect(x * r, -0.2 * r, 0.1 * r, 0.1 * r);
      g.strokeStyle = fg;
      g.lineWidth = 0.07 * r;
      g.beginPath();
      g.moveTo(-0.6 * r, 0.5 * r);
      g.quadraticCurveTo(-0.45 * r, 0.42 * r, -0.3 * r, 0.5 * r);
      g.quadraticCurveTo(-0.15 * r, 0.58 * r, 0, 0.5 * r);
      g.quadraticCurveTo(0.15 * r, 0.42 * r, 0.3 * r, 0.5 * r);
      g.quadraticCurveTo(0.45 * r, 0.58 * r, 0.6 * r, 0.5 * r);
      g.stroke();
    },
  },
  plane: {
    id: "plane",
    label: "Lander hop",
    color: "#F0592B",
    line: "dashed",
    speed: 3,
    rotates: false,
    flight: true,
    // the lunar module from the side: ascent stage on the descent stage, four splayed legs
    glyph(g, r, bg, fg) {
      g.fillStyle = fg;
      g.strokeStyle = fg;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      g.moveTo(-0.26 * r, -0.2 * r);
      g.lineTo(-0.18 * r, -0.52 * r);
      g.lineTo(0.18 * r, -0.52 * r);
      g.lineTo(0.3 * r, -0.2 * r);
      g.closePath();
      g.fill();
      g.fillRect(-0.36 * r, -0.2 * r, 0.72 * r, 0.3 * r);
      g.fillStyle = bg;
      g.fillRect(-0.08 * r, -0.44 * r, 0.14 * r, 0.12 * r);
      g.lineWidth = 0.08 * r;
      g.beginPath();
      g.moveTo(-0.3 * r, 0.08 * r);
      g.lineTo(-0.58 * r, 0.5 * r);
      g.moveTo(0.3 * r, 0.08 * r);
      g.lineTo(0.58 * r, 0.5 * r);
      g.moveTo(-0.12 * r, 0.1 * r);
      g.lineTo(-0.22 * r, 0.5 * r);
      g.moveTo(0.12 * r, 0.1 * r);
      g.lineTo(0.22 * r, 0.5 * r);
      g.stroke();
      g.lineWidth = 0.1 * r;
      g.beginPath();
      for (const x of [-0.58, -0.22, 0.22, 0.58]) {
        g.moveTo((x - 0.08) * r, 0.52 * r);
        g.lineTo((x + 0.08) * r, 0.52 * r);
      }
      g.stroke();
    },
  },
} as Record<TransportId, Transport>;

// Lighter-than-air: no wheels, slow, straight across country like a flight.
Object.assign(TRANSPORTS, {
  balloon: {
    id: "balloon",
    label: "Hot air balloon",
    color: "#F28C6B",
    line: "dashed",
    speed: 0.4,
    rotates: false,
    flight: true,
    glyph(g: CanvasRenderingContext2D, r: number, _bg: string, fg: string) {
      g.fillStyle = fg;
      g.strokeStyle = fg;
      g.beginPath();
      g.moveTo(0, 0.18 * r);
      g.bezierCurveTo(-0.5 * r, -0.05 * r, -0.5 * r, -0.66 * r, 0, -0.66 * r);
      g.bezierCurveTo(0.5 * r, -0.66 * r, 0.5 * r, -0.05 * r, 0, 0.18 * r);
      g.fill();
      g.lineWidth = 0.06 * r;
      g.beginPath();
      g.moveTo(-0.12 * r, 0.12 * r);
      g.lineTo(-0.1 * r, 0.38 * r);
      g.moveTo(0.12 * r, 0.12 * r);
      g.lineTo(0.1 * r, 0.38 * r);
      g.stroke();
      g.fillRect(-0.14 * r, 0.38 * r, 0.28 * r, 0.2 * r);
    },
  },
  airship: {
    id: "airship",
    label: "Airship",
    color: "#9FB3C8",
    line: "dashed",
    speed: 0.8,
    rotates: false,
    flight: true,
    glyph(g: CanvasRenderingContext2D, r: number, _bg: string, fg: string) {
      g.fillStyle = fg;
      g.beginPath();
      g.ellipse(0.04 * r, -0.12 * r, 0.6 * r, 0.26 * r, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(-0.5 * r, -0.12 * r);
      g.lineTo(-0.72 * r, -0.36 * r);
      g.lineTo(-0.72 * r, 0.12 * r);
      g.closePath();
      g.fill();
      g.beginPath();
      g.roundRect(-0.14 * r, 0.16 * r, 0.32 * r, 0.14 * r, 0.04 * r);
      g.fill();
    },
  },
  arrow: {
    id: "arrow",
    label: "Arrow",
    color: "#E6E6E6",
    line: "solid",
    speed: 1,
    rotates: true,
    flight: false,
    glyph(g: CanvasRenderingContext2D, r: number, _bg: string, fg: string) {
      g.fillStyle = fg;
      g.beginPath();
      g.moveTo(0.62 * r, 0);
      g.lineTo(-0.5 * r, -0.46 * r);
      g.lineTo(-0.24 * r, 0);
      g.lineTo(-0.5 * r, 0.46 * r);
      g.closePath();
      g.fill();
    },
  },
});

/** On the Moon: a neutral pointer, on foot, the rover, and hops by lander. */
export const TRANSPORT_ORDER: TransportId[] = ["arrow", "walk", "car", "plane"];

export const TRANSPORT_IDS = TRANSPORT_ORDER;

const ICON_BG = "#0e0e0e";
/** The round side-view icon used in menus and lists: always a white glyph on black. */
const iconCache = new Map<string, string>();
export function transportIcon(id: TransportId, _color?: string, size = 32): string {
  const key = `${id}|${size}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = size * 2;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  g.translate(size / 2, size / 2);
  g.beginPath();
  g.arc(0, 0, size / 2 - 1, 0, Math.PI * 2);
  g.fillStyle = ICON_BG;
  g.fill();
  TRANSPORTS[id].glyph(g, size * 0.38, ICON_BG, "#ffffff");
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

/** White pictograms on dark colours, near-black on light ones. */
export function glyphInk(bg: string) {
  return luminance(bg) > 0.55 ? "#0e0e0e" : "#ffffff";
}

export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
