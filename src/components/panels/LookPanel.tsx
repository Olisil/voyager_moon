import { useEffect, useState } from "react";
import { ColorPicker, Field, Fold, Segmented, Slider, Toggle } from "../Controls";
import type { Map as MLMap } from "maplibre-gl";
import { lookById, QUICK_LOOKS } from "../../lib/mapStyles";
import { AUTO, autoColor } from "../../lib/colors";
import { cachedThumb } from "../../lib/thumbnails";
import type { RouteModel } from "../../lib/model";
import { TRANSPORT_IDS, TRANSPORTS, transportIcon } from "../../lib/transports";
import type { Corner, FinishMarker, Markers, Scene, StartMarker, TransportId, TransportStyle } from "../../lib/types";

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compassPoint = (deg: number) => POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export function LookPanel(props: {
  scene: Scene;
  model: RouteModel | null;
  update: (fn: (s: Scene) => Scene) => void;
  focusTransport: TransportId | null;
  map: MLMap | null;
}) {
  const { scene, update } = props;
  const look = scene.look;
  const used = [...new Set(props.model?.legs.map((l) => l.transport) ?? [scene.route.startTransport])];
  const [picked, setPicked] = useState<TransportId>(props.focusTransport ?? used[0] ?? "car");
  useEffect(() => {
    if (props.focusTransport) setPicked(props.focusTransport);
  }, [props.focusTransport]);
  const style = look.transports[picked];
  const legCount = (id: TransportId) => props.model?.legs.filter((l) => l.transport === id).length ?? 0;

  const setLook = (l: Partial<Scene["look"]>) => update((s) => ({ ...s, look: { ...s.look, ...l } }));
  const setStyle = (st: Partial<TransportStyle>) =>
    update((s) => ({ ...s, look: { ...s.look, transports: { ...s.look.transports, [picked]: { ...s.look.transports[picked], ...st } } } }));
  const setCompass = (c: Partial<Scene["look"]["compass"]>) => setLook({ compass: { ...look.compass, ...c } });
  const markers = look.markers;
  const setMarkers = (m: Partial<Markers>) => setLook({ markers: { ...markers, ...m } });
  const marked = markers.start !== "none" || markers.finish !== "none" || markers.legIcons;


  return (
    <>
      <header className="panel-intro">
        <h2>Choose the look</h2>
        <p>The ground, the sun, the line and its symbol, and extras like a compass. This is per scene; a new scene copies the look of the last one.</p>
      </header>

      <Fold title="Ground and sun">
        <div className="themes" role="radiogroup" aria-label="Map look">
          {[...QUICK_LOOKS, ...(QUICK_LOOKS.includes(look.theme) ? [] : [look.theme])].map((id) => {
            const t = lookById(id);
            const c = props.map?.getCenter();
            const thumb = c ? cachedThumb(t, [c.lng, c.lat], Math.max(1, props.map!.getZoom() - 0.5)) : null;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={look.theme === t.id}
                className={`theme${look.theme === t.id ? " on" : ""}`}
                onClick={() => setLook({ theme: t.id })}
              >
                {thumb && !QUICK_LOOKS.includes(t.id) ? (
                  <img className="theme-thumb" src={thumb} alt="" />
                ) : (
                  <span className="theme-swatch" style={{ background: t.swatch[0] }} aria-hidden>
                    <span style={{ background: t.swatch[1] }} />
                    <span style={{ background: t.swatch[2] }} />
                  </span>
                )}
                {t.title}
              </button>
            );
          })}
        </div>
        <Toggle label="3D surface" hint="Mountains and crater rims rise from the ground; pair it with some tilt in the camera step." checked={look.terrain} onChange={(v) => setLook({ terrain: v })} />
        {look.terrain && (
          <Slider
            label="Relief height"
            value={look.relief}
            min={1}
            max={3}
            step={0.1}
            format={(v) => (v === 1 ? "True shape" : `${v.toFixed(1)}×`)}
            onChange={(v) => setLook({ relief: v })}
          />
        )}
        <Field label="Sun">
          <Slider
            label="Sun direction"
            value={look.sun.azimuth}
            min={0}
            max={359}
            step={1}
            format={(v) => `${compassPoint(v)} ${v}°`}
            onChange={(v) => setLook({ sun: { ...look.sun, azimuth: v } })}
          />
          <Slider
            label="Sun height"
            value={look.sun.altitude}
            min={2}
            max={70}
            step={1}
            format={(v) => `${v}°`}
            ends={["Low, long shadows", "High"]}
            onChange={(v) => setLook({ sun: { ...look.sun, altitude: v } })}
          />
        </Field>
        <p className="hint">The Apollo crews landed with the sun 7–15° above the horizon, which shows craters best.</p>
      </Fold>

      <Fold title="Line and symbol">
        <Field label="Transport styles">
          <div className="transports" role="radiogroup" aria-label="Transport to style">
            {TRANSPORT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={picked === id}
                className={`transport${picked === id ? " on" : ""}`}
                onClick={() => setPicked(id)}
              >
                <img src={transportIcon(id, look.transports[id].color, 28)} alt="" width={22} height={22} />
                <span>
                  {TRANSPORTS[id].label}
                  {legCount(id) > 0 && <small>{legCount(id) === 1 ? "1 leg" : `${legCount(id)} legs`}</small>}
                </span>
              </button>
            ))}
          </div>
        </Field>
        <div className="style-card">
          <p className="style-card-title">
            {TRANSPORTS[picked].label} style
            <small>{legCount(picked) ? `Changes ${legCount(picked) === 1 ? "the" : "every"} ${TRANSPORTS[picked].label.toLowerCase()} leg` : "Not used in this route yet"}</small>
          </p>
          <Field label="Colour">
            <ColorPicker label="Line colour" value={style.color === AUTO ? "" : style.color} onChange={(c) => setStyle({ color: c })} />
            <button type="button" className={`btn btn-small auto-colour${style.color === AUTO ? " on" : ""}`} aria-pressed={style.color === AUTO} onClick={() => setStyle({ color: AUTO })}>
              <span className="auto-dot" style={{ background: autoColor(look.theme, picked) }} aria-hidden />
              Auto, fits the map
            </button>
          </Field>
          <Slider label="Thickness" value={style.width} min={2} max={14} step={1} format={(v) => `${v} px`} onChange={(v) => setStyle({ width: v })} />
          <Field label="Line">
            <Segmented
              label="Line pattern"
              value={style.line}
              options={[
                { value: "solid", label: "Solid" },
                { value: "dashed", label: "Dashed" },
                { value: "dotted", label: "Dotted" },
              ]}
              onChange={(v) => setStyle({ line: v })}
            />
          </Field>
          <Field label="Symbol at the tip">
            <Segmented
              label="Symbol at the tip"
              value={style.symbol}
              options={[
                { value: "badge", label: "Icon" },
                { value: "arrow", label: "Arrow" },
                { value: "dot", label: "Dot" },
                { value: "none", label: "None" },
              ]}
              onChange={(v) => setStyle({ symbol: v })}
            />
          </Field>
          {style.symbol === "badge" && <p className="hint">A top-down {TRANSPORTS[picked].label.toLowerCase()} that turns with the line. It switches to dark on bright maps.</p>}
          {(style.symbol === "arrow" || style.symbol === "dot") && (
            <Field label="Symbol colour">
              <Segmented
                label="Symbol colour"
                value={style.symbolColor ? "own" : "line"}
                options={[
                  { value: "line", label: "Same as line" },
                  { value: "own", label: "Its own" },
                ]}
                onChange={(v) => setStyle({ symbolColor: v === "own" ? "#E6E6E6" : null })}
              />
              {style.symbolColor && (
                <div className="nested">
                  <ColorPicker label="Symbol colour" value={style.symbolColor} onChange={(c) => setStyle({ symbolColor: c })} />
                </div>
              )}
            </Field>
          )}
        </div>
        <Slider label="Symbol size" value={look.symbolScale} min={0.6} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setLook({ symbolScale: v })} />
        <Toggle label="White outline" hint="A thin white edge around the line." checked={look.outline} onChange={(v) => setLook({ outline: v })} />
        <Toggle label="Show the way ahead" hint="A faint dashed line for the part not travelled yet." checked={look.showAhead} onChange={(v) => setLook({ showAhead: v })} />
      </Fold>

      <Fold title="Start, finish and legs" defaultOpen={marked}>
        <Field label="Start">
          <Segmented<StartMarker>
            label="Start mark"
            value={markers.start}
            options={[
              { value: "none", label: "None" },
              { value: "cross", label: "Cross" },
            ]}
            onChange={(v) => setMarkers({ start: v })}
          />
        </Field>
        <Field label="Finish">
          <Segmented<FinishMarker>
            label="Finish mark"
            value={markers.finish}
            options={[
              { value: "none", label: "None" },
              { value: "cross", label: "Cross" },
              { value: "flag", label: "Chequered flag" },
            ]}
            onChange={(v) => setMarkers({ finish: v })}
          />
        </Field>
        {markers.finish !== "none" && (
          <Toggle
            label="Show the finish from the start"
            hint="Off: it pops up when the line arrives."
            checked={markers.finishFromStart}
            onChange={(v) => setMarkers({ finishFromStart: v })}
          />
        )}
        <Toggle
          label="Transport icons on the legs"
          hint="A round icon in the middle of each leg, popping up as soon as that leg is done."
          checked={markers.legIcons}
          onChange={(v) => setMarkers({ legIcons: v })}
        />
        <p className="hint">The crosses take the colour of the line. Marks follow the symbol size.</p>
      </Fold>

      <Fold title="Extras" defaultOpen={look.compass.on}>
        <Toggle label="Compass" hint="Sits in a corner of the video and turns with the map." checked={look.compass.on} onChange={(v) => setCompass({ on: v })} />
        {look.compass.on && (
          <>
            <Field label="Corner">
              <Segmented<Corner>
                label="Compass corner"
                value={look.compass.corner}
                options={[
                  { value: "tl", label: "Top left" },
                  { value: "tr", label: "Top right" },
                  { value: "bl", label: "Bottom left" },
                  { value: "br", label: "Bottom right" },
                ]}
                onChange={(v) => setCompass({ corner: v })}
              />
            </Field>
            <Field label="Style">
              <Segmented
                label="Compass style"
                value={look.compass.style}
                options={[
                  { value: "needle", label: "Needle" },
                  { value: "rose", label: "Compass rose" },
                ]}
                onChange={(v) => setCompass({ style: v })}
              />
            </Field>
            <Slider label="Size" value={look.compass.size} min={0.6} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setCompass({ size: v })} />
          </>
        )}
      </Fold>
    </>
  );
}
