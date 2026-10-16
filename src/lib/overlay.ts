import type { FrameState } from "./camera";
import { pointAt, toLngLat } from "./geo";
import { timeAtS, type RouteModel, type Timeline } from "./model";
import { drawTopIcon, inkFor, topIcon } from "./topdown";
import { lineColor } from "./colors";
import { TRANSPORTS } from "./transports";
import type { LngLat, Scene, Sign, TransportId } from "./types";

export const FONT_HEAD = '"Neugrotypeface", "Raleway Variablefont Wght", "Raleway Variable", sans-serif';
export const FONT_BODY = '"Raleway Variablefont Wght", "Raleway Variable", system-ui, sans-serif';

export interface Hit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverlayInput {
  scene: Scene;
  frame: FrameState | null;
  timeline: Timeline | null;
  /** null = editing: every sign shown in full */
  t: number | null;
  toScreen: (ll: LngLat) => { x: number; y: number };
  mapBearing: number;
  /** css size of the frame */
  width: number;
  height: number;
  /** canvas pixels per css pixel */
  scale: number;
  credit: string | null;
  selectedSign?: string | null;
  /** route geometry and map zoom, so trains and footsteps can follow the line behind the tip */
  model?: RouteModel | null;
  zoom?: number;
  /** bright base map: top-down icons are drawn inverted */
  brightMap?: boolean;
  image: (url: string) => HTMLImageElement | null;
}

const backOut = (x: number) => {
  const c = 1.7;
  const k = Math.min(1, Math.max(0, x)) - 1;
  return 1 + (c + 1) * k * k * k + c * k * k;
};

// ---------- tip symbol ----------

/**
 * A point on the route `px` screen pixels behind the tip, and the direction the drawn line runs
 * there ON SCREEN. The heading is measured between projected points of the path itself, so a
 * pointer always lies along the line, whatever the pitch, terrain or rotation of the map.
 */
function behind(o: OverlayInput, px: number): { x: number; y: number; heading: number } | null {
  const f = o.frame;
  if (!f || !o.model || o.zoom === undefined) return null;
  const path = o.model.path;
  const unit = 1 / (512 * Math.pow(2, o.zoom));
  const s = Math.max(0, Math.min(path.length, f.s - px * unit));
  const p = o.toScreen(toLngLat(pointAt(path, s)));
  return { x: p.x, y: p.y, heading: screenHeading(o, s) ?? ((f.tipBearing - o.mapBearing) * Math.PI) / 180 };
}

function screenHeading(o: OverlayInput, s: number): number | null {
  if (!o.model || o.zoom === undefined) return null;
  const path = o.model.path;
  const d = 6 / (512 * Math.pow(2, o.zoom));
  let a = s - d;
  let b = s;
  if (a < 0) {
    a = 0;
    b = Math.min(path.length, d);
  }
  if (b - a <= 0) return null;
  const pa = o.toScreen(toLngLat(pointAt(path, a)));
  const pb = o.toScreen(toLngLat(pointAt(path, b)));
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  if (Math.hypot(dx, dy) < 0.01) return null;
  return Math.atan2(dx, -dy);
}

function drawSymbol(g: CanvasRenderingContext2D, o: OverlayInput) {
  const f = o.frame;
  if (!f) return;
  const st = o.scene.look.transports[f.leg.transport];
  if (st.symbol === "none") return;
  const p = o.toScreen(f.tip);
  const color = st.symbolColor ?? lineColor(o.scene, f.leg.transport);
  const heading = screenHeading(o, f.s) ?? ((f.tipBearing - o.mapBearing) * Math.PI) / 180;
  const k = o.scene.look.symbolScale;
  if (st.symbol === "badge") {
    drawTopDown(g, o, p, heading, k);
    return;
  }
  const r = 15 * k;
  g.save();
  g.translate(p.x, p.y);
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowBlur = 6;
  g.shadowOffsetY = 2;
  if (st.symbol === "dot") {
    g.beginPath();
    g.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    g.shadowColor = "transparent";
    g.lineWidth = 2.5;
    g.strokeStyle = "#fff";
    g.stroke();
  } else {
    g.rotate(heading);
    const a = r * 1.05;
    g.beginPath();
    g.moveTo(0, -a);
    g.lineTo(a * 0.8, a * 0.85);
    g.lineTo(0, a * 0.4);
    g.lineTo(-a * 0.8, a * 0.85);
    g.closePath();
    g.lineJoin = "round";
    g.fillStyle = color;
    g.fill();
    g.shadowColor = "transparent";
    g.lineWidth = 2.2;
    g.strokeStyle = "#fff";
    g.stroke();
  }
  g.restore();
}

/**
 * Top-down pointers. 1 design px = 2 screen px at 100 % symbol size.
 * Train: locomotive at the tip, two wagons following the line behind it.
 * Walk: footprints left along the line, left and right feet a little apart and turned slightly
 * outwards, the older steps fading out.
 * Balloon: stays upright and bobs gently.
 */
function drawTopDown(g: CanvasRenderingContext2D, o: OverlayInput, p: { x: number; y: number }, heading: number, k: number) {
  const f = o.frame!;
  const ink = inkFor(!!o.brightMap);
  const scale = 2 * k;
  const shadow = () => {
    g.shadowColor = o.brightMap ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.5)";
    g.shadowBlur = 4;
    g.shadowOffsetY = 1;
  };
  const at = (x: number, y: number, h: number, id: Parameters<typeof topIcon>[0], alpha = 1, mirror = false) => {
    const icon = topIcon(id);
    if (!icon) return;
    g.save();
    g.translate(x, y);
    if (icon.rotates) g.rotate(h);
    if (mirror) g.scale(-1, 1);
    shadow();
    drawTopIcon(g, icon, scale, ink, alpha);
    g.restore();
  };
  const t = f.leg.transport;

  if (t === "train") {
    const loco = topIcon("loco")!;
    const wagon = topIcon("wagon")!;
    // centres measured back from the tip, in screen px
    const offsets = [loco.h / 2, loco.h + wagon.h / 2, loco.h + wagon.h * 1.5].map((d) => d * scale);
    const ids: ("loco" | "wagon")[] = ["loco", "wagon", "wagon"];
    for (let i = ids.length - 1; i >= 0; i--) {
      const b = behind(o, offsets[i]);
      if (b) at(b.x, b.y, b.heading, ids[i]);
      else if (i === 0) at(p.x, p.y, heading, "loco");
    }
    return;
  }

  if (t === "walk") {
    // The print is a left shoe. Steps are about one and a half shoe lengths apart along the line,
    // and the feet sit a shoe width apart across it, so prints never touch.
    const foot = topIcon("foot")!;
    const step = foot.h * 1.45 * scale;
    const side = foot.w * 0.6 * scale;
    const toeOut = 0.12;
    const zoomScale = o.zoom !== undefined ? 512 * Math.pow(2, o.zoom) : 0;
    const walked = f.s * zoomScale;
    const last = Math.floor(walked / step);
    for (let n = 3; n >= 0; n--) {
      const i = last - n;
      if (i < 0) continue;
      const b = behind(o, walked - i * step);
      if (!b) continue;
      const left = i % 2 === 0;
      const off = left ? -side : side;
      const x = b.x + Math.cos(b.heading) * off;
      const y = b.y + Math.sin(b.heading) * off;
      at(x, y, b.heading + (left ? -toeOut : toeOut), "foot", [1, 0.7, 0.45, 0.2][n], !left);
    }
    if (last < 0 || !o.model) at(p.x, p.y, heading, "foot");
    return;
  }

  if (t === "balloon") {
    const bob = Math.sin(f.t * 2.2) * 1.5 * k;
    at(p.x, p.y - 10 * k + bob, 0, "balloon");
    return;
  }

  at(p.x, p.y, heading, t);
}

// ---------- route markers: start, finish, transport per leg ----------

/** How far a mark has popped up (0..1): it appears at `when` seconds and settles in half a second. */
function popAmount(o: OverlayInput, when: number | null): number {
  if (o.t === null || when === null) return 1;
  if (o.t < when) return 0;
  return Math.min(1, (o.t - when) / 0.5);
}

function withPop(g: CanvasRenderingContext2D, x: number, y: number, amount: number, draw: () => void) {
  if (amount <= 0) return;
  g.save();
  g.translate(x, y);
  if (amount < 1) {
    g.globalAlpha *= Math.min(1, amount * 2);
    const s = 0.3 + 0.7 * backOut(amount);
    g.scale(s, s);
  }
  draw();
  g.restore();
}

/** An X in the colour of the line, with a white edge, like the arrow symbol. */
function drawCross(g: CanvasRenderingContext2D, k: number, color: string) {
  const a = 9 * k;
  g.lineCap = "round";
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowBlur = 6;
  g.shadowOffsetY = 2;
  g.beginPath();
  g.moveTo(-a, -a);
  g.lineTo(a, a);
  g.moveTo(a, -a);
  g.lineTo(-a, a);
  g.lineWidth = 9 * k;
  g.strokeStyle = "#ffffff";
  g.stroke();
  g.shadowColor = "transparent";
  g.lineWidth = 5 * k;
  g.strokeStyle = color;
  g.stroke();
}

/** A chequered flag on a pole, planted at 0,0 and waving a little. */
function drawChequeredFlag(g: CanvasRenderingContext2D, k: number, time: number) {
  const pole = 50 * k;
  const w = 34 * k;
  const h = 22 * k;
  const cols = 6;
  const rows = 4;
  const wave = (u: number) => Math.sin(u * Math.PI * 1.6 - time * 4) * 2.2 * k * u;
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowBlur = 6;
  g.shadowOffsetY = 2;
  g.fillStyle = "#e6e6e6";
  g.fillRect(-1.5 * k, -pole, 3 * k, pole);
  // the cloth: white with a dark outline, then the dark squares
  const top = -pole + 1 * k;
  const pt = (u: number, v: number): [number, number] => [1.5 * k + u * w, top + v * h + wave(u)];
  const quad = (u0: number, v0: number, u1: number, v1: number) => {
    const [ax, ay] = pt(u0, v0);
    const [bx, by] = pt(u1, v0);
    const [cx, cy] = pt(u1, v1);
    const [dx, dy] = pt(u0, v1);
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.lineTo(cx, cy);
    g.lineTo(dx, dy);
    g.closePath();
  };
  g.beginPath();
  quad(0, 0, 1, 1);
  g.fillStyle = "#f7f7f7";
  g.fill();
  g.shadowColor = "transparent";
  g.beginPath();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((r + c) % 2 === 0) quad(c / cols, r / rows, (c + 1) / cols, (r + 1) / rows);
  g.fillStyle = "#0e0e0e";
  g.fill();
  g.beginPath();
  quad(0, 0, 1, 1);
  g.lineWidth = 1.2 * k;
  g.strokeStyle = "#0e0e0e";
  g.stroke();
  anchorDot(g, k * 0.8);
}

/** The round side-view transport icon from the app's menus, on the line. */
function drawLegIcon(g: CanvasRenderingContext2D, k: number, id: TransportId) {
  const r = 15 * k;
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowBlur = 6;
  g.shadowOffsetY = 2;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = "#0e0e0e";
  g.fill();
  g.shadowColor = "transparent";
  g.lineWidth = 2 * k;
  g.strokeStyle = "#ffffff";
  g.stroke();
  TRANSPORTS[id].glyph(g, r * 0.76, "#0e0e0e", "#ffffff");
}

function drawMarkers(g: CanvasRenderingContext2D, o: OverlayInput) {
  const m = o.scene.look.markers;
  const model = o.model;
  if (!model || (m.start === "none" && m.finish === "none" && !m.legIcons)) return;
  const k = o.scene.look.symbolScale;
  const easing = o.scene.timing.easing;
  const tl = o.timeline;
  const path = model.path;
  const legs = model.legs;

  if (m.legIcons) {
    for (const leg of legs) {
      if (leg.s1 - leg.s0 <= 0) continue;
      const p = o.toScreen(toLngLat(pointAt(path, (leg.s0 + leg.s1) / 2)));
      const when = tl ? timeAtS(tl, leg.s1, easing) : null;
      withPop(g, p.x, p.y, popAmount(o, when), () => drawLegIcon(g, k, leg.transport));
    }
  }
  if (m.start === "cross") {
    const p = o.toScreen(toLngLat(path.xy[0]));
    withPop(g, p.x, p.y, 1, () => drawCross(g, k, lineColor(o.scene, legs[0].transport)));
  }
  if (m.finish !== "none") {
    const p = o.toScreen(toLngLat(path.xy[path.xy.length - 1]));
    const when = m.finishFromStart || !tl ? null : timeAtS(tl, path.length, easing);
    const amount = popAmount(o, when);
    const time = o.t ?? 0;
    withPop(g, p.x, p.y, amount, () =>
      m.finish === "cross" ? drawCross(g, k, lineColor(o.scene, legs[legs.length - 1].transport)) : drawChequeredFlag(g, k, time),
    );
  }
}

// ---------- signs ----------

function textWidth(g: CanvasRenderingContext2D, text: string) {
  return g.measureText(text || " ").width;
}

function anchorDot(g: CanvasRenderingContext2D, k: number, fill = "#0e0e0e", ring = "#ffffff") {
  g.beginPath();
  g.arc(0, 0, 4.5 * k, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 2 * k;
  g.strokeStyle = ring;
  g.stroke();
}

/** Draws one sign with its anchor at 0,0 and returns its bounds relative to the anchor. */
function drawSign(g: CanvasRenderingContext2D, sign: Sign, k: number, image: OverlayInput["image"]): [number, number, number, number] {
  const text = sign.text.trim();
  g.textBaseline = "middle";
  switch (sign.style) {
    case "plate": {
      g.font = `500 ${18 * k}px ${FONT_HEAD}`;
      const w = textWidth(g, text) + 28 * k;
      const h = 38 * k;
      const post = 22 * k;
      g.fillStyle = "#e6e6e6";
      g.fillRect(-1.5 * k, -post, 3 * k, post);
      g.beginPath();
      g.roundRect(-w / 2, -post - h, w, h, 4 * k);
      g.fillStyle = "rgba(14,14,14,0.92)";
      g.fill();
      g.lineWidth = 2 * k;
      g.strokeStyle = "#bad70a";
      g.stroke();
      g.fillStyle = "#e6e6e6";
      g.textAlign = "center";
      g.fillText(text, 0, -post - h / 2 + 1 * k);
      anchorDot(g, k);
      return [-w / 2, -post - h, w, h + post + 5 * k];
    }
    case "tag": {
      g.font = `600 ${16 * k}px ${FONT_BODY}`;
      const w = textWidth(g, text) + 24 * k;
      const h = 34 * k;
      const gap = 12 * k;
      g.shadowColor = "rgba(0,0,0,0.35)";
      g.shadowBlur = 8 * k;
      g.shadowOffsetY = 2 * k;
      g.beginPath();
      g.roundRect(-w / 2, -gap - h, w, h, 6 * k);
      g.moveTo(-7 * k, -gap);
      g.lineTo(0, 0);
      g.lineTo(7 * k, -gap);
      g.fillStyle = "#ffffff";
      g.fill();
      g.shadowColor = "transparent";
      g.fillStyle = "#0e0e0e";
      g.textAlign = "center";
      g.fillText(text, 0, -gap - h / 2 + 1 * k);
      return [-w / 2, -gap - h, w, h + gap];
    }
    case "pin": {
      g.font = `600 ${16 * k}px ${FONT_BODY}`;
      const w = textWidth(g, text);
      anchorDot(g, k * 1.3, "#bad70a", "#0e0e0e");
      g.textAlign = "left";
      g.lineJoin = "round";
      g.lineWidth = 4 * k;
      g.strokeStyle = "rgba(14,14,14,0.85)";
      g.strokeText(text, 12 * k, 0);
      g.fillStyle = "#ffffff";
      g.fillText(text, 12 * k, 0);
      return [-8 * k, -12 * k, w + 22 * k, 24 * k];
    }
    case "flag": {
      g.font = `500 ${15 * k}px ${FONT_HEAD}`;
      const pole = 56 * k;
      const w = textWidth(g, text) + 26 * k;
      const h = 26 * k;
      g.fillStyle = "#e6e6e6";
      g.fillRect(-1.25 * k, -pole, 2.5 * k, pole);
      g.beginPath();
      g.moveTo(0, -pole);
      g.lineTo(w, -pole);
      g.lineTo(w - 9 * k, -pole + h / 2);
      g.lineTo(w, -pole + h);
      g.lineTo(0, -pole + h);
      g.closePath();
      g.fillStyle = "#c5a11f";
      g.fill();
      g.fillStyle = "#0e0e0e";
      g.textAlign = "left";
      g.fillText(text, 8 * k, -pole + h / 2 + 1 * k);
      anchorDot(g, k * 0.8);
      return [-6 * k, -pole - 2 * k, w + 8 * k, pole + 8 * k];
    }
    case "caption": {
      g.font = `500 ${30 * k}px ${FONT_HEAD}`;
      const w = textWidth(g, text);
      g.textAlign = "center";
      g.shadowColor = "rgba(0,0,0,0.7)";
      g.shadowBlur = 10 * k;
      g.fillStyle = "#ffffff";
      g.fillText(text, 0, 0);
      g.shadowColor = "transparent";
      return [-w / 2 - 6 * k, -22 * k, w + 12 * k, 44 * k];
    }
    case "photo": {
      const pw = 132 * k;
      const frame = 8 * k;
      const capH = text ? 30 * k : 10 * k;
      const w = pw + frame * 2;
      const h = pw + frame + capH;
      const lift = 30 * k;
      g.strokeStyle = "rgba(230,230,230,0.9)";
      g.lineWidth = 1.5 * k;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -lift);
      g.stroke();
      anchorDot(g, k * 0.8);
      g.save();
      g.translate(0, -lift - h / 2);
      g.rotate(-0.045);
      g.shadowColor = "rgba(0,0,0,0.45)";
      g.shadowBlur = 14 * k;
      g.shadowOffsetY = 4 * k;
      g.fillStyle = "#f7f5f0";
      g.fillRect(-w / 2, -h / 2, w, h);
      g.shadowColor = "transparent";
      const img = sign.photo ? image(sign.photo) : null;
      const ix = -w / 2 + frame;
      const iy = -h / 2 + frame;
      if (img) {
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, ix, iy, pw, pw);
      } else {
        g.fillStyle = "#393939";
        g.fillRect(ix, iy, pw, pw);
        g.fillStyle = "#e6e6e6";
        g.font = `500 ${13 * k}px ${FONT_BODY}`;
        g.textAlign = "center";
        g.fillText("Add a photo", 0, iy + pw / 2);
      }
      if (text) {
        g.fillStyle = "#252525";
        g.font = `italic 500 ${15 * k}px ${FONT_BODY}`;
        g.textAlign = "center";
        g.fillText(text, 0, h / 2 - capH / 2, pw);
      }
      g.restore();
      return [-w / 2 - 4 * k, -lift - h - 6 * k, w + 8 * k, h + lift + 6 * k];
    }
  }
}

function drawSigns(g: CanvasRenderingContext2D, o: OverlayInput): Hit[] {
  const hits: Hit[] = [];
  const k = o.scene.signScale;
  for (const sign of o.scene.signs) {
    let amount = 1;
    if (o.t !== null && sign.show === "passed") {
      const tp = o.timeline?.signTimes[sign.id];
      if (tp === undefined || o.t < tp) continue;
      amount = Math.min(1, (o.t - tp) / 0.5);
    }
    const p = o.toScreen(sign.at);
    g.save();
    g.translate(p.x, p.y);
    if (amount < 1) {
      g.globalAlpha = Math.min(1, amount * 2);
      const s = 0.4 + 0.6 * backOut(amount);
      g.scale(s, s);
    }
    const [x, y, w, h] = drawSign(g, sign, k, o.image);
    if (o.selectedSign === sign.id) {
      g.setLineDash([5, 4]);
      g.lineWidth = 1.5;
      g.strokeStyle = "#e6ff4c";
      g.strokeRect(x - 4, y - 4, w + 8, h + 8);
    }
    g.restore();
    hits.push({ id: sign.id, x: p.x + x, y: p.y + y, w, h });
  }
  return hits;
}

// ---------- compass and credit ----------

function drawCompass(g: CanvasRenderingContext2D, o: OverlayInput) {
  const c = o.scene.look.compass;
  if (!c.on) return;
  const r = 28 * c.size;
  const m = 20 + r;
  const x = c.corner.endsWith("l") ? m : o.width - m;
  const y = c.corner.startsWith("t") ? m : o.height - m - (c.corner.endsWith("r") && o.credit ? 28 : 0);
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = "rgba(14,14,14,0.72)";
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = "rgba(230,230,230,0.5)";
  g.stroke();
  g.rotate((-o.mapBearing * Math.PI) / 180);
  if (c.style === "rose") {
    for (let i = 0; i < 8; i++) {
      const long = i % 2 === 0;
      const len = (long ? 0.82 : 0.5) * r;
      g.save();
      g.rotate((i * Math.PI) / 4);
      g.beginPath();
      g.moveTo(0, -len);
      g.lineTo(0.13 * r, 0);
      g.lineTo(0, 0.13 * r);
      g.closePath();
      g.fillStyle = i === 0 ? "#bad70a" : "#e6e6e6";
      g.fill();
      g.beginPath();
      g.moveTo(0, -len);
      g.lineTo(-0.13 * r, 0);
      g.lineTo(0, 0.13 * r);
      g.closePath();
      g.fillStyle = i === 0 ? "#7f9306" : "#8a8a8a";
      g.fill();
      g.restore();
    }
  } else {
    g.beginPath();
    g.moveTo(0, -0.62 * r);
    g.lineTo(0.17 * r, 0);
    g.lineTo(-0.17 * r, 0);
    g.closePath();
    g.fillStyle = "#bad70a";
    g.fill();
    g.beginPath();
    g.moveTo(0, 0.62 * r);
    g.lineTo(0.17 * r, 0);
    g.lineTo(-0.17 * r, 0);
    g.closePath();
    g.fillStyle = "#e6e6e6";
    g.fill();
    g.font = `500 ${0.3 * r}px ${FONT_HEAD}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#e6e6e6";
    g.fillText("N", 0, -0.8 * r);
  }
  g.restore();
}

function drawCredit(g: CanvasRenderingContext2D, o: OverlayInput) {
  if (!o.credit) return;
  const size = Math.max(10, Math.round(Math.min(o.width, o.height) * 0.017));
  g.font = `500 ${size}px ${FONT_BODY}`;
  const pad = Math.round(size * 0.55);
  const w = g.measureText(o.credit).width + pad * 2;
  const h = size + pad * 1.2;
  const x = o.width - w - pad;
  const y = o.height - h - pad;
  g.fillStyle = "rgba(14,14,14,0.6)";
  g.fillRect(x, y, w, h);
  g.fillStyle = "rgba(230,230,230,0.92)";
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillText(o.credit, x + pad, y + h / 2 + 1);
}

/** Draws everything that sits on top of the map. Returns where the signs are, for dragging. */
export function drawOverlay(g: CanvasRenderingContext2D, o: OverlayInput): Hit[] {
  g.save();
  g.scale(o.scale, o.scale);
  drawMarkers(g, o);
  const hits = drawSigns(g, o);
  drawSymbol(g, o);
  drawCompass(g, o);
  drawCredit(g, o);
  g.restore();
  return hits;
}

// ---------- images ----------

const images = new Map<string, HTMLImageElement>();
export function cachedImage(url: string, onLoad?: () => void): HTMLImageElement | null {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.onload = () => onLoad?.();
    img.src = url;
    images.set(url, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

export async function preloadImages(urls: string[]) {
  await Promise.all(
    urls.map(async (u) => {
      cachedImage(u);
      try {
        await images.get(u)!.decode();
      } catch {
        /* a broken photo renders as the placeholder */
      }
    }),
  );
}

/** Shrinks a picked photo to something that fits comfortably in a project. */
export async function photoToDataUrl(file: File, max = 900): Promise<string> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL("image/jpeg", 0.85);
}

export async function ensureFonts() {
  await Promise.all([
    document.fonts.load(`500 20px ${FONT_HEAD}`),
    document.fonts.load(`600 20px ${FONT_BODY}`),
    document.fonts.load(`italic 500 20px ${FONT_BODY}`),
  ]).catch(() => {});
}
