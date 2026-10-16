import maplibregl from "maplibre-gl";

/**
 * The Moon map: elevation and image tiles made by tools/make_moon_tiles.py from NASA's Lunar
 * Reconnaissance Orbiter maps, bundled with the app in src/moon-data (a few packed files and an
 * index). They are served to MapLibre through a "moon://" protocol. Where a detailed tile doesn't
 * exist (outside the detailed sites) it is made on the fly from the nearest coarser tile, so the
 * map never goes blank when zooming in.
 *
 * The map is drawn in Earth-sized web mercator: a lunar degree takes as much space as an Earth
 * degree, so heights are scaled up by Earth radius ÷ Moon radius to keep true proportions.
 */

export const MOON_RADIUS_KM = 1737.4;
/** Earth's mean radius ÷ the Moon's: makes the relief look as steep as it really is. */
export const RELIEF_SCALE = 6371.0088 / MOON_RADIUS_KM;

interface MoonIndex {
  version: number;
  globalZoom: number;
  maxzoom: number;
  sites: { id: string; title: string; lat: number; lon: number; bounds: [number, number, number, number]; maxzoom: number }[];
  source: string;
  tiles: Record<string, [string, number, number]>;
}

const indexFiles = import.meta.glob("../moon-data/index.json", { eager: true, import: "default" }) as Record<string, MoonIndex>;
const packUrls = import.meta.glob("../moon-data/*.bin", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const INDEX: MoonIndex | null = Object.values(indexFiles)[0] ?? null;
const PACKS = new Map(Object.entries(packUrls).map(([path, url]) => [path.replace(/^.*\//, "").replace(/\.bin$/, ""), url]));

export const hasMoonData = () => !!INDEX && Object.keys(INDEX.tiles).length > 0;
export const moonSites = () => INDEX?.sites ?? [];
export const moonMaxZoom = () => Math.max(INDEX?.maxzoom ?? 4, 4);

// ---------- raw tiles ----------

const packCache = new Map<string, Promise<ArrayBuffer>>();
function pack(name: string): Promise<ArrayBuffer> {
  let p = packCache.get(name);
  if (!p) {
    const url = PACKS.get(name);
    p = url ? fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`)))) : Promise.reject(new Error("missing pack"));
    p.catch(() => packCache.delete(name));
    packCache.set(name, p);
  }
  return p;
}

async function rawTile(layer: string, z: number, x: number, y: number): Promise<ArrayBuffer | null> {
  const hit = INDEX?.tiles[`${layer}/${z}/${x}/${y}`];
  if (!hit) return null;
  const [name, offset, length] = hit;
  const buf = await pack(name);
  return buf.slice(offset, offset + length);
}

// ---------- tiles made from a coarser one ----------

const SIZE = 256;

function canvas(): OffscreenCanvas {
  return new OffscreenCanvas(SIZE, SIZE);
}

async function bitmap(data: ArrayBuffer, type: string) {
  return createImageBitmap(new Blob([data], { type }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
}

/** A tile cut out of an ancestor tile and scaled up. Elevation is decoded, interpolated and encoded again. */
async function fromAncestor(layer: string, z: number, x: number, y: number): Promise<ArrayBuffer> {
  for (let dz = 1; dz <= z; dz++) {
    const pz = z - dz;
    const px = x >> dz;
    const py = y >> dz;
    const data = await rawTile(layer, pz, px, py);
    if (!data) continue;
    const n = 1 << dz;
    const span = SIZE / n;
    const sx = (x - px * n) * span;
    const sy = (y - py * n) * span;
    if (layer === "img") {
      const bmp = await bitmap(data, "image/jpeg");
      const c = canvas();
      const g = c.getContext("2d")!;
      g.imageSmoothingQuality = "high";
      g.drawImage(bmp, sx, sy, span, span, 0, 0, SIZE, SIZE);
      bmp.close();
      return (await c.convertToBlob({ type: "image/jpeg", quality: 0.9 })).arrayBuffer();
    }
    const bmp = await bitmap(data, "image/png");
    const src = canvas();
    const sg = src.getContext("2d", { willReadFrequently: true })!;
    sg.drawImage(bmp, 0, 0);
    bmp.close();
    const pix = sg.getImageData(0, 0, SIZE, SIZE).data;
    const h = new Float64Array(SIZE * SIZE);
    for (let i = 0; i < h.length; i++) h[i] = pix[i * 4] * 65536 + pix[i * 4 + 1] * 256 + pix[i * 4 + 2];
    const out = new ImageData(SIZE, SIZE);
    const o = out.data;
    for (let j = 0; j < SIZE; j++) {
      const v = Math.min(SIZE - 1, Math.max(0, sy + ((j + 0.5) * span) / SIZE - 0.5));
      const v0 = Math.floor(v);
      const v1 = Math.min(SIZE - 1, v0 + 1);
      const fv = v - v0;
      for (let i = 0; i < SIZE; i++) {
        const u = Math.min(SIZE - 1, Math.max(0, sx + ((i + 0.5) * span) / SIZE - 0.5));
        const u0 = Math.floor(u);
        const u1 = Math.min(SIZE - 1, u0 + 1);
        const fu = u - u0;
        const val =
          (h[v0 * SIZE + u0] * (1 - fu) + h[v0 * SIZE + u1] * fu) * (1 - fv) + (h[v1 * SIZE + u0] * (1 - fu) + h[v1 * SIZE + u1] * fu) * fv;
        const e = Math.round(val);
        const k = (j * SIZE + i) * 4;
        o[k] = (e >> 16) & 255;
        o[k + 1] = (e >> 8) & 255;
        o[k + 2] = e & 255;
        o[k + 3] = 255;
      }
    }
    const c = canvas();
    c.getContext("2d")!.putImageData(out, 0, 0);
    return (await c.convertToBlob({ type: "image/png" })).arrayBuffer();
  }
  return blank(layer);
}

/** Without Moon data: level ground in a mid grey, so the app still works. */
async function blank(layer: string): Promise<ArrayBuffer> {
  const c = canvas();
  const g = c.getContext("2d")!;
  // height 0 is (0 + 20000) × 10 = 200000 = rgb(3, 13, 64)
  g.fillStyle = layer === "img" ? "#7a7a7a" : "rgb(3,13,64)";
  g.fillRect(0, 0, SIZE, SIZE);
  return (await c.convertToBlob({ type: layer === "img" ? "image/jpeg" : "image/png" })).arrayBuffer();
}

const made = new Map<string, Promise<ArrayBuffer>>();
function remember(key: string, p: Promise<ArrayBuffer>) {
  made.set(key, p);
  if (made.size > 400) made.delete(made.keys().next().value!);
  p.catch(() => made.delete(key));
  return p;
}

async function tile(layer: string, z: number, x: number, y: number): Promise<ArrayBuffer> {
  const raw = await rawTile(layer, z, x, y);
  if (raw) return raw;
  const key = `${layer}/${z}/${x}/${y}`;
  return made.get(key) ?? remember(key, fromAncestor(layer, z, x, y));
}

let registered = false;
/** Makes "moon://dem/{z}/{x}/{y}" and "moon://img/{z}/{x}/{y}" work in MapLibre. Call before creating a map. */
export function registerMoonProtocol() {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol("moon", async (params) => {
    const m = /^moon:\/\/(dem|img)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) throw new Error(`Not a Moon tile: ${params.url}`);
    const data = await tile(m[1], +m[2], +m[3], +m[4]);
    return { data };
  });
}

/** The elevation source, scaled to true proportions (see RELIEF_SCALE). */
export function demSource(): maplibregl.RasterDEMSourceSpecification {
  const k = RELIEF_SCALE / 10;
  return {
    type: "raster-dem",
    tiles: ["moon://dem/{z}/{x}/{y}"],
    tileSize: SIZE,
    maxzoom: moonMaxZoom(),
    encoding: "custom",
    redFactor: 65536 * k,
    greenFactor: 256 * k,
    blueFactor: k,
    baseShift: -20000 * RELIEF_SCALE,
    attribution: MOON_CREDIT_HTML,
  };
}

export function imageSource(): maplibregl.RasterSourceSpecification {
  return { type: "raster", tiles: ["moon://img/{z}/{x}/{y}"], tileSize: SIZE, maxzoom: moonMaxZoom(), attribution: MOON_CREDIT_HTML };
}

export const MOON_CREDIT = "NASA/GSFC/ASU LRO (LOLA, LROC), USGS";
const MOON_CREDIT_HTML =
  '<a href="https://astrogeology.usgs.gov/search/map/moon_lro_lola_dem_118m" target="_blank" rel="noopener">NASA LRO LOLA &amp; LROC WAC, USGS Astrogeology</a>';
