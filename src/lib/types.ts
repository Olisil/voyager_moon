export type LngLat = [number, number];

/** Id of a map look in `MAP_LOOKS` (lib/mapStyles.ts). */
export type ThemeId = string;
export type TransportId = "car" | "motorcycle" | "bicycle" | "walk" | "bus" | "train" | "boat" | "plane" | "balloon" | "airship" | "arrow";
export type LineStyle = "solid" | "dashed" | "dotted";
export type SymbolKind = "badge" | "arrow" | "dot" | "none";
export type SignStyle = "plate" | "tag" | "pin" | "flag" | "caption" | "photo";
export type Aspect = "16:9" | "9:16" | "1:1" | "4:5";
export type Resolution = 1080 | 1440 | 2160;
export type Fps = 24 | 25 | 30 | 60;
export type Corner = "tl" | "tr" | "bl" | "br";
export type StartMarker = "none" | "cross";
export type FinishMarker = "none" | "cross" | "flag";

/** Marks on the route itself: where it starts and ends, and what each leg travelled by. */
export interface Markers {
  start: StartMarker;
  finish: FinishMarker;
  /** the finish mark is there from the start, instead of popping up when the line arrives */
  finishFromStart: boolean;
  /** a round transport icon in the middle of each leg, popping up when the leg is done */
  legIcons: boolean;
}

export interface SavedView {
  center: LngLat;
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface RoutePoint {
  at: LngLat;
  /** A new leg starts at this point, travelling by this transport. */
  transport?: TransportId;
  /** Seconds the line stops here. */
  pause?: number;
  /** Seconds the leg that starts at this point takes to draw (unset = share of the travel time). */
  legSeconds?: number;
  /** Keep a hard corner here even when the route is smoothed. */
  sharp?: boolean;
}

export interface Route {
  kind: "drawn" | "gpx";
  points: RoutePoint[];
  smooth: boolean;
  /** Transport of the first leg. */
  startTransport: TransportId;
}

export interface TransportStyle {
  /** a hex colour, or "auto" to follow the map (lib/colors.ts) */
  color: string;
  width: number;
  line: LineStyle;
  symbol: SymbolKind;
  /** null = same as the line */
  symbolColor: string | null;
}

export interface Sign {
  id: string;
  at: LngLat;
  style: SignStyle;
  text: string;
  /** data: URL, photo signs only */
  photo?: string;
  show: "always" | "passed";
  /** Seconds the line stops when it reaches this sign. */
  pause: number;
}

export interface Scene {
  id: string;
  name: string;
  route: Route;
  look: {
    theme: ThemeId;
    terrain: boolean;
    /** How raised terrain is drawn: hill shading, or thin height curves only. */
    terrainStyle: "shading" | "contours";
    placeNames: boolean;
    outline: boolean;
    showAhead: boolean;
    symbolScale: number;
    transports: Record<TransportId, TransportStyle>;
    compass: { on: boolean; corner: Corner; style: "needle" | "rose"; size: number };
    markers: Markers;
    /** where the sunlight comes from: degrees from north, and height above the horizon */
    sun: { azimuth: number; altitude: number };
    /** relief height: 1 = true shape */
    relief: number;
    /** outlines of maria, basins and big craters; colour "auto" follows the look */
    areas: { on: boolean; names: boolean; color: string };
    /** landmarks like the Straight Wall, as points */
    sights: { on: boolean; names: boolean };
    /** every spacecraft that has landed: a history mark over a faint cross on the ground */
    history: { on: boolean; names: boolean };
  };
  signs: Sign[];
  signScale: number;
  camera: {
    mode: "follow" | "fixed" | "glide";
    zoom: number;
    pitch: number;
    up: "north" | "travel";
    lookAhead: 0 | 0.15 | 0.3;
    steadiness: "tight" | "smooth" | "very";
    openWide: boolean;
    closeWide: boolean;
    fixedView: SavedView | null;
    startView: SavedView | null;
    endView: SavedView | null;
  };
  timing: { duration: number; easing: "steady" | "ease" };
  /** Where the editing map was last looking. */
  view: SavedView | null;
}

export interface Project {
  id: string;
  version: 2;
  name: string;
  createdAt: number;
  updatedAt: number;
  scenes: Scene[];
  output: {
    aspect: Aspect;
    resolution: Resolution;
    fps: Fps;
    holdStart: number;
    holdEnd: number;
    credit: boolean;
    joinScenes: boolean;
  };
}

export const ASPECTS: Record<Aspect, { ratio: number; label: string }> = {
  "16:9": { ratio: 16 / 9, label: "16:9 Landscape" },
  "9:16": { ratio: 9 / 16, label: "9:16 Story" },
  "1:1": { ratio: 1, label: "1:1 Square" },
  "4:5": { ratio: 4 / 5, label: "4:5 Portrait" },
};

export const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: 1080, label: "1080p" },
  { value: 1440, label: "2K" },
  { value: 2160, label: "4K" },
];

/** Output pixel size; the short side equals the chosen resolution. Always even. */
export function outputSize(aspect: Aspect, res: Resolution): { width: number; height: number } {
  const r = ASPECTS[aspect].ratio;
  const even = (n: number) => Math.round(n / 2) * 2;
  return r >= 1 ? { width: even(res * r), height: res } : { width: res, height: even(res / r) };
}

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

import { TRANSPORTS, TRANSPORT_IDS } from "./transports";

export function defaultTransportStyles(): Record<TransportId, TransportStyle> {
  return Object.fromEntries(
    TRANSPORT_IDS.map((id) => {
      const t = TRANSPORTS[id];
      return [id, { color: "auto", width: 6, line: t.line, symbol: "badge", symbolColor: null } satisfies TransportStyle];
    }),
  ) as Record<TransportId, TransportStyle>;
}

export function defaultMarkers(): Markers {
  return { start: "none", finish: "none", finishFromStart: false, legIcons: false };
}

export function newScene(name = "Scene 1", lookFrom?: Scene): Scene {
  return {
    id: uid(),
    name,
    route: { kind: "drawn", points: [], smooth: true, startTransport: "car" },
    look: lookFrom
      ? structuredClone(lookFrom.look)
      : {
          theme: "curves",
          terrain: true,
          terrainStyle: "shading",
          placeNames: false,
          outline: true,
          showAhead: true,
          symbolScale: 1,
          transports: defaultTransportStyles(),
          compass: { on: false, corner: "tr", style: "needle", size: 1 },
          markers: defaultMarkers(),
          sun: { azimuth: 100, altitude: 14 },
          relief: 1,
          areas: { on: true, names: true, color: "auto" },
          sights: { on: true, names: true },
          history: { on: true, names: true },
        },
    signs: [],
    signScale: lookFrom?.signScale ?? 1,
    camera: lookFrom
      ? { ...structuredClone(lookFrom.camera), fixedView: null, startView: null, endView: null }
      : {
          mode: "follow",
          zoom: 11,
          pitch: 50,
          up: "travel",
          lookAhead: 0.15,
          steadiness: "smooth",
          openWide: true,
          closeWide: false,
          fixedView: null,
          startView: null,
          endView: null,
        },
    timing: { duration: 12, easing: "ease" },
    view: lookFrom?.view ?? null,
  };
}

export function newProject(name = "Untitled trip"): Project {
  const now = Date.now();
  return {
    id: uid(),
    version: 2,
    name,
    createdAt: now,
    updatedAt: now,
    scenes: [newScene()],
    output: { aspect: "16:9", resolution: 1080, fps: 30, holdStart: 1, holdEnd: 1.5, credit: true, joinScenes: false },
  };
}

/**
 * The demo: a rover drive through the Taurus-Littrow valley, after Apollo 17's second
 * moonwalk (December 1972). The stops are approximate, not the surveyed station positions.
 */
export function demoProject(): Project {
  const p = newProject("Apollo 17, Taurus-Littrow");
  const s = p.scenes[0];
  s.route.startTransport = "car";
  s.route.points = (
    [
      [30.7723, 20.1911],
      [30.735, 20.176],
      [30.69, 20.158],
      [30.64, 20.142],
      [30.598, 20.128],
      [30.62, 20.147],
      [30.665, 20.168],
      [30.705, 20.18],
      [30.745, 20.188],
      [30.7723, 20.1911],
    ] as LngLat[]
  ).map((at) => ({ at }));
  s.route.points[4].pause = 1.5;
  s.route.points[8].transport = "walk";
  s.signs.push({ id: uid(), at: [30.7723, 20.1911], style: "plate", text: "Challenger", show: "always", pause: 0 });
  s.signs.push({ id: uid(), at: [30.598, 20.128], style: "flag", text: "Station 2, South Massif", show: "passed", pause: 0 });
  s.signs.push({ id: uid(), at: [30.69, 20.158], style: "pin", text: "Station 4", show: "passed", pause: 0 });
  s.look.markers = { start: "cross", finish: "none", finishFromStart: false, legIcons: true };
  s.timing.duration = 16;
  s.view = { center: [30.69, 20.165], zoom: 10.4, bearing: 0, pitch: 0 };
  return p;
}

// ---------- coercion and migration ----------

function coerceScene(raw: Partial<Scene>, i: number): Scene {
  const base = newScene(`Scene ${i + 1}`);
  const look = { ...base.look, ...raw.look };
  look.transports = { ...base.look.transports };
  for (const id of TRANSPORT_IDS) {
    const t = { ...base.look.transports[id], ...raw.look?.transports?.[id] };
    // Colours left at the old built-in default now follow the map instead.
    if (t.color && t.color.toUpperCase() === TRANSPORTS[id].color.toUpperCase()) t.color = "auto";
    look.transports[id] = t;
  }
  look.compass = { ...base.look.compass, ...raw.look?.compass };
  look.markers = { ...defaultMarkers(), ...raw.look?.markers };
  look.sun = { ...base.look.sun, ...raw.look?.sun };
  look.areas = { ...base.look.areas, ...raw.look?.areas };
  look.sights = { ...base.look.sights, ...raw.look?.sights };
  look.history = { ...base.look.history, ...raw.look?.history };
  if (!["curves", "curves-paper", "curves-blueprint", "curves-colour", "relief"].includes(look.theme)) look.theme = base.look.theme;
  return {
    ...base,
    ...raw,
    id: raw.id ?? base.id,
    route: { ...base.route, ...raw.route, points: (raw.route?.points ?? []).filter((p) => Array.isArray(p?.at)) },
    look,
    signs: (raw.signs ?? []).map((s) => ({ ...s, id: s.id ?? uid() })),
    camera: { ...base.camera, ...raw.camera },
    timing: { ...base.timing, ...raw.timing },
  };
}

interface V1Project {
  version: 1;
  name: string;
  route: { points: LngLat[]; kind: "drawn" | "gpx"; smooth: boolean };
  style: { theme: ThemeId; terrain: boolean; lineColor: string; lineWidth: number; symbol: "arrow" | "dot" | "none"; showAhead: boolean };
  camera: Partial<Scene["camera"]>;
  timing: { duration: number; holdStart: number; holdEnd: number; easing: "steady" | "ease" };
  output: { aspect: Aspect; resolution: number; fps: Fps; credit: boolean };
}

function fromV1(v: V1Project): Project {
  const p = newProject(v.name || "Untitled trip");
  const s = p.scenes[0];
  s.route = { kind: v.route.kind, smooth: v.route.smooth, points: v.route.points.map((at) => ({ at })), startTransport: "car" };
  s.look.theme = v.style.theme;
  s.look.terrain = v.style.terrain;
  s.look.showAhead = v.style.showAhead;
  s.look.transports.car = { ...s.look.transports.car, color: v.style.lineColor, width: v.style.lineWidth, symbol: v.style.symbol };
  s.camera = { ...s.camera, ...v.camera, openWide: false, closeWide: false, startView: null, endView: null };
  s.timing = { duration: v.timing.duration, easing: v.timing.easing };
  p.output = {
    ...p.output,
    aspect: v.output.aspect,
    fps: v.output.fps,
    credit: v.output.credit,
    holdStart: v.timing.holdStart,
    holdEnd: v.timing.holdEnd,
    resolution: v.output.resolution >= 2160 ? 2160 : 1080,
  };
  return p;
}

/** Accepts a v2 project, a v1 project, or a project file wrapper. Throws on anything else. */
export function coerceProject(raw: unknown): Project {
  const notOurs = new Error("This file isn't a Voyager Moon project.");
  if (!raw || typeof raw !== "object") throw notOurs;
  let r = raw as Record<string, unknown>;
  if (r.format === "voyager-moon" && r.project) r = r.project as Record<string, unknown>;
  if (r.version === 1 && r.route) return fromV1(r as unknown as V1Project);
  if (r.version !== 2 || !Array.isArray(r.scenes) || !r.scenes.length) throw notOurs;
  const base = newProject();
  const p = r as unknown as Project;
  return {
    ...base,
    ...p,
    id: typeof p.id === "string" ? p.id : base.id,
    scenes: p.scenes.map((s, i) => coerceScene(s, i)),
    output: { ...base.output, ...p.output },
  };
}
