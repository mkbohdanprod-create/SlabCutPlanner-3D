/**
 * ОПЕРАЦІЇ НАД ЗАМІРОМ — те, що конструктор робить руками в AutoCAD, а
 * інструмент має робити нативно (07.09.2026, журнал №126). Кожна функція
 * чиста: приймає модель/точки, повертає нову модель/точки + провенанс.
 * Правила — `ПРАВИЛА_ОБРОБКИ_ЗАМІРУ_КОНСТРУКТОР.md`:
 *
 *   ЗК-11  дублет у куті → одна точка = перетин ліній (i−1,i) і (i+1,i+2);
 *          поріг 10–20 мм (у 81-1130988 дублети до 42 мм);
 *   ЗК-12  кути НЕ приводять до 90°;  ЗК-13 проміжні точки не чіпають;
 *   ЗК-14  контур стін лишається ВІДКРИТИМ;
 *   ЗК-15  розсипані примітиви зшивають із порогом ≈ 5 мм і ставлять closed;
 *   ЗК-10  увесь замір довертають так, щоб довга стіна лягла по осі
 *          (−0,135° у кейсі); по якому ребру — вибір людини;
 *   ЗК-17/30 панель — з 3D-контуру стіни: кінці обходу геть, дублети →
 *          перетин, замкнути; розетки з висотами і числом (ЗК-19, ЗК-24);
 *   ЗК-18  зсув −5,5 мм горизонтальних ребер — ГІПОТЕЗА, тому параметр;
 *   ЗК-54  нуль по висоті — верх корпусів; низ панелі = z − 43 (параметр);
 *   ЗК-32  переріз на висоті h — план як перетин площин стін з z = h;
 *   ЗК-22/33 карта хвилі стіни — сирі точки проти площини, з порогом;
 *   ЗК-25/34 горизонт по лазеру — кут кожної площини до лінії лазера;
 *   ЗК-31  провенанс: кожна оброблена вершина знає сиру.
 */
import {
  bboxOf, buildChains, chainLength, cornerAngles, classifyPolylines, fromUZ, toUZ,
  type MPoint, type MeasureChain, type MeasureModel, type MeasureSegment, type RawPoint, type WallPlane,
} from './leicaDxf';

// ── Геометрія ─────────────────────────────────────────────────────────

/** Перетин прямих (p1,p2) і (p3,p4) у XY; undefined — паралельні. */
export function lineIntersection(p1: MPoint, p2: MPoint, p3: MPoint, p4: MPoint): MPoint | undefined {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-9) return undefined;
  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y), z: p1.z };
}

const dxy = (a: MPoint, b: MPoint) => Math.hypot(a.x - b.x, a.y - b.y);

// ── ЗК-11: дублети в кутах ────────────────────────────────────────────

export interface Doublet {
  /** Індекс першої вершини кластера в контурі (i, i+1, … i+count−1). */
  i: number;
  /** Скільки вершин злиплось у куті: 2 — класичний дублет, 3 — триплет (81-1395178, Стінова 3). */
  count: number;
  /** Розмір кластера — найбільша відстань між його вершинами, мм. */
  distMm: number;
  /** Перетин продовжених ліній входу і виходу; undefined — паралельні (не замінюємо). */
  intersection?: MPoint;
  /** Δ від перетину до першої і останньої вершини кластера — щоб людина бачила, куди «стрибнув» кут. */
  deltaMm: [number, number];
}

/**
 * Кластери сусідніх вершин із кроком < `maxMm`, затиснуті між двома
 * довгими лініями, що сходяться під кутом (45…135°). Кут-перетин —
 * лінія входу (точка перед кластером → перша вершина) × лінія виходу
 * (остання вершина → точка після). Кінці відкритого контуру — не дублети
 * (нема чим продовжити).
 */
export function findDoublets(pts: MPoint[], maxMm = 20, closed = false): Doublet[] {
  const n = pts.length;
  const out: Doublet[] = [];
  if (n < 4) return out;
  const at = (k: number) => pts[((k % n) + n) % n];
  const gapShort = (k: number) => dxy(at(k), at(k + 1)) < maxMm && dxy(at(k), at(k + 1)) > 1e-9;
  const visited = new Set<number>();
  const lastStart = closed ? n : n - 1;
  for (let s = 0; s < lastStart; s += 1) {
    if (visited.has(s) || !gapShort(s)) continue;
    let e = s + 1;
    while (e - s < n - 2 && (closed || e < n - 1) && gapShort(e)) e += 1;
    for (let k = s; k <= e; k += 1) visited.add(((k % n) + n) % n);
    const count = e - s + 1;
    if (!closed && (s - 1 < 0 || e + 1 > n - 1)) continue;
    const p0 = at(s - 1); const a = at(s); const b = at(e); const p3 = at(e + 1);
    let span = 0;
    for (let k = s; k <= e; k += 1) for (let m = k + 1; m <= e; m += 1) span = Math.max(span, dxy(at(k), at(m)));
    // лінії входу/виходу мають бути довші за кластер — інакше це не кут, а крихта
    if (dxy(p0, a) <= Math.max(span, maxMm * 0.5) || dxy(b, p3) <= Math.max(span, maxMm * 0.5)) continue;
    // ЗК-13: проміжні точки на прямій стіні не чіпаємо — дублет лише там,
    // де лінії входу і виходу справді сходяться під кутом (45…135°)
    const ang = Math.abs(edgeAngleDeg(p0, a) - edgeAngleDeg(b, p3));
    const corner = ((ang % 180) + 180) % 180;
    if (corner < 45 || corner > 135) continue;
    const x = lineIntersection(p0, a, b, p3);
    out.push({ i: s, count, distMm: span, intersection: x, deltaMm: [x ? dxy(x, a) : NaN, x ? dxy(x, b) : NaN] });
  }
  return out;
}

export interface ProvenanceEntry {
  /** Індекс вершини в обробленому контурі. */
  index: number;
  /** Звідки: 'raw' — як прийшла; 'intersection' — перетин двох ліній замість кластера. */
  kind: 'raw' | 'intersection';
  /** Індекси сирих вершин, з яких народилась (одна або кластер дублета). */
  from: number[];
}

/** Замінити прийняті дублети на перетини. Індекси `accepted` — поле `i` з `findDoublets`. */
export function applyDoublets(pts: MPoint[], doublets: Doublet[], accepted?: Set<number>): { points: MPoint[]; provenance: ProvenanceEntry[]; replaced: number } {
  const n = pts.length;
  const owner = new Map<number, Doublet>(); // індекс вершини → кластер, якому вона належить
  for (const d of doublets) {
    if (!d.intersection || (accepted && !accepted.has(d.i))) continue;
    for (let k = 0; k < d.count; k += 1) owner.set((d.i + k) % n, d);
  }
  const points: MPoint[] = [];
  const provenance: ProvenanceEntry[] = [];
  const emitted = new Set<Doublet>();
  for (let i = 0; i < n; i += 1) {
    const d = owner.get(i);
    if (d) {
      if (emitted.has(d)) continue;
      emitted.add(d);
      points.push({ ...d.intersection!, z: pts[i].z });
      provenance.push({ index: points.length - 1, kind: 'intersection', from: Array.from({ length: d.count }, (_, k) => (d.i + k) % n) });
      continue;
    }
    points.push(pts[i]);
    provenance.push({ index: points.length - 1, kind: 'raw', from: [i] });
  }
  return { points, provenance, replaced: emitted.size };
}

// ── ЗК-15: зшивання розсипаних примітивів ─────────────────────────────

/**
 * Зшити відрізки шару з порогом (5 мм за замовчуванням) і поставити
 * `closed`, якщо кінці зійшлись. Це та сама `buildChains`, лише поріг
 * більший — тому ланцюги, які були «розсипані», стають одним контуром.
 */
export function stitchSegments(segments: MeasureSegment[], toleranceMm = 5): MeasureChain[] {
  return buildChains(segments, toleranceMm);
}

// ── ЗК-10: доворот по ребру ───────────────────────────────────────────

export function edgeAngleDeg(a: MPoint, b: MPoint): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** Індекс найдовшого ребра контуру. */
export function longestEdgeIndex(pts: MPoint[], closed = false): number {
  let best = 0; let bestLen = -1;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i += 1) {
    const l = dxy(pts[i], pts[(i + 1) % pts.length]);
    if (l > bestLen) { bestLen = l; best = i; }
  }
  return best;
}

/** Кут, на який треба довернути, щоб ребро лягло на найближчу вісь (0/90/180/270). */
export function rotationToAxisDeg(a: MPoint, b: MPoint): number {
  const ang = edgeAngleDeg(a, b);
  const target = Math.round(ang / 90) * 90;
  return target - ang;
}

export function rotatePoint(p: MPoint, deg: number, about: MPoint = { x: 0, y: 0 }): MPoint {
  const r = (deg * Math.PI) / 180; const c = Math.cos(r); const s = Math.sin(r);
  const dx = p.x - about.x; const dy = p.y - about.y;
  return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c, z: p.z };
}

/** Довернути ВСЮ модель на `deg` (ЗК-10: увесь замір, не один контур). */
export function rotateModel(model: MeasureModel, deg: number, about: MPoint = { x: 0, y: 0 }): MeasureModel {
  const rp = (p: MPoint) => rotatePoint(p, deg, about);
  const segments = model.segments.map((s) => ({
    ...s, a: rp(s.a), b: rp(s.b),
    arc: s.arc ? (() => { const c = rp({ x: s.arc.cx, y: s.arc.cy }); return { ...s.arc, cx: c.x, cy: c.y, startDeg: s.arc.startDeg + deg, endDeg: s.arc.endDeg + deg }; })() : undefined,
  }));
  const polylines = model.polylines.map((p) => ({ ...p, points: p.points.map(rp), role: 'other' as const, wallIndex: undefined }));
  const walls = classifyPolylines(polylines);
  const rawPoints: RawPoint[] = model.rawPoints.map((r) => ({ ...r, ...rp(r) }));
  const marks = model.marks.map((m) => ({ ...m, ...rp(m) }));
  const heights = model.heights.map((h) => { const q = rp(h); return { x: q.x, y: q.y, z: h.z }; });
  const laser = model.laser ? (() => { const points = model.laser.points.map(rp); return { ...model.laser, points }; })() : null;
  const all: MPoint[] = [];
  for (const s of segments) all.push(s.a, s.b);
  for (const r of rawPoints) all.push(r);
  return {
    ...model, segments, polylines, walls, rawPoints, marks, heights, laser,
    chains: buildChains(segments),
    bbox: all.length ? bboxOf(all) : model.bbox,
    ops: [...model.ops, `доворот ${deg.toFixed(3)}° (ЗК-10)`],
  };
}

// ── ЗК-22/33: карта хвилі стіни ───────────────────────────────────────

export interface WaveSample {
  raw: RawPoint;
  wallIndex: number;
  u: number;
  z: number;
  /** Відхилення від площини, мм; знак — по нормалі (+ у кімнату). */
  devMm: number;
}

/**
 * Сирі точки, що лежать біля площини стіни (ближче за `bandMm` і в межах
 * її u-діапазону), з відхиленням від площини. Поріг для кольору — у UI.
 */
export function wallWave(model: MeasureModel, bandMm = 60): WaveSample[] {
  const out: WaveSample[] = [];
  for (const r of model.rawPoints) {
    let best: WaveSample | undefined;
    for (const w of model.walls) {
      const dev = (r.x - w.origin.x) * w.normal.x + (r.y - w.origin.y) * w.normal.y;
      if (Math.abs(dev) > bandMm) continue;
      const uz = toUZ(r, w);
      if (uz.u < w.uMin - 20 || uz.u > w.uMax + 20) continue;
      if (uz.z < w.zMin - 20 || uz.z > w.zMax + 20) continue;
      if (!best || Math.abs(dev) < Math.abs(best.devMm)) best = { raw: r, wallIndex: w.index, u: uz.u, z: uz.z, devMm: dev };
    }
    if (best) out.push(best);
  }
  return out;
}

export function waveStats(samples: WaveSample[], thresholdMm = 10) {
  const abs = samples.map((s) => Math.abs(s.devMm));
  const over = abs.filter((d) => d > thresholdMm).length;
  return { count: samples.length, maxMm: abs.length ? Math.max(...abs) : 0, over, rmsMm: abs.length ? Math.sqrt(abs.reduce((a, b) => a + b * b, 0) / abs.length) : 0 };
}

// ── ЗК-25/34: горизонт по лазеру ──────────────────────────────────────

export interface LaserHorizon {
  zMean: number; spreadMm: number; pointCount: number;
  /** По кожній стіні: нахил сліду лазера в її площині, градуси і мм на метр. */
  perWall: Array<{ wallIndex: number; layer: string; points: number; tiltDeg: number; mmPerM: number; zAtU0: number }>;
}

export function laserHorizon(model: MeasureModel, bandMm = 40): LaserHorizon | null {
  if (!model.laser) return null;
  const perWall: LaserHorizon['perWall'] = [];
  for (const w of model.walls) {
    const near = model.laser.points.filter((p) => Math.abs((p.x - w.origin.x) * w.normal.x + (p.y - w.origin.y) * w.normal.y) < bandMm)
      .map((p) => toUZ(p, w)).filter((q) => q.u >= w.uMin - 50 && q.u <= w.uMax + 50);
    if (near.length < 2) continue;
    // лінійна регресія z(u)
    const n = near.length; let su = 0, sz = 0, suu = 0, suz = 0;
    for (const q of near) { su += q.u; sz += q.z; suu += q.u * q.u; suz += q.u * q.z; }
    const den = n * suu - su * su;
    const slope = Math.abs(den) < 1e-9 ? 0 : (n * suz - su * sz) / den;
    const b = (sz - slope * su) / n;
    perWall.push({ wallIndex: w.index, layer: w.layer, points: n, tiltDeg: (Math.atan(slope) * 180) / Math.PI, mmPerM: slope * 1000, zAtU0: b });
  }
  return { zMean: model.laser.zMean, spreadMm: model.laser.spreadMm, pointCount: model.laser.points.length, perWall };
}

// ── ЗК-32: переріз на висоті ──────────────────────────────────────────

/**
 * Перетин контуру стіни (u, z) з горизонталлю z = h → інтервали по u →
 * відрізки в XY. Незамкнений контур замикаємо для перетину (ЗК-56).
 */
export function sectionAtHeight(model: MeasureModel, hMm: number): MeasureSegment[] {
  const out: MeasureSegment[] = [];
  let seq = 0;
  for (const w of model.walls) {
    const c = w.contourUZ;
    if (c.length < 3) continue;
    const us: number[] = [];
    for (let i = 0; i < c.length; i += 1) {
      const a = c[i]; const b = c[(i + 1) % c.length];
      if (i === c.length - 1 && !w.contourClosed && Math.abs(a.u - b.u) + Math.abs(a.z - b.z) > 1e-6) {
        // замикання відкритого контуру — теж ребро
      }
      if ((a.z <= hMm && b.z > hMm) || (b.z <= hMm && a.z > hMm)) {
        const t = (hMm - a.z) / (b.z - a.z);
        us.push(a.u + t * (b.u - a.u));
      }
    }
    us.sort((p, q) => p - q);
    for (let k = 0; k + 1 < us.length; k += 2) {
      seq += 1;
      out.push({ id: `sec${seq}`, layer: `Переріз z=${hMm}`, a: fromUZ({ u: us[k], z: hMm }, w), b: fromUZ({ u: us[k + 1], z: hMm }, w) });
    }
  }
  return out;
}

// ── ЗК-17/30/54: панель зі стіни ──────────────────────────────────────

export interface PanelFromWallOptions {
  /** Нуль по висоті: 'cabinet-top' — верх корпусів (ЗК-54), 'floor' — підлога, 'custom' — своє число zZero. */
  zeroMode: 'cabinet-top' | 'floor' | 'custom';
  /** Низ панелі над нулем заміру, мм (43 = камінь 20 + фанера 20 + шов, ЗК-54). */
  baseMm: number;
  zZeroMm?: number;
  /** Поріг дублетів у кутах розгортки, мм (ЗК-11). */
  doubletMm: number;
  /** Викинути кінці обходу, що лежать посеред нижнього ребра (ЗК-30). */
  dropTraversalEnds: boolean;
  /** ЗК-18: зсув горизонтальних ребер по z, мм (ГІПОТЕЗА, 0 = вимкнено). */
  horizontalShiftMm: number;
}

/** Дублети в розгортці стіни більші, ніж на плані (до 75 мм у 81-1395178, Стінова 3) — тому 100. */
export const PANEL_DEFAULTS: PanelFromWallOptions = { zeroMode: 'cabinet-top', baseMm: 43, doubletMm: 100, dropTraversalEnds: true, horizontalShiftMm: 0 };

export interface PanelFromWall {
  wallIndex: number;
  layer: string;
  /** Полігон панелі в координатах панелі: u від лівого краю, v від НИЗУ панелі. */
  polygon: Array<{ u: number; v: number }>;
  widthMm: number;
  heightMm: number;
  /** Розетки/вирізи в координатах панелі (від лівого краю і від низу). */
  sockets: Array<{ uMin: number; uMax: number; vMin: number; vMax: number; wMm: number; hMm: number; closed: boolean }>;
  socketCount: number;
  /** Кути полігона, градуси — щоб бачити, де не 90 (ЗК-12/38). */
  angles: Array<number | undefined>;
  doubletsReplaced: number;
  droppedEnds: number;
  provenance: ProvenanceEntry[];
  /** Що саме взято за низ панелі у z заміру. */
  baseZ: number;
  /** u лівого краю панелі в координатах розгортки стіни — щоб покласти полігон назад на стіну. */
  uOffset: number;
}

export function panelFromWall(wall: WallPlane, opts: PanelFromWallOptions = PANEL_DEFAULTS): PanelFromWall {
  const baseZ = opts.zeroMode === 'custom' ? (opts.zZeroMm ?? 0) + opts.baseMm : opts.zeroMode === 'floor' ? opts.baseMm : opts.baseMm;
  let pts: MPoint[] = wall.contourUZ.map((q) => ({ x: q.u, y: q.z }));
  let droppedEnds = 0;
  if (opts.dropTraversalEnds && !wall.contourClosed && pts.length >= 5) {
    // ЗК-30: обхід починається і закінчується посеред одного ребра (81-1395178:
    // (367,1) … (364,1) на нижньому). Обидва кінці на одному ребрі, всередині
    // діапазону → їх геть, замикання піде вздовж того самого ребра.
    const first = pts[0]; const last = pts[pts.length - 1];
    const onEdge = (p: MPoint) => {
      if (Math.abs(p.y - wall.zMin) < 15 && p.x > wall.uMin + 30 && p.x < wall.uMax - 30) return 'bottom';
      if (Math.abs(p.y - wall.zMax) < 15 && p.x > wall.uMin + 30 && p.x < wall.uMax - 30) return 'top';
      if (Math.abs(p.x - wall.uMin) < 15 && p.y > wall.zMin + 30 && p.y < wall.zMax - 30) return 'left';
      if (Math.abs(p.x - wall.uMax) < 15 && p.y > wall.zMin + 30 && p.y < wall.zMax - 30) return 'right';
      return null;
    };
    const e1 = onEdge(first); const e2 = onEdge(last);
    if (e1 && e1 === e2) { pts = pts.slice(1, -1); droppedEnds = 2; }
  }
  const doublets = findDoublets(pts, opts.doubletMm, true);
  const applied = applyDoublets(pts, doublets);
  let poly = applied.points;
  if (opts.horizontalShiftMm) {
    // ЗК-18: горизонтальні ребра (сусідні точки з майже рівним z) зсунути по z
    const shifted = poly.map((p) => ({ ...p }));
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]; const b = poly[(i + 1) % poly.length];
      if (Math.abs(a.y - b.y) < 2 && Math.abs(a.x - b.x) > 50) { shifted[i].y += opts.horizontalShiftMm; shifted[(i + 1) % poly.length].y += opts.horizontalShiftMm; }
    }
    poly = shifted;
  }
  const uMin = Math.min(...poly.map((p) => p.x));
  const polygon = poly.map((p) => ({ u: p.x - uMin, v: p.y - baseZ }));
  const vMax = Math.max(...polygon.map((p) => p.v));
  const sockets = wall.sockets.map((s) => ({
    uMin: s.uMin - uMin, uMax: s.uMax - uMin, vMin: s.zMin - baseZ, vMax: s.zMax - baseZ,
    wMm: s.uMax - s.uMin, hMm: s.zMax - s.zMin, closed: s.closed,
  }));
  return {
    wallIndex: wall.index, layer: wall.layer, polygon,
    widthMm: Math.max(...polygon.map((p) => p.u)), heightMm: vMax - Math.min(...polygon.map((p) => p.v)),
    sockets, socketCount: sockets.length,
    angles: cornerAngles(poly, true), doubletsReplaced: applied.replaced, droppedEnds, provenance: applied.provenance, baseZ, uOffset: uMin,
  };
}

// ── Композиція: обробити план ─────────────────────────────────────────

export interface ProcessedContour {
  sourceChainId: string;
  layer: string;
  points: MPoint[];
  closed: boolean;
  lengthMm: number;
  angles: Array<number | undefined>;
  doublets: Doublet[];
  provenance: ProvenanceEntry[];
  replaced: number;
}

/** Контур плану після дублетів (ЗК-11); контур лишається відкритим (ЗК-14). */
export function processPlanContour(chain: MeasureChain, doubletMm = 15, accepted?: Set<number>): ProcessedContour {
  const doublets = findDoublets(chain.points, doubletMm, chain.closed);
  const applied = applyDoublets(chain.points, doublets, accepted);
  return {
    sourceChainId: chain.id, layer: chain.layer, points: applied.points, closed: chain.closed,
    lengthMm: chainLength(applied.points, chain.closed), angles: cornerAngles(applied.points, chain.closed),
    doublets, provenance: applied.provenance, replaced: applied.replaced,
  };
}

/** Зіставити вершини обробленого контуру з сирими точками (ЗК-53: «вершина = сира точка»). */
export function matchRaw(points: MPoint[], raw: RawPoint[], tolMm = 0.05): Array<{ index: number; raw?: RawPoint; distMm: number }> {
  return points.map((p, index) => {
    let best: RawPoint | undefined; let bd = Infinity;
    for (const r of raw) { const d = dxy(p, r); if (d < bd) { bd = d; best = r; } }
    return { index, raw: bd <= tolMm ? best : undefined, distMm: bd };
  });
}

// ── ЗК-27: 2D як звірка ───────────────────────────────────────────────

/**
 * 2D-файл — точна проєкція 3D (ЗК-0: 0,0000 мм). Для кожної полілінії
 * плану з 3D шукаємо у 2D полілінію з тим самим числом вершин і
 * найменшою сумою відстаней; повертаємо найбільше відхилення.
 */
export function projectionCheck(m3: MeasureModel, m2: MeasureModel): { polylines: number; matched: number; maxDeltaMm: number } {
  const plan3 = m3.polylines.filter((p) => p.role === 'plan');
  let matched = 0; let maxDelta = 0;
  for (const p of plan3) {
    let best = Infinity;
    for (const q of m2.polylines) {
      if (q.points.length !== p.points.length) continue;
      let worst = 0;
      for (let i = 0; i < p.points.length; i += 1) worst = Math.max(worst, dxy(p.points[i], q.points[i]));
      best = Math.min(best, worst);
    }
    if (best < 50) { matched += 1; maxDelta = Math.max(maxDelta, best); }
  }
  return { polylines: plan3.length, matched, maxDeltaMm: maxDelta };
}

// ── ЗК-15: де саме розрив і що дасть поріг ────────────────────────────

export interface ChainGap {
  /** Кінець одного ланцюга і найближчий до нього кінець ІНШОГО. */
  a: MPoint; b: MPoint;
  distMm: number;
  fromChain: string; toChain: string;
}

/**
 * Зазори між кінцями різних ланцюгів — рівно те, що закриває поріг
 * зшивання. Потрібні, щоб людина не гадала число: у 81-1430086 зазори
 * лягають двома купками — 2,4…4,8 мм (шість) і 12,3…42,8 мм (решта), і
 * поріг 5 зшиває першу купку, поріг 30 — другу.
 *
 * Для кожного кінця беремо ОДИН найближчий чужий кінець; пару (A→B і
 * B→A) не дублюємо.
 */
export function chainGaps(chains: MeasureChain[], maxMm = 500): ChainGap[] {
  type End = { chain: string; p: MPoint };
  const ends: End[] = [];
  for (const c of chains) {
    if (c.closed || c.points.length < 2) continue;
    ends.push({ chain: c.id, p: c.points[0] });
    ends.push({ chain: c.id, p: c.points[c.points.length - 1] });
  }
  const out: ChainGap[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < ends.length; i += 1) {
    let best: { j: number; d: number } | null = null;
    for (let j = 0; j < ends.length; j += 1) {
      if (i === j || ends[i].chain === ends[j].chain) continue;
      const d = dxy(ends[i].p, ends[j].p);
      if (d > maxMm) continue;
      if (!best || d < best.d) best = { j, d };
    }
    if (!best) continue;
    const key = [i, best.j].sort((x, y) => x - y).join('-');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ a: ends[i].p, b: ends[best.j].p, distMm: best.d, fromChain: ends[i].chain, toChain: ends[best.j].chain });
  }
  return out.sort((x, y) => x.distMm - y.distMm);
}

/** Скільки буде ланцюгів і замкнених при такому порозі — БЕЗ застосування. */
export function stitchStats(segments: MeasureSegment[], toleranceMm: number): { chains: number; closed: number } {
  const c = buildChains(segments, toleranceMm);
  return { chains: c.length, closed: c.filter((x) => x.closed).length };
}

// ── ЗК-16 / МТ-1: мітки замірника «М» і «В» ───────────────────────────

/**
 * МІТКИ МОНТАЖНИКА — НЕ ГЕОМЕТРІЯ (07.09.2026, №130, слова власника:
 * «оце М і В це так монтажники позначають де мийка і де варочна, їх мож
 * ігнорувати»).
 *
 * Літери намальовані відрізками просто на плані, тому досі вони йшли в
 * геометрію нарівні зі стінами. Наслідок був не косметичний: у кейсі
 * 81-1430086 **шість із дев'ятнадцяти «розривів» лежали ВСЕРЕДИНІ літер**
 * (4,3 · 4,5 · 4,6 · 4,6 · 4,8 · 53,5 мм), і поріг зшивання 5 мм чесно
 * зшивав… букви. Людина натискала кнопку, лічильник мінявся, стіни
 * лишались розсипаними.
 *
 * Ознака літери — не форма (їх багато), а масштаб і самотність:
 *   · кластер ланцюгів, зчеплених між собою ближче ніж `clusterMm`;
 *   · весь кластер уміщається в коробку `maxBoxMm` (літера ≈ 200–300 мм);
 *   · він або складається з кількох штрихів, або це одна складена
 *     полілінія (у 81-1395178 гліфи приходили полілініями на 5–6 точок);
 *   · і він відірваний від довгої геометрії — найближча стіна далі
 *     ніж `clusterMm`.
 * Одиночний прямий відрізок (перегородка тумби 312 мм) під це не
 * підпадає — у нього дві точки і він сам по собі.
 */
export function detectMarkChains(chains: MeasureChain[], opts: { clusterMm?: number; maxBoxMm?: number; longMm?: number } = {}): Set<string> {
  const clusterMm = opts.clusterMm ?? 60;
  const maxBoxMm = opts.maxBoxMm ?? 400;
  const longMm = opts.longMm ?? 1000;
  const small = chains.filter((c) => c.lengthMm < maxBoxMm * 4 && !c.closed);
  const near = (a: MeasureChain, b: MeasureChain) => {
    let best = Infinity;
    for (const p of [a.points[0], a.points[a.points.length - 1]]) {
      for (const q of [b.points[0], b.points[b.points.length - 1]]) best = Math.min(best, dxy(p, q));
    }
    return best;
  };
  // кластери за близькістю кінців
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x); if (!p || p === x) return x; const r = find(p); parent.set(x, r); return r; };
  for (const c of small) parent.set(c.id, c.id);
  for (let i = 0; i < small.length; i += 1) {
    for (let j = i + 1; j < small.length; j += 1) {
      if (near(small[i], small[j]) <= clusterMm) parent.set(find(small[i].id), find(small[j].id));
    }
  }
  const groups = new Map<string, MeasureChain[]>();
  for (const c of small) { const r = find(c.id); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(c); }
  const longChains = chains.filter((c) => c.lengthMm >= longMm);
  const out = new Set<string>();
  for (const group of groups.values()) {
    const pts = group.flatMap((c) => c.points);
    const b = bboxOf(pts);
    if (b.maxX - b.minX > maxBoxMm || b.maxY - b.minY > maxBoxMm) continue;
    const strokes = group.length;
    const folded = group.some((c) => c.points.length >= 4);
    if (strokes < 2 && !folded) continue;               // одинокий прямий відрізок — геометрія
    const attached = longChains.some((L) => group.some((c) => near(c, L) <= clusterMm));
    if (attached) continue;                              // прилипло до стіни — не мітка
    for (const c of group) out.add(c.id);
  }
  return out;
}

/** Ідентифікатори відрізків, з яких складені мітки — щоб відняти їх від геометрії. */
export function markSegmentIds(chains: MeasureChain[], markChainIds: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const c of chains) if (markChainIds.has(c.id)) for (const s of c.segmentIds) out.add(s);
  return out;
}
