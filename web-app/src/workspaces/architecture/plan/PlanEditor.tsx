/**
 * ПЛАН — перше вікно архітектора (06.09.2026, рішення власника).
 *
 * Не редактор стін, а план: підвантажили PDF (або картинку) архітектурного
 * плану / дизайн-проєкту, задали масштаб по одному відомому розміру, і
 * обвели лініями те, що на плані вже є — контури підлог, отвори (колони,
 * шахти), стіни по ребрах. Усі розміри — з масштабу PDF, у міліметрах.
 *
 * Інструменти: Масштаб (два кліки + число), Підлога (обвести по точках,
 * замкнути на першій або Enter), Отвір (два кути всередині підлоги),
 * Стіна (клік по ребру підлоги → стіна заданої висоти), Вибрати
 * (клік — вибір, Delete — прибрати), Рука (тягнути план).
 * Клавіатура як у «Приміщенні»: тягнеш лінію і набираєш число + Enter —
 * довжина сегмента; Esc — скасувати; Backspace — прибрати точку.
 *
 * Підложка зберігається в проєкті як JPEG ≤ 2400 px — план їде разом із
 * замовленням, як і поверхні.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Ruler, PenLine, Square, BrickWall, MousePointer2, Hand, Trash2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useArchitecture } from '../useArchitecture';
import { useArchUIStore, type PlanTool } from '../store';
import { archId, edgeLength, wallFromEdge, type PlanPoint, type PlanUnderlay, type Surface } from '../../../domain/architecture';
import { pointInPolygon } from '../../../domain/room';
import { BTN_IDLE, BTN_BLUE, fmt } from '../../../constructor/ui';

const BTN_ACTIVE = BTN_BLUE;

/** Растр сторінки PDF / картинки → підложка. Викликає pdf.js ліниво. */
async function loadUnderlayFile(file: File, pageIndex: number): Promise<{ underlay: PlanUnderlay; pages: number }> {
  const MAX = 2400;
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const page = await pdf.getPage(Math.min(Math.max(1, pageIndex), pdf.numPages));
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(4, MAX / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    // Стартова оцінка масштабу: аркуш ≈ 20 м завширшки. До калібрування —
    // лише щоб план був видимий; справжній масштаб задає людина.
    return {
      underlay: { name: file.name, dataUrl, widthPx: canvas.width, heightPx: canvas.height, mmPerPx: 20000 / canvas.width, calibrated: false, pageIndex: page.pageNumber, opacity: 0.85 },
      pages: pdf.numPages,
    };
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el); el.onerror = reject;
    el.src = URL.createObjectURL(file);
  });
  const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * k); canvas.height = Math.round(img.naturalHeight * k);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return {
    underlay: { name: file.name, dataUrl: canvas.toDataURL('image/jpeg', 0.85), widthPx: canvas.width, heightPx: canvas.height, mmPerPx: 20000 / canvas.width, calibrated: false, pageIndex: 1, opacity: 0.85 },
    pages: 1,
  };
}

interface Cam { x: number; y: number; zoom: number }

const dist = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.y - b.y);

function nearestEdge(floors: Surface[], p: PlanPoint, tolMm: number): { surface: Surface; edgeIndex: number } | null {
  let best: { surface: Surface; edgeIndex: number; d: number } | null = null;
  for (const s of floors) {
    for (let i = 0; i < s.points.length; i += 1) {
      const a = s.points[i]; const b = s.points[(i + 1) % s.points.length];
      const vx = b.x - a.x; const vy = b.y - a.y; const len2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
      const d = Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
      if (d <= tolMm && (!best || d < best.d)) best = { surface: s, edgeIndex: i, d };
    }
  }
  return best ? { surface: best.surface, edgeIndex: best.edgeIndex } : null;
}

const TOOLS: Array<{ id: PlanTool; label: string; title: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'select', label: 'Вибрати', title: 'Клік — вибрати поверхню; Delete — прибрати', icon: MousePointer2 },
  { id: 'pan', label: 'Рука', title: 'Тягнути план (або колесо/середня кнопка)', icon: Hand },
  { id: 'calibrate', label: 'Масштаб', title: 'Два кліки по відомому розміру на плані + число в мм', icon: Ruler },
  { id: 'floor', label: 'Підлога', title: 'Обвести контур підлоги по точках; замкнути на першій точці або Enter', icon: PenLine },
  { id: 'opening', label: 'Отвір', title: 'Два кути прямокутника всередині підлоги: колона, шахта', icon: Square },
  { id: 'wall', label: 'Стіна', title: 'Клік по ребру підлоги → стіна заданої висоти', icon: BrickWall },
];

export default function PlanEditor() {
  const { model, patch, upsertSurface, removeSurface } = useArchitecture();
  const tool = useArchUIStore((s) => s.tool);
  const setTool = useArchUIStore((s) => s.setTool);
  const selectedSurfaceId = useArchUIStore((s) => s.selectedSurfaceId);
  const selectSurface = useArchUIStore((s) => s.selectSurface);
  const wallHeightMm = useArchUIStore((s) => s.wallHeightMm);
  const setWallHeightMm = useArchUIStore((s) => s.setWallHeightMm);
  const ortho = useArchUIStore((s) => s.ortho);
  const setOrtho = useArchUIStore((s) => s.setOrtho);

  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [cam, setCam] = useState<Cam>({ x: -500, y: -500, zoom: 0.05 });
  const [cursor, setCursor] = useState<PlanPoint | null>(null);
  const [draft, setDraft] = useState<PlanPoint[]>([]);
  const [calib, setCalib] = useState<{ a: PlanPoint; b?: PlanPoint; known: string } | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [pages, setPages] = useState(1);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [hoverEdge, setHoverEdge] = useState<{ surface: Surface; edgeIndex: number } | null>(null);
  const drag = useRef<{ sx: number; sy: number; cx: number; cy: number; moved: boolean } | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ d: number; zoom: number } | null>(null);

  const underlay = model.underlay;
  const floors = useMemo(() => model.surfaces.filter((s) => s.kind === 'floor'), [model.surfaces]);
  const walls = useMemo(() => model.surfaces.filter((s) => s.kind === 'wall'), [model.surfaces]);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const ro = new ResizeObserver(() => setSize({ w: host.clientWidth, h: host.clientHeight }));
    ro.observe(host); setSize({ w: host.clientWidth, h: host.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitAll = useCallback(() => {
    const host = hostRef.current; if (!host) return;
    const w = host.clientWidth; const h = host.clientHeight;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    const take = (p: PlanPoint) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); };
    if (underlay) { take({ x: 0, y: 0 }); take({ x: underlay.widthPx * underlay.mmPerPx, y: underlay.heightPx * underlay.mmPerPx }); }
    floors.forEach((s) => s.points.forEach(take));
    if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 10000; maxY = 7000; }
    const zoom = Math.min(w / Math.max(1, maxX - minX), h / Math.max(1, maxY - minY)) * 0.92;
    setCam({ zoom, x: minX - (w / zoom - (maxX - minX)) / 2, y: minY - (h / zoom - (maxY - minY)) / 2 });
  }, [underlay, floors]);

  const fitOnce = useRef(false);
  useEffect(() => { if (!fitOnce.current && size.w > 0) { fitOnce.current = true; fitAll(); } }, [size, fitAll]);
  useEffect(() => { if (underlay) fitAll(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlay?.dataUrl]);

  const toWorld = useCallback((clientX: number, clientY: number): PlanPoint => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: cam.x + (clientX - r.left) / cam.zoom, y: cam.y + (clientY - r.top) / cam.zoom };
  }, [cam]);

  /** Прив'язка: точки контурів, перша точка чернетки, орто по осях. */
  const snap = useCallback((p: PlanPoint): PlanPoint => {
    const tol = 10 / cam.zoom;
    if (draft.length >= 3 && dist(p, draft[0]) <= tol * 1.5) return draft[0];
    for (const s of floors) for (const q of s.points) if (dist(p, q) <= tol) return q;
    if (ortho && draft.length && tool === 'floor') {
      const last = draft[draft.length - 1];
      const dx = p.x - last.x; const dy = p.y - last.y;
      return Math.abs(dx) >= Math.abs(dy) ? { x: p.x, y: last.y } : { x: last.x, y: p.y };
    }
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }, [cam.zoom, draft, floors, ortho, tool]);

  const commitFloor = useCallback((pts: PlanPoint[]) => {
    if (pts.length < 3) return;
    const n = floors.length + 1;
    upsertSurface({ id: archId('srf'), name: `Підлога ${n}`, kind: 'floor', points: pts, openings: [] });
    setDraft([]);
  }, [floors.length, upsertSurface]);

  const finishCalibration = useCallback(() => {
    if (!calib?.b || !underlay) return;
    const known = Number(calib.known.replace(',', '.'));
    const dMm = dist(calib.a, calib.b);
    if (!(known > 0) || dMm <= 0) return;
    const factor = known / dMm; // нове мм / старе мм для тієї ж відстані в пікселях
    patch((m) => ({
      ...m,
      underlay: m.underlay ? { ...m.underlay, mmPerPx: m.underlay.mmPerPx * factor, calibrated: true } : m.underlay,
      // усе, що вже обведено, лишається на тих самих пікселях плану
      surfaces: m.surfaces.map((s) => (s.kind === 'floor'
        ? { ...s, points: s.points.map((p) => ({ x: p.x * factor, y: p.y * factor })), openings: s.openings.map((o) => o.map((p) => ({ x: p.x * factor, y: p.y * factor }))) }
        : { ...s, points: s.points.map((p) => ({ x: p.x * factor, y: p.y })), openings: s.openings.map((o) => o.map((p) => ({ x: p.x * factor, y: p.y }))) })),
    }));
    setCalib(null);
    setCam((c) => ({ ...c, x: c.x * factor, y: c.y * factor, zoom: c.zoom / factor }));
    setTool('floor');
  }, [calib, underlay, patch, setTool]);

  const onFile = async (file: File, pageIndex = 1) => {
    setBusy('Читаю план…');
    try {
      const { underlay: u, pages: n } = await loadUnderlayFile(file, pageIndex);
      setPages(n); setLastFile(file);
      patch((m) => ({ ...m, underlay: u }));
      setTool('calibrate');
    } catch (e) {
      setBusy(null);
      window.alert(`Не вдалося прочитати план: ${(e as Error).message}`);
      return;
    }
    setBusy(null);
  };

  /* ── миша / дотик ────────────────────────────────────────────── */
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: cam.zoom };
      drag.current = null;
      return;
    }
    const panning = tool === 'pan' || e.button === 1 || (e.button === 0 && e.altKey);
    drag.current = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    if (panning) return;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const zoom = Math.min(5, Math.max(0.005, pinch.current.zoom * (d / Math.max(1, pinch.current.d))));
      const mid = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
      const rect = svgRef.current!.getBoundingClientRect();
      setCam({ zoom, x: mid.x - ((a.x + b.x) / 2 - rect.left) / zoom, y: mid.y - ((a.y + b.y) / 2 - rect.top) / zoom });
      return;
    }
    const raw = toWorld(e.clientX, e.clientY);
    const d = drag.current;
    const panning = d && (tool === 'pan' || e.buttons === 4 || (e.buttons === 1 && (e.altKey || (e.pointerType === 'touch' && tool === 'select'))));
    if (d && panning) {
      const dx = e.clientX - d.sx; const dy = e.clientY - d.sy;
      if (Math.hypot(dx, dy) > 3) d.moved = true;
      setCam((c) => ({ ...c, x: d.cx - dx / c.zoom, y: d.cy - dy / c.zoom }));
      return;
    }
    setCursor(snap(raw));
    if (tool === 'wall') setHoverEdge(nearestEdge(floors, raw, 10 / cam.zoom));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current; drag.current = null;
    if (!d || d.moved || e.button !== 0) return;
    if (tool === 'pan' || e.altKey) return;
    const raw = toWorld(e.clientX, e.clientY);
    const p = snap(raw);
    if (tool === 'calibrate') {
      if (!underlay) return;
      if (!calib) setCalib({ a: raw, known: '' });
      else if (!calib.b) setCalib({ ...calib, b: raw });
      return;
    }
    if (tool === 'floor') {
      if (draft.length >= 3 && p === draft[0]) { commitFloor(draft); return; }
      if (draft.length && dist(p, draft[draft.length - 1]) < 1) return;
      setDraft((cur) => [...cur, p]);
      return;
    }
    if (tool === 'opening') {
      if (!draft.length) {
        const host = floors.find((f) => pointInPolygon(raw, f.points));
        if (!host) return;
        setDraft([raw]);
        return;
      }
      const a = draft[0]; const b = raw;
      const host = floors.find((f) => pointInPolygon(a, f.points));
      if (host) {
        const rect = [{ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) }, { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }, { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) }].map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) }));
        upsertSurface({ ...host, openings: [...host.openings, rect] });
      }
      setDraft([]);
      return;
    }
    if (tool === 'wall') {
      const hit = nearestEdge(floors, raw, 10 / cam.zoom);
      if (!hit) return;
      const existing = walls.find((w) => w.planEdge?.surfaceId === hit.surface.id && w.planEdge.edgeIndex === hit.edgeIndex);
      if (existing) { selectSurface(existing.id); return; }
      const letter = String.fromCharCode(65 + (walls.length % 26));
      const wall = wallFromEdge(hit.surface, hit.edgeIndex, wallHeightMm, `Стіна ${letter} (${hit.surface.name})`);
      upsertSurface(wall);
      selectSurface(wall.id);
      return;
    }
    if (tool === 'select') {
      const hitWall = walls.find((w) => {
        const f = floors.find((fl) => fl.id === w.planEdge?.surfaceId); if (!f || !w.planEdge) return false;
        const a = f.points[w.planEdge.edgeIndex]; const b = f.points[(w.planEdge.edgeIndex + 1) % f.points.length];
        const vx = b.x - a.x; const vy = b.y - a.y; const len2 = vx * vx + vy * vy || 1;
        const t = Math.max(0, Math.min(1, ((raw.x - a.x) * vx + (raw.y - a.y) * vy) / len2));
        return Math.hypot(raw.x - (a.x + vx * t), raw.y - (a.y + vy * t)) <= 8 / cam.zoom;
      });
      if (hitWall) { selectSurface(hitWall.id); return; }
      const hitFloor = [...floors].reverse().find((f) => pointInPolygon(raw, f.points));
      selectSurface(hitFloor ? hitFloor.id : null);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left; const my = e.clientY - r.top;
    const k = Math.exp(-e.deltaY * 0.0015);
    setCam((c) => {
      const zoom = Math.min(5, Math.max(0.005, c.zoom * k));
      return { zoom, x: c.x + mx / c.zoom - mx / zoom, y: c.y + my / c.zoom - my / zoom };
    });
  };

  /* ── клавіатура ─────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'Escape') { setDraft([]); setCalib(null); setTyped(''); return; }
      if (e.key === 'Backspace' && draft.length) { setDraft((d) => d.slice(0, -1)); e.preventDefault(); return; }
      if ((e.key === 'Delete') && selectedSurfaceId) { removeSurface(selectedSurfaceId); selectSurface(null); return; }
      if (/^[0-9.,]$/.test(e.key) && tool === 'floor' && draft.length) { setTyped((s) => s + e.key); return; }
      if (e.key === 'Enter') {
        if (tool === 'floor' && draft.length && typed && cursor) {
          const len = Number(typed.replace(',', '.'));
          const last = draft[draft.length - 1];
          const dx = cursor.x - last.x; const dy = cursor.y - last.y; const L = Math.hypot(dx, dy) || 1;
          if (len > 0) setDraft((d) => [...d, { x: Math.round(last.x + dx / L * len), y: Math.round(last.y + dy / L * len) }]);
          setTyped('');
          return;
        }
        if (tool === 'floor' && draft.length >= 3) { commitFloor(draft); return; }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, typed, cursor, tool, selectedSurfaceId, removeSurface, selectSurface, commitFloor]);

  /* ── рендер ─────────────────────────────────────────────────── */
  const vb = `${cam.x} ${cam.y} ${size.w / cam.zoom} ${size.h / cam.zoom}`;
  const px = (n: number) => n / cam.zoom; // товщина/шрифт у мм, щоб на екрані було n px
  const selected = model.surfaces.find((s) => s.id === selectedSurfaceId) ?? null;
  const draftPath = draft.length ? draft.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ') + (cursor && tool === 'floor' ? ` L${cursor.x} ${cursor.y}` : '') : '';
  const draftSegLen = draft.length && cursor && tool === 'floor' ? dist(draft[draft.length - 1], cursor) : 0;

  const hint = !underlay ? 'Підвантаж PDF плану (або картинку) — кнопка «План» зліва вгорі. Можна й без плану: обводь підлогу по сітці.'
    : tool === 'calibrate' ? (!calib ? 'Масштаб: клікни початок відомого розміру на плані' : !calib.b ? 'Тепер — кінець розміру' : 'Впиши, скільки це в мм, і натисни «Задати»')
      : tool === 'floor' ? (draft.length ? 'Наступна точка; число + Enter — довжина; клік по першій точці або Enter — замкнути; Esc — скасувати' : 'Клікни перший кут підлоги')
        : tool === 'opening' ? (draft.length ? 'Другий кут отвору' : 'Перший кут отвору всередині підлоги')
          : tool === 'wall' ? 'Наведи на ребро підлоги і клікни — виросте стіна'
            : tool === 'select' ? 'Клік — вибрати підлогу або стіну; Delete — прибрати' : 'Тягни план';

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#eaf0f4]">
      <div className="flex items-center gap-1.5 flex-wrap px-3 py-2 bg-white border-b border-slate-200">
        <button type="button" className={BTN_IDLE} onClick={() => fileRef.current?.click()} title="Підвантажити PDF плану або картинку" disabled={Boolean(busy)}>
          <Upload className="w-4 h-4" /> {busy ?? 'План'}
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
        {underlay && pages > 1 && lastFile && (
          <label className="flex items-center gap-1 text-[12px] text-slate-600">Сторінка
            <input type="number" min={1} max={pages} value={underlay.pageIndex} onChange={(e) => void onFile(lastFile, Number(e.target.value) || 1)} className="w-14 h-7 px-1 border border-slate-300 rounded text-center" /> з {pages}
          </label>
        )}
        <span className="w-px h-6 bg-slate-200 mx-1" />
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} type="button" className={tool === t.id ? BTN_ACTIVE : BTN_IDLE} title={t.title} onClick={() => { setTool(t.id); setDraft([]); setCalib(null); }}>
              <Icon className="w-4 h-4" /> <span className="hidden md:inline">{t.label}</span>
            </button>
          );
        })}
        <span className="w-px h-6 bg-slate-200 mx-1 hidden md:block" />
        <label className="flex items-center gap-1 text-[12px] text-slate-600" title="Сегменти лише по осях">
          <input type="checkbox" className="!w-4 !h-4 !m-0" checked={ortho} onChange={(e) => setOrtho(e.target.checked)} /> Орто
        </label>
        <label className="flex items-center gap-1 text-[12px] text-slate-600 whitespace-nowrap" title="Висота стіни для інструмента «Стіна», мм">Стіна, мм
          <input type="number" value={wallHeightMm} onChange={(e) => setWallHeightMm(Math.max(100, Number(e.target.value) || 0))} className="!w-16 h-7 !px-1 !m-0 border border-slate-300 rounded text-right !text-[12px]" style={{ width: 64 }} />
        </label>
        {underlay && (
          <label className="hidden md:flex items-center gap-1 text-[12px] text-slate-600 whitespace-nowrap" title="Прозорість підложки">Підложка
            <input type="range" min={0} max={1} step={0.05} value={underlay.opacity} onChange={(e) => patch((m) => ({ ...m, underlay: m.underlay ? { ...m.underlay, opacity: Number(e.target.value) } : m.underlay }))} className="!w-20 !m-0" style={{ width: 80 }} />
          </label>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className={`${BTN_IDLE} hidden md:inline-flex`} title="Наблизити" onClick={() => setCam((c) => ({ ...c, zoom: c.zoom * 1.25 }))}><ZoomIn className="w-4 h-4" /></button>
          <button type="button" className={`${BTN_IDLE} hidden md:inline-flex`} title="Віддалити" onClick={() => setCam((c) => ({ ...c, zoom: c.zoom / 1.25 }))}><ZoomOut className="w-4 h-4" /></button>
          <button type="button" className={BTN_IDLE} title="Показати все" onClick={fitAll}><Maximize2 className="w-4 h-4" /></button>
          {selected && (
            <button type="button" className={`${BTN_IDLE} !text-rose-600`} title="Прибрати вибрану поверхню" onClick={() => { removeSurface(selected.id); selectSurface(null); }}><Trash2 className="w-4 h-4" /></button>
          )}
        </span>
      </div>

      <div ref={hostRef} className="flex-1 min-h-0 relative overflow-hidden touch-none select-none">
        <svg
          ref={svgRef}
          viewBox={vb}
          className="w-full h-full block"
          style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair', background: '#f4f6f8' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { drag.current = null; pointers.current.clear(); pinch.current = null; }}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <defs>
            <pattern id="arch-grid" width={1000} height={1000} patternUnits="userSpaceOnUse">
              <path d="M1000 0H0V1000" fill="none" stroke="#cfd8e0" strokeWidth={px(1)} />
            </pattern>
            <pattern id="arch-hatch" width={px(8)} height={px(8)} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={px(8)} stroke="#94a3b8" strokeWidth={px(1)} />
            </pattern>
          </defs>
          <rect x={cam.x} y={cam.y} width={size.w / cam.zoom} height={size.h / cam.zoom} fill="url(#arch-grid)" />
          {underlay && (
            <image href={underlay.dataUrl} x={0} y={0} width={underlay.widthPx * underlay.mmPerPx} height={underlay.heightPx * underlay.mmPerPx} opacity={underlay.opacity} preserveAspectRatio="none" />
          )}
          {floors.map((f) => {
            const isSel = f.id === selectedSurfaceId;
            const hasLayout = model.layouts.some((l) => l.surfaceId === f.id);
            return (
              <g key={f.id}>
                <path
                  d={`M${f.points.map((p) => `${p.x} ${p.y}`).join('L')}Z ${f.openings.map((o) => `M${o.map((p) => `${p.x} ${p.y}`).join('L')}Z`).join(' ')}`}
                  fillRule="evenodd"
                  fill={isSel ? 'rgba(31,147,239,0.22)' : hasLayout ? 'rgba(34,160,107,0.16)' : 'rgba(31,147,239,0.10)'}
                  stroke={isSel ? '#1f93ef' : '#1f2d3a'}
                  strokeWidth={px(isSel ? 2.5 : 1.5)}
                />
                {f.openings.map((o, i) => (
                  <path key={i} d={`M${o.map((p) => `${p.x} ${p.y}`).join('L')}Z`} fill="url(#arch-hatch)" stroke="#475569" strokeWidth={px(1)} />
                ))}
                {f.points.map((p, i) => {
                  const q = f.points[(i + 1) % f.points.length];
                  const len = edgeLength(f.points, i);
                  const mx = (p.x + q.x) / 2; const my = (p.y + q.y) / 2;
                  const ang = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
                  const flip = ang > 90 || ang < -90 ? ang + 180 : ang;
                  return (
                    <text key={i} x={mx} y={my} fontSize={px(11)} fill="#1f2d3a" textAnchor="middle" transform={`rotate(${flip} ${mx} ${my}) translate(0 ${-px(4)})`} style={{ pointerEvents: 'none', fontFamily: 'Roboto, sans-serif' }}>
                      {Math.round(len)}
                    </text>
                  );
                })}
                <text x={f.points.reduce((s, p) => s + p.x, 0) / f.points.length} y={f.points.reduce((s, p) => s + p.y, 0) / f.points.length} fontSize={px(12)} fontWeight={700} fill="#1f2d3a" textAnchor="middle" style={{ pointerEvents: 'none', fontFamily: 'Roboto, sans-serif' }}>
                  {f.name}
                </text>
              </g>
            );
          })}
          {walls.map((w) => {
            const f = floors.find((fl) => fl.id === w.planEdge?.surfaceId); if (!f || !w.planEdge) return null;
            const a = f.points[w.planEdge.edgeIndex]; const b = f.points[(w.planEdge.edgeIndex + 1) % f.points.length];
            const isSel = w.id === selectedSurfaceId;
            return <line key={w.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={isSel ? '#1f93ef' : '#7c3aed'} strokeWidth={px(isSel ? 7 : 5)} strokeLinecap="butt" opacity={0.75}><title>{w.name}: {Math.round(w.points[1].x)} × {w.heightMm} мм</title></line>;
          })}
          {hoverEdge && tool === 'wall' && (() => {
            const a = hoverEdge.surface.points[hoverEdge.edgeIndex]; const b = hoverEdge.surface.points[(hoverEdge.edgeIndex + 1) % hoverEdge.surface.points.length];
            return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#22a06b" strokeWidth={px(6)} opacity={0.6} />;
          })()}
          {draftPath && <path d={draftPath} fill="none" stroke="#1f93ef" strokeWidth={px(2)} strokeDasharray={`${px(6)} ${px(4)}`} />}
          {draft.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={px(4)} fill={i === 0 ? '#22a06b' : '#1f93ef'} />)}
          {tool === 'opening' && draft.length === 1 && cursor && (
            <rect x={Math.min(draft[0].x, cursor.x)} y={Math.min(draft[0].y, cursor.y)} width={Math.abs(cursor.x - draft[0].x)} height={Math.abs(cursor.y - draft[0].y)} fill="url(#arch-hatch)" stroke="#475569" strokeWidth={px(1)} strokeDasharray={`${px(5)} ${px(3)}`} />
          )}
          {calib && (
            <g>
              <circle cx={calib.a.x} cy={calib.a.y} r={px(5)} fill="#f59e0b" />
              {(calib.b ?? cursor) && <line x1={calib.a.x} y1={calib.a.y} x2={(calib.b ?? cursor)!.x} y2={(calib.b ?? cursor)!.y} stroke="#f59e0b" strokeWidth={px(2)} />}
              {calib.b && <circle cx={calib.b.x} cy={calib.b.y} r={px(5)} fill="#f59e0b" />}
            </g>
          )}
          {cursor && tool !== 'select' && tool !== 'pan' && (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={cursor.x - px(8)} y1={cursor.y} x2={cursor.x + px(8)} y2={cursor.y} stroke="#1f2d3a" strokeWidth={px(1)} />
              <line x1={cursor.x} y1={cursor.y - px(8)} x2={cursor.x} y2={cursor.y + px(8)} stroke="#1f2d3a" strokeWidth={px(1)} />
              {draftSegLen > 0 && (
                <text x={cursor.x + px(12)} y={cursor.y - px(8)} fontSize={px(12)} fill="#1f93ef" fontWeight={700} style={{ fontFamily: 'Roboto, sans-serif' }}>
                  {typed ? `${typed}…` : Math.round(draftSegLen)}
                </text>
              )}
            </g>
          )}
        </svg>

        {calib?.b && (
          <div className="absolute left-1/2 -translate-x-1/2 top-3 bg-white border border-amber-300 rounded-lg shadow-lg px-3 py-2 flex items-center gap-2">
            <span className="text-[13px] text-slate-700">Цей відрізок на плані =</span>
            <input autoFocus type="number" value={calib.known} onChange={(e) => setCalib({ ...calib, known: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') finishCalibration(); if (e.key === 'Escape') setCalib(null); }} className="w-24 h-8 px-2 border border-slate-300 rounded text-right" placeholder="мм" />
            <span className="text-[13px] text-slate-700">мм</span>
            <button type="button" className={BTN_BLUE} onClick={finishCalibration}>Задати</button>
            <button type="button" className={BTN_IDLE} onClick={() => setCalib(null)}>Скасувати</button>
          </div>
        )}
        {underlay && !underlay.calibrated && !calib && (
          <div className="absolute left-3 top-3 bg-amber-50 border border-amber-300 text-amber-800 rounded-md px-3 py-1.5 text-[12.5px] shadow">
            Масштаб не задано — інструмент «Масштаб»: два кліки по відомому розміру
          </div>
        )}
        {!underlay && floors.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white/90 border border-slate-200 rounded-xl px-6 py-5 text-center max-w-md shadow">
              <div className="text-[15px] font-bold text-slate-800 mb-1">План приміщення</div>
              <div className="text-[13px] text-slate-600">Підвантаж PDF плану, задай масштаб по одному відомому розміру і обведи підлоги, отвори, стіни. Далі — «Розкладка».</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 px-3 h-8 bg-white border-t border-slate-200 text-[12px] text-slate-600 overflow-hidden whitespace-nowrap">
        <span className="font-semibold text-slate-800 truncate">{hint}</span>
        <span className="ml-auto shrink-0">{cursor ? `${Math.round(cursor.x)} ; ${Math.round(cursor.y)} мм` : ''}</span>
        <span className="shrink-0">{underlay ? (underlay.calibrated ? `масштаб ${fmt(underlay.mmPerPx, 2)} мм/px` : 'масштаб ≈') : ''}</span>
        <span className="shrink-0">підлог {floors.length} · стін {walls.length}</span>
      </div>
    </div>
  );
}
