import maplibregl from "maplibre-gl";
import type { MapLook } from "./mapStyles";

/**
 * Small previews of map looks, rendered one at a time in an off-screen map so only one extra
 * WebGL context exists at once. Cached for the session per look, place and zoom.
 */
const cache = new Map<string, string>();
const keyOf = (look: MapLook, center: [number, number], zoom: number) =>
  `${look.id}|${center[0].toFixed(2)},${center[1].toFixed(2)}|${zoom.toFixed(1)}`;

export function cachedThumb(look: MapLook, center: [number, number], zoom: number): string | null {
  return cache.get(keyOf(look, center, zoom)) ?? null;
}

export async function renderThumb(look: MapLook, center: [number, number], zoom: number, w = 192, h = 120): Promise<string> {
  const key = keyOf(look, center, zoom);
  const hit = cache.get(key);
  if (hit) return hit;
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px;pointer-events:none;`;
  document.body.appendChild(el);
  const map = new maplibregl.Map({
    container: el,
    style: look.style(),
    center,
    zoom,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    pixelRatio: Math.min(2, window.devicePixelRatio || 1),
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  try {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 9000);
      map.once("idle", () => {
        clearTimeout(timer);
        resolve();
      });
      map.once("error", () => undefined);
    });
    const url = map.getCanvas().toDataURL("image/jpeg", 0.82);
    cache.set(key, url);
    return url;
  } finally {
    map.remove();
    el.remove();
  }
}
