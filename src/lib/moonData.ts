import maplibregl from "maplibre-gl";
import mlcontour from "maplibre-contour";

/**
 * The Moon map: height tiles made by tools/make_moon_tiles.py from NASA's Lunar Reconnaissance
 * Orbiter height map, bundled with the app in src/moon-data (a few packed files and an index).
 * Everything on the map is drawn from them: the 3D surface, the height curves and the sun
 * shading. They are served to MapLibre through a "moon://" protocol. Where a detailed tile
 * doesn't exist (outside the detailed sites) it is made on the fly from the nearest coarser tile,
 * so the map never goes blank when zooming in. Tiles are Terrarium-encoded, in real metres.
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

/** A height tile cut out of an ancestor tile and scaled up: decoded, interpolated and encoded again. */
async function fromAncestor(z: number, x: number, y: number): Promise<ArrayBuffer> {
  for (let dz = 1; dz <= z; dz++) {
    const pz = z - dz;
    const px = x >> dz;
    const py = y >> dz;
    const data = await rawTile("dem", pz, px, py);
    if (!data) continue;
    const n = 1 << dz;
    const span = SIZE / n;
    const sx = (x - px * n) * span;
    const sy = (y - py * n) * span;
    const bmp = await bitmap(data, "image/png");
    const src = canvas();
    const sg = src.getContext("2d", { willReadFrequently: true })!;
    sg.drawImage(bmp, 0, 0);
    bmp.close();
    const pix = sg.getImageData(0, 0, SIZE, SIZE).data;
    const h = new Float64Array(SIZE * SIZE);
    for (let i = 0; i < h.length; i++) h[i] = pix[i * 4] * 256 + pix[i * 4 + 1] + pix[i * 4 + 2] / 256;
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
        const whole = Math.floor(val);
        const k = (j * SIZE + i) * 4;
        o[k] = (whole >> 8) & 255;
        o[k + 1] = whole & 255;
        o[k + 2] = Math.floor((val - whole) * 256);
        o[k + 3] = 255;
      }
    }
    const c = canvas();
    c.getContext("2d")!.putImageData(out, 0, 0);
    return (await c.convertToBlob({ type: "image/png" })).arrayBuffer();
  }
  return blank();
}

/** Without Moon data: level ground, so the app still works. Height 0 is 32768 = rgb(128, 0, 0). */
async function blank(): Promise<ArrayBuffer> {
  const c = canvas();
  const g = c.getContext("2d")!;
  g.fillStyle = "rgb(128,0,0)";
  g.fillRect(0, 0, SIZE, SIZE);
  return (await c.convertToBlob({ type: "image/png" })).arrayBuffer();
}

const made = new Map<string, Promise<ArrayBuffer>>();
function remember(key: string, p: Promise<ArrayBuffer>) {
  made.set(key, p);
  if (made.size > 400) made.delete(made.keys().next().value!);
  p.catch(() => made.delete(key));
  return p;
}

async function tile(z: number, x: number, y: number): Promise<ArrayBuffer> {
  const raw = await rawTile("dem", z, x, y);
  if (raw) return raw;
  const key = `${z}/${x}/${y}`;
  return made.get(key) ?? remember(key, fromAncestor(z, x, y));
}

const TILE_URL = /^moon:\/\/dem\/(\d+)\/(\d+)\/(\d+)/;
async function tileForUrl(url: string): Promise<ArrayBuffer> {
  const m = TILE_URL.exec(url);
  if (!m) throw new Error(`Not a Moon tile: ${url}`);
  return tile(+m[1], +m[2], +m[3]);
}

let registered = false;
/** Makes "moon://dem/{z}/{x}/{y}" work in MapLibre, and sets up the height curves. Call before creating a map. */
export function registerMoonProtocol() {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol("moon", async (params) => ({ data: await tileForUrl(params.url) }));
  contours = new mlcontour.DemSource({ url: "moon://dem/{z}/{x}/{y}", encoding: "terrarium", maxzoom: moonMaxZoom(), worker: false });
  // The bundled tiles come through the app, not the network: hand them to the curve maker directly.
  contours.manager = new mlcontour.LocalDemManager({
    demUrlPattern: "moon://dem/{z}/{x}/{y}",
    cacheSize: 120,
    encoding: "terrarium",
    maxzoom: moonMaxZoom(),
    timeoutMs: 15000,
    getTile: async (url) => ({ data: new Blob([await tileForUrl(url)], { type: "image/png" }) }),
  });
  contours.setupMaplibre(maplibregl);
}

let contours: InstanceType<typeof mlcontour.DemSource> | null = null;

/**
 * Height curves as vector tiles, made in the browser from the height tiles. [minor, major]
 * spacing in real metres per zoom level: more curves appear as you zoom in; every major one is
 * drawn stronger.
 */
export function contourTiles(): string {
  registerMoonProtocol();
  return contours!.contourProtocolUrl({
    // The map is Earth-sized, so a lunar slope looks 3.7 times steeper per pixel than on Earth:
    // spacings are chosen to keep curves a few pixels apart on steep crater walls.
    thresholds: { 0: [2000, 10000], 3: [1000, 5000], 5: [500, 2500], 7: [250, 1000], 9: [100, 500], 11: [50, 250], 12: [25, 100], 13: [10, 50] },
    elevationKey: "ele",
    levelKey: "level",
    contourLayer: "contours",
    overzoom: 1,
  });
}

/**
 * The height source for the 3D surface, the shading and the colours, scaled to true proportions
 * (see RELIEF_SCALE). The same Terrarium tiles, read with every height multiplied up.
 */
export function demSource(): maplibregl.RasterDEMSourceSpecification {
  const k = RELIEF_SCALE;
  return {
    type: "raster-dem",
    tiles: ["moon://dem/{z}/{x}/{y}"],
    tileSize: SIZE,
    maxzoom: moonMaxZoom(),
    encoding: "custom",
    redFactor: 256 * k,
    greenFactor: k,
    blueFactor: k / 256,
    // MapLibre subtracts the shift: height = (R*256 + G + B/256) × k − 32768 × k
    baseShift: 32768 * k,
    attribution: MOON_CREDIT_HTML,
  };
}

export const MOON_CREDIT = "NASA/GSFC LRO LOLA, USGS";
const MOON_CREDIT_HTML =
  '<a href="https://astrogeology.usgs.gov/search/map/moon_lro_lola_dem_118m" target="_blank" rel="noopener">Heights: NASA LRO LOLA, USGS Astrogeology</a>';
