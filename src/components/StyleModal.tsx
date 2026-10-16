import type { Map as MLMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MAP_LOOKS } from "../lib/mapStyles";
import { cachedThumb, renderThumb } from "../lib/thumbnails";

/**
 * Larger previews of all map looks, rendered around where the map is looking now.
 * Picking one switches the map underneath straight away; the modal stays open.
 * Drag it by its title bar; close it with × or by clicking outside it.
 */
export function StyleModal(props: { map: MLMap | null; value: string; onPick: (id: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => ({ x: Math.max(12, Math.min(372, window.innerWidth - 660)), y: 140 }));
  const [where] = useState(() => {
    const c = props.map?.getCenter();
    return { center: (c ? [c.lng, c.lat] : [30.77, 20.19]) as [number, number], zoom: Math.max(1, (props.map?.getZoom() ?? 6) - 0.5) };
  });
  const [thumbs, setThumbs] = useState<Record<string, string>>(() => {
    const t: Record<string, string> = {};
    for (const l of MAP_LOOKS) {
      const u = cachedThumb(l, where.center, where.zoom);
      if (u) t[l.id] = u;
    }
    return t;
  });

  // Render the missing previews one by one, the selected look first.
  useEffect(() => {
    let alive = true;
    const order = [...MAP_LOOKS].sort((a, b) => (a.id === props.value ? -1 : b.id === props.value ? 1 : 0));
    (async () => {
      for (const look of order) {
        if (!alive) return;
        if (thumbs[look.id]) continue;
        try {
          const url = await renderThumb(look, where.center, where.zoom);
          if (alive) setThumbs((t) => ({ ...t, [look.id]: url }));
        } catch {
          /* leave the colour swatch */
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on a click outside, or Esc.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) props.onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    const id = setTimeout(() => window.addEventListener("pointerdown", down), 0);
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(id);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [props]);

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const el = box.current!;
    const from = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y };
    const move = (ev: PointerEvent) =>
      setPos({
        x: Math.min(window.innerWidth - el.offsetWidth - 8, Math.max(8, from.x + ev.clientX - from.mx)),
        y: Math.min(window.innerHeight - 60, Math.max(8, from.y + ev.clientY - from.my)),
      });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("is-dragging");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.classList.add("is-dragging");
  };

  return createPortal(
    <div ref={box} className="look-modal" role="dialog" aria-label="Map looks" style={{ left: pos.x, top: pos.y }}>
      <div className="look-modal-head" onPointerDown={startDrag}>
        <strong>Map looks</strong>
        <span className="hint">{MAP_LOOKS.length} looks around your route. Drag to move.</span>
        <button type="button" className="icon-btn" aria-label="Close" onClick={props.onClose}>
          ×
        </button>
      </div>
      <div className="look-grid" role="radiogroup" aria-label="Map look">
        {MAP_LOOKS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={props.value === l.id}
            className={`look-tile${props.value === l.id ? " on" : ""}`}
            onClick={() => props.onPick(l.id)}
          >
            {thumbs[l.id] ? (
              <img src={thumbs[l.id]} alt="" />
            ) : (
              <span className="look-swatch" style={{ background: l.swatch[0] }} aria-hidden>
                <span style={{ background: l.swatch[1] }} />
                <span style={{ background: l.swatch[2] }} />
                <span className="look-loading">Loading preview…</span>
              </span>
            )}
            <span className="look-title">{l.title}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
