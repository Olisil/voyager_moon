import { routeLengthKm } from "./geo";
import { LANDINGS } from "./landings";
import { coerceProject, uid, type Project } from "./types";

/**
 * The Historical trips: moonwalks and rover drives that really happened, kept as ordinary
 * project files in src/historical-trips (the same format as "Download file"; made by
 * tools/make_historical_trips.ts). Opening one saves a copy to your projects, so the originals
 * stay as they are.
 */
const files = import.meta.glob("../historical-trips/*.voyager-moon.json", { eager: true, import: "default" }) as Record<string, unknown>;

export interface HistoricalTrip {
  file: string;
  project: Project;
  km: number;
  /** a drive with the rover, or a walk */
  rover: boolean;
  year: number | null;
}

export const HISTORICAL_TRIPS: HistoricalTrip[] = Object.entries(files)
  .map(([path, raw]) => {
    try {
      const project = coerceProject(raw);
      const km = project.scenes.reduce((a, s) => a + routeLengthKm(s.route.points.map((p) => p.at)), 0);
      const landing = LANDINGS.find((l) => project.name.startsWith(`${l.name} `));
      const rover = project.scenes[0].route.startTransport === "car";
      return { file: path.replace(/^.*\//, ""), project, km, rover, year: landing?.year ?? null };
    } catch {
      return null;
    }
  })
  .filter((t): t is HistoricalTrip => !!t)
  .sort((a, b) => a.file.localeCompare(b.file, "en", { numeric: true }));

/** A fresh copy of a historical trip, to keep in your own projects. */
export function copyOfTrip(t: HistoricalTrip): Project {
  const now = Date.now();
  const p = structuredClone(t.project);
  return { ...p, id: uid(), createdAt: now, updatedAt: now };
}
