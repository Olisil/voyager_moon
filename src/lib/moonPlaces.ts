import type { LngLat } from "./types";

/**
 * Named places on the Moon: for the search box, the outlined areas and the sights.
 *
 * Positions are planetocentric, east-positive, rounded from the IAU Gazetteer of Planetary
 * Nomenclature and published landing coordinates. Craters are outlined as circles of their
 * catalogued diameter, which matches their rims well. Maria aren't round, so they are outlined
 * as smooth ovals of about the right size and orientation: a guide to where they are, not their
 * true shores. The map stops at 85° north and south, so the poles themselves aren't listed.
 */
export type PlaceKind = "site" | "mare" | "basin" | "crater" | "feature";

export interface MoonPlace {
  name: string;
  /** short description shown in search results */
  detail: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
  /** zoom for "go to" from search */
  zoom: number;
  /** outline size in km: diameter, or [east-west, north-south] for an oval */
  size?: number | [number, number];
  /** oval tilt, degrees clockwise from north-south */
  tilt?: number;
  aliases?: string;
}

const P = (
  kind: PlaceKind,
  name: string,
  detail: string,
  lat: number,
  lon: number,
  zoom: number,
  extra: Partial<Pick<MoonPlace, "size" | "tilt" | "aliases">> = {},
): MoonPlace => ({ kind, name, detail, lat, lon, zoom, ...extra });

export const MOON_PLACES: MoonPlace[] = [
  // landing sites
  P("site", "Apollo 11", "Tranquility Base, 1969", 0.6741, 23.473, 13, { aliases: "eagle armstrong aldrin tranquility base" }),
  P("site", "Apollo 12", "Ocean of Storms, 1969", -3.0124, -23.4216, 13, { aliases: "intrepid surveyor 3" }),
  P("site", "Apollo 14", "Fra Mauro, 1971", -3.6453, -17.4714, 13, { aliases: "antares shepard fra mauro" }),
  P("site", "Apollo 15", "Hadley–Apennine, 1971", 26.1322, 3.6339, 12, { aliases: "falcon rover hadley" }),
  P("site", "Apollo 16", "Descartes Highlands, 1972", -8.973, 15.5002, 12, { aliases: "orion descartes" }),
  P("site", "Apollo 17", "Taurus–Littrow, 1972", 20.1908, 30.7717, 12, { aliases: "challenger cernan schmitt taurus littrow" }),
  P("site", "Luna 9", "First soft landing, 1966", 7.08, -64.37, 12),
  P("site", "Luna 16", "Sample return, 1970", -0.513, 56.364, 12),
  P("site", "Lunokhod 1", "Rover, Luna 17, 1970", 38.28, -35.0, 12),
  P("site", "Lunokhod 2", "Rover, Luna 21, 1973", 25.85, 30.45, 12, { aliases: "le monnier" }),
  P("site", "Luna 24", "Sample return, 1976", 12.71, 62.21, 12),
  P("site", "Surveyor 1", "Landing site, 1966", -2.47, -43.34, 12),
  P("site", "Chang'e 3", "Yutu rover, 2013", 44.12, -19.51, 12, { aliases: "change yutu" }),
  P("site", "Chang'e 4", "Yutu-2 rover, far side, 2019", -45.44, 177.6, 12, { aliases: "change von karman" }),
  P("site", "Chang'e 5", "Sample return, 2020", 43.06, -51.92, 12, { aliases: "change mons rumker" }),
  P("site", "Chandrayaan-3", "Vikram and Pragyan, 2023", -69.37, 32.32, 12, { aliases: "vikram pragyan" }),
  P("site", "SLIM", "Landing site, 2024", -13.32, 25.25, 12),
  P("site", "Odysseus", "IM-1, 2024", -80.13, 1.44, 11, { aliases: "intuitive machines malapert im-1" }),
  P("site", "Blue Ghost 1", "Landing site, 2025", 18.56, 61.81, 12, { aliases: "mare crisium mons latreille" }),

  // maria and basins (ovals of about the right size)
  P("mare", "Mare Imbrium", "Sea of Showers", 32.8, -15.6, 5, { size: [1150, 1050] }),
  P("mare", "Mare Serenitatis", "Sea of Serenity", 28.0, 17.5, 6, { size: [640, 700] }),
  P("mare", "Mare Crisium", "Sea of Crises", 17.0, 59.1, 6, { size: [560, 420] }),
  P("mare", "Mare Tranquillitatis", "Sea of Tranquillity", 8.5, 31.4, 6, { size: [880, 640], tilt: 20, aliases: "tranquility" }),
  P("mare", "Mare Nectaris", "Sea of Nectar", -15.2, 35.5, 6, { size: [340, 340] }),
  P("mare", "Mare Fecunditatis", "Sea of Fertility", -7.8, 51.3, 6, { size: [560, 900], tilt: -10 }),
  P("mare", "Mare Nubium", "Sea of Clouds", -21.3, -16.6, 6, { size: [720, 700] }),
  P("mare", "Mare Humorum", "Sea of Moisture", -24.4, -38.6, 6, { size: [390, 390] }),
  P("mare", "Mare Vaporum", "Sea of Vapours", 13.3, 3.6, 7, { size: [245, 245] }),
  P("mare", "Mare Frigoris", "Sea of Cold", 56.0, 1.4, 5, { size: [1600, 230] }),
  P("mare", "Mare Moscoviense", "Sea of Moscow, far side", 27.3, 147.9, 6, { size: [275, 275] }),
  P("mare", "Oceanus Procellarum", "Ocean of Storms", 18.4, -57.4, 4),
  P("basin", "Mare Orientale", "Eastern Sea, a ringed basin", -19.4, -92.8, 5, { size: 930 }),
  P("basin", "South Pole–Aitken basin", "The largest basin, far side", -53.0, -169.0, 4, { size: 2500, aliases: "aitken spa" }),

  // craters (circles of their catalogued diameter)
  P("crater", "Tycho", "Crater, 85 km", -43.31, -11.36, 9, { size: 85 }),
  P("crater", "Copernicus", "Crater, 93 km", 9.62, -20.08, 9, { size: 93 }),
  P("crater", "Kepler", "Crater, 31 km", 8.12, -38.01, 10, { size: 31 }),
  P("crater", "Aristarchus", "Crater, 40 km", 23.73, -47.49, 10, { size: 40 }),
  P("crater", "Plato", "Crater, 101 km", 51.62, -9.38, 9, { size: 101 }),
  P("crater", "Clavius", "Crater, 225 km", -58.62, -14.73, 8, { size: 225 }),
  P("crater", "Ptolemaeus", "Crater, 153 km", -9.16, -1.84, 8, { size: 153 }),
  P("crater", "Alphonsus", "Crater, 108 km", -13.39, -2.85, 9, { size: 108 }),
  P("crater", "Arzachel", "Crater, 97 km", -18.26, -1.93, 9, { size: 97 }),
  P("crater", "Theophilus", "Crater, 98 km", -11.45, 26.28, 9, { size: 98 }),
  P("crater", "Eratosthenes", "Crater, 58 km", 14.47, -11.32, 9, { size: 58 }),
  P("crater", "Langrenus", "Crater, 132 km", -8.86, 60.9, 8, { size: 132 }),
  P("crater", "Petavius", "Crater, 177 km", -25.3, 60.4, 8, { size: 177 }),
  P("crater", "Grimaldi", "Crater, 172 km", -5.2, -68.6, 8, { size: 172 }),
  P("crater", "Archimedes", "Crater, 81 km", 29.72, -3.99, 9, { size: 81 }),
  P("crater", "Posidonius", "Crater, 95 km", 31.8, 29.9, 9, { size: 95 }),
  P("crater", "Gassendi", "Crater, 110 km", -17.55, -39.96, 9, { size: 110 }),
  P("crater", "Schickard", "Crater, 227 km", -44.4, -54.6, 8, { size: 227 }),
  P("crater", "Tsiolkovskiy", "Crater, far side, 185 km", -20.38, 129.1, 8, { size: 185 }),

  // landmarks
  P("feature", "Montes Apenninus", "Lunar Apennines", 18.9, -3.7, 7, { aliases: "apennines" }),
  P("feature", "Montes Alpes", "Lunar Alps", 48.4, -0.6, 7, { aliases: "alps" }),
  P("feature", "Vallis Alpes", "Alpine Valley", 49.2, 3.6, 8, { aliases: "alpine valley" }),
  P("feature", "Mons Huygens", "Highest peak of the Apennines", 20.0, -2.9, 9),
  P("feature", "Mons Piton", "Lone mountain in Imbrium", 40.7, -1.1, 10),
  P("feature", "Montes Taurus", "Taurus Mountains", 25.9, 35.9, 7),
  P("feature", "Rupes Recta", "The Straight Wall", -22.1, -7.8, 9, { aliases: "straight wall" }),
  P("feature", "Rima Hadley", "Hadley Rille", 25.0, 3.0, 9, { aliases: "hadley rille" }),
  P("feature", "Vallis Schröteri", "Schröter's Valley", 26.2, -50.8, 9, { aliases: "schroter schroeter" }),
  P("feature", "Reiner Gamma", "A bright swirl", 7.5, -59.0, 9, { aliases: "swirl" }),
  P("feature", "Marius Hills", "Volcanic domes and a skylight pit", 13.4, -55.9, 9, { aliases: "pit skylight" }),
];

export const MOON_R_KM = 1737.4;

/** A point `dist` km from (lat, lon) in direction `bearing` (degrees), on the Moon's sphere. */
function destination(lat: number, lon: number, bearing: number, dist: number): LngLat {
  const d = dist / MOON_R_KM;
  const b = (bearing * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [(l2 * 180) / Math.PI, (p2 * 180) / Math.PI];
}

/** The outline of a place: a circle or an oval, as a closed ring of lng/lat points. */
export function outline(p: MoonPlace, steps = 96): LngLat[] | null {
  if (!p.size) return null;
  const [w, h] = typeof p.size === "number" ? [p.size, p.size] : p.size;
  const tilt = p.tilt ?? 0;
  const ring: LngLat[] = [];
  let prevLon: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    // oval in its own frame (x east, y north), then turned by the tilt
    const x = (w / 2) * Math.sin(t);
    const y = (h / 2) * Math.cos(t);
    const dist = Math.hypot(x, y);
    const bearing = (Math.atan2(x, y) * 180) / Math.PI + tilt;
    let [lon, lat] = destination(p.lat, p.lon, bearing, dist);
    // keep the ring continuous across the date line
    if (prevLon !== null) while (lon - prevLon > 180) lon -= 360;
    if (prevLon !== null) while (lon - prevLon < -180) lon += 360;
    prevLon = lon;
    ring.push([lon, Math.max(-85, Math.min(85, lat))]);
  }
  return ring;
}

/** Outlines of the maria, basins and craters for the map. */
export function areaOutlines(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of MOON_PLACES) {
    const ring = outline(p);
    if (!ring) continue;
    features.push({ type: "Feature", properties: { name: p.name, kind: p.kind }, geometry: { type: "LineString", coordinates: ring } });
  }
  return { type: "FeatureCollection", features };
}
