# Historical trips

The moonwalks and rover drives of the Apollo landings, shown under "Historical trips" on the
app's start page. Each is an ordinary Voyager Moon project file, the same format as
"Download file" in the app, so you can also open one with "Open a project file".

They are made by `tools/make_historical_trips.ts` (run `npx tsx tools/make_historical_trips.ts`),
which also says where every position comes from. To add or change a trip, edit that script and
run it again, or drop any `*.voyager-moon.json` project file into this folder.

- Lunar Module, ALSEP, SEP, rover and Surveyor 3 positions: LROC, "Spacecraft Related
  Coordinates, 2016 Update".
- Geology stations: the craters they were at, from the IAU Gazetteer of Planetary Nomenclature
  (to 0.01°, about 300 m). The lines between stations are straight and smoothed, so the routes
  are a good guide rather than a survey of the real tracks.
