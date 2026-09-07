/**
 * ГЕОМЕТРІЯ ДЛЯ КРЕСЛЕНЬ — спільні дрібниці компонувальників аркушів (06.09.2026).
 *
 * Усе в мм деталі, якщо не сказано інакше. Жодних рішень «що малювати» —
 * лише обчислення: габарити, сторони з літерами, кути, отвори, масштаб.
 */
import type { Detail, DetailPart, SurfaceCutout } from '../../domain/types';
import type { Pt } from './model';
import { SCALES } from './style';

export interface BBox { minX: number; minY: number; maxX: number; maxY: number; w: number; h: number }

export const bbox = (pts: Pt[]): BBox => {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
};

/** DWG: dimdec 2, але цілі — без коми (2922,5 · 901). */
export const fmtMm = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString().replace('.', ','));

const LETTERS = 'ABCDEFGHIJKLMNOP';

export interface Side { name: string; a: Pt; b: Pt; len: number; mid: Pt; /** одинична нормаль НАЗОВНІ */ n: Pt }

/**
 * Сторони парта з літерами. Джерело — `sideSegments` рушія (Г/П-подібні);
 * коли їх нема (прямокутні доповнення) — ребра контуру по порядку: A —
 * перше ребро (домовленість `domain/sideNaming.ts`).
 */
export function sidesOf(pts: Pt[], sideSegments?: Record<string, { start: Pt; end: Pt }>): Side[] {
  const area = signedArea(pts);
  const out: Side[] = [];
  const mk = (name: string, a: Pt, b: Pt): Side => {
    const dx = b.x - a.x; const dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1;
    // для контуру за годинниковою (у координатах y вниз area > 0) зовнішня нормаль — ліворуч від напрямку
    const s = area > 0 ? 1 : -1;
    return { name, a, b, len, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, n: { x: (dy / len) * s, y: (-dx / len) * s } };
  };
  if (sideSegments && Object.keys(sideSegments).length) {
    for (const [name, seg] of Object.entries(sideSegments)) out.push(mk(name, seg.start, seg.end));
    out.sort((p, q) => LETTERS.indexOf(p.name) - LETTERS.indexOf(q.name));
    return out;
  }
  for (let i = 0; i < pts.length; i += 1) out.push(mk(LETTERS[i] ?? String(i), pts[i], pts[(i + 1) % pts.length]));
  return out;
}

export function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) { const p = pts[i]; const q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
  return a / 2;
}

/** Вершина між сторонами X і Y (ім'я кута «XY» — кінець X = початок Y). */
export function cornerVertex(sides: Side[], cornerId: string): Pt | undefined {
  if (cornerId.length < 2) return undefined;
  const first = sides.find((s) => s.name === cornerId[0]);
  const second = sides.find((s) => s.name === cornerId[1]);
  if (first && second && Math.hypot(first.b.x - second.a.x, first.b.y - second.a.y) < 1) return first.b;
  if (first && second && Math.hypot(second.b.x - first.a.x, second.b.y - first.a.y) < 1) return second.b;
  return first?.b ?? second?.a;
}

/** Контур зі скругленими кутами (радіус із `corners`), для картинки. */
export function roundedContour(pts: Pt[], sides: Side[], corners: Record<string, { type?: string; radius?: number }> | undefined): Pt[] {
  if (!corners || !Object.keys(corners).length) return pts;
  const radiusAt = new Map<number, number>();
  for (const [id, c] of Object.entries(corners)) {
    if (c?.type !== 'radius' || !c.radius) continue;
    const v = cornerVertex(sides, id); if (!v) continue;
    const idx = pts.findIndex((p) => Math.hypot(p.x - v.x, p.y - v.y) < 1);
    if (idx >= 0) radiusAt.set(idx, c.radius);
  }
  if (!radiusAt.size) return pts;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    const r = radiusAt.get(i);
    const p = pts[i];
    if (!r) { out.push(p); continue; }
    const prev = pts[(i - 1 + pts.length) % pts.length]; const next = pts[(i + 1) % pts.length];
    const u1 = unit(prev, p); const u2 = unit(p, next);
    const a = { x: p.x - u1.x * r, y: p.y - u1.y * r }; const b = { x: p.x + u2.x * r, y: p.y + u2.y * r };
    // дуга через квадратичну апроксимацію — 6 точок
    for (let k = 0; k <= 6; k += 1) {
      const t = k / 6;
      const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * p.x + t * t * b.x;
      const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * p.y + t * t * b.y;
      out.push({ x, y });
    }
  }
  return out;
}

const unit = (a: Pt, b: Pt): Pt => { const d = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };

export interface Hole {
  /** габарит у координатах парта */
  box: BBox;
  cx: number; cy: number;
  round: boolean;
  d: number;
  /** виріз деталі того самого розміру (тип, радіус кута) */
  cut?: SurfaceCutout;
  /** виріз під мийку — тягнеться з `sinks`, id `sink_cut_*` */
  isSink: boolean;
  pts: Pt[];
}

/** Отвори парта з класифікацією: мийка / прямокутний виріз / сантехніка Ø30–35 / кріплення ≤ Ø14. */
export function holesOf(part: DetailPart, detail: Detail | undefined, off: Pt): Hole[] {
  const cuts = Object.entries((detail?.geometry?.cutouts ?? {}) as Record<string, SurfaceCutout>);
  const raw = (part.nominalHoles ?? part.holes ?? []).filter((h) => h && h.length >= 3);
  return raw.map((h) => {
    const pts = h.map((q) => ({ x: q.x - off.x, y: q.y - off.y }));
    const box = bbox(pts);
    const round = Math.abs(box.w - box.h) < 2 && pts.length > 8;
    const hit = cuts.find(([, c]) => {
      const cw = c.shape === 'circle' ? (c.radius ?? 0) * 2 : (c.width ?? 0);
      const ch = c.shape === 'circle' ? (c.radius ?? 0) * 2 : (c.height ?? 0);
      return Math.abs(cw - box.w) < 2 && Math.abs(ch - box.h) < 2;
    });
    return { box, cx: box.minX + box.w / 2, cy: box.minY + box.h / 2, round, d: (box.w + box.h) / 2, cut: hit?.[1], isSink: Boolean(hit && hit[0].startsWith('sink_cut')), pts };
  });
}

export const isFastener = (h: Hole) => h.round && h.d <= 14;
export const isPlumbing = (h: Hole) => h.round && h.d > 14 && h.d <= 60;

/** «Круглий» масштаб 1:N, у який вміщається w×h мм деталі в areaW×areaH мм аркуша. */
export function fitScaleDen(w: number, h: number, areaW: number, areaH: number): number {
  const raw = Math.min(areaW / Math.max(1, w), areaH / Math.max(1, h));
  return SCALES.find((d) => 1 / d <= raw) ?? SCALES[SCALES.length - 1];
}

/** Ширина тексту, мм аркуша (Arial ≈ 0,52 висоти на символ; кирилиця трохи ширша). */
export const textW = (s: string, size: number) => s.length * size * 0.56;

/** Повернути точки на 90° (для опор, що «падають» униз від ребра). */
export function rotate90(pts: Pt[], cw = true): Pt[] {
  const r = pts.map((p) => (cw ? { x: -p.y, y: p.x } : { x: p.y, y: -p.x }));
  const b = bbox(r);
  return r.map((p) => ({ x: p.x - b.minX, y: p.y - b.minY }));
}

export function translate(pts: Pt[], dx: number, dy: number): Pt[] { return pts.map((p) => ({ x: p.x + dx, y: p.y + dy })); }

/** Точки прямокутника з центром c. */
export function rectPts(c: Pt, w: number, h: number): Pt[] {
  return [{ x: c.x - w / 2, y: c.y - h / 2 }, { x: c.x + w / 2, y: c.y - h / 2 }, { x: c.x + w / 2, y: c.y + h / 2 }, { x: c.x - w / 2, y: c.y + h / 2 }];
}

/** Профіль кромки сторони (пряме ім'я або через alias розрізаного парта). */
export function profileOfSide(detail: Detail | undefined, part: DetailPart, side: string): string | undefined {
  const ep = detail?.edgeProfiles ?? {};
  const direct = ep[side];
  if (typeof direct === 'string') return direct;
  if (direct && typeof direct === 'object') { const top = (direct as unknown as { top?: unknown }).top; if (typeof top === 'string') return top; }
  const alias = part.sideAliases?.[side];
  const v = alias ? ep[alias] : undefined;
  return typeof v === 'string' ? v : undefined;
}

/** Слот доповнення з id елемента: «prod_x/element:thickening_C/detail:main» → «thickening_C». */
export function slotOf(id: string): string {
  const m = /element:([^/]+)/.exec(id);
  return m ? m[1] : id;
}

export type AdditionKind = 'thickening' | 'fold' | 'leg' | 'wall_panel' | 'sink' | 'other';
export function additionKind(slot: string): AdditionKind {
  if (slot.startsWith('thickening')) return 'thickening';
  if (slot.startsWith('fold')) return 'fold';
  if (slot.startsWith('leg')) return 'leg';
  if (slot.startsWith('wall_panel')) return 'wall_panel';
  if (slot.startsWith('sink')) return 'sink';
  return 'other';
}

export function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]; const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Точка для назви деталі в тілі (ВН-6): центр габариту, якщо він усередині
 * контуру й не на вирізі; інакше — точка всередині від середини найдовшої
 * сторони, вільна від вирізів.
 */
export function labelPoint(pts: Pt[], sides: Side[], holes: Hole[], marginMm = 60, textWMm = 0): Pt {
  const b = bbox(pts);
  const freePt = (p: Pt) => pointInPoly(p, pts) && !holes.some((h) => p.x > h.box.minX - marginMm && p.x < h.box.maxX + marginMm && p.y > h.box.minY - marginMm && p.y < h.box.maxY + marginMm);
  // текст має ширину: перевіряємо і краї напису
  const free = (p: Pt) => freePt(p) && (!textWMm || (freePt({ x: p.x - textWMm / 2, y: p.y }) && freePt({ x: p.x + textWMm / 2, y: p.y })));
  const centre = { x: b.minX + b.w / 2, y: b.minY + b.h / 2 };
  if (free(centre)) return centre;
  const cands: Pt[] = [];
  for (const s of [...sides].sort((p, q) => q.len - p.len)) {
    for (const k of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const at = { x: s.a.x + (s.b.x - s.a.x) * k, y: s.a.y + (s.b.y - s.a.y) * k };
      for (const d of [180, 300, 120]) cands.push({ x: at.x - s.n.x * d, y: at.y - s.n.y * d });
    }
  }
  return cands.find(free) ?? cands.find((p) => pointInPoly(p, pts)) ?? centre;
}
