import type { LngLat } from "./types";

/**
 * Every spacecraft that has touched down on the Moon in working order (and two that landed
 * damaged), for the history marks on the map and the search box.
 *
 * Positions are planetocentric, east-positive degrees. Sources:
 * - Apollo LMs, Surveyors, Lunas, Lunokhods and Chang'e 3: LROC "Spacecraft Related
 *   Coordinates, 2016 Update" (mean observed positions in LROC images, metres accuracy).
 * - Chang'e 4 and Chandrayaan-3: LROC featured images of the landers.
 * - Luna 9, Luna 13, Chang'e 5, Chang'e 6, SLIM, IM-1, IM-2 and Blue Ghost 1: the mission
 *   records as summarised on Wikipedia (October 2026).
 */
export interface Landing {
  /** short name shown on the map */
  name: string;
  /** one line for the search results */
  detail: string;
  /** year of touchdown */
  year: number;
  crewed: boolean;
  /** landed damaged or tipped over */
  partial?: boolean;
  lat: number;
  lon: number;
  aliases?: string;
}

const L = (name: string, detail: string, year: number, lat: number, lon: number, extra: Partial<Landing> = {}): Landing => ({
  name,
  detail,
  year,
  crewed: false,
  lat,
  lon,
  ...extra,
});

/** 0..360 longitudes (as LROC gives them) to -180..180 */
const e = (lon: number) => (lon > 180 ? lon - 360 : lon);

export const LANDINGS: Landing[] = [
  // crewed
  L("Apollo 11", "Tranquility Base, July 1969", 1969, 0.67416, 23.47314, { crewed: true, aliases: "eagle armstrong aldrin tranquility base" }),
  L("Apollo 12", "Ocean of Storms, November 1969", 1969, -3.0128, e(336.5781), { crewed: true, aliases: "intrepid conrad bean" }),
  L("Apollo 14", "Fra Mauro, February 1971", 1971, -3.64589, e(342.52806), { crewed: true, aliases: "antares shepard mitchell fra mauro" }),
  L("Apollo 15", "Hadley–Apennine, July 1971", 1971, 26.13239, 3.6333, { crewed: true, aliases: "falcon scott irwin hadley rover" }),
  L("Apollo 16", "Descartes Highlands, April 1972", 1972, -8.9734, 15.5011, { crewed: true, aliases: "orion young duke descartes rover" }),
  L("Apollo 17", "Taurus–Littrow, December 1972", 1972, 20.1911, 30.7723, { crewed: true, aliases: "challenger cernan schmitt taurus littrow rover" }),

  // robotic
  L("Luna 9", "First soft landing, February 1966", 1966, 7.133, e(295.633)),
  L("Surveyor 1", "First US soft landing, June 1966", 1966, -2.4745, e(316.6602)),
  L("Luna 13", "Lander, December 1966", 1966, 18.87, -62.05),
  L("Surveyor 3", "Lander, April 1967, visited by Apollo 12", 1967, -3.0162, e(336.582)),
  L("Surveyor 5", "Lander, September 1967", 1967, 1.4551, 23.1943),
  L("Surveyor 6", "Lander, November 1967, first lift-off from the Moon", 1967, 0.4742, e(358.5725)),
  L("Surveyor 7", "Lander near Tycho, January 1968", 1968, -40.9812, e(348.4873)),
  L("Luna 16", "First robotic sample return, September 1970", 1970, -0.5137, 56.3638),
  L("Luna 17", "Lander of Lunokhod 1, November 1970", 1970, 38.23764, e(324.99837), { aliases: "lunokhod 1" }),
  L("Lunokhod 1", "First rover on the Moon, where it stopped", 1970, 38.315, e(324.9919)),
  L("Luna 20", "Sample return, February 1972", 1972, 3.7863, 56.6242),
  L("Luna 21", "Lander of Lunokhod 2, January 1973", 1973, 25.9994, 30.4076, { aliases: "lunokhod 2 le monnier" }),
  L("Lunokhod 2", "Rover, 39 km, where it stopped", 1973, 25.8323, 30.9222),
  L("Luna 23", "Landed damaged, November 1974", 1974, 12.6667, 62.1511, { partial: true }),
  L("Luna 24", "Sample return, August 1976", 1976, 12.7142, 62.2129),
  L("Chang'e 3", "Lander and Yutu rover, December 2013", 2013, 44.1214, e(340.4883), { aliases: "change yutu" }),
  L("Chang'e 4", "First far-side landing, January 2019", 2019, -45.457, 177.589, { aliases: "change yutu-2 von karman far side" }),
  L("Chang'e 5", "Sample return, December 2020", 2020, 43.0576, -51.9161, { aliases: "change mons rumker" }),
  L("Chandrayaan-3", "Vikram and Pragyan, August 2023", 2023, -69.3741, 32.32, { aliases: "vikram pragyan isro shiv shakti" }),
  L("SLIM", "Pinpoint landing, January 2024", 2024, -13.316, 25.251, { aliases: "jaxa shioli" }),
  L("IM-1 Odysseus", "First commercial landing, February 2024", 2024, -80.13, 1.44, { aliases: "odysseus intuitive machines malapert" }),
  L("Chang'e 6", "Far-side sample return, June 2024", 2024, -41.6385, -153.9852, { aliases: "change apollo basin far side" }),
  L("Blue Ghost 1", "Firefly, March 2025", 2025, 18.56, 61.81, { aliases: "firefly mons latreille crisium" }),
  L("IM-2 Athena", "Tipped over on landing, March 2025", 2025, -84.7906, 29.1957, { partial: true, aliases: "athena intuitive machines mons mouton" }),
];

export const landingAt = (l: Landing): LngLat => [l.lon, l.lat];
