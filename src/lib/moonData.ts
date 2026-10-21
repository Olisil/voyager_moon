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
  encoding?: string;
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

/** True when height tiles in the current (Terrarium) format are bundled. Data made by the 0.1 script is ignored. */
export const hasMoonData = () => !!INDEX && INDEX.encoding === "terrarium" && Object.keys(INDEX.tiles ?? {}).length > 0;
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
  if (!hasMoonData()) return null;
  const hit = INDEX!.tiles[`${layer}/${z}/${x}/${y}`];
  if (!hit) return null;
  const [name, offset, length] = hit;
  const buf = await pack(name);
  return buf.slice(offset, offset + length);
}

/**
 * The deepest zoom whose stored tiles may be used for tile z/x/y. The detailed areas' tiles at low
 * zooms are much bigger than the areas themselves, and the tile maker fills the rest with
 * whole-Moon heights sampled at their own spacing, which differ from the whole-Moon tiles by up to
 * a few hundred metres. So away from the detailed areas only the whole-Moon tiles are used: no
 * seams where the two kinds of tile meet.
 */
function deepestFor(z: number, x: number, y: number): number {
  if (!INDEX) return z;
  const g = INDEX.globalZoom;
  if (z <= g) return z;
  const n = 1 << z;
  const lat = (j: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI;
  const w = (x / n) * 360 - 180;
  const e = ((x + 1) / n) * 360 - 180;
  const north = lat(y);
  const south = lat(y + 1);
  const detail = INDEX.sites.some(({ bounds: [sw, ss, se, sn] }) => sw < e && se > w && ss < north && sn > south);
  return detail ? z : g;
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
  for (let dz = Math.max(1, z - deepestFor(z, x, y)); dz <= z; dz++) {
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
  const raw = deepestFor(z, x, y) === z ? await rawTile("dem", z, x, y) : null;
  if (raw) return raw;
  const key = `${z}/${x}/${y}`;
  return made.get(key) ?? remember(key, fromAncestor(z, x, y));
}

// ---------- smooth tiles for the sun shading ----------
//
// Shading lights each slope, so it shows every kink in the surface. Heights stretched with straight
// lines between data points are flat facets, which the sun turns into hard-edged squares when you
// zoom in. The shading therefore gets its own tiles: heights read from the deepest tile that still
// holds real detail, and drawn between its points with a cubic B-spline. That curve bends smoothly
// (its slope never jumps), so light and shadow fade into each other at any zoom, while craters,
// rims and peaks keep their highlights and shadows. Tiles are made down to SHADE_MAXZOOM, so the
// shading is always worked out at about screen resolution. (MapLibre's slope texture is made finer
// too: see tools/smooth-hillshade.ts.)

/** Deepest zoom the shading reads heights from: the height map is ~118 m per pixel, and zoom 9 tiles are ~83 m. */
const SHADE_BASE_MAX = 9;
export const SHADE_MAXZOOM = 16;

const decodedCache = new Map<string, Promise<Float32Array | null>>();
/** A height tile as raw Terrarium values (R*256 + G + B/256), or null where there is none. */
function decoded(z: number, x: number, y: number): Promise<Float32Array | null> {
  const key = `${z}/${x}/${y}`;
  let p = decodedCache.get(key);
  if (p) {
    decodedCache.delete(key); // keep recently used tiles at the end
    decodedCache.set(key, p);
    return p;
  }
  p = (async () => {
    const data = await rawTile("dem", z, x, y);
    if (!data) return null;
    const bmp = await bitmap(data, "image/png");
    const c = canvas();
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0);
    bmp.close();
    const pix = g.getImageData(0, 0, SIZE, SIZE).data;
    const h = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < h.length; i++) h[i] = pix[i * 4] * 256 + pix[i * 4 + 1] + pix[i * 4 + 2] / 256;
    return h;
  })();
  p.catch(() => decodedCache.delete(key));
  decodedCache.set(key, p);
  if (decodedCache.size > 96) decodedCache.delete(decodedCache.keys().next().value!);
  return p;
}

/** Cubic B-spline weights for the four points around a position t (0–1) past the second one. */
function bspline(t: number, w: Float32Array, o: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  const s = 1 - t;
  w[o] = (s * s * s) / 6;
  w[o + 1] = (3 * t3 - 6 * t2 + 4) / 6;
  w[o + 2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
  w[o + 3] = t3 / 6;
}

function encodeTerrarium(vals: Float32Array): Promise<ArrayBuffer> {
  const out = new ImageData(SIZE, SIZE);
  const o = out.data;
  for (let i = 0; i < vals.length; i++) {
    const v = Math.min(65535.99, Math.max(0, vals[i]));
    const whole = Math.floor(v);
    o[i * 4] = whole >> 8;
    o[i * 4 + 1] = whole & 255;
    o[i * 4 + 2] = Math.floor((v - whole) * 256);
    o[i * 4 + 3] = 255;
  }
  const c = canvas();
  c.getContext("2d")!.putImageData(out, 0, 0);
  return c.convertToBlob({ type: "image/png" }).then((b) => b.arrayBuffer());
}

/** A shading tile at z/x/y: B-spline heights from the tile at zoom b that holds it. */
async function smoothFrom(b: number, z: number, x: number, y: number): Promise<ArrayBuffer> {
  const n = 1 << (z - b);
  const px = x >> (z - b);
  const py = y >> (z - b);
  const tilesB = 1 << b;
  const home = (await decoded(b, px, py))!;
  // The points around the tile's edges can lie in the neighbouring tiles: read those too, so
  // the shading runs on across tile edges without a seam.
  const pos = (i: number) => (x * SIZE + i + 0.5) / n - 0.5; // child pixel → base-level pixel position
  const lo = (v: number) => Math.floor(v) - 1;
  const gx0 = lo(pos(0));
  const gx1 = lo(pos(SIZE - 1)) + 3;
  const gy0 = lo((y * SIZE + 0.5) / n - 0.5);
  const gy1 = lo((y * SIZE + SIZE - 0.5) / n - 0.5) + 3;
  // the neighbouring tiles that the points near the edges reach into: [row][column], counted
  // from the tile left of / above this one
  const tx0 = px - 1;
  const ty0 = py - 1;
  const near: (Float32Array | null)[][] = [[null, null, null], [null, home, null], [null, null, null]];
  for (let ty = Math.floor(gy0 / SIZE); ty <= Math.floor(gy1 / SIZE); ty++) {
    for (let tx = Math.floor(gx0 / SIZE); tx <= Math.floor(gx1 / SIZE); tx++) {
      if ((tx === px && ty === py) || ty < 0 || ty >= tilesB) continue;
      near[ty - ty0][tx - tx0] = await decoded(b, ((tx % tilesB) + tilesB) % tilesB, ty); // longitude wraps around
    }
  }
  /** Height at base-level pixel gx, gy; where a neighbour has no data, the nearest edge of this tile. */
  const at = (gx: number, gy: number): number => {
    const tx = Math.floor(gx / SIZE);
    const ty = Math.floor(gy / SIZE);
    const t = near[ty - ty0]?.[tx - tx0];
    if (t) return t[(gy - ty * SIZE) * SIZE + (gx - tx * SIZE)];
    const lx = Math.max(0, Math.min(SIZE - 1, gx - px * SIZE));
    const ly = Math.max(0, Math.min(SIZE - 1, gy - py * SIZE));
    return home[ly * SIZE + lx];
  };
  const pw = gx1 - gx0 + 1;
  const ph = gy1 - gy0 + 1;
  const base = new Float32Array(pw * ph); // base points gx0…gx1 × gy0…gy1
  for (let r = 0; r < ph; r++) for (let c = 0; c < pw; c++) base[r * pw + c] = at(gx0 + c, gy0 + r);
  // Then the B-spline: first along each row of base points, then down the columns.
  const wx = new Float32Array(SIZE * 4);
  const cx = new Int32Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    const u = pos(i);
    cx[i] = Math.floor(u) - 1 - gx0;
    bspline(u - Math.floor(u), wx, i * 4);
  }
  const rows = ph;
  const across = new Float32Array(rows * SIZE);
  for (let r = 0; r < rows; r++) {
    const row = r * pw;
    for (let i = 0; i < SIZE; i++) {
      const c0 = row + cx[i];
      const w = i * 4;
      across[r * SIZE + i] = wx[w] * base[c0] + wx[w + 1] * base[c0 + 1] + wx[w + 2] * base[c0 + 2] + wx[w + 3] * base[c0 + 3];
    }
  }
  const vals = new Float32Array(SIZE * SIZE);
  const wy = new Float32Array(4);
  for (let j = 0; j < SIZE; j++) {
    const v = (y * SIZE + j + 0.5) / n - 0.5;
    const r0 = Math.floor(v) - 1 - gy0;
    bspline(v - Math.floor(v), wy, 0);
    for (let i = 0; i < SIZE; i++) {
      vals[j * SIZE + i] =
        wy[0] * across[r0 * SIZE + i] + wy[1] * across[(r0 + 1) * SIZE + i] + wy[2] * across[(r0 + 2) * SIZE + i] + wy[3] * across[(r0 + 3) * SIZE + i];
    }
  }
  return encodeTerrarium(vals);
}

const madeShade = new Map<string, Promise<ArrayBuffer>>();
async function shadeTile(z: number, x: number, y: number): Promise<ArrayBuffer> {
  const key = `${z}/${x}/${y}`;
  const hit = madeShade.get(key);
  if (hit) return hit;
  for (let b = Math.min(z, SHADE_BASE_MAX, deepestFor(z, x, y)); b >= 0; b--) {
    if (!INDEX?.tiles[`dem/${b}/${x >> (z - b)}/${y >> (z - b)}`]) continue;
    const p = smoothFrom(b, z, x, y);
    madeShade.set(key, p);
    if (madeShade.size > 600) madeShade.delete(madeShade.keys().next().value!);
    p.catch(() => madeShade.delete(key));
    return p;
  }
  return blank();
}

const TILE_URL = /^moon:\/\/(dem|shade)\/(\d+)\/(\d+)\/(\d+)/;
async function tileForUrl(url: string): Promise<ArrayBuffer> {
  const m = TILE_URL.exec(url);
  if (!m) throw new Error(`Not a Moon tile: ${url}`);
  return m[1] === "shade" ? shadeTile(+m[2], +m[3], +m[4]) : tile(+m[2], +m[3], +m[4]);
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
 * A height source, scaled to true proportions (see RELIEF_SCALE): the same Terrarium tiles, read
 * with every height multiplied up. "dem" is for the 3D surface and the height colours; "shade" is
 * the smoothed heights for the sun shading (see above).
 */
export function demSource(kind: "dem" | "shade" = "dem"): maplibregl.RasterDEMSourceSpecification {
  const k = RELIEF_SCALE;
  return {
    type: "raster-dem",
    tiles: [`moon://${kind}/{z}/{x}/{y}`],
    tileSize: SIZE,
    maxzoom: kind === "shade" ? SHADE_MAXZOOM : moonMaxZoom(),
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
