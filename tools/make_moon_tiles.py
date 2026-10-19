#!/usr/bin/env python3
"""
Makes the Moon map data for Voyager Moon.

Reads the Moon's height map from NASA's Lunar Reconnaissance Orbiter (LOLA, 118 m per pixel,
8 GB), as published by USGS Astrogeology:
    https://planetarymaps.usgs.gov/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif

The file is read straight from USGS over the internet, only the parts that are needed (a coarse
version of the whole Moon, and the full detail around each site below). You can also download
it first and pass its path with --dem.

It writes height tiles packed into a few files in src/moon-data/, which the app bundles. The app
draws everything from them: the 3D surface, the height curves and the sun shading. No images.
Run it from the project folder:

    pip install rasterio numpy pillow
    python tools/make_moon_tiles.py

Options:
    --sites apollo17,apollo11     which detailed sites to make (see SITES below; "all" for every one)
    --global-ppd 8                detail of the whole-Moon layer, pixels per degree
    --dem PATH_OR_URL             elevation GeoTIFF (default: the USGS file above)
    --out src/moon-data           where to write
    --yes                         don't ask before downloading

Tiles use the Terrarium encoding, in real lunar metres: height = R*256 + G + B/256 - 32768.
"""
from __future__ import annotations

import argparse
import io
import json
import math
import os
import sys
import time
from dataclasses import dataclass

import numpy as np
from PIL import Image

try:
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.windows import Window
except ImportError:  # pragma: no cover
    sys.exit("This script needs rasterio:  pip install rasterio numpy pillow")

USGS = "https://planetarymaps.usgs.gov/mosaic/"
DEM_URL = USGS + "Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif"
DEM_SCALE = 0.5  # stored value × 0.5 = metres (from the USGS label)

TILE = 256
GLOBAL_ZOOM = 4  # whole-Moon tiles from zoom 0 to this
MAX_LAT = 85.0511287798

# Detailed areas: name, latitude, longitude, half size in degrees of latitude, deepest zoom.
SITES = {
    "apollo17": ("Apollo 17, Taurus-Littrow", 20.19, 30.77, 1.4, 10),
    "apollo11": ("Apollo 11, Sea of Tranquillity", 0.674, 23.473, 1.0, 10),
    "apollo15": ("Apollo 15, Hadley Rille", 26.13, 3.63, 1.2, 10),
    "apollo16": ("Apollo 16, Descartes Highlands", -8.97, 15.50, 1.0, 10),
    "tycho": ("Tycho crater", -43.31, -11.36, 1.6, 9),
    "copernicus": ("Copernicus crater", 9.62, -20.08, 1.6, 9),
}


@dataclass
class Grid:
    """An equirectangular array with where it sits: column = (lon - lon0) / dlon, row = (lat0 - lat) / dlat."""

    data: np.ndarray
    lon0: float
    lat0: float
    dlon: float
    dlat: float

    def sample(self, lon: np.ndarray, lat: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Bilinear values at lon/lat, and a mask of where the grid has data."""
        h, w = self.data.shape
        c = (lon - self.lon0) / self.dlon - 0.5
        r = (self.lat0 - lat) / self.dlat - 0.5
        inside = (c >= -0.5) & (c <= w - 0.5) & (r >= -0.5) & (r <= h - 0.5)
        c = np.clip(c, 0, w - 1)
        r = np.clip(r, 0, h - 1)
        c0 = np.floor(c).astype(np.int64)
        r0 = np.floor(r).astype(np.int64)
        c1 = np.minimum(c0 + 1, w - 1)
        r1 = np.minimum(r0 + 1, h - 1)
        fc = (c - c0).astype(np.float32)
        fr = (r - r0).astype(np.float32)
        d = self.data
        top = d[r0, c0] * (1 - fc) + d[r0, c1] * fc
        bot = d[r1, c0] * (1 - fc) + d[r1, c1] * fc
        return top * (1 - fr) + bot * fr, inside


def open_raster(src: str):
    if src.startswith("http"):
        os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
        os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
        os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
        os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
        os.environ.setdefault("VSI_CACHE", "TRUE")
        os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "5")
        os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "2")
        return rasterio.open("/vsicurl/" + src)
    return rasterio.open(src)


def geo(ds):
    """lon0, lat0, degrees per pixel in lon and lat, for an equirectangular file in degrees or metres."""
    t = ds.transform
    if ds.crs is not None and ds.crs.is_projected:
        # Simple cylindrical on the 1737.4 km sphere, in metres.
        m_per_deg = math.pi * 1737400.0 / 180.0
        return t.c / m_per_deg, t.f / m_per_deg, t.a / m_per_deg, -t.e / m_per_deg
    return t.c, t.f, t.a, -t.e


def describe(ds, name: str):
    lon0, lat0, dlon, dlat = geo(ds)
    bh, bw = ds.block_shapes[0]
    print(f"  {name}: {ds.width} × {ds.height} px, {1 / dlon:.1f} px per degree, blocks of {bw} × {bh}, {ds.dtypes[0]}")


def estimate_rows_bytes(ds, rows: int) -> float:
    """Rough download for reading `rows` scattered rows of the whole width."""
    bh, bw = ds.block_shapes[0]
    itemsize = np.dtype(ds.dtypes[0]).itemsize
    if bw >= ds.width:  # strips: a whole strip per row group
        return min(ds.height, rows * bh) * ds.width * itemsize
    return min(ds.height, rows * bh) * ds.width * itemsize  # tiles: the whole tile row


def read_global(ds, ppd: float, scale: float) -> Grid:
    lon0, lat0, dlon, dlat = geo(ds)
    w = max(64, int(round(360 * ppd)))
    h = max(32, int(round(ds.height * dlat * ppd)))
    t0 = time.time()
    a = ds.read(1, out_shape=(h, w), resampling=Resampling.nearest).astype(np.float32) * scale
    print(f"    whole Moon at {ppd} px/degree: {w} × {h} in {time.time() - t0:.0f} s")
    return Grid(a, lon0, lat0, (ds.width * dlon) / w, (ds.height * dlat) / h)


def read_window(ds, lat: float, lon: float, half: float, scale: float) -> Grid:
    lon0, lat0, dlon, dlat = geo(ds)
    half_lon = half / max(0.2, math.cos(math.radians(lat)))
    c0 = int(math.floor((lon - half_lon - lon0) / dlon))
    c1 = int(math.ceil((lon + half_lon - lon0) / dlon))
    r0 = int(math.floor((lat0 - (lat + half)) / dlat))
    r1 = int(math.ceil((lat0 - (lat - half)) / dlat))
    c0, r0 = max(0, c0), max(0, r0)
    c1, r1 = min(ds.width, c1), min(ds.height, r1)
    t0 = time.time()
    a = ds.read(1, window=Window(c0, r0, c1 - c0, r1 - r0)).astype(np.float32) * scale
    print(f"    detail {c1 - c0} × {r1 - r0} px in {time.time() - t0:.0f} s")
    return Grid(a, lon0 + c0 * dlon, lat0 - r0 * dlat, dlon, dlat)


def tile_lonlat(z: int, x: int, y: int) -> tuple[np.ndarray, np.ndarray]:
    n = 2**z
    i = (np.arange(TILE) + 0.5) / TILE
    X = (x + i) / n
    Y = (y + i) / n
    lon = X * 360.0 - 180.0
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * Y))))
    return np.meshgrid(lon, lat)


def tiles_for_box(z: int, lat: float, lon: float, half: float):
    half_lon = half / max(0.2, math.cos(math.radians(lat)))
    n = 2**z

    def tx(lo):
        return int(math.floor((lo + 180.0) / 360.0 * n))

    def ty(la):
        la = max(-MAX_LAT, min(MAX_LAT, la))
        s = math.sin(math.radians(la))
        return int(math.floor((0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n))

    for x in range(max(0, tx(lon - half_lon)), min(n - 1, tx(lon + half_lon)) + 1):
        for y in range(max(0, ty(lat + half)), min(n - 1, ty(lat - half)) + 1):
            yield x, y


def encode_dem(h: np.ndarray, step: float) -> bytes:
    """Terrarium PNG: height + 32768 = R*256 + G + B/256."""
    if step > 0:
        h = np.round(h / step) * step
    v = np.clip(h + 32768.0, 0, 65535.996)
    whole = np.floor(v)
    r = (whole // 256).astype(np.uint8)
    g = (whole % 256).astype(np.uint8)
    b = np.floor((v - whole) * 256).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(np.stack([r, g, b], axis=-1), "RGB").save(buf, "PNG", optimize=True)
    return buf.getvalue()


class Packer:
    """Tiles grouped into a few files (an upload to GitHub stays small), with an index of where each is."""

    def __init__(self, out: str):
        self.out = out
        self.chunks: dict[str, bytearray] = {}
        self.index: dict[str, list] = {}

    def add(self, layer: str, z: int, x: int, y: int, data: bytes, site: str | None):
        # the whole Moon in at most 2 × 2 files per zoom level; a site in one file per zoom level
        if site:
            name = f"{layer}-{site}-{z}"
        else:
            s = max(0, z - 1)
            name = f"{layer}-moon-{z}-{x >> s}-{y >> s}"
        buf = self.chunks.setdefault(name, bytearray())
        self.index[f"{layer}/{z}/{x}/{y}"] = [name, len(buf), len(data)]
        buf.extend(data)

    def write(self, meta: dict):
        os.makedirs(self.out, exist_ok=True)
        for f in os.listdir(self.out):
            if f.endswith(".bin") or f == "index.json":
                os.remove(os.path.join(self.out, f))
        total = 0
        for name, buf in self.chunks.items():
            with open(os.path.join(self.out, name + ".bin"), "wb") as fh:
                fh.write(buf)
            total += len(buf)
        with open(os.path.join(self.out, "index.json"), "w") as fh:
            json.dump({**meta, "tiles": self.index}, fh, separators=(",", ":"))
        print(f"Wrote {len(self.index)} tiles in {len(self.chunks)} files, {total / 1e6:.1f} MB, to {self.out}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dem", default=DEM_URL)
    ap.add_argument("--dem-scale", type=float, default=None, help="multiply stored elevation values by this to get metres (default: from the file, else 0.5 for whole numbers)")
    ap.add_argument("--sites", default="apollo17")
    ap.add_argument("--global-ppd", type=float, default=8.0)
    ap.add_argument("--global-zoom", type=int, default=GLOBAL_ZOOM)
    ap.add_argument("--out", default=os.path.join("src", "moon-data"))
    ap.add_argument("--yes", action="store_true")
    a = ap.parse_args()

    names = list(SITES) if a.sites == "all" else [s for s in a.sites.split(",") if s]
    for s in names:
        if s not in SITES:
            sys.exit(f"Unknown site {s!r}. Choose from: {', '.join(SITES)}")

    print("Opening the maps…")
    dem = open_raster(a.dem)
    describe(dem, "Elevation")
    if a.dem_scale is None:
        tagged = dem.scales[0] if dem.scales else 1.0
        a.dem_scale = tagged if tagged not in (0, 1) else (DEM_SCALE if np.issubdtype(np.dtype(dem.dtypes[0]), np.integer) else 1.0)
    print(f"  Elevation values × {a.dem_scale} = metres")

    # What reading will cost when the files are remote.
    remote = a.dem.startswith("http")
    if remote:
        mb = 0.0
        for ds in (dem,):
            _, _, _, dlat = geo(ds)
            rows_global = int(round(ds.height * dlat * a.global_ppd))
            mb += estimate_rows_bytes(ds, rows_global) / 1e6
            for s in names:
                half = SITES[s][3]
                rows = int(2 * half / dlat)
                mb += estimate_rows_bytes(ds, max(1, rows // ds.block_shapes[0][0])) / 1e6
        print(f"About {mb:,.0f} MB will be downloaded from USGS (often less).")
        if not a.yes and input("Continue? [y/N] ").strip().lower() not in ("y", "yes"):
            return

    print("Reading the whole Moon (coarse)…")
    g_dem = read_global(dem, a.global_ppd, a.dem_scale)

    pack = Packer(a.out)
    t0 = time.time()
    for z in range(0, a.global_zoom + 1):
        n = 2**z
        for x in range(n):
            for y in range(n):
                lon, lat = tile_lonlat(z, x, y)
                h, _ = g_dem.sample(lon, lat)
                pack.add("dem", z, x, y, encode_dem(h, 1.0), None)
    print(f"  whole Moon, zoom 0–{a.global_zoom}: {time.time() - t0:.0f} s")

    sites_meta = []
    for s in names:
        title, lat, lon, half, maxz = SITES[s]
        print(f"Reading {title}…")
        w_dem = read_window(dem, lat, lon, half, a.dem_scale)
        count = 0
        for z in range(a.global_zoom + 1, maxz + 1):
            for x, y in tiles_for_box(z, lat, lon, half):
                key = f"dem/{z}/{x}/{y}"
                if key in pack.index:
                    continue
                lon_g, lat_g = tile_lonlat(z, x, y)
                h, inside = w_dem.sample(lon_g, lat_g)
                if not inside.any():
                    continue
                if not inside.all():
                    hg, _ = g_dem.sample(lon_g, lat_g)
                    h = np.where(inside, h, hg)
                pack.add("dem", z, x, y, encode_dem(h, 0.5), s)
                count += 1
        print(f"  {count} detailed tiles")
        half_lon = half / max(0.2, math.cos(math.radians(lat)))
        sites_meta.append({"id": s, "title": title, "lat": lat, "lon": lon, "bounds": [lon - half_lon, lat - half, lon + half_lon, lat + half], "maxzoom": maxz})

    maxzoom = max([a.global_zoom] + [m["maxzoom"] for m in sites_meta])
    pack.write(
        {
            "version": 1,
            "encoding": "terrarium",
            "globalZoom": a.global_zoom,
            "maxzoom": maxzoom,
            "sites": sites_meta,
            "made": time.strftime("%Y-%m-%d"),
            "source": "NASA/GSFC: LRO LOLA elevation, via USGS Astrogeology",
        }
    )


if __name__ == "__main__":
    main()
