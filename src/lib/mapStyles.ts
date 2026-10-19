import type { StyleSpecification } from "maplibre-gl";
import { demSource, MOON_CREDIT } from "./moonData";

/**
 * Moon looks. All are drawn from the height data only, no images: a ground colour (or colours by
 * height), height curves, and shading from the sun set in the Look step.
 */
export interface MapLook {
  id: string;
  title: string;
  /** pale base map: pointers are drawn inverted */
  bright: boolean;
  /** text burned into the video */
  credit: string;
  /** ground, curves, light: drawn as the look's swatch */
  swatch: [string, string, string];
  /** how the sun shading is drawn over the ground */
  shade: { opacity: number; shadow: string; highlight: string; accent: string };
  /** height curves: colour and strength of the minor and major lines, or none */
  curves: { color: string; minor: number; major: number } | null;
  /** colour for outlined areas and sights when "auto" */
  marks: string;
  style: () => string | StyleSpecification;
}

/** Black space above the horizon when the camera tilts. */
const SKY = {
  "sky-color": "#000000",
  "horizon-color": "#05070a",
  "fog-color": "#000000",
  "sky-horizon-blend": 0.2,
  "horizon-fog-blend": 0.1,
  "fog-ground-blend": 1,
  "atmosphere-blend": 0,
} as const;

function style(ground: string | "height"): StyleSpecification {
  const layers: StyleSpecification["layers"] = [{ id: "space", type: "background", paint: { "background-color": ground === "height" ? "#000000" : ground } }];
  if (ground === "height") {
    layers.push({
      id: "ground",
      type: "color-relief",
      source: "fv-dem",
      paint: {
        // heights in the scaled units of the height source (real metres × RELIEF_SCALE)
        "color-relief-color": [
          "interpolate",
          ["linear"],
          ["elevation"],
          -30000, "#1d2b53",
          -14000, "#3f5f8f",
          -4000, "#6d8f8a",
          0, "#a6a07a",
          8000, "#c9a46b",
          18000, "#d9c3a3",
          32000, "#f4efe6",
        ],
      },
    } as never);
  }
  return { version: 8, sources: { "fv-dem": demSource() }, sky: SKY, layers } as StyleSpecification;
}

export const MAP_LOOKS: MapLook[] = [
  {
    id: "curves",
    title: "Height curves",
    bright: false,
    credit: MOON_CREDIT,
    swatch: ["#141517", "#d9d9d9", "#6b6b6b"],
    shade: { opacity: 0.55, shadow: "#000000", highlight: "#ffffff", accent: "#000000" },
    curves: { color: "#e6e6e6", minor: 0.32, major: 0.78 },
    marks: "#E6FF4C",
    style: () => style("#17181a"),
  },
  {
    id: "curves-paper",
    title: "Curves on paper",
    bright: true,
    credit: MOON_CREDIT,
    swatch: ["#e9e5dc", "#3b3a37", "#b8b2a6"],
    shade: { opacity: 0.45, shadow: "#5a554c", highlight: "#ffffff", accent: "#7a746a" },
    curves: { color: "#2f2e2b", minor: 0.35, major: 0.8 },
    marks: "#C2410C",
    style: () => style("#e9e5dc"),
  },
  {
    id: "curves-blueprint",
    title: "Blueprint",
    bright: false,
    credit: MOON_CREDIT,
    swatch: ["#0f2a4a", "#cfe3ff", "#3f6a9a"],
    shade: { opacity: 0.45, shadow: "#020a14", highlight: "#cfe3ff", accent: "#020a14" },
    curves: { color: "#cfe3ff", minor: 0.3, major: 0.75 },
    marks: "#FFD166",
    style: () => style("#0f2a4a"),
  },
  {
    id: "curves-colour",
    title: "Curves and height colours",
    bright: false,
    credit: MOON_CREDIT,
    swatch: ["#a6a07a", "#1d2b53", "#f4efe6"],
    shade: { opacity: 0.6, shadow: "#000000", highlight: "#ffffff", accent: "#000000" },
    curves: { color: "#101010", minor: 0.28, major: 0.6 },
    marks: "#FFFFFF",
    style: () => style("height"),
  },
  {
    id: "relief",
    title: "Sunlit relief",
    bright: false,
    credit: MOON_CREDIT,
    swatch: ["#8d8a85", "#1c1b1a", "#e9e6e0"],
    shade: { opacity: 1, shadow: "#050505", highlight: "#f5f2ec", accent: "#3a3836" },
    curves: null,
    marks: "#E6FF4C",
    style: () => style("#8d8a85"),
  },
];

export const QUICK_LOOKS = MAP_LOOKS.map((l) => l.id);

export function lookById(id: string): MapLook {
  return MAP_LOOKS.find((l) => l.id === id) ?? MAP_LOOKS[0];
}
