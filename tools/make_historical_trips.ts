/**
 * Writes the Historical trips (src/historical-trips/*.voyager-moon.json): the moonwalks and rover
 * drives of the Apollo landings, one project file each, as ordinary Voyager Moon project files, the same format as
 * "Download file" in the app. Run from the project folder:
 *
 *     npx tsx tools/make_historical_trips.ts
 *
 * Where the positions come from:
 * - Lunar Module, ALSEP, SEP and final rover parking positions, and Surveyor 3: LROC
 *   "Spacecraft Related Coordinates, 2016 Update" (measured in LROC images, metres accuracy).
 * - Geology stations: the named craters they were at, from the IAU Gazetteer of Planetary
 *   Nomenclature as given on Wikipedia (to 0.01°, about 300 m), placed on the side of the crater
 *   the mission records name. The lines between stations are straight and smoothed: the real
 *   drives wound around craters and boulders, so treat the routes as a good guide, not a survey.
 * Moonwalks whose stations aren't in the gazetteer (Apollo 15 and 17 EVA 3) are left out.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newProject, newScene, type LngLat, type Project, type Scene, type SignStyle, type TransportId } from "../src/lib/types";

const OUT = join("src", "historical-trips");
const KM_PER_DEG = (Math.PI * 1737.4) / 180;
const MADE = Date.UTC(2026, 9, 19);

/** A point moved east and north by some kilometres. */
function offset([lon, lat]: LngLat, eastKm: number, northKm: number): LngLat {
  const cos = Math.cos((lat * Math.PI) / 180);
  return [round(lon + eastKm / (KM_PER_DEG * cos)), round(lat + northKm / KM_PER_DEG)];
}
const round = (v: number) => Math.round(v * 1e6) / 1e6;
const lonlat = (lat: number, lon: number): LngLat => [lon, lat];

interface Stop {
  at: LngLat;
  /** a sign here */
  sign?: string;
  style?: SignStyle;
  /** seconds the line waits here */
  pause?: number;
}

interface Walk {
  name: string;
  transport: TransportId;
  stops: Stop[];
  seconds: number;
}

function kmBetween(a: LngLat, b: LngLat) {
  const cos = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * cos, a[1] - b[1]) * KM_PER_DEG;
}

/** The zoom that fits a set of points in about 600 px. */
function fitZoom(pts: LngLat[]) {
  const lats = pts.map((p) => p[1]);
  const lons = pts.map((p) => p[0]);
  const cos = Math.cos((((Math.max(...lats) + Math.min(...lats)) / 2) * Math.PI) / 180);
  const extent = Math.max(Math.max(...lats) - Math.min(...lats), (Math.max(...lons) - Math.min(...lons)) * cos, 0.0004);
  return Math.min(19, Math.log2((600 * 360) / (512 * extent)));
}

function scene(w: Walk, i: number, lookFrom?: Scene): Scene {
  const s = newScene(w.name, lookFrom);
  s.id = `scene-${i + 1}`;
  s.route.kind = "drawn";
  s.route.smooth = true;
  s.route.startTransport = w.transport;
  s.route.points = w.stops.map((st) => ({ at: st.at, ...(st.pause ? { pause: st.pause } : {}) }));
  s.signs = w.stops
    .filter((st) => st.sign)
    .map((st, k) => ({
      id: `sign-${i + 1}-${k + 1}`,
      at: st.at,
      style: st.style ?? "flag",
      text: st.sign!,
      show: k === 0 ? "always" : "passed",
      pause: 0,
    }));
  s.look.markers = { start: "cross", finish: "none", finishFromStart: false, legIcons: false };
  const pts = w.stops.map((st) => st.at);
  const z = fitZoom(pts);
  const lats = pts.map((p) => p[1]);
  const lons = pts.map((p) => p[0]);
  const center: LngLat = [round((Math.max(...lons) + Math.min(...lons)) / 2), round((Math.max(...lats) + Math.min(...lats)) / 2)];
  s.view = { center, zoom: round(z), bearing: 0, pitch: 0 };
  s.camera = { ...s.camera, mode: "follow", zoom: round(Math.min(19.5, z + 1.3)), pitch: 50, up: "travel", openWide: true };
  s.timing = { duration: w.seconds, easing: "ease" };
  return s;
}

/** One project file per moonwalk or drive (the editor works on a project's first scene). */
function trip(file: string, mission: string, walks: Walk[]): { file: string; project: Project }[] {
  return walks.map((w, i) => {
    const p = newProject(`${mission} · ${w.name}`);
    p.id = `historical-${file}-eva-${i + 1}`;
    p.createdAt = MADE;
    p.updatedAt = MADE;
    p.scenes = [scene(w, 0)];
    return { file: `${file}-eva-${i + 1}`, project: p };
  });
}

// ---------- Apollo 11: Armstrong's walk to Little West crater ----------

const A11_LM = lonlat(0.67416, 23.47314);
const apollo11 = trip("apollo-11", "Apollo 11", [
  {
    name: "Moonwalk to Little West crater",
    transport: "walk",
    seconds: 10,
    stops: [
      { at: A11_LM, sign: "Eagle", style: "plate" },
      // Little West crater, about 30 m across, some 60 m east of the LM: Armstrong went to its rim
      { at: offset(A11_LM, 0.045, -0.003), sign: "Little West crater", pause: 1 },
      { at: A11_LM },
    ],
  },
]);

// ---------- Apollo 12: the ALSEP, then the walk to Surveyor 3 ----------

const A12_LM = lonlat(-3.0128, -23.4219);
const A12_ALSEP = lonlat(-3.0098, -23.4249);
const SURVEYOR_3 = lonlat(-3.0162, -23.418);
const apollo12 = trip("apollo-12", "Apollo 12", [
  {
    name: "EVA 1 · Setting up the ALSEP",
    transport: "walk",
    seconds: 9,
    stops: [{ at: A12_LM, sign: "Intrepid", style: "plate" }, { at: A12_ALSEP, sign: "ALSEP", pause: 1 }, { at: A12_LM }],
  },
  {
    name: "EVA 2 · The walk to Surveyor 3",
    transport: "walk",
    seconds: 11,
    stops: [{ at: A12_LM, sign: "Intrepid", style: "plate" }, { at: SURVEYOR_3, sign: "Surveyor 3, landed 1967", pause: 1.5 }, { at: A12_LM }],
  },
]);

// ---------- Apollo 14: the ALSEP, then towards the rim of Cone crater ----------

const A14_LM = lonlat(-3.64589, -17.47194);
const A14_ALSEP = lonlat(-3.64419, -17.47768);
const CONE = lonlat(-3.62, -17.43);
// they stopped some 20 m short of the rim of the 340 m crater, on its west side
const coneRim = (() => {
  const d = kmBetween(A14_LM, CONE);
  const k = (d - 0.19) / d;
  return [round(A14_LM[0] + (CONE[0] - A14_LM[0]) * k), round(A14_LM[1] + (CONE[1] - A14_LM[1]) * k)] as LngLat;
})();
const apollo14 = trip("apollo-14", "Apollo 14", [
  {
    name: "EVA 1 · Setting up the ALSEP",
    transport: "walk",
    seconds: 9,
    stops: [{ at: A14_LM, sign: "Antares", style: "plate" }, { at: A14_ALSEP, sign: "ALSEP", pause: 1 }, { at: A14_LM }],
  },
  {
    name: "EVA 2 · Towards Cone crater",
    transport: "walk",
    seconds: 14,
    stops: [{ at: A14_LM, sign: "Antares", style: "plate" }, { at: coneRim, sign: "Near the rim of Cone crater", pause: 1.5 }, { at: A14_LM }],
  },
]);

// ---------- Apollo 15: the first rover drives ----------

const A15_LM = lonlat(26.13239, 3.6333);
const A15_ALSEP = lonlat(26.13406, 3.62991);
const A15_LRV = lonlat(26.13174, 3.63803);
const ELBOW = lonlat(26.03, 3.6);
const ST_GEORGE = lonlat(25.96, 3.54);
const RHYSLING = lonlat(26.07, 3.62);
const SPUR = lonlat(25.98, 3.67);
const DUNE = lonlat(26.04, 3.66);
const apollo15 = trip("apollo-15", "Apollo 15", [
  {
    name: "EVA 1 · Elbow and St. George",
    transport: "car",
    seconds: 18,
    stops: [
      { at: A15_LM, sign: "Falcon", style: "plate" },
      { at: offset(ELBOW, 0.15, 0), sign: "Station 1 · Elbow", pause: 1 },
      { at: offset(ST_GEORGE, 0.35, 0.35), sign: "Station 2 · St. George", pause: 1.2 },
      { at: offset(RHYSLING, -0.125, 0), sign: "Station 3 · Rhysling", pause: 1 },
      { at: A15_ALSEP, sign: "ALSEP" },
      { at: A15_LM },
    ],
  },
  {
    name: "EVA 2 · Spur and Dune, the Genesis Rock",
    transport: "car",
    seconds: 18,
    stops: [
      { at: A15_LM, sign: "Falcon", style: "plate" },
      { at: SPUR, sign: "Station 7 · Spur, the Genesis Rock", pause: 1.5 },
      { at: DUNE, sign: "Station 4 · Dune", pause: 1 },
      { at: A15_LRV },
    ],
  },
]);

// ---------- Apollo 16: Flag and Spook, Stone Mountain, North Ray ----------

const A16_LM = lonlat(-8.9734, 15.5011);
const A16_ALSEP = lonlat(-8.9759, 15.4986);
const A16_LRV = lonlat(-8.9729, 15.5037);
const FLAG = lonlat(-8.97, 15.45);
const SPOOK = lonlat(-8.98, 15.48);
const CINCO = lonlat(-9.1, 15.52);
const NORTH_RAY = lonlat(-8.82, 15.48);
const apollo16 = trip("apollo-16", "Apollo 16", [
  {
    name: "EVA 1 · Flag and Spook",
    transport: "car",
    seconds: 14,
    stops: [
      { at: A16_LM, sign: "Orion", style: "plate" },
      { at: A16_ALSEP, sign: "ALSEP" },
      { at: offset(FLAG, 0.15, 0), sign: "Station 1 · Plum, on Flag", pause: 1 },
      { at: offset(SPOOK, -0.1, 0), sign: "Station 2 · Spook", pause: 1 },
      { at: A16_LM },
    ],
  },
  {
    name: "EVA 2 · Up Stone Mountain",
    transport: "car",
    seconds: 16,
    stops: [
      { at: A16_LM, sign: "Orion", style: "plate" },
      { at: offset(CINCO, -0.08, 0), sign: "Station 4 · Cinco, Stone Mountain", pause: 1.5 },
      { at: A16_LM },
    ],
  },
  {
    name: "EVA 3 · North Ray crater",
    transport: "car",
    seconds: 16,
    stops: [
      { at: A16_LM, sign: "Orion", style: "plate" },
      // the station was on the southeast rim of the kilometre-wide crater, by House Rock
      { at: offset(NORTH_RAY, 0.3, -0.35), sign: "Station 11 · North Ray, House Rock", pause: 1.5 },
      { at: A16_LRV },
    ],
  },
]);

// ---------- Apollo 17: the longest drives ----------

const A17_LM = lonlat(20.1911, 30.7723);
const A17_ALSEP = lonlat(20.1923, 30.7655);
const A17_SEP = lonlat(20.192, 30.7768);
const NANSEN = lonlat(20.11, 30.53);
const LARA = lonlat(20.17, 30.55);
const SHORTY = lonlat(20.22, 30.63);
const CAMELOT = lonlat(20.19, 30.73);
const apollo17 = trip("apollo-17", "Apollo 17", [
  {
    name: "EVA 1 · ALSEP and the SEP",
    transport: "walk",
    seconds: 9,
    stops: [
      { at: A17_LM, sign: "Challenger", style: "plate" },
      { at: A17_ALSEP, sign: "ALSEP", pause: 1 },
      { at: A17_SEP, sign: "SEP transmitter" },
      { at: A17_LM },
    ],
  },
  {
    name: "EVA 2 · Nansen, Lara, Shorty, Camelot",
    transport: "car",
    seconds: 22,
    stops: [
      { at: A17_LM, sign: "Challenger", style: "plate" },
      { at: NANSEN, sign: "Station 2 · Nansen, South Massif", pause: 1.5 },
      { at: offset(LARA, 0.15, 0.15), sign: "Station 3 · Lara", pause: 1 },
      { at: SHORTY, sign: "Station 4 · Shorty, the orange soil", pause: 1.5 },
      { at: offset(CAMELOT, 0, -0.25), sign: "Station 5 · Camelot", pause: 1 },
      { at: A17_LM },
    ],
  },
]);

mkdirSync(OUT, { recursive: true });
for (const { file, project } of [apollo11, apollo12, apollo14, apollo15, apollo16, apollo17].flat()) {
  const body = JSON.stringify({ format: "voyager-moon", version: 2, project }, null, 2);
  writeFileSync(join(OUT, `${file}.voyager-moon.json`), body + "\n");
  const km = project.scenes.map((s) => {
    let d = 0;
    for (let i = 1; i < s.route.points.length; i++) d += kmBetween(s.route.points[i - 1].at, s.route.points[i].at);
    return d.toFixed(1);
  });
  console.log(`${file}: ${project.name}, ${km.join(" + ")} km`);
}
