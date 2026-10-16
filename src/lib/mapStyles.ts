import type { StyleSpecification } from "maplibre-gl";
import { demSource, imageSource, MOON_CREDIT } from "./moonData";

/**
 * Moon looks. All use the same two tile sets (elevation and the LROC image mosaic); they differ in
 * whether the photo is shown and how the sun shading (a hillshade from the elevation, lit from
 * the sun set in the Look step) is mixed in.
 */
export interface MapLook {
  id: string;
  title: string;
  /** pale base map: pointers are drawn inverted */
  bright: boolean;
  /** text burned into the video */
  credit: string;
  /** ground, shadow, light: drawn as a placeholder until the thumbnail is ready */
  swatch: [string, string, string];
  /** how the sun shading is drawn over the ground */
  shade: { opacity: number; shadow: string; highlight: string; accent: string };
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

function style(ground: "photo" | "plain" | "height", plain = "#8d8a85"): StyleSpecification {
  const layers: StyleSpecification["layers"] = [{ id: "space", type: "background", paint: { "background-color": "#000000" } }];
  if (ground === "photo") {
    layers.push({ id: "ground", type: "raster", source: "moon-img", paint: { "raster-fade-duration": 0, "raster-contrast": 0.08 } });
  } else if (ground === "plain") {
    layers.push({ id: "ground", type: "background", paint: { "background-color": plain } });
  } else {
    layers.push({
      id: "ground",
      type: "color-relief",
      source: "fv-dem",
      paint: {
        // heights in the scaled units of the elevation source (see RELIEF_SCALE)
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
  return {
    version: 8,
    sources: { "moon-img": imageSource(), "fv-dem": demSource() },
    sky: SKY,
    layers,
  } as StyleSpecification;
}

export const MAP_LOOKS: MapLook[] = [
  {
    id: "photo-sun",
    title: "Photo and sun",
    bright: false,
    credit: MOON_CREDIT,
    swatch: ["#8a8781", "#2a2826", "#d8d4cc"],
    shade: { opacity: 0.55, shadow: "#000000", highlight: "#ffffff", accent: "#000000" },
    style: () => style("photo"),
  },
  {
    id: "photo",
    title: "Orbiter photo",
    bright: false,
    credit: MOON_CREDIT,
    swatch: ["#86837d", "#4d4b47", "#bdb9b1"],
    shade: { opacity: 0, shadow: "#000000", highlight: "#ffffff", accent: "#000000" },
    style: () => style("photo"),
  },
  {
    id: "relief",
    title: "Sunlit relief",
    bright: false,
    credit: MOON_CREDIT,
    swatch: ["#8d8a85", "#1c1b1a", "#e9e6e0"],
    shade: { opacity: 1, shadow: "#050505", highlight: "#f5f2ec", accent: "#3a3836" },
    style: () => style("plain"),
  },
  {
    id: "height",
    title: "Height colours",
    bright: false,
    credit: MOON_CREDIT,
    swatch: ["#a6a07a", "#3f5f8f", "#f4efe6"],
    shade: { opacity: 0.7, shadow: "#000000", highlight: "#ffffff", accent: "#000000" },
    style: () => style("height"),
  },
  {
    id: "silver",
    title: "Silver",
    bright: true,
    credit: MOON_CREDIT,
    swatch: ["#d9d7d2", "#8c8a86", "#ffffff"],
    shade: { opacity: 0.9, shadow: "#6b6863", highlight: "#ffffff", accent: "#9a968f" },
    style: () => style("plain", "#d6d3cd"),
  },
];

export const QUICK_LOOKS = MAP_LOOKS.map((l) => l.id);

export function lookById(id: string): MapLook {
  return MAP_LOOKS.find((l) => l.id === id) ?? MAP_LOOKS[0];
}
