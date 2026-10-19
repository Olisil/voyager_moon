import { MOON_PLACES, MOON_R_KM } from "./moonPlaces";
import type { LngLat } from "./types";

export interface Place {
  name: string;
  detail: string;
  at: LngLat;
  /** [west, south, east, north] when the place has an extent */
  extent?: [number, number, number, number];
  zoom: number;
}

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** For an outlined place: the zoom at which it fills about 600 px of the screen. */
function fitZoom(m: (typeof MOON_PLACES)[number]): number {
  if (!m.size) return m.zoom;
  const km = typeof m.size === "number" ? m.size : Math.max(...m.size);
  const deg = km / ((Math.PI * MOON_R_KM) / 180);
  const pxPerDeg = (600 / deg) * Math.cos((m.lat * Math.PI) / 180);
  return Math.max(2, Math.min(12, Math.log2((pxPerDeg * 360) / 512)));
}

/** Search the Moon's named places (lib/moonPlaces.ts) by name, description or alias. Instant and offline. */
export async function searchPlaces(q: string, _signal?: AbortSignal): Promise<Place[]> {
  const words = fold(q).split(/\s+/).filter(Boolean);
  const scored: { p: Place; score: number }[] = [];
  for (const m of MOON_PLACES) {
    const hay = fold(`${m.name} ${m.detail} ${m.aliases ?? ""}`);
    if (!words.every((w) => hay.includes(w))) continue;
    const score = fold(m.name).startsWith(words[0]) ? 0 : 1;
    scored.push({ p: { name: m.name, detail: m.detail, at: [m.lon, m.lat], zoom: fitZoom(m) }, score });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, 8).map((s) => s.p);
}
