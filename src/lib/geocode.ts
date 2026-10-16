import type { LngLat } from "./types";

export interface Place {
  name: string;
  detail: string;
  at: LngLat;
  /** [west, south, east, north] when the place has an extent */
  extent?: [number, number, number, number];
  zoom: number;
}

/**
 * Places on the Moon to search: landing sites, maria, big craters, mountains and rilles.
 * Positions are planetocentric, east-positive, rounded from the IAU Gazetteer of Planetary
 * Nomenclature and published landing coordinates. The map stops at 85° north and south, so the
 * poles themselves (Shackleton, Peary) aren't listed.
 */
type Entry = [name: string, kind: string, lat: number, lon: number, zoom: number, aliases?: string];

const PLACES: Entry[] = [
  // landing sites
  ["Apollo 11, Tranquility Base", "Landing site, 1969", 0.6741, 23.473, 13, "eagle armstrong aldrin"],
  ["Apollo 12, Ocean of Storms", "Landing site, 1969", -3.0124, -23.4216, 13, "intrepid surveyor 3"],
  ["Apollo 14, Fra Mauro", "Landing site, 1971", -3.6453, -17.4714, 13, "antares shepard"],
  ["Apollo 15, Hadley-Apennine", "Landing site, 1971", 26.1322, 3.6339, 12, "falcon rover hadley"],
  ["Apollo 16, Descartes Highlands", "Landing site, 1972", -8.973, 15.5002, 12, "orion"],
  ["Apollo 17, Taurus-Littrow", "Landing site, 1972", 20.1908, 30.7717, 12, "challenger cernan schmitt"],
  ["Luna 9", "First soft landing, 1966", 7.08, -64.37, 12],
  ["Luna 16", "Sample return, 1970", -0.513, 56.364, 12],
  ["Lunokhod 1 (Luna 17)", "Rover, 1970", 38.28, -35.0, 12],
  ["Lunokhod 2 (Luna 21)", "Rover, 1973", 25.85, 30.45, 12, "le monnier"],
  ["Luna 24", "Sample return, 1976", 12.71, 62.21, 12],
  ["Surveyor 1", "Landing site, 1966", -2.47, -43.34, 12],
  ["Chang'e 3, Yutu", "Rover, 2013", 44.12, -19.51, 12, "change yutu"],
  ["Chang'e 4, Yutu-2", "Far side rover, 2019", -45.44, 177.6, 12, "change von karman"],
  ["Chang'e 5", "Sample return, 2020", 43.06, -51.92, 12, "change mons rumker"],
  ["Chandrayaan-3, Vikram", "Landing site, 2023", -69.37, 32.32, 12, "pragyan"],
  ["SLIM", "Landing site, 2024", -13.32, 25.25, 12],
  ["Odysseus (IM-1)", "Landing site, 2024", -80.13, 1.44, 11, "intuitive machines malapert"],
  ["Blue Ghost 1", "Landing site, 2025", 18.56, 61.81, 12, "mare crisium mons latreille"],
  // maria and basins
  ["Mare Tranquillitatis", "Sea of Tranquillity", 8.5, 31.4, 6, "tranquility"],
  ["Mare Imbrium", "Sea of Showers", 32.8, -15.6, 5],
  ["Mare Serenitatis", "Sea of Serenity", 28.0, 17.5, 6],
  ["Mare Crisium", "Sea of Crises", 17.0, 59.1, 6],
  ["Mare Nectaris", "Sea of Nectar", -15.2, 35.5, 6],
  ["Mare Fecunditatis", "Sea of Fertility", -7.8, 51.3, 6],
  ["Mare Nubium", "Sea of Clouds", -21.3, -16.6, 6],
  ["Mare Humorum", "Sea of Moisture", -24.4, -38.6, 6],
  ["Mare Frigoris", "Sea of Cold", 56.0, 1.4, 5],
  ["Oceanus Procellarum", "Ocean of Storms", 18.4, -57.4, 4],
  ["Mare Orientale", "Eastern Sea, a ringed basin", -19.4, -92.8, 5],
  ["Mare Moscoviense", "Sea of Moscow, far side", 27.3, 147.9, 6],
  ["South Pole–Aitken basin", "Basin, far side", -53.0, -169.0, 4, "aitken"],
  // craters
  ["Tycho", "Crater, 85 km", -43.31, -11.36, 9],
  ["Copernicus", "Crater, 96 km", 9.62, -20.08, 9],
  ["Kepler", "Crater, 31 km", 8.12, -38.01, 10],
  ["Aristarchus", "Crater, 40 km", 23.73, -47.49, 10],
  ["Plato", "Crater, 101 km", 51.62, -9.38, 9],
  ["Clavius", "Crater, 231 km", -58.62, -14.73, 8],
  ["Ptolemaeus", "Crater, 154 km", -9.16, -1.84, 8],
  ["Alphonsus", "Crater, 119 km", -13.39, -2.85, 9],
  ["Arzachel", "Crater, 97 km", -18.26, -1.93, 9],
  ["Theophilus", "Crater, 99 km", -11.45, 26.28, 9],
  ["Eratosthenes", "Crater, 58 km", 14.47, -11.32, 9],
  ["Langrenus", "Crater, 132 km", -8.86, 60.9, 8],
  ["Petavius", "Crater, 188 km", -25.3, 60.4, 8],
  ["Grimaldi", "Crater, 173 km", -5.2, -68.6, 8],
  ["Archimedes", "Crater, 81 km", 29.72, -3.99, 9],
  ["Posidonius", "Crater, 95 km", 31.8, 29.9, 9],
  ["Gassendi", "Crater, 110 km", -17.55, -39.96, 9],
  ["Schickard", "Crater, 206 km", -44.4, -54.6, 8],
  ["Tsiolkovskiy", "Crater, far side, 185 km", -20.38, 129.1, 8],
  // mountains, valleys, rilles
  ["Montes Apenninus", "Lunar Apennines", 18.9, -3.7, 7, "apennines"],
  ["Montes Alpes", "Lunar Alps", 48.4, -0.6, 7, "alps"],
  ["Vallis Alpes", "Alpine Valley", 49.2, 3.6, 8, "alpine"],
  ["Mons Huygens", "Highest peak of the Apennines", 20.0, -2.9, 9],
  ["Mons Piton", "Mountain", 40.7, -1.1, 10],
  ["Montes Taurus", "Taurus Mountains", 25.9, 35.9, 7],
  ["Rupes Recta", "The Straight Wall", -22.1, -7.8, 9, "straight wall"],
  ["Rima Hadley", "Hadley Rille", 25.0, 3.0, 9, "hadley rille"],
  ["Vallis Schröteri", "Schröter's Valley", 26.2, -50.8, 9, "schroter schroeter"],
];

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Search among the places above, by name, description or alias. Instant and offline. */
export async function searchPlaces(q: string, _signal?: AbortSignal): Promise<Place[]> {
  const words = fold(q).split(/\s+/).filter(Boolean);
  const scored: { p: Place; score: number }[] = [];
  for (const [name, detail, lat, lon, zoom, aliases] of PLACES) {
    const hay = fold(`${name} ${detail} ${aliases ?? ""}`);
    if (!words.every((w) => hay.includes(w))) continue;
    const score = fold(name).startsWith(words[0]) ? 0 : 1;
    scored.push({ p: { name, detail, at: [lon, lat], zoom }, score });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, 8).map((s) => s.p);
}
