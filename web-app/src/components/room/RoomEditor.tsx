import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Line } from '@react-three/drei';
import * as THREE from 'three';
import {
  MousePointer2, PenLine, Square, MoveVertical, Paintbrush, Eraser, Home, LayoutTemplate,
  Undo2, Trash2, Grid3x3, ArrowUpFromLine, Eye, EyeOff, Camera, BrickWall,
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import {
  emptyRoom, rectPoints, snapPoint, pointAtLength, wallsFromContour, wallOnEdge, nearestContourEdge,
  pushPull, kindAfterPull, moveContourEdge, addSolid, updateSolid, removeSolid, roomId, ROOM_PALETTE,
  solidAxis, worldFromLocal, localFromWorld, axisVector, axisFromNormal, solidCorners,
  type RoomModel, type RoomPoint, type RoomSolid, type RoomAxis,
} from '../../domain/room';
import { RoomSolids } from './RoomSolids';

/**
 * РЕДАКТОР ПРИМІЩЕННЯ (БАЗИ) — 01.09.2026, рішення власника.
 *
 * Сценарій власника дослівно (зі SketchUp): «малюю квадрат, потім
 * вказую, по яких ребрах ростуть стіни; на стіні прямокутник — втиснув —
 * проріз; на підлозі прямокутник — витягнув — кухонний блок; на блоку
 * прямокутник — витягнув — Г-частина». Тому:
 *
 *   · малювати можна на БУДЬ-ЯКІЙ грані: підлога, верх блока, стіна —
 *     грань під курсором задає площину (Surface), точки беруться в її
 *     локальних (u, v), прив'язки — сітка 10 мм, кути тіл на цій площині,
 *     орто;
 *   · push/pull тягне по НОРМАЛІ грані: торець призми — довжина, бік
 *     прямокутного блока — рухається ребро; плоска грань — стає тілом
 *     (назовні) або вибіркою (усередину господаря);
 *   · стіни — «по ребрах»: клік по ребру підлоги вирощує стіну назовні;
 *     є й швидкі «контур» і «прямокутник» (усі стіни одразу).
 *
 * Клавіші: число + Enter — довжина сегмента або висота обраного; Enter —
 * замкнути; Esc — скасувати; Delete — видалити; Ctrl+Z — назад (30).
 * Права кнопка — обертати, колесо — зум, середня — панорама.
 * Натиснуті кнопки — сині. Стан — `project.room` (domain/room.ts).
 */

const S = 0.001;

type Tool = 'select' | 'wallsEdge' | 'walls' | 'wallsRect' | 'line' | 'rect' | 'pushpull' | 'paint' | 'erase';

/** Площина, на якій зараз малюємо: вісь, зсув, куди дивиться грань-господар. */
type Surface = { axis: RoomAxis; along: number; normal: 1 | -1; hostId?: string };

type Draft = { tool: 'walls' | 'wallsRect' | 'line' | 'rect'; points: RoomPoint[]; surface: Surface };

type Cursor = { local: RoomPoint; world: THREE.Vector3; kind: string; surface: Surface };

type Drag = {
  id: string;
  original: RoomSolid;
  /** Нормаль грані у світі (одинична, по одній осі). */
  normal: THREE.Vector3;
  start: THREE.Vector3;
  plane: THREE.Plane;
  mode: { kind: 'end'; end: 'top' | 'base' } | { kind: 'edge'; local: { u: number; v: number }; at: number } | { kind: 'face' };
};

const FLOOR: Surface = { axis: 'up', along: 0, normal: 1 };

const TOOLS: Array<{ id: Tool; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'select', label: 'Вибрати', hint: 'Клік по тілу — обрати; у пусте — скинути', icon: MousePointer2 },
  { id: 'wallsRect', label: 'Підлога', hint: 'Два кути кімнати в світлі → плита підлоги. Далі — «Стіни по ребрах»', icon: LayoutTemplate },
  { id: 'wallsEdge', label: 'Стіни по ребрах', hint: 'Клік по ребру підлоги — стіна росте назовні на задану товщину й висоту', icon: BrickWall },
  { id: 'walls', label: 'Стіни: контур', hint: 'Обвести кімнату по точках і замкнути — усі стіни й підлога одразу', icon: Home },
  { id: 'line', label: 'Лінія', hint: 'Замкнений контур на будь-якій грані — площа, яку потім витягнеш', icon: PenLine },
  { id: 'rect', label: 'Прямокутник', hint: 'Два кути на будь-якій грані: підлога, стіна, верх блока', icon: Square },
  { id: 'pushpull', label: 'Витягнути', hint: 'Тягни грань по її нормалі: назовні — тіло, всередину — проріз/вибірка. Або обери і набери число + Enter', icon: MoveVertical },
  { id: 'paint', label: 'Фарба', hint: 'Клік по тілу — пофарбувати обраним кольором', icon: Paintbrush },
  { id: 'erase', label: 'Видалити', hint: 'Клік по тілу — прибрати', icon: Eraser },
];

const BLUE = 'bg-[#0084ff] text-white border-[#0084ff]';
const IDLE = 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50';

const fmt = (mm: number) => `${Math.round(mm)}`;
const surfaceLabel = (s: Surface) => (s.axis === 'up' ? (s.along === 0 ? 'підлога' : `площина на ${fmt(s.along)} мм`) : `стіна ${s.axis === 'z' ? 'Z' : 'X'} = ${fmt(s.along)}`);

function toWorld(surface: Surface, p: RoomPoint): THREE.Vector3 {
  const w = worldFromLocal(surface.axis, p.x, p.y, surface.along);
  return new THREE.Vector3(w.x * S, w.y * S, w.z * S);
}

function planeOf(surface: Surface): THREE.Plane {
  const n = axisVector(surface.axis);
  const normal = new THREE.Vector3(n.x, n.y, n.z);
  return new THREE.Plane(normal, -surface.along * S);
}

/* ═══════════════════════════════════════════════════════════════════ */

export function RoomEditor() {
  const project = useProjectStore((s) => s.project);
  const room: RoomModel = project.room ?? emptyRoom();

  const [tool, setToolState] = useState<Tool>('wallsRect');
  const [ortho, setOrtho] = useState(true);
  const [cutMode, setCutMode] = useState(false);
  const [color, setColor] = useState<string>(ROOM_PALETTE[0].hex);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [edgeHover, setEdgeHover] = useState<{ solidId: string; index: number } | null>(null);
  const [typed, setTyped] = useState('');
  const [preview, setPreview] = useState<RoomModel | null>(null);
  const [topView, setTopView] = useState(false);
  const undoRef = useRef<RoomModel[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);

  const shown = preview ?? room;
  const selected = shown.solids.find((s) => s.id === selectedId) ?? null;

  const commit = useCallback((next: RoomModel) => {
    undoRef.current = [...undoRef.current.slice(-29), room];
    setUndoDepth(undoRef.current.length);
    useProjectStore.getState().updateProject({ room: next });
  }, [room]);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    setUndoDepth(undoRef.current.length);
    if (prev) useProjectStore.getState().updateProject({ room: prev });
  }, []);

  const cancelDraft = useCallback(() => { setDraft(null); setTyped(''); }, []);
  const setTool = useCallback((next: Tool) => { setToolState(next); setDraft(null); setTyped(''); setEdgeHover(null); }, []);

  const finishContour = useCallback((points: RoomPoint[], draftTool: Draft['tool'], surface: Surface) => {
    if (points.length < 3) { cancelDraft(); return; }
    if (draftTool === 'walls') {
      commit({ ...room, solids: [...room.solids, ...wallsFromContour(points, room.wallThicknessMm, room.wallHeightMm)] });
    } else if (draftTool === 'wallsRect') {
      // Лише підлога — стіни далі «по ребрах», як у сценарії власника.
      commit({ ...room, solids: [...room.solids, ...wallsFromContour(points, room.wallThicknessMm, room.wallHeightMm).filter((s) => s.role === 'floor')] });
    } else {
      commit(addSolid(room, {
        id: roomId(cutMode ? 'cut' : 'face'),
        kind: cutMode ? 'cut' : 'add',
        role: 'custom',
        axis: surface.axis,
        faceNormal: surface.normal,
        points,
        baseMm: surface.along,
        heightMm: 0,
        color: cutMode ? undefined : color,
      }));
    }
    cancelDraft();
  }, [room, commit, cutMode, color, cancelDraft]);

  /** Клік на площині (підлога чи грань під курсором). */
  const onSurfaceClick = useCallback((c: Cursor) => {
    const snapped = c.local;
    if (tool === 'select') { setSelectedId(null); return; }
    if (tool === 'walls' || tool === 'line') {
      if (!draft) { setDraft({ tool, points: [snapped], surface: c.surface }); return; }
      const first = draft.points[0];
      const closes = draft.points.length >= 3 && Math.hypot(first.x - snapped.x, first.y - snapped.y) < 1;
      if (closes) { finishContour(draft.points, draft.tool, draft.surface); return; }
      const last = draft.points[draft.points.length - 1];
      if (Math.hypot(last.x - snapped.x, last.y - snapped.y) < 1) return;
      setDraft({ ...draft, points: [...draft.points, snapped] });
      setTyped('');
      return;
    }
    if (tool === 'wallsRect' || tool === 'rect') {
      if (!draft) { setDraft({ tool, points: [snapped], surface: c.surface }); return; }
      const a = draft.points[0];
      if (Math.abs(a.x - snapped.x) < 1 || Math.abs(a.y - snapped.y) < 1) return;
      finishContour(rectPoints(a, snapped), draft.tool, draft.surface);
    }
  }, [tool, draft, finishContour]);

  /** Клік по тілу інструментами вибору/фарби/видалення/стін по ребрах. */
  const onSolidClick = useCallback((solidId: string, c: Cursor | null) => {
    if (tool === 'select' || tool === 'pushpull') { setSelectedId(solidId); return; }
    if (tool === 'paint') { commit(updateSolid(room, solidId, { color })); return; }
    if (tool === 'erase') { commit(removeSolid(room, solidId)); if (selectedId === solidId) setSelectedId(null); return; }
    if (tool === 'wallsEdge') {
      const host = room.solids.find((s) => s.id === solidId);
      if (!host || solidAxis(host) !== 'up' || !c) return;
      const edge = nearestContourEdge(host.points, { x: c.world.x / S, y: c.world.z / S }, 250);
      if (!edge) return;
      const wall = wallOnEdge(host.points, edge.index, room.wallThicknessMm, room.wallHeightMm);
      if (wall) commit(addSolid(room, wall));
    }
  }, [tool, room, color, commit, selectedId]);

  /** Клавіатура: довжина сегмента, висота обраного, Esc, Delete, Ctrl+Z. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.key === 'Escape') { cancelDraft(); setSelectedId(null); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (typed) { setTyped((t) => t.slice(0, -1)); return; }
        if (e.key === 'Delete' && selectedId) { commit(removeSolid(room, selectedId)); setSelectedId(null); }
        return;
      }
      if (/^[0-9.,]$/.test(e.key)) { setTyped((t) => (t + e.key).replace(',', '.')); return; }
      if (e.key === '-' && !typed) { setTyped('-'); return; }
      if (e.key === 'Enter') {
        const value = Number(typed);
        if (draft && (draft.tool === 'walls' || draft.tool === 'line')) {
          if (typed && Number.isFinite(value) && cursor && draft.points.length >= 1) {
            const last = draft.points[draft.points.length - 1];
            setDraft({ ...draft, points: [...draft.points, pointAtLength(last, cursor.local, Math.abs(value))] });
            setTyped('');
          } else if (draft.points.length >= 3) {
            finishContour(draft.points, draft.tool, draft.surface);
          }
          return;
        }
        if (selectedId && typed && Number.isFinite(value)) {
          const solid = room.solids.find((s) => s.id === selectedId);
          if (!solid) return;
          // Число для плоскої грані — витягнути на стільки по нормалі; для тіла — довжина.
          if (solid.heightMm <= 0) {
            const delta = (solid.faceNormal ?? 1) * Math.abs(value) * (cutMode ? -1 : 1);
            commit(updateSolid(room, selectedId, { ...pushPull(solid, delta), kind: kindAfterPull(solid, delta, cutMode) }));
          } else {
            commit(updateSolid(room, selectedId, { heightMm: Math.max(0, Math.round(Math.abs(value))) }));
          }
          setTyped('');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [typed, draft, cursor, selectedId, room, commit, undo, cancelDraft, finishContour, cutMode]);

  const activeTool = TOOLS.find((t) => t.id === tool)!;
  const segmentInfo = useMemo(() => {
    if (!draft || !cursor || (draft.tool !== 'walls' && draft.tool !== 'line')) return null;
    const last = draft.points[draft.points.length - 1];
    return { length: Math.hypot(cursor.local.x - last.x, cursor.local.y - last.y) };
  }, [draft, cursor]);
  const rectInfo = useMemo(() => {
    if (!draft || !cursor || (draft.tool !== 'rect' && draft.tool !== 'wallsRect')) return null;
    const a = draft.points[0];
    return { w: Math.abs(cursor.local.x - a.x), d: Math.abs(cursor.local.y - a.y) };
  }, [draft, cursor]);
  const floorExists = room.solids.some((s) => s.role === 'floor');

  return (
    <div className="relative w-full h-full bg-[#f0f4f8] select-none" style={{ minHeight: 400 }}>
      {/* ── Інструменти (ліворуч) ─────────────────────────────────── */}
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5 pointer-events-auto">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const active = tool === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setTool(t.id)} title={`${t.label} — ${t.hint}`}
              className={`flex items-center gap-2 px-2.5 h-9 rounded-md border shadow-sm text-[13px] font-medium transition-colors ${active ? BLUE : IDLE}`}>
              <Icon className="w-4 h-4" />
              <span className="whitespace-nowrap">{t.label}</span>
            </button>
          );
        })}
        <div className="h-px bg-slate-300 my-1" />
        <button type="button" onClick={() => setOrtho((v) => !v)} title="Орто: лінії тільки по осях"
          className={`flex items-center gap-2 px-2.5 h-9 rounded-md border shadow-sm text-[13px] font-medium transition-colors ${ortho ? BLUE : IDLE}`}>
          <Grid3x3 className="w-4 h-4" /> Орто
        </button>
        <button type="button" onClick={() => setCutMode((v) => !v)} title="Вибірка (мінус): усе, що витягнеш, буде відніматись від тіл"
          className={`flex items-center gap-2 px-2.5 h-9 rounded-md border shadow-sm text-[13px] font-medium transition-colors ${cutMode ? BLUE : IDLE}`}>
          <ArrowUpFromLine className="w-4 h-4 rotate-180" /> Вибірка
        </button>
        <button type="button" onClick={undo} disabled={undoDepth === 0} title="Крок назад (Ctrl+Z)"
          className={`flex items-center gap-2 px-2.5 h-9 rounded-md border shadow-sm text-[13px] font-medium transition-colors ${IDLE} disabled:opacity-40`}>
          <Undo2 className="w-4 h-4" /> Назад{undoDepth ? ` (${undoDepth})` : ''}
        </button>
      </div>

      {/* ── Параметри (згори) ─────────────────────────────────────── */}
      <div className="absolute left-1/2 -translate-x-1/2 top-3 z-10 flex items-center gap-3 bg-white/95 border border-slate-200 rounded-md shadow-sm px-3 py-1.5 text-[13px] pointer-events-auto">
        <label className="flex items-center gap-1.5 text-slate-600">
          Стіна, висота
          <input type="number" step="10" min="100" value={room.wallHeightMm}
            onChange={(e) => useProjectStore.getState().updateProject({ room: { ...room, wallHeightMm: Math.max(100, Number(e.target.value) || 0) } })}
            className="w-20 px-2 py-1 border border-slate-300 rounded-sm text-right" />
        </label>
        <label className="flex items-center gap-1.5 text-slate-600">
          товщина
          <input type="number" step="10" min="10" value={room.wallThicknessMm}
            onChange={(e) => useProjectStore.getState().updateProject({ room: { ...room, wallThicknessMm: Math.max(10, Number(e.target.value) || 0) } })}
            className="w-16 px-2 py-1 border border-slate-300 rounded-sm text-right" />
        </label>
        <div className="w-px h-6 bg-slate-200" />
        <div className="flex items-center gap-1" title="Колір для фарби і нових граней">
          {ROOM_PALETTE.map((c) => (
            <button key={c.id} type="button" title={c.label} onClick={() => setColor(c.hex)}
              className={`w-6 h-6 rounded-sm border-2 ${color === c.hex ? 'border-[#0084ff] ring-2 ring-[#0084ff]/30' : 'border-white shadow'}`}
              style={{ background: c.hex }} />
          ))}
        </div>
        <div className="w-px h-6 bg-slate-200" />
        <button type="button" onClick={() => setTopView((v) => !v)} title={topView ? 'Повернути 3D-вид' : 'Вид зверху (план)'}
          className={`flex items-center gap-1.5 px-2 h-7 rounded-sm border text-[12px] font-medium ${topView ? BLUE : IDLE}`}>
          <Camera className="w-3.5 h-3.5" /> План
        </button>
        <button type="button"
          onClick={() => useProjectStore.getState().updateProject({ room: { ...room, visibleInAssembly: !room.visibleInAssembly } })}
          title="Показувати базу у 3D Підборі"
          className={`flex items-center gap-1.5 px-2 h-7 rounded-sm border text-[12px] font-medium ${room.visibleInAssembly ? BLUE : IDLE}`}>
          {room.visibleInAssembly ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} у 3D Підборі
        </button>
      </div>

      {/* ── Властивості обраного (праворуч) ───────────────────────── */}
      {selected && (
        <div className="absolute right-3 top-3 z-10 w-64 bg-white/95 border border-slate-200 rounded-md shadow-sm p-3 text-[13px] flex flex-col gap-2 pointer-events-auto">
          <div className="font-bold text-slate-700 flex items-center justify-between">
            <span>{selected.label ?? (selected.kind === 'cut' ? 'Вибірка' : selected.heightMm <= 0 ? 'Грань' : 'Тіло')}</span>
            <button type="button" onClick={() => { commit(removeSolid(room, selected.id)); setSelectedId(null); }} title="Видалити" className="text-slate-400 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="text-[11px] text-slate-400">
            Вісь {solidAxis(selected) === 'up' ? 'вгору (Y)' : solidAxis(selected).toUpperCase()} · контур {fmt(Math.max(...selected.points.map((p) => p.x)) - Math.min(...selected.points.map((p) => p.x)))} × {fmt(Math.max(...selected.points.map((p) => p.y)) - Math.min(...selected.points.map((p) => p.y)))} мм
          </div>
          <label className="flex items-center justify-between gap-2 text-slate-600">
            Початок, мм
            <input type="number" step="10" value={selected.baseMm}
              onChange={(e) => commit(updateSolid(room, selected.id, { baseMm: Math.round(Number(e.target.value) || 0) }))}
              className="w-24 px-2 py-1 border border-slate-300 rounded-sm text-right" />
          </label>
          <label className="flex items-center justify-between gap-2 text-slate-600">
            Довжина, мм
            <input type="number" step="10" min="0" value={selected.heightMm}
              onChange={(e) => commit(updateSolid(room, selected.id, { heightMm: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
              className="w-24 px-2 py-1 border border-slate-300 rounded-sm text-right" />
          </label>
          <div className="flex items-center justify-between gap-2 text-slate-600">
            Тип
            <div className="flex rounded-sm border border-slate-300 overflow-hidden">
              {(['add', 'cut'] as const).map((k) => (
                <button key={k} type="button" onClick={() => commit(updateSolid(room, selected.id, { kind: k }))}
                  className={`px-2 py-1 text-[12px] ${selected.kind === k ? BLUE : 'bg-white text-slate-600'}`}>
                  {k === 'add' ? 'Тіло' : 'Вибірка'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Статус (знизу) ────────────────────────────────────────── */}
      <div className="absolute left-3 right-3 bottom-3 z-10 flex items-center gap-4 bg-white/95 border border-slate-200 rounded-md shadow-sm px-3 py-1.5 text-[12px] text-slate-600 pointer-events-none">
        <span className="font-semibold text-slate-800">{activeTool.label}</span>
        <span className="text-slate-500 truncate">{activeTool.hint}</span>
        <span className="ml-auto tabular-nums">
          {cursor ? `${surfaceLabel(cursor.surface)} · u ${fmt(cursor.local.x)}  v ${fmt(cursor.local.y)}${cursor.kind === 'anchor' ? '  ● кут' : cursor.kind === 'ortho' ? '  ⟂ орто' : ''}` : ''}
        </span>
        {segmentInfo && <span className="tabular-nums font-semibold text-slate-800">L = {fmt(segmentInfo.length)} мм</span>}
        {rectInfo && <span className="tabular-nums font-semibold text-slate-800">{fmt(rectInfo.w)} × {fmt(rectInfo.d)} мм</span>}
        {typed && <span className="px-2 py-0.5 rounded-sm bg-[#0084ff] text-white font-bold tabular-nums">{typed} мм ⏎</span>}
        {room.solids.length === 0 && !draft && <span className="text-slate-400">Порожньо. Почни з «Підлога»: два кути кімнати.</span>}
        {floorExists && !room.solids.some((s) => s.role === 'wall') && tool !== 'wallsEdge' && <span className="text-slate-400">Тепер «Стіни по ребрах»: клік по ребру підлоги.</span>}
      </div>

      <Canvas
        shadows
        camera={{ position: [5, 5, 7], fov: 45, near: 0.05, far: 200 }}
        onPointerMissed={(e) => { if (e.type === 'click' && e.button === 0 && tool === 'select') setSelectedId(null); }}
      >
        <color attach="background" args={['#f0f4f8']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[8, 12, 6]} intensity={1.1} castShadow shadow-mapSize={[2048, 2048]} />
        <hemisphereLight args={['#ffffff', '#c9d2dc', 0.35]} />
        <Suspense fallback={null}>
          <RoomScene
            room={shown}
            tool={tool}
            ortho={ortho}
            cutMode={cutMode}
            draft={draft}
            cursor={cursor}
            selectedId={selectedId}
            hoverId={hoverId}
            edgeHover={edgeHover}
            topView={topView}
            setCursor={setCursor}
            setHoverId={setHoverId}
            setEdgeHover={setEdgeHover}
            onSurfaceClick={onSurfaceClick}
            onSolidClick={onSolidClick}
            onPreview={(next) => setPreview(next)}
            onCommit={(next) => { setPreview(null); commit(next); }}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */

function RoomScene({
  room, tool, ortho, cutMode, draft, cursor, selectedId, hoverId, edgeHover, topView,
  setCursor, setHoverId, setEdgeHover, onSurfaceClick, onSolidClick, onPreview, onCommit,
}: {
  room: RoomModel;
  tool: Tool;
  ortho: boolean;
  cutMode: boolean;
  draft: Draft | null;
  cursor: Cursor | null;
  selectedId: string | null;
  hoverId: string | null;
  edgeHover: { solidId: string; index: number } | null;
  topView: boolean;
  setCursor: (c: Cursor | null) => void;
  setHoverId: (id: string | null) => void;
  setEdgeHover: (e: { solidId: string; index: number } | null) => void;
  onSurfaceClick: (c: Cursor) => void;
  onSolidClick: (id: string, c: Cursor | null) => void;
  onPreview: (next: RoomModel) => void;
  onCommit: (next: RoomModel) => void;
}) {
  const { camera } = useThree();
  const dragRef = useRef<Drag | null>(null);
  const previewRef = useRef<RoomModel | null>(null);
  const controlsRef = useRef<{ target: THREE.Vector3; enabled: boolean; update?: () => void } | null>(null);
  const drawing = tool === 'walls' || tool === 'wallsRect' || tool === 'line' || tool === 'rect';

  /** Якорі прив'язки для площини: кути всіх тіл, що лежать на ній. */
  const anchorsFor = useCallback((surface: Surface): RoomPoint[] => {
    const out: RoomPoint[] = [];
    for (const s of room.solids) {
      for (const c of solidCorners(s)) {
        const l = localFromWorld(surface.axis, c);
        if (Math.abs(l.along - surface.along) < 1) out.push({ x: l.u, y: l.v });
      }
    }
    if (draft) out.push(...draft.points);
    return out;
  }, [room.solids, draft]);

  /** Точка у світі (м) → курсор на площині з прив'язками. */
  const cursorAt = useCallback((worldM: THREE.Vector3, surface: Surface): Cursor => {
    const l = localFromWorld(surface.axis, { x: worldM.x / S, y: worldM.y / S, z: worldM.z / S });
    const last = draft && (draft.tool === 'walls' || draft.tool === 'line') ? draft.points[draft.points.length - 1] : null;
    const snapped = snapPoint({ x: l.u, y: l.v }, { anchors: anchorsFor(surface), orthoFrom: ortho ? last : null });
    return { local: snapped.point, world: toWorld(surface, snapped.point), kind: snapped.kind, surface };
  }, [draft, ortho, anchorsFor]);

  /** Під час малювання точки беруться з площини чернетки, а не з грані під мишею. */
  const cursorOnDraftPlane = useCallback((ray: THREE.Ray): Cursor | null => {
    if (!draft) return null;
    const hit = new THREE.Vector3();
    if (!ray.intersectPlane(planeOf(draft.surface), hit)) return null;
    return cursorAt(hit, draft.surface);
  }, [draft, cursorAt]);

  // Вид зверху / 3D.
  useEffect(() => {
    const t = controlsRef.current?.target ?? new THREE.Vector3(2, 0, 1.5);
    if (topView) { camera.position.set(t.x, 12, t.z + 0.0001); camera.up.set(0, 1, 0); }
    else camera.position.set(t.x + 4, 5, t.z + 6);
    camera.lookAt(t);
    controlsRef.current?.update?.();
  }, [topView, camera]);

  // Push/pull: тягнемо вздовж нормалі грані по площині, поверненій до камери.
  useFrame(({ pointer, raycaster }) => {
    const drag = dragRef.current;
    if (!drag) return;
    raycaster.setFromCamera(pointer, camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(drag.plane, hit)) return;
    const deltaMm = Math.round((hit.clone().sub(drag.start).dot(drag.normal) / S) / 10) * 10;
    const next = applyDrag(room, drag, deltaMm, cutMode);
    previewRef.current = next;
    onPreview(next);
  });

  useEffect(() => {
    const up = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      if (controlsRef.current) controlsRef.current.enabled = true;
      onCommit(previewRef.current ?? room);
      previewRef.current = null;
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [room, onCommit]);

  const startPushPull = (solidId: string, e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0 || !e.face) return;
    const original = room.solids.find((s) => s.id === solidId);
    if (!original) return;
    e.stopPropagation();
    const n = e.face.normal.clone().round(); // геометрії без трансформацій → світ
    const info = axisFromNormal({ x: n.x, y: n.y, z: n.z });
    if (!info) return;
    const axis = solidAxis(original);
    let mode: Drag['mode'];
    if (original.heightMm <= 0) {
      // Плоска грань: тягнемо по її власній осі, незалежно від того, з якого боку клікнули.
      const av = axisVector(axis);
      n.set(av.x, av.y, av.z);
      mode = { kind: 'face' };
    } else if (info.axis === axis) {
      mode = { kind: 'end', end: info.sign > 0 ? 'top' : 'base' };
    } else {
      const l = localFromWorld(axis, { x: n.x, y: n.y, z: n.z });
      const hitL = localFromWorld(axis, { x: e.point.x / S, y: e.point.y / S, z: e.point.z / S });
      const alongU = Math.abs(l.u) > 0.5;
      mode = { kind: 'edge', local: { u: l.u, v: l.v }, at: alongU ? hitL.u : hitL.v };
    }
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const planeNormal = dir.clone().sub(n.clone().multiplyScalar(dir.dot(n)));
    if (planeNormal.lengthSq() < 1e-6) planeNormal.set(0, 0, 1);
    planeNormal.normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, e.point.clone());
    dragRef.current = { id: solidId, original, normal: n, start: e.point.clone(), plane, mode };
    if (controlsRef.current) controlsRef.current.enabled = false;
  };

  const mouseButtons = useMemo(() => ({
    LEFT: tool === 'select' ? THREE.MOUSE.ROTATE : (-1 as unknown as THREE.MOUSE),
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE,
  }), [tool]);

  /** Рух над тілом: площина = грань під курсором (або площина чернетки). */
  const onSolidMove = (solidId: string, e: ThreeEvent<PointerEvent>) => {
    if (dragRef.current) return;
    e.stopPropagation();
    if (draft) { setCursor(cursorOnDraftPlane(e.ray)); return; }
    const solid = room.solids.find((s) => s.id === solidId);
    if (!solid || !e.face) { setCursor(null); return; }
    const n = e.face.normal.clone().round();
    const info = axisFromNormal({ x: n.x, y: n.y, z: n.z });
    if (!info) { setCursor(null); return; }
    const along = localFromWorld(info.axis, { x: e.point.x / S, y: e.point.y / S, z: e.point.z / S }).along;
    const surface: Surface = { axis: info.axis, along: Math.round(along), normal: info.sign, hostId: solidId };
    setCursor(cursorAt(e.point, surface));
    if (tool === 'wallsEdge' && solidAxis(solid) === 'up') {
      const edge = nearestContourEdge(solid.points, { x: e.point.x / S, y: e.point.z / S }, 250);
      setEdgeHover(edge ? { solidId, index: edge.index } : null);
    }
  };

  const previewLines = useMemo(() => {
    if (!draft || !cursor) return null;
    const surface = draft.surface;
    const lift = (v: THREE.Vector3) => { const n = axisVector(surface.axis); return v.clone().add(new THREE.Vector3(n.x, n.y, n.z).multiplyScalar(0.003 * surface.normal)); };
    if (draft.tool === 'walls' || draft.tool === 'line') {
      const pts = [...draft.points, cursor.local].map((p) => lift(toWorld(surface, p)));
      return { done: pts.slice(0, -1), rubber: pts.slice(-2) };
    }
    const r = rectPoints(draft.points[0], cursor.local).map((p) => lift(toWorld(surface, p)));
    return { done: [], rubber: [...r, r[0]] };
  }, [draft, cursor]);

  const edgeLine = useMemo(() => {
    if (!edgeHover) return null;
    const host = room.solids.find((s) => s.id === edgeHover.solidId);
    if (!host) return null;
    const a = host.points[edgeHover.index]; const b = host.points[(edgeHover.index + 1) % host.points.length];
    const y = (host.baseMm + host.heightMm) * S + 0.004;
    return [new THREE.Vector3(a.x * S, y, a.y * S), new THREE.Vector3(b.x * S, y, b.y * S)];
  }, [edgeHover, room.solids]);

  const cursorNormal = cursor ? axisVector(cursor.surface.axis) : null;

  return (
    <>
      <OrbitControls ref={controlsRef as never} makeDefault target={[2, 0, 1.5]} mouseButtons={mouseButtons} maxPolarAngle={Math.PI / 2 - 0.02} minDistance={0.5} maxDistance={60} />
      <Grid position={[0, -0.001, 0]} infiniteGrid cellSize={0.1} sectionSize={1} fadeDistance={40} cellColor="#d5dbe2" sectionColor="#9aa5b1" cellThickness={0.5} sectionThickness={1} raycast={() => null} />
      <axesHelper args={[1]} />

      {/* Підлога-площина: ловить рух і кліки там, де немає тіл. Лежить на
          2 мм нижче нуля, щоб верх плити підлоги (y=0) завжди був ближчим
          до камери і саме тіло отримувало події першим. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.002, 0]}
        onPointerMove={(e) => {
          if (dragRef.current) return;
          if (draft) { setCursor(cursorOnDraftPlane(e.ray)); return; }
          setCursor(cursorAt(e.point, FLOOR));
          if (tool === 'wallsEdge') setEdgeHover(null);
        }}
        onPointerDown={(e) => {
          if (e.nativeEvent.button !== 0) return;
          if (!drawing && tool !== 'select') return;
          const c = draft ? cursorOnDraftPlane(e.ray) : cursorAt(e.point, FLOOR);
          if (c) onSurfaceClick(c);
        }}
        onPointerOut={() => { if (!draft) setCursor(null); }}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <RoomSolids
        room={room}
        selectedId={selectedId}
        hoverId={tool === 'select' || tool === 'paint' || tool === 'erase' || tool === 'pushpull' ? hoverId : null}
        showCuts
        onSolidPointerMove={onSolidMove}
        onSolidPointerDown={(id, e) => {
          if (e.nativeEvent.button !== 0) return;
          if (tool === 'pushpull') { startPushPull(id, e); return; }
          e.stopPropagation();
          if (drawing) {
            const c = draft ? cursorOnDraftPlane(e.ray) : cursor;
            if (c) onSurfaceClick(c);
            return;
          }
          onSolidClick(id, cursor);
        }}
        onSolidPointerOver={(id) => setHoverId(id)}
        onSolidPointerOut={() => setHoverId(null)}
      />

      {/* Курсор, гумова лінія, ребро під курсором */}
      {cursor && drawing && cursorNormal && (
        <mesh position={cursor.world.clone().add(new THREE.Vector3(cursorNormal.x, cursorNormal.y, cursorNormal.z).multiplyScalar(0.004 * cursor.surface.normal))}
          rotation={cursor.surface.axis === 'up' ? [-Math.PI / 2, 0, 0] : cursor.surface.axis === 'x' ? [0, Math.PI / 2, 0] : [0, 0, 0]}>
          <ringGeometry args={[0.02, 0.035, 24]} />
          <meshBasicMaterial color={cursor.kind === 'anchor' ? '#16a34a' : '#0084ff'} depthTest={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {previewLines && previewLines.done.length >= 2 && <Line points={previewLines.done} color="#0084ff" lineWidth={2} depthTest={false} />}
      {previewLines && previewLines.rubber.length >= 2 && <Line points={previewLines.rubber} color="#0084ff" lineWidth={2} dashed dashSize={0.05} gapSize={0.03} depthTest={false} />}
      {draft?.points.map((p, i) => (
        <mesh key={i} position={toWorld(draft.surface, p)}>
          <sphereGeometry args={[0.014, 12, 12]} />
          <meshBasicMaterial color={i === 0 ? '#16a34a' : '#0084ff'} depthTest={false} />
        </mesh>
      ))}
      {edgeLine && <Line points={edgeLine} color="#16a34a" lineWidth={4} depthTest={false} />}
    </>
  );
}

/** Застосувати перетягування push/pull до моделі (чисто, для прев'ю і коміту). */
function applyDrag(room: RoomModel, drag: Drag, deltaMm: number, cutMode: boolean): RoomModel {
  const o = drag.original;
  if (drag.mode.kind === 'face') {
    // Для плоскої грані drag.normal = вектор її осі, тож deltaMm уже вздовж осі.
    if (deltaMm === 0) return updateSolid(room, o.id, o);
    return updateSolid(room, o.id, { ...pushPull(o, deltaMm), kind: kindAfterPull(o, deltaMm, cutMode) });
  }
  if (drag.mode.kind === 'end') {
    // deltaMm — уздовж нормалі грані; для базового торця нормаль дивиться в −вісь.
    const d = drag.mode.end === 'top' ? deltaMm : -deltaMm;
    return updateSolid(room, o.id, pushPull(o, d, drag.mode.end));
  }
  return updateSolid(room, o.id, { points: moveContourEdge(o.points, drag.mode.local, drag.mode.at, deltaMm) });
}
