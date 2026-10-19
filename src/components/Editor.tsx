import type { Map as MLMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { frameAt } from "../lib/camera";
import { downloadBlob, downloadProjectFile, duplicateProject, getProject, importProjectFile, saveProject, slug } from "../lib/db";
import { creditFor, ExportUnsupportedError, renderVideo } from "../lib/exporter";
import { boundsOf, chordBearing, haversineKm, parseGpx } from "../lib/geo";
import { TRANSPORT_IDS } from "../lib/transports";
import { ensureTheme, isBrightLook, showEditing, showFrame } from "../lib/mapScene";
import { buildRouteModel, legSeconds, makeTimeline, type RouteModel } from "../lib/model";
import { navigate } from "../router";
import { ThemeToggle } from "../theme";
import { ASPECTS, outputSize, uid, type Aspect, type LngLat, type Project, type Route, type Scene, type SignStyle, type TransportId } from "../lib/types";
import { MapStage, type Interaction, type OverlayBase } from "./MapStage";
import { LegsPanel, PointPopover, SearchBox } from "./MapWidgets";
import { CameraPanel } from "./panels/CameraPanel";
import { ExportPanel, type RenderState } from "./panels/ExportPanel";
import { LookPanel } from "./panels/LookPanel";
import { RoutePanel } from "./panels/RoutePanel";
import { SignsPanel } from "./panels/SignsPanel";
import { Floating } from "./Floating";
import { HeaderNav } from "./HeaderNav";
import { MapControls } from "./MapControls";
import logoUrl from "../assets/voyager-moon-logo.svg";
import { Segmented } from "./Controls";
import { hasMoonData } from "../lib/moonData";

type Step = "route" | "look" | "signs" | "camera" | "export";
const STEPS: { id: Step; label: string; next: string }[] = [
  { id: "route", label: "Route", next: "Next: choose the look" },
  { id: "look", label: "Look", next: "Next: add signs" },
  { id: "signs", label: "Signs", next: "Next: set up the camera" },
  { id: "camera", label: "Camera", next: "Next: preview & export" },
  { id: "export", label: "Preview & export", next: "" },
];

const modelCache = new WeakMap<Route, RouteModel | null>();
function modelFor(route: Route): RouteModel | null {
  if (!modelCache.has(route)) modelCache.set(route, buildRouteModel(route));
  return modelCache.get(route)!;
}

function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

function routeKm(route: Route) {
  let km = 0;
  for (let i = 1; i < route.points.length; i++) km += haversineKm(route.points[i - 1].at, route.points[i].at);
  return km;
}

export function Editor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    getProject(projectId)
      .then((p) => {
        if (!live) return;
        if (p) setProject(p);
        else setMissing(true);
      })
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [projectId]);

  if (missing)
    return (
      <div className="empty-page">
        <h1>This project isn't in this browser</h1>
        <p>Projects are saved in the browser they were made in. Open the project file instead, or start a new one.</p>
        <a className="btn btn-primary" href="#/">
          Go to your projects
        </a>
      </div>
    );
  if (!project) return <div className="empty-page" aria-busy="true" />;
  return <EditorLoaded key={project.id} initial={project} />;
}

function EditorLoaded({ initial }: { initial: Project }) {
  const [project, setProject] = useState<Project>(initial);
  // Scenes are not offered in the editor; a project shows and renders its first scene.
  const sceneIdx = 0;
  const [step, setStep] = useState<Step>(initial.scenes[0].route.points.length ? "look" : "route");
  const [map, setMap] = useState<MLMap | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [tool, setTool] = useState<"draw" | "move">("draw");
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [selectedSign, setSelectedSign] = useState<string | null>(null);
  const [placing, setPlacing] = useState<SignStyle | null>(null);
  const [focusTransport, setFocusTransport] = useState<TransportId | null>(null);
  const [history, setHistory] = useState<Route[]>([]);
  const [future, setFuture] = useState<Route[]>([]);
  const [render, setRender] = useState<RenderState>({ status: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [overlayKey, setOverlayKey] = useState(0);
  // The project menu (download or duplicate) opens below its button in the step bar.
  const [projectMenu, setProjectMenu] = useState<{ top: number; right: number } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const overlayRef = useRef<OverlayBase | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;

  // The project menu closes on a click outside it, on Escape, and when the window resizes or
  // anything scrolls (it is placed in window coordinates, below its button).
  useEffect(() => {
    if (!projectMenu) return;
    const outside = (e: PointerEvent) => {
      if (!(e.target as Element).closest(".project-menu, .project-menu-button")) setProjectMenu(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProjectMenu(null);
    };
    const away = () => setProjectMenu(null);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away, true);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", away);
      window.removeEventListener("scroll", away, true);
    };
  }, [projectMenu]);

  const scene = project.scenes[Math.min(sceneIdx, project.scenes.length - 1)];
  const model = modelFor(scene.route);
  const timeline = useMemo(() => makeTimeline(model, scene, project.output), [model, scene, project.output]);
  const duration = timeline.total;
  const rendering = render.status === "rendering";
  const lastTransport = model?.legs[model.legs.length - 1]?.transport ?? scene.route.startTransport;
  const [travelBy, setTravelBy] = useState<TransportId>(lastTransport);

  const mode: "route-edit" | "sign-edit" | "frame" =
    !playing && !previewing && step === "route" ? "route-edit" : !playing && !previewing && step === "signs" ? "sign-edit" : "frame";

  // ---- updates
  const updateProject = useCallback((fn: (p: Project) => Project) => setProject(fn), []);
  const updateScene = useCallback(
    (fn: (s: Scene) => Scene) =>
      setProject((p) => ({ ...p, scenes: p.scenes.map((s, i) => (i === Math.min(sceneIdx, p.scenes.length - 1) ? fn(s) : s)) })),
    [sceneIdx],
  );
  const setRoute = useCallback(
    (route: Route, commit = true) => {
      if (commit) {
        const before = projectRef.current.scenes[sceneIdx]?.route;
        if (before) setHistory((h) => [...h.slice(-99), before]);
        setFuture([]);
      }
      updateScene((s) => ({ ...s, route }));
    },
    [sceneIdx, updateScene],
  );

  // The editor fills the window; the page itself never scrolls (except the stacked phone layout).
  useEffect(() => {
    document.documentElement.classList.add("editor-open");
    return () => document.documentElement.classList.remove("editor-open");
  }, []);

  // ---- autosave
  useEffect(() => {
    const id = setTimeout(() => {
      saveProject({ ...project, updatedAt: Date.now() }).catch(() => setNotice("Couldn't save to this browser. Download the project file to keep your work."));
    }, 500);
    return () => clearTimeout(id);
  }, [project]);

  // ---- stage sizing
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ratio = ASPECTS[project.output.aspect].ratio;
    const fit = () => {
      // Room around the frame for the passe-partout: the toolbar and size label sit above it.
      const small = window.innerWidth < 820;
      const padX = small ? 12 : 48;
      const padY = small ? 84 : 80;
      const aw = Math.max(100, el.clientWidth - padX * 2);
      const ah = Math.max(100, el.clientHeight - padY * 2);
      const w = Math.min(aw, ah * ratio);
      setStage({ w: el.clientWidth, h: el.clientHeight });
      setFrame({ w: Math.floor(w), h: Math.floor(w / ratio) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [project.output.aspect]);

  // ---- where the video frame sits
  // The map fills the whole stage; the frame is centred in it and everything around it is dimmed
  // (the passe-partout). While rendering, the map shrinks to exactly the frame.
  const fx = Math.round((stage.w - frame.w) / 2);
  const fy = Math.round((stage.h - frame.h) / 2);
  const mapRect = rendering ? { x: fx, y: fy, w: frame.w, h: frame.h } : { x: 0, y: 0, w: stage.w, h: stage.h };
  const frameInMap = rendering ? { x: 0, y: 0, w: frame.w, h: frame.h } : { x: fx, y: fy, w: frame.w, h: frame.h };
  /** map padding that keeps a fit inside the video frame, plus a margin */
  const framePadding = useCallback(
    (margin: number) => ({
      left: frameInMap.x + margin,
      top: frameInMap.y + margin,
      right: Math.max(0, mapRect.w - frameInMap.x - frameInMap.w) + margin,
      bottom: Math.max(0, mapRect.h - frameInMap.y - frameInMap.h) + margin,
    }),
    [frameInMap.x, frameInMap.y, frameInMap.w, frameInMap.h, mapRect.w, mapRect.h],
  );
  const out = outputSize(project.output.aspect, project.output.resolution);

  // ---- map framing helpers
  const fitRoute = useCallback(
    (sc: Scene, animate = true) => {
      const b = boundsOf(modelFor(sc.route)?.points ?? sc.route.points.map((p) => p.at));
      if (!map || !b) return false;
      map.fitBounds(b, { padding: framePadding(Math.min(80, frame.w / 8)), duration: animate ? 700 : 0, bearing: 0, pitch: 0, maxZoom: 13 });
      return true;
    },
    [map, frame.w, framePadding],
  );

  // When the scene changes (or the map first appears), go to where that scene was last edited.
  const shownScene = useRef<string | null>(null);
  useEffect(() => {
    if (!map || frame.w === 0 || shownScene.current === scene.id) return;
    shownScene.current = scene.id;
    if (scene.view) map.jumpTo(scene.view);
    else fitRoute(scene, false);
    setTravelBy(lastTransport);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, scene.id, frame.w]);

  // ---- what the map shows
  const savedView = useRef<{ center: [number, number]; zoom: number; bearing: number; pitch: number } | null>(null);
  const brightMap = isBrightLook(scene.look.theme);
  useEffect(() => {
    if (!map || rendering) return;
    let cancelled = false;
    ensureTheme(map, scene).then(() => {
      if (cancelled) return;
      const vp = { width: frame.w, height: frame.h };
      if (mode !== "frame" || !model) {
        showEditing(map, scene, model, mode === "route-edit");
        // Show the travel type's pointer (train, footsteps …) where the route ends, while editing.
        const end = model ? { ...frameAt(scene, model, timeline, timeline.total, vp), camera: null } : null;
        overlayRef.current = { scene, frame: end, timeline, t: null, credit: null, selectedSign: step === "signs" ? selectedSign : null, model, brightMap };
      } else {
        const f = frameAt(scene, model, timeline, Math.min(t, duration), vp);
        // The map keeps the zoom and rotation the user left it at. Only the Camera and Preview & export
        // steps run the camera move, and only while playing or scrubbing; leaving them puts the view back.
        const runCamera = (step === "camera" || step === "export") && (playing || previewing);
        if (runCamera && !savedView.current) {
          const c = map.getCenter();
          savedView.current = { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
        }
        showFrame(map, scene, model, f, runCamera);
        overlayRef.current = { scene, frame: f, timeline, t: Math.min(t, duration), credit: project.output.credit ? creditFor(scene) : null, model, brightMap };
      }
      setOverlayKey((k) => k + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [map, scene, model, timeline, t, duration, mode, rendering, frame.w, frame.h, selectedSign, step, project.output.credit, brightMap, playing, previewing]);

  // ---- playback
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let done = false;
      setT((prev) => {
        const next = prev + dt;
        if (next >= duration) {
          done = true;
          return duration;
        }
        return next;
      });
      if (done) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  const togglePlay = useCallback(() => {
    if (!model || rendering) return;
    if (!playing && t >= duration - 0.01) setT(0);
    setSelectedPoint(null);
    setPlaying(!playing);
  }, [model, rendering, playing, t, duration]);

  // ---- undo / redo (route edits)
  const undo = useCallback(() => {
    const prev = history[history.length - 1];
    if (!prev) return;
    const current = projectRef.current.scenes[sceneIdx].route;
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [...f, current]);
    updateScene((s) => ({ ...s, route: prev }));
  }, [history, sceneIdx, updateScene]);
  const redo = useCallback(() => {
    const next = future[future.length - 1];
    if (!next) return;
    const current = projectRef.current.scenes[sceneIdx].route;
    setFuture((f) => f.slice(0, -1));
    setHistory((h) => [...h, current]);
    updateScene((s) => ({ ...s, route: next }));
  }, [future, sceneIdx, updateScene]);

  // ---- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
      // Ctrl+Z on Windows and Linux, ⌘Z on Mac; add Shift (or Ctrl+Y) to redo. Text fields keep their own undo.
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !typing && !rendering && (e.key === "z" || e.key === "Z" || e.key === "y")) {
        e.preventDefault();
        if (e.key === "y" || e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === "Escape") {
        setPlacing(null);
        setSelectedPoint(null);
      }
      if (typing) return;
      if (e.code === "Space" && tag !== "BUTTON") {
        e.preventDefault();
        togglePlay();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && step === "signs" && selectedSign) {
        e.preventDefault();
        updateScene((s) => ({ ...s, signs: s.signs.filter((x) => x.id !== selectedSign) }));
        setSelectedSign(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, step, selectedSign, updateScene, undo, redo, rendering]);

  // ---- route editing
  const addPoint = (at: LngLat) => {
    const r = scene.route;
    if (r.kind === "gpx") return;
    if (!r.points.length) {
      setRoute({ ...r, points: [{ at }], startTransport: travelBy });
      return;
    }
    const pts = r.points.slice();
    let startTransport = r.startTransport;
    if (lastTransport !== travelBy) {
      if (pts.length === 1) startTransport = travelBy;
      else pts[pts.length - 1] = { ...pts[pts.length - 1], transport: travelBy };
    }
    pts.push({ at });
    setRoute({ ...r, points: pts, startTransport });
  };

  const dragOrigin = useRef<Route | null>(null);
  const movePoint = (i: number, at: LngLat, commit: boolean) => {
    const r = projectRef.current.scenes[sceneIdx].route;
    if (!dragOrigin.current) dragOrigin.current = r;
    const pts = r.points.slice();
    pts[i] = { ...pts[i], at };
    if (commit) {
      const before = dragOrigin.current;
      dragOrigin.current = null;
      setHistory((h) => [...h.slice(-99), before]);
    }
    updateScene((s) => ({ ...s, route: { ...s.route, points: pts } }));
  };

  const patchPoint = (i: number, patch: Partial<Route["points"][number]>) => {
    const r = scene.route;
    setRoute({ ...r, points: r.points.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  };

  const pointTransport = (i: number): TransportId => {
    const leg = model?.legs.find((l) => l.p0 <= i && i < l.p1) ?? model?.legs[model.legs.length - 1];
    return leg?.transport ?? scene.route.startTransport;
  };

  const setTransportFrom = (i: number, tr: TransportId) => {
    const r = scene.route;
    if (i === 0) setRoute({ ...r, startTransport: tr, points: r.points.map((p, j) => (j === 0 ? { ...p, transport: undefined } : p)) });
    else patchPoint(i, { transport: tr });
  };

  /** A new leg from the end of the route, a short way on in the direction it was heading. */
  const addLeg = () => {
    const r = scene.route;
    if (!map || r.kind !== "drawn" || !r.points.length) return;
    const last = model?.points[model.points.length - 1] ?? r.points[r.points.length - 1].at;
    const p = map.project(last);
    let dx = 1;
    let dy = 0;
    if (model && model.path.length > 0) {
      const b = chordBearing(model.path, Math.max(0, model.path.length * 0.97), model.path.length);
      if (b !== null) {
        const a = ((b - map.getBearing()) * Math.PI) / 180;
        dx = Math.sin(a);
        dy = -Math.cos(a);
      }
    }
    const step = Math.min(160, Math.max(80, frame.w * 0.12));
    const q = map.unproject([
      Math.min(fx + frame.w - 30, Math.max(fx + 30, p.x + dx * step)),
      Math.min(fy + frame.h - 30, Math.max(fy + 30, p.y + dy * step)),
    ]);
    const current = lastTransport;
    const next = TRANSPORT_IDS.find((id) => id !== current && id !== "arrow") ?? "car";
    const pts = r.points.slice();
    let startTransport = r.startTransport;
    if (pts.length === 1) startTransport = next;
    else pts[pts.length - 1] = { ...pts[pts.length - 1], transport: next };
    pts.push({ at: [q.lng, q.lat] });
    setRoute({ ...r, points: pts, startTransport });
    setTravelBy(next);
  };

  /** Give one leg its own drawing time; the other legs keep theirs. */
  const setLegSecondsFor = (legIndex: number, secs: number) => {
    if (!model) return;
    const leg = model.legs[legIndex];
    const before = legSeconds(model, scene)[legIndex] ?? secs;
    updateScene((s) => ({
      ...s,
      route: { ...s.route, points: s.route.points.map((p, i) => (i === leg.p0 ? { ...p, legSeconds: secs } : p)) },
      timing: { ...s.timing, duration: Math.max(0.5, Math.round((s.timing.duration + secs - before) * 10) / 10) },
    }));
  };

  const setLegTransport = (legIndex: number, tr: TransportId) => {
    const leg = model?.legs[legIndex];
    if (leg) setTransportFrom(leg.p0, tr);
  };

  const removePoint = (i: number) => {
    const r = scene.route;
    const pts = r.points.filter((_, j) => j !== i);
    // A removed leg start hands its transport to the next point, so later legs keep theirs.
    const removed = r.points[i];
    let startTransport = r.startTransport;
    if (removed?.transport) {
      if (i === 0) startTransport = removed.transport;
      else if (pts[i] && !pts[i].transport) pts[i] = { ...pts[i], transport: removed.transport };
    }
    if (i === 0 && pts[0]?.transport) {
      startTransport = pts[0].transport;
      pts[0] = { ...pts[0], transport: undefined };
    }
    setRoute({ ...r, points: pts, startTransport });
    setSelectedPoint(null);
  };

  /** Delete one leg: its points go, the legs before and after keep their transport and timing. */
  const removeLeg = (legIndex: number) => {
    const r = scene.route;
    if (!model || r.kind !== "drawn") return;
    const leg = model.legs[legIndex];
    if (!leg) return;
    const n = model.legs.length;
    const secs = legSeconds(model, scene)[legIndex] ?? 0;
    let pts = r.points.slice();
    let startTransport = r.startTransport;
    if (n === 1) {
      pts = [];
    } else if (legIndex === 0) {
      // the route now starts where the second leg starts
      pts = pts.slice(leg.p1);
      startTransport = pts[0].transport ?? model.legs[1].transport;
      const { transport: _t, ...first } = pts[0];
      pts[0] = first;
    } else if (legIndex === n - 1) {
      // the route now ends where this leg started
      pts = pts.slice(0, leg.p0 + 1);
      const { transport: _t, legSeconds: _s, ...end } = pts[leg.p0];
      pts[leg.p0] = end;
    } else {
      // the next leg takes over from where this one started
      const next = pts[leg.p1];
      pts.splice(leg.p0 + 1, leg.p1 - leg.p0);
      const at = pts[leg.p0];
      const { legSeconds: _s, ...rest } = at;
      pts[leg.p0] = { ...rest, transport: next.transport ?? model.legs[legIndex + 1].transport, ...(next.legSeconds !== undefined ? { legSeconds: next.legSeconds } : {}) };
    }
    setRoute({ ...r, points: pts, startTransport });
    if (pts.length && secs > 0) updateScene((s) => ({ ...s, timing: { ...s.timing, duration: Math.max(0.5, Math.round((s.timing.duration - secs) * 10) / 10) } }));
    setSelectedPoint(null);
  };

  const reverseRoute = () => {
    const r = scene.route;
    if (!model) return;
    const n = r.points.length;
    const rev = r.points
      .slice()
      .reverse()
      .map((p) => ({ at: p.at, ...(p.pause ? { pause: p.pause } : {}), ...(p.sharp ? { sharp: p.sharp } : {}) }) as Route["points"][number]);
    let startTransport = r.startTransport;
    for (const leg of model.legs) {
      const start = n - 1 - leg.p1;
      if (start === 0) startTransport = leg.transport;
      else rev[start] = { ...rev[start], transport: leg.transport };
    }
    setRoute({ ...r, points: rev, startTransport });
  };

  const importGpx = async (file: File) => {
    try {
      const pts = parseGpx(await file.text());
      setRoute({ kind: "gpx", points: pts.map((at) => ({ at })), smooth: false, startTransport: travelBy });
      setStep("route");
      setPreviewing(false);
      const b = boundsOf(pts);
      if (map && b) {
        map.fitBounds(b, { padding: framePadding(Math.min(80, frame.w / 8)), duration: 700, maxZoom: 13 });
        const cam = map.cameraForBounds(b, { padding: framePadding(40) });
        if (cam?.zoom !== undefined) {
          const z = Math.min(14, Math.round((cam.zoom + 2) * 10) / 10);
          updateScene((s) => ({ ...s, camera: { ...s.camera, zoom: z } }));
        }
      }
      setNotice(`Loaded ${pts.length.toLocaleString("en")} track points from ${file.name}.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "The GPX file couldn't be read.");
    }
  };

  // ---- signs
  const placeSign = (at: LngLat) => {
    if (!placing) return;
    const id = uid();
    const defaults: Record<SignStyle, string> = { plate: "Place", tag: "Place", pin: "Place", flag: "Summit", caption: "Chapter one", photo: "" };
    updateScene((s) => ({
      ...s,
      signs: [...s.signs, { id, at, style: placing, text: defaults[placing], show: placing === "photo" || placing === "flag" ? "passed" : "always", pause: placing === "photo" ? 2 : 0 }],
    }));
    setSelectedSign(id);
    setPlacing(null);
  };
  const moveSign = (id: string, at: LngLat) => updateScene((s) => ({ ...s, signs: s.signs.map((x) => (x.id === id ? { ...x, at } : x)) }));

  // ---- files dropped on the page
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      setDragOver(true);
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragOver(false);
    };
    const drop = async (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      if (/\.gpx$/i.test(f.name)) importGpx(f);
      else if (/\.json$/i.test(f.name)) {
        try {
          const p = await importProjectFile(f);
          navigate(`/p/${p.id}`);
        } catch (err) {
          setNotice(err instanceof Error ? err.message : "That file couldn't be opened.");
        }
      } else setNotice("Drop a .gpx track or a .voyager-moon.json project file.");
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  });

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  // ---- export
  const startRender = async () => {
    if (!map) return;
    setPlaying(false);
    const ac = new AbortController();
    abortRef.current = ac;
    if (render.status === "done") URL.revokeObjectURL(render.url);
    const scenes = project.output.joinScenes && project.scenes.length > 1 ? project.scenes.map((_, i) => i) : [sceneIdx];
    setRender({ status: "rendering", frame: 0, frames: 1, elapsedMs: 0, scene: 1, scenes: scenes.length, paused: false });
    let lock: WakeLockSentinel | null = null;
    try {
      // Let the map shrink to the frame (no passe-partout in the video) before the first capture.
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      map.resize();
      lock = (await navigator.wakeLock?.request("screen").catch(() => null)) ?? null;
      const res = await renderVideo({
        map,
        project,
        scenes,
        models: project.scenes.map((s) => modelFor(s.route)),
        signal: ac.signal,
        onProgress: (p) => setRender({ status: "rendering", ...p }),
      });
      setRender({ status: "done", url: URL.createObjectURL(res.blob), blob: res.blob, width: res.width, height: res.height, codec: res.codec });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") setRender({ status: "idle" });
      else
        setRender({
          status: "error",
          message: err instanceof ExportUnsupportedError ? err.message : `Rendering stopped: ${err instanceof Error ? err.message : String(err)}`,
        });
    } finally {
      lock?.release().catch(() => {});
      abortRef.current = null;
    }
  };

  // ---- layout
  const stepIdx = STEPS.findIndex((s) => s.id === step);
  const goStep = (s: Step) => {
    if (savedView.current && s !== "camera" && s !== "export") {
      map?.jumpTo(savedView.current);
      savedView.current = null;
    }
    setPlaying(false);
    setPreviewing(false);
    setPlacing(null);
    setSelectedPoint(null);
    setStep(s);
  };
  const interaction: Interaction = rendering || playing
    ? { kind: "none" }
    : mode === "route-edit"
      ? scene.route.kind === "drawn" && tool === "draw"
        ? { kind: "draw" }
        : { kind: "move" }
      : mode === "sign-edit"
        ? { kind: "signs", placing: !!placing }
        : { kind: "move" };

  const markers = useMemo(() => {
    const m: { t: number; kind: "pause" | "sign" }[] = [];
    let acc = timeline.holdStart;
    let prevU = 0;
    for (const p of timeline.pauses) {
      acc += p.u - prevU;
      m.push({ t: acc, kind: "pause" });
      acc += p.seconds;
      prevU = p.u;
    }
    for (const s of scene.signs) if (s.show === "passed" && timeline.signTimes[s.id] !== undefined) m.push({ t: timeline.signTimes[s.id], kind: "sign" });
    return m;
  }, [timeline, scene.signs]);

  return (
    <div className={`editor${dragOver ? " is-dragover" : ""}`}>
      <header className="topbar app-header">
        <div className="app-header-start">
          <a className="app-logo" href="#/" aria-label="Voyager Moon, all projects">
            <img src={logoUrl} alt="Voyager Moon" width={205} height={25} />
          </a>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <a className="crumb-link" href="#/">
              Projects
            </a>
            <span className="crumb-sep" aria-hidden>
              /
            </span>
            <input className="project-name" aria-label="Project name" value={project.name} onChange={(e) => updateProject((p) => ({ ...p, name: e.target.value }))} />
          </nav>
        </div>
        <div className="topbar-end">
          <HeaderNav />
          <ThemeToggle />
        </div>
      </header>

      <div className="app-version">Version {__APP_VERSION__}</div>

      <nav className="steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <button key={s.id} type="button" className={`step${step === s.id ? " on" : ""}${i < stepIdx ? " past" : ""}`} aria-current={step === s.id ? "step" : undefined} disabled={rendering} onClick={() => goStep(s.id)}>
            <span className="step-num">{i + 1}</span>
            {s.label}
          </button>
        ))}
        <div className="steps-end">
          <button
            type="button"
            className={`icon-button project-menu-button${projectMenu ? " is-active" : ""}`}
            aria-label="Project: download or duplicate"
            title="Project"
            aria-haspopup="menu"
            aria-expanded={!!projectMenu}
            onClick={(e) => {
              if (projectMenu) return setProjectMenu(null);
              // Right-aligned under the button, kept inside the window (the step bar scrolls on phones).
              const r = e.currentTarget.getBoundingClientRect();
              const vw = document.documentElement.clientWidth;
              setProjectMenu({ top: r.bottom + 4, right: Math.max(8, Math.min(vw - r.right, vw - 198)) });
            }}
          >
            <svg viewBox="0 0 18 16" width="24" height="22" aria-hidden>
              <path
                fill="currentColor"
                d="M12.5 7.98V6.5c0-.28-.23-.5-.5-.5H9.05C7.46 6 6.11 7.05 5.66 8.49 5.56 8.19 5.5 7.87 5.5 7.5 5.5 5.57 7.07 4 9 4h3c.28 0 .5-.22.5-.5V2.02L15.81 5 12.5 7.98ZM10.5 7.5H11V9c0 .55.45 1 1 1h.12c.25 0 .48-.09.67-.26l4.34-3.91c.24-.21.37-.51.37-.83s-.13-.62-.37-.83L12.81.28A1.08 1.08 0 0 0 11 1.08V2.5H9C6.24 2.5 4 4.74 4 7.5c0 1.89 1.08 3.1 2 3.78.18.14.36.25.52.35.14.08.27.15.37.21.1.05.19.09.26.12.07.03.14.04.22.04h.08c.31 0 .56-.25.56-.56 0-.24-.17-.46-.36-.61l-.04-.03a1.4 1.4 0 0 1-.31-.3 1.97 1.97 0 0 1-.43-1.26c0-1.13.92-2.05 2.05-2.05h1.45L10.5 7.5ZM2.25 1A2.25 2.25 0 0 0 0 3.25v10.5C0 14.99 1.01 16 2.25 16h10.5c1.24 0 2.25-1.01 2.25-2.25v-2a.75.75 0 0 0-1.5 0v2c0 .42-.33.75-.75.75H2.25a.75.75 0 0 1-.75-.75V3.25c0-.42.33-.75.75-.75h2a.75.75 0 0 0 0-1.5h-2Z"
              />
            </svg>
          </button>
          {projectMenu && (
            <div className="menu project-menu" role="menu" style={{ top: projectMenu.top, right: projectMenu.right }} onMouseLeave={() => setProjectMenu(null)}>
              <button type="button" role="menuitem" onClick={() => (setProjectMenu(null), downloadProjectFile(project))}>
                Download project file
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  setProjectMenu(null);
                  const copy = await duplicateProject(project);
                  navigate(`/p/${copy.id}`);
                }}
              >
                Duplicate project
              </button>
            </div>
          )}
          <select
            className="aspect-select"
            aria-label="Video shape"
            value={project.output.aspect}
            disabled={rendering}
            onChange={(e) => updateProject((p) => ({ ...p, output: { ...p.output, aspect: e.target.value as Aspect } }))}
          >
            {(Object.keys(ASPECTS) as Aspect[]).map((a) => (
              <option key={a} value={a}>
                {ASPECTS[a].label}
              </option>
            ))}
          </select>
        </div>
      </nav>

      <aside className="panel">
        <div className="panel-body">
          {step === "route" && (
            <RoutePanel
              scene={scene}
              travelBy={travelBy}
              setTravelBy={(tr) => {
                setTravelBy(tr);
                if (scene.route.kind === "gpx" || scene.route.points.length < 2) updateScene((s) => ({ ...s, route: { ...s.route, startTransport: tr } }));
              }}
              distanceKm={routeKm(scene.route)}
              canUndo={history.length > 0}
              onUndo={undo}
              onReverse={reverseRoute}
              onClear={() => setRoute({ kind: "drawn", points: [], smooth: true, startTransport: travelBy })}
              onSmooth={(v) => setRoute({ ...scene.route, smooth: v })}
              onImport={importGpx}
            />
          )}
          {step === "look" && <LookPanel scene={scene} model={model} update={updateScene} focusTransport={focusTransport} map={map} />}
          {step === "signs" && (
            <SignsPanel scene={scene} update={updateScene} placing={placing} setPlacing={setPlacing} selected={selectedSign} setSelected={setSelectedSign} onError={setNotice} />
          )}
          {step === "camera" && (
            <CameraPanel
              scene={scene}
              update={(fn) => {
                updateScene(fn);
                setPreviewing(true);
              }}
              map={map}
              onShowView={(v) => map?.jumpTo(v)}
            />
          )}
          {step === "export" && (
            <ExportPanel
              project={project}
              updateProject={updateProject}
              sceneSeconds={[duration]}
              renderable={!!map && project.scenes.some((s) => modelFor(s.route))}
              render={render}
              onRender={startRender}
              onCancel={() => abortRef.current?.abort()}
              onDownload={() => render.status === "done" && downloadBlob(render.blob, `${slug(project.name)}-${render.height}p.mp4`)}
            />
          )}
        </div>
        {STEPS[stepIdx].next && (
          <footer className="panel-foot">
            <button type="button" className="btn btn-primary btn-wide" disabled={rendering} onClick={() => goStep(STEPS[stepIdx + 1].id)}>
              {STEPS[stepIdx].next}
            </button>
          </footer>
        )}
      </aside>

      <main className="stage">
        <div className="stage-area" ref={stageRef}>
          {frame.w > 0 && stage.w > 0 && (
            <div className="map-layer" style={{ left: mapRect.x, top: mapRect.y, width: mapRect.w, height: mapRect.h }}>
              <MapStage
                scene={scene}
                width={mapRect.w}
                height={mapRect.h}
                frame={frameInMap}
                interaction={interaction}
                overlay={overlayRef}
                overlayKey={overlayKey}
                trackMoves={selectedPoint !== null}
                onReady={setMap}
                onAddPoint={addPoint}
                onMovePoint={movePoint}
                onPointClick={(i) => setSelectedPoint(i)}
                onToggleSharp={(i) => patchPoint(i, { sharp: !scene.route.points[i]?.sharp })}
                onPlaceSign={placeSign}
                onMoveSign={(id, at) => moveSign(id, at)}
                onSelectSign={setSelectedSign}
                onViewChange={(v) => {
                  if (mode !== "frame" && !rendering) updateScene((s) => ({ ...s, view: v }));
                }}
              >
                {(toScreen) => {
                  if (selectedPoint === null || mode !== "route-edit" || !scene.route.points[selectedPoint]) return null;
                  const at = toScreen(model?.points[selectedPoint] ?? scene.route.points[selectedPoint].at);
                  return (
                    <Floating
                      key={selectedPoint}
                      id="popover"
                      persist={false}
                      className="pos-popover"
                      bounds={{ w: mapRect.w, h: mapRect.h }}
                      anchorStyle={{ left: at.x, top: at.y, transform: at.y < 300 ? "translate(-50%, 16px)" : "translate(-50%, calc(-100% - 16px))" }}
                    >
                      <PointPopover
                        scene={scene}
                        index={selectedPoint}
                        at={at}
                        currentTransport={pointTransport(selectedPoint)}
                        onTransport={(tr) => setTransportFrom(selectedPoint, tr)}
                        onPause={(s) => patchPoint(selectedPoint, { pause: s || undefined })}
                        onSharp={(v) => patchPoint(selectedPoint, { sharp: v || undefined })}
                        onRemove={() => removePoint(selectedPoint)}
                        onClose={() => setSelectedPoint(null)}
                      />
                    </Floating>
                  );
                }}
              </MapStage>
            </div>
          )}

          {/* The video frame: a window in the passe-partout, with its format and pixel size above it. */}
          {frame.w > 0 && (
            <div className={`frame${rendering ? " is-rendering" : ""}`} style={{ left: fx, top: fy, width: frame.w, height: frame.h }}>
              <div className="frame-size" aria-label={`Video size ${project.output.aspect}, ${out.width} by ${out.height} pixels`}>
                {project.output.aspect} · {out.width}×{out.height}
              </div>
              {!rendering && !hasMoonData() && (
                <div className="getting-started no-data" role="status">
                  <strong>No height data yet</strong>
                  <span>
                    The Moon's heights aren't bundled with this build, so the ground is flat and has no height curves or shading. Run{" "}
                    <code>tools/make_moon_tiles.py</code> and upload the <code>src/moon-data</code> folder it fills (see the README).
                  </span>
                </div>
              )}
              {mode === "route-edit" && !rendering && scene.route.points.length === 0 && (
                <div className="getting-started">
                  <strong>Start here</strong>
                  <span>Search for a place, then click the map to drop the first point of your route. Or drop a GPX file on the page.</span>
                </div>
              )}
            </div>
          )}

          {mode === "route-edit" && !rendering && (
            <Floating id="toolbar" className="pos-toolbar" bounds={stage}>
              <div className="map-toolbar">
                {scene.route.kind === "drawn" && (
                  <Segmented
                    label="Map tool"
                    value={tool}
                    options={[
                      { value: "draw", label: "Draw" },
                      { value: "move", label: "Move map" },
                    ]}
                    onChange={setTool}
                  />
                )}
                <button type="button" className="btn btn-small" disabled={!model} onClick={() => fitRoute(scene)}>
                  Show route
                </button>
                <button type="button" className="btn btn-small" disabled={!history.length} onClick={undo} title="Undo (Ctrl+Z / ⌘Z)">
                  Undo
                </button>
              </div>
            </Floating>
          )}
          {!rendering && (
            <Floating id="search" className="pos-search" bounds={stage}>
              <SearchBox map={map} padding={framePadding(40)} />
            </Floating>
          )}
          {step === "route" && !playing && !rendering && model && model.legs.length > 0 && (
            <Floating id="legs" className="pos-legs" bounds={stage}>
              <LegsPanel
                scene={scene}
                model={model}
                onChange={setLegTransport}
                onAddLeg={scene.route.kind === "drawn" && !playing ? addLeg : undefined}
                onRemoveLeg={scene.route.kind === "drawn" && !playing ? removeLeg : undefined}
                seconds={model ? legSeconds(model, scene) : []}
                onSeconds={setLegSecondsFor}
                onStyle={(tr) => {
                  setFocusTransport(tr);
                  goStep("look");
                }}
              />
            </Floating>
          )}
          {!rendering && <MapControls map={map} />}
          {dragOver && <div className="drop-veil">Drop a GPX track or a project file</div>}
        </div>

        <div className="timeline">
          <button type="button" className="play" onClick={togglePlay} disabled={!model || rendering} aria-label={playing ? "Pause" : "Play preview"}>
            {playing ? (
              <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
                <rect x="4" y="3" width="4" height="14" rx="1" fill="currentColor" />
                <rect x="12" y="3" width="4" height="14" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
                <path d="M5 3.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 5 3.5Z" fill="currentColor" />
              </svg>
            )}
          </button>
          <span className="time">
            {fmtTime(Math.min(t, duration))} <span className="time-total">/ {fmtTime(duration)}</span>
          </span>
          <div className="scrub-wrap">
            <input
              className="scrub"
              type="range"
              aria-label="Playhead"
              min={0}
              max={duration}
              step={0.01}
              value={Math.min(t, duration)}
              disabled={!model || rendering}
              onChange={(e) => {
                setPlaying(false);
                setPreviewing(true);
                setSelectedPoint(null);
                setT(parseFloat(e.target.value));
              }}
            />
            <div className="scrub-marks" aria-hidden>
              {markers.map((m, i) => (
                <span key={i} className={`mark mark-${m.kind}`} style={{ left: `${(100 * m.t) / Math.max(0.01, duration)}%` }} />
              ))}
            </div>
          </div>
          {(previewing || playing) && (step === "route" || step === "signs") && !rendering && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setPlaying(false);
                setPreviewing(false);
              }}
            >
              Back to editing
            </button>
          )}
        </div>
      </main>

      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
