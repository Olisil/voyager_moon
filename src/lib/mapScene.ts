import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import { lookById } from "./mapStyles";
import { contourTiles, demSource, registerMoonProtocol } from "./moonData";
import { areaOutlines } from "./moonPlaces";
import { lineColor } from "./colors";
import type { FrameState } from "./camera";
import { pointAt, toLngLat, type Path } from "./geo";
import type { RouteModel } from "./model";
import type { LngLat, Scene, ThemeId } from "./types";

export { MAP_LOOKS, QUICK_LOOKS, lookById } from "./mapStyles";

/** Looks with a pale base map get inverted pointers. */
export const isBrightLook = (id: string) => lookById(id).bright;

export const SRC = { full: "fv-full", drawn: "fv-drawn", ctrl: "fv-ctrl", dem: "fv-dem", shade: "fv-dem-shade", contours: "fv-contours-src", areas: "fv-areas-src" } as const;
export const LYR = {
  hillshade: "fv-hillshade",
  contours: "fv-contours",
  areas: "fv-areas",
  areasDashed: "fv-areas-dashed",
  ahead: "fv-ahead",
  casing: "fv-casing",
  solid: "fv-line-solid",
  dashed: "fv-line-dashed",
  dotted: "fv-line-dotted",
  ctrl: "fv-ctrl",
  ctrlEnds: "fv-ctrl-ends",
} as const;
export const HANDLE_LAYERS = [LYR.ctrl, LYR.ctrlEnds];

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const currentTheme = new WeakMap<MLMap, ThemeId>();

/** Where a new map looks: the Apollo 17 landing site. */
export const MOON_HOME: LngLat = [30.77, 20.19];

export function createMap(container: HTMLElement, scene: Scene): MLMap {
  registerMoonProtocol();
  const theme = lookById(scene.look.theme);
  const v = scene.view;
  const map = new maplibregl.Map({
    container,
    style: theme.style(),
    center: v?.center ?? MOON_HOME,
    zoom: v?.zoom ?? 8,
    bearing: v?.bearing ?? 0,
    pitch: v?.pitch ?? 0,
    attributionControl: { compact: true },
    // Needed so finished frames can be copied off the canvas into the video.
    canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    maxCanvasSize: [8192, 8192],
    maxPitch: 70,
    fadeDuration: 0,
  });
  currentTheme.set(map, theme.id);
  if (import.meta.env.DEV) (window as unknown as { __map: MLMap }).__map = map;
  return map;
}

/**
 * Where the route goes in the layer stack: above every road, building and area of the base map,
 * but under its labels. Some styles interleave early labels (water names) before the roads, so
 * this is the first label after the last line or fill layer, not simply the first label.
 */
function firstSymbolLayer(map: MLMap): string | undefined {
  const layers = (map.getStyle().layers ?? []).filter((l) => !l.id.startsWith("fv-"));
  let lastShape = -1;
  layers.forEach((l, i) => {
    if (l.type === "line" || l.type === "fill" || l.type === "fill-extrusion" || l.type === "raster" || l.type === "hillshade") lastShape = i;
  });
  return layers.slice(lastShape + 1).find((l) => l.type === "symbol")?.id;
}

/** Adds the app's sources and layers. Safe to call again after a style change. */
export function installScene(map: MLMap) {
  const below = firstSymbolLayer(map);
  // Relief sits on the ground, under roads and labels.
  const belowRoads = (map.getStyle().layers ?? []).find((l) => !l.id.startsWith("fv-") && (l.type === "line" || l.type === "symbol"))?.id;
  for (const id of [SRC.full, SRC.drawn, SRC.ctrl]) {
    if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: EMPTY });
  }
  if (!map.getSource(SRC.dem)) map.addSource(SRC.dem, demSource());
  // the shading has its own smoothed tiles, so the sun never shows the height data's pixels
  if (!map.getSource(SRC.shade)) map.addSource(SRC.shade, demSource("shade"));
  const add = (layer: maplibregl.AddLayerObject, before?: string) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer, before);
  };
  // The sun: shading from the elevation, lit from the direction and height set in the Look step.
  add(
    {
      id: LYR.hillshade,
      type: "hillshade",
      source: SRC.shade,
      paint: { "hillshade-method": "basic", "hillshade-illumination-anchor": "map", "hillshade-exaggeration": 1 },
    },
    belowRoads,
  );
  // Height curves, made in the browser from the same height tiles; major lines drawn stronger.
  if (!map.getSource(SRC.contours)) map.addSource(SRC.contours, { type: "vector", tiles: [contourTiles()], maxzoom: 15 });
  add(
    {
      id: LYR.contours,
      type: "line",
      source: SRC.contours,
      "source-layer": "contours",
      layout: { "line-join": "round" },
      paint: {
        "line-color": "#e6e6e6",
        "line-opacity": ["match", ["get", "level"], 1, 0.78, 0.32],
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, ["match", ["get", "level"], 1, 0.9, 0.45], 12, ["match", ["get", "level"], 1, 1.6, 0.8]],
      },
    },
    belowRoads,
  );
  // Outlines of famous areas: craters solid (their true rims), maria and basins dashed (approximate).
  if (!map.getSource(SRC.areas)) map.addSource(SRC.areas, { type: "geojson", data: areaOutlines() });
  const areaWidth = ["interpolate", ["linear"], ["zoom"], 2, 1, 8, 1.6, 12, 2.4] as unknown as number;
  add(
    {
      id: LYR.areas,
      type: "line",
      source: SRC.areas,
      filter: ["==", ["get", "kind"], "crater"],
      layout: { "line-join": "round", visibility: "none" },
      paint: { "line-color": "#E6FF4C", "line-opacity": 0.85, "line-width": areaWidth },
    },
    belowRoads,
  );
  add(
    {
      id: LYR.areasDashed,
      type: "line",
      source: SRC.areas,
      filter: ["!=", ["get", "kind"], "crater"],
      layout: { "line-join": "round", visibility: "none" },
      paint: { "line-color": "#E6FF4C", "line-opacity": 0.7, "line-width": areaWidth, "line-dasharray": [3, 2.5] },
    },
    belowRoads,
  );
  add(
    {
      id: LYR.ahead,
      type: "line",
      source: SRC.full,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": ["get", "color"], "line-opacity": 0.4, "line-width": 2, "line-dasharray": [1.5, 2] },
    },
    below,
  );
  add(
    {
      id: LYR.casing,
      type: "line",
      source: SRC.drawn,
      layout: { "line-join": "round", "line-cap": "round", visibility: "none" },
      paint: { "line-color": "#ffffff", "line-width": ["+", ["get", "width"], 4] },
    },
    below,
  );
  const line = (id: string, kind: string, dash?: number[]) =>
    add(
      {
        id,
        type: "line",
        source: SRC.drawn,
        filter: ["==", ["get", "line"], kind],
        layout: { "line-join": "round", "line-cap": kind === "solid" ? "round" : "round" },
        paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], ...(dash ? { "line-dasharray": dash } : {}) },
      },
      below,
    );
  line(LYR.solid, "solid");
  line(LYR.dashed, "dashed", [2, 1.6]);
  line(LYR.dotted, "dotted", [0.01, 1.9]);
  add({
    id: LYR.ctrl,
    type: "circle",
    source: SRC.ctrl,
    paint: {
      "circle-radius": ["case", ["has", "legStart"], 7, 5],
      "circle-color": ["case", ["has", "legStart"], ["get", "legColor"], "#0e0e0e"],
      "circle-stroke-color": ["case", ["has", "pause"], "#e6ff4c", "#ffffff"],
      "circle-stroke-width": ["case", ["has", "pause"], 3.5, 2],
    },
  });
  add({
    id: LYR.ctrlEnds,
    type: "circle",
    source: SRC.ctrl,
    filter: ["has", "end"],
    paint: {
      "circle-radius": 7,
      "circle-color": ["match", ["get", "end"], "start", "#bad70a", "#ffffff"],
      "circle-stroke-color": "#0e0e0e",
      "circle-stroke-width": 2.5,
    },
  });
}

export function applyLook(map: MLMap, scene: Scene) {
  if (!map.getLayer(LYR.solid)) return;
  const look = scene.look;
  map.setLayoutProperty(LYR.casing, "visibility", look.outline ? "visible" : "none");
  map.setLayoutProperty(LYR.ahead, "visibility", look.showAhead ? "visible" : "none");
  const shade = lookById(look.theme).shade;
  const set = (prop: string, value: unknown) => {
    if (JSON.stringify(map.getPaintProperty(LYR.hillshade, prop)) !== JSON.stringify(value)) map.setPaintProperty(LYR.hillshade, prop, value);
  };
  map.setLayoutProperty(LYR.hillshade, "visibility", shade.opacity > 0 ? "visible" : "none");
  set("hillshade-illumination-direction", Math.round(((look.sun.azimuth % 360) + 360) % 360));
  set("hillshade-illumination-altitude", Math.max(1, Math.min(90, look.sun.altitude)));
  set("hillshade-shadow-color", withAlpha(shade.shadow, shade.opacity));
  set("hillshade-highlight-color", withAlpha(shade.highlight, shade.opacity * 0.6));
  set("hillshade-accent-color", withAlpha(shade.accent, shade.opacity * 0.5));
  const curves = lookById(look.theme).curves;
  map.setLayoutProperty(LYR.contours, "visibility", curves ? "visible" : "none");
  if (curves) {
    const setC = (prop: string, value: unknown) => {
      if (JSON.stringify(map.getPaintProperty(LYR.contours, prop)) !== JSON.stringify(value)) map.setPaintProperty(LYR.contours, prop, value);
    };
    setC("line-color", curves.color);
    setC("line-opacity", ["match", ["get", "level"], 1, curves.major, curves.minor]);
  }
  const areaColor = areaColour(scene);
  for (const id of [LYR.areas, LYR.areasDashed]) {
    map.setLayoutProperty(id, "visibility", look.areas.on ? "visible" : "none");
    if (map.getPaintProperty(id, "line-color") !== areaColor) map.setPaintProperty(id, "line-color", areaColor);
  }
  const terrain = map.getTerrain();
  if (look.terrain && (!terrain || terrain.exaggeration !== look.relief)) map.setTerrain({ source: SRC.dem, exaggeration: look.relief });
  if (!look.terrain && terrain) map.setTerrain(null);
}

/** The colour of area outlines and sights: picked, or the look's own. */
export function areaColour(scene: Scene): string {
  const c = scene.look.areas.color;
  return !c || c === "auto" ? lookById(scene.look.theme).marks : c;
}

function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

const pending = new WeakMap<MLMap, { theme: ThemeId; promise: Promise<boolean> }>();

/** Switches the base map if needed and puts the app's layers back. */
export function ensureTheme(map: MLMap, scene: Scene): Promise<boolean> {
  const inFlight = pending.get(map);
  if (inFlight) {
    // Another switch is loading: wait for it, then check again.
    return inFlight.promise.then(() => ensureTheme(map, scene));
  }
  if (currentTheme.get(map) === scene.look.theme && map.getLayer(LYR.solid)) {
    applyLook(map, scene);
    return Promise.resolve(false);
  }
  const theme = lookById(scene.look.theme);
  currentTheme.set(map, theme.id);
  const promise = new Promise<boolean>((resolve) => {
    map.once("style.load", () => {
      installScene(map);
      applyLook(map, scene);
      pending.delete(map);
      resolve(true);
    });
    map.setStyle(theme.style(), { diff: false });
  });
  pending.set(map, { theme: theme.id, promise });
  return promise;
}

function src(map: MLMap, id: string): GeoJSONSource | undefined {
  return map.getSource(id) as GeoJSONSource | undefined;
}

/** Coordinates of the path between two arc lengths. */
export function sliceRange(path: Path, a: number, b: number): LngLat[] {
  if (b <= a) return [];
  const out: LngLat[] = [toLngLat(pointAt(path, a))];
  for (let i = 0; i < path.cum.length; i++) {
    if (path.cum[i] > a && path.cum[i] < b) out.push(path.lngLat[i]);
    if (path.cum[i] >= b) break;
  }
  out.push(toLngLat(pointAt(path, b)));
  return out;
}

function legFeatures(scene: Scene, model: RouteModel, upTo: number): GeoJSON.Feature[] {
  const feats: GeoJSON.Feature[] = [];
  for (const leg of model.legs) {
    const end = Math.min(leg.s1, upTo);
    if (end <= leg.s0) continue;
    const coords = sliceRange(model.path, leg.s0, end);
    if (coords.length < 2) continue;
    const st = scene.look.transports[leg.transport];
    feats.push({
      type: "Feature",
      properties: { color: lineColor(scene, leg.transport), width: st.width, line: st.line, leg: leg.index },
      geometry: { type: "LineString", coordinates: coords },
    });
  }
  return feats;
}

/** Editing view: the whole route, plus handles when the route is drawn. */
export function showEditing(map: MLMap, scene: Scene, model: RouteModel | null, handles: boolean) {
  src(map, SRC.full)?.setData(EMPTY);
  src(map, SRC.drawn)?.setData({ type: "FeatureCollection", features: model ? legFeatures(scene, model, Infinity) : [] });
  const pts = scene.route.points;
  const unwrapped = model?.points ?? pts.map((p) => p.at);
  let features: GeoJSON.Feature[] = [];
  if (handles && scene.route.kind === "drawn") {
    const legStartIdx = new Map((model?.legs ?? []).map((l) => [l.p0, l.transport]));
    features = pts.map((p, i) => {
      const legT = i > 0 ? legStartIdx.get(i) : undefined;
      return {
        type: "Feature",
        properties: {
          i,
          ...(i === 0 ? { end: "start" } : i === pts.length - 1 ? { end: "finish" } : {}),
          ...(legT ? { legStart: 1, legColor: lineColor(scene, legT) } : {}),
          ...(p.pause ? { pause: p.pause } : {}),
        },
        geometry: { type: "Point", coordinates: unwrapped[i] ?? p.at },
      };
    });
  } else if (handles && pts.length) {
    features = [0, pts.length - 1].map((i, k) => ({
      type: "Feature",
      properties: { i, end: k === 0 ? "start" : "finish" },
      geometry: { type: "Point", coordinates: unwrapped[i] },
    }));
  }
  src(map, SRC.ctrl)?.setData({ type: "FeatureCollection", features });
}

/** Animation view: the line drawn up to the frame, and optionally the camera. */
export function showFrame(map: MLMap, scene: Scene, model: RouteModel, frame: FrameState, moveCamera: boolean) {
  src(map, SRC.ctrl)?.setData(EMPTY);
  src(map, SRC.full)?.setData({ type: "FeatureCollection", features: legFeatures(scene, model, Infinity) });
  src(map, SRC.drawn)?.setData({ type: "FeatureCollection", features: legFeatures(scene, model, frame.s) });
  if (moveCamera && frame.camera) map.jumpTo(frame.camera);
}

/** Resolves once every tile and source update for the current view has been drawn. */
export function waitForIdle(map: MLMap, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      map.off("idle", finish);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    map.on("idle", finish);
    map.triggerRepaint();
  });
}
