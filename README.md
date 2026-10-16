# Voyager Moon

Animated routes on the Moon, as a page on nassau.se: a moonwalk, a rover drive or a lander hop
over real lunar mountains and craters, lit by a sun you place, with signs, a camera move and an
MP4 rendered in the browser. Built on Voyager Earth (same steps, editor, signs, camera and
export). No backend, no accounts: projects live in the browser (IndexedDB) and can be downloaded
as `.voyager-moon.json` files.

**First version.** The Moon map data is made once with a script (below) and bundled with the
app. Until it is, the app works on flat grey ground.

## 1. Make the Moon map data (once)

The script reads NASA's Lunar Reconnaissance Orbiter maps from USGS Astrogeology, only the parts
it needs, and writes them as map tiles into `src/moon-data/` (about 20–30 MB for the whole Moon
coarse plus the Apollo 17 valley in detail).

On Windows:

1. Install Python 3.11 or newer from python.org (tick "Add python.exe to PATH").
2. Open this project folder in Explorer, type `cmd` in the address bar and press Enter.
3. Run:

       py -m pip install rasterio numpy pillow
       py tools\make_moon_tiles.py

   It shows the maps it found and how much it will download, and asks before it starts. It can
   take a while on a slow line; it prints its progress.

On a Mac: `python3 -m pip install rasterio numpy pillow`, then `python3 tools/make_moon_tiles.py`.

More detailed places: `--sites apollo17,apollo11,apollo15,apollo16,tycho,copernicus` (or
`all`); each adds a few MB. Less to download for the whole-Moon layer: `--global-ppd 4`. If the
download keeps failing, download the two files below in a browser and pass them with
`--dem path\to\file.tif --img path\to\file.tif`.

- Elevation, LRO LOLA 118 m/px (8 GB):
  https://planetarymaps.usgs.gov/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif
- Image, LRO LROC WAC mosaic 100 m/px (5.5 GB):
  https://planetarymaps.usgs.gov/mosaic/Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013.tif

## 2. Run locally (optional)

    npm install
    npm run dev        # http://localhost:5173

Node 22+. Rendering needs WebCodecs H.264: current Chrome or Edge on desktop is the reference.

## 3. Deploy as a page under nassau.se (Webflow Cloud)

Plain Vite + React, which Webflow Cloud builds directly (`webflow.json` pins `vite`). Don't set
`base` in `vite.config.ts`; Webflow Cloud sets it from the mount path. Routing is hash based, so
any mount path works. The map data in `src/moon-data/` is bundled like the app's own files.

1. Push this folder, including `src/moon-data/`, to GitHub (contents at the repository root).
2. nassau.se site settings > Webflow Cloud > create a project from the repository, mount path
   `/voyager_moon`.
3. Publish the site once. Every push to the branch redeploys.

## How the Moon is drawn

- **Tiles**: `lib/moonData.ts` serves the bundled tiles to MapLibre through a `moon://`
  protocol. Outside the detailed sites, deeper tiles are made on the fly from the coarser ones,
  so the ground never goes blank when zooming in.
- **True proportions**: the map is web mercator sized like the Earth, so a lunar kilometre is
  drawn 3.67 times larger than an Earth one; heights are scaled up by the same factor (Earth
  radius ÷ Moon radius) when decoded. "Relief height 1×" is the real shape.
- **Sun**: a hillshade from the elevation, lit from the direction and height set in the Look
  step. It shades slopes; it doesn't cast long shadows across the ground (yet).
- **Looks**: Photo and sun (the LROC mosaic with sun shading), Orbiter photo, Sunlit relief
  (shading only), Height colours, Silver.
- **Ways to travel**: moonwalk (boot prints), lunar rover, lander hop (a ballistic arc drawn as
  a straight flight line), and a plain arrow.
- **Places**: the search box finds landing sites, maria, big craters, mountains and rilles from a
  built-in list (`lib/geocode.ts`), instantly and offline.
- **Distances** use the Moon's radius, 1,737.4 km.

## Limits of this first version

- Detail: about 118 m per pixel for heights and 100 m for the image. The whole Moon looks good
  from high up down to views a few kilometres wide; closer than that it gets soft.
- The map stops at 85° north and south (web mercator), so the poles themselves (Shackleton,
  the Artemis region) need a different map projection.
- The Apollo 17 demo route is approximate, not the surveyed station positions.

## Data sources and licences

- LRO LOLA elevation and LROC WAC mosaic: NASA/GSFC/Arizona State University, distributed by
  USGS Astrogeology. NASA data is not copyrighted; credit is burned into the video.
- Place positions: IAU Gazetteer of Planetary Nomenclature and published landing coordinates.

## Design system

`src/styles.css` uses the exact Webflow variables of nassau.se (names and values from the
site's "Base" collection): `--color--*` light values, `--dark--*` dark values, `--space--*`,
`--size--*`, `--stroke--*`, `--radius--*`, `--headings`, `--persist-*`. As on the site, the class
`dark-mode` on `<html>` swaps them, and the choice is shared with the rest of nassau.se through
`localStorage["dark-mode"]` (dark by default). Fonts are the site's own (Neugrotypeface,
Raleway variable) from the Webflow CDN, with a bundled Raleway as fallback for local development.

The header is the site's floating navigation plate: the Voyager Moon logo and a breadcrumb on
the left; on the right "Apps home", "Buy me a coffee" and the site's `toggle_wrap` theme toggle.
The plate is always dark, so its controls keep their dark-mode colours in light mode too.

- **Buy me a coffee** is the button from nassau.se/apps (Button Secondary with the Buy Me a
  Coffee logo, signal green with the coffee in Signal On). A click opens the same support panel
  as on the Apps page (`lib/support.ts` and the `.nx-bmc` styles are copied from the page's
  custom code); with a modifier key the link opens buymeacoffee.com/nassau in a new tab. Below
  1000 px wide the button shows the cup only.
- **Apps home** is a nav link like the site's main navigation (`.nav-text-link`: Raleway 600,
  16 px, bright text, signal green on hover) and goes to `/apps` on the same site. On phones it
  reads "Apps".
- The **project menu** (download or duplicate) is the icon button left of the video shape
  select in the step bar.

Components follow the "Nassau New" Figma design system:

| Figma component | Used for | Class |
| --- | --- | --- |
| Button / Primary | Next step, Render video, Download MP4, Create project, Play | `.btn.btn-primary` |
| Button / Secondary | Open a project file, New scene | `.btn.btn-secondary` |
| Button / Secondary (Apps page) | Buy me a coffee, in the header | `.bmc-button` |
| Nav link (site navigation) | Apps home, in the header | `.nav-text-link` |
| Button Tool / Secondary | Detailed controls: Undo, Reverse, Use this view, Duplicate | `.btn` |
| Button Tool / Primary | Chosen option in segmented controls, active tool, chosen transport | `.segmented .on` |
| Nav link | The current step | `.step.on` |
| Pill | Counts and meta | `.pill` |
| Text field | Text inputs | `.input` |
| Theme toggle | Light/dark switch | `.toggle_wrap` |

Glass (bg/glass + 20 px blur) for the header and floating map tools; 350 ms ease on colour and
border. Deviations: Button Tool / Primary keeps bright text in light mode (dark text on Dim Grey
fails contrast), and on/off switches, which the system doesn't define, borrow the Theme
toggle's shape.

To keep tokens in sync when the site changes, update the block at the top of `styles.css`, or
export them with Webflow DevLink.

