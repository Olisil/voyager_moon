import type { Map as MLMap } from "maplibre-gl";
import { useEffect, useState } from "react";

/** Zoom in, zoom out, and a compass needle that follows the map's rotation; clicking it turns north up. */
export function MapControls({ map }: { map: MLMap | null }) {
  const [bearing, setBearing] = useState(0);
  useEffect(() => {
    if (!map) return;
    const on = () => setBearing(map.getBearing());
    on();
    map.on("rotate", on);
    return () => {
      map.off("rotate", on);
    };
  }, [map]);
  const north = Math.abs(bearing) < 0.5;
  return (
    <div className="map-controls" role="group" aria-label="Map view">
      <button type="button" className="map-ctl" aria-label="Zoom in" onClick={() => map?.zoomIn()}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <button type="button" className="map-ctl" aria-label="Zoom out" onClick={() => map?.zoomOut()}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
          <path d="M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="map-ctl"
        aria-label={north ? "North is up" : "Turn north up"}
        title={north ? "North is up" : "Turn north up"}
        aria-disabled={north}
        onClick={() => !north && map?.easeTo({ bearing: 0, duration: 400 })}
      >
        <svg viewBox="0 0 16 24" width="12" height="20" aria-hidden style={{ transform: `rotate(${-bearing}deg)` }}>
          <path d="M8 1 12 12H4Z" fill="var(--persist-signal-green)" />
          <path d="M8 23 4 12h8Z" fill="currentColor" opacity="0.7" />
        </svg>
      </button>
    </div>
  );
}
