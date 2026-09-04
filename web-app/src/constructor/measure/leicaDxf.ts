/**
 * ЧИТАННЯ ЗАМІРУ З ПРИЛАДУ (Leica iCON iCS50 / vPen) — 04.09.2026.
 *
 * Окремий модуль, НЕ правка `parsers/dxf/parser.ts` (інваріант 2.48):
 * замір — сирі дані з поля, і в них інша структура, ніж у кресленні для
 * різання. Правила — з `06_ОБУЧАЛОЧКА/ПРАВИЛА_ФАЙЛІВ_ЗАМІРУ.md`, кожна
 * позначена кодом там, де вона застосована:
 *
 *   ВК-1   контури відкриті — прапорець `closed` НЕ є ознакою геометрії;
 *   РМ-1   єдиний закритий контур — рамка кадру на шарі `Фреймы`, не деталь;
 *   ЗМ-Т3  файл несе дублі геометрії, зсунуті по одній площині на «вид» —
 *          дедуплікуємо за рамками;
 *   ЗМ-Т8  `Level` (трикутник 50×50) і `MchOrg` (хрестик у точці стояння)
 *          — службові маркери, у геометрію не йдуть;
 *   ЗМ-Т1  у типовому замірі шари заповнені: `External`/`Internal`/
 *          `Стінова N`/`Layer 0`; числові шари «2», «3» — площини (ЗМ-Т7);
 *   ЗМ-Т9  `ZLines` — вертикальні відрізки = карта висот;
 *   МТ-1   мітки — одна-дві літери; показуємо як є, не розшифровуємо (МТ-2);
 *   ФР-1   основний вхід — 2D-файл; з 3D беремо лише блоки точок як
 *          довідку (INSERT ігноруємо у першій версії).
 *
 * Що модуль НЕ робить (НЕ-3): не видає зшитий контур як затверджений.
 * Він віддає ланцюги з кутами, а рішення — людині у вкладці «Зведення».
 */

export interface MPoint { x: number; y: number; z?: number }

export interface MeasureSegment {
  id: string;
  layer: string;
  a: MPoint;
  b: MPoint;
  /** Дуга: центр і радіус, щоб намалювати; для довжин беремо хорду. */
  arc?: { cx: number; cy: number; r: number; startDeg: number; endDeg: number };
}

export interface MeasureMark {
  text: string;
  x: number;
  y: number;
  layer: string;
}

export interface MeasureChain {
  id: string;
  layer: string;
  points: MPoint[];
  closed: boolean;
  lengthMm: number;
  /** Кути в вершинах між сусідніми ребрами, градуси; для відкритого ланцюга крайні — undefined. */
  cornerAngles: Array<number | undefined>;
}

export interface MeasureModel {
  fileName: string;
  /** Формат, який упізнали: пара 2D, «External/Internal», один файл із ZLines. */
  variant: 'polylines' | 'external-internal' | 'zlines' | 'unknown';
  layers: string[];
  segments: MeasureSegment[];
  marks: MeasureMark[];
  /** Карта висот з `ZLines`: точка і відхилення Z, мм. */
  heights: Array<{ x: number; y: number; z: number }>;
  chains: MeasureChain[];
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  /** Що відкинули і чому — щоб людина бачила, а не гадала. */
  dropped: Array<{ layer: string; count: number; reason: string }>;
  /** Скільки рамок кадру знайшли (ЗМ-Т3) і скільки дублів прибрали. */
  frames: number;
  dedupedSegments: number;
}

/** Службові шари, які в геометрію не йдуть (РМ-1, ЗМ-Т8, ТМ-1). */
const SERVICE_LAYERS = new Set([
  'Фреймы', 'Level', 'MchOrg', 'Control Points', 'POINT-NAME', 'POINT-ELEV',
  'Сырые измерения', 'Лінія лазера', 'Текст',
]);

/** Шар карти висот (ЗМ-Т9). */
const ZLINES_LAYER = 'ZLines';

// ── Читання пар DXF ───────────────────────────────────────────────────

interface Pair { code: number; value: string }

function readPairs(text: string): Pair[] {
  const lines = text.split(/\r?\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: lines[i + 1].trim() });
  }
  return pairs;
}

interface RawEntity {
  type: string;
  layer: string;
  props: Array<[number, string]>;
}

function readEntities(pairs: Pair[]): RawEntity[] {
  const entities: RawEntity[] = [];
  let inEntities = false;
  let current: RawEntity | null = null;
  for (let i = 0; i < pairs.length; i += 1) {
    const { code, value } = pairs[i];
    if (code === 2 && value === 'ENTITIES' && pairs[i - 1]?.code === 0 && pairs[i - 1]?.value === 'SECTION') {
      inEntities = true;
      continue;
    }
    if (!inEntities) continue;
    if (code === 0) {
      if (value === 'ENDSEC') break;
      if (current) entities.push(current);
      current = { type: value, layer: '0', props: [] };
      continue;
    }
    if (!current) continue;
    if (code === 8) current.layer = value;
    current.props.push([code, value]);
  }
  if (current) entities.push(current);
  return entities;
}

function num(v: string): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// ── Сутності → відрізки ───────────────────────────────────────────────

interface Parsed {
  segments: MeasureSegment[];
  marks: MeasureMark[];
  heights: Array<{ x: number; y: number; z: number }>;
  frames: MPoint[][];
  layers: Set<string>;
  dropped: Map<string, { count: number; reason: string }>;
  hasLwPolyline: boolean;
}

function parseEntities(entities: RawEntity[]): Parsed {
  const out: Parsed = { segments: [], marks: [], heights: [], frames: [], layers: new Set(), dropped: new Map(), hasLwPolyline: false };
  let seq = 0;
  const drop = (layer: string, reason: string) => {
    const cur = out.dropped.get(layer) ?? { count: 0, reason };
    cur.count += 1;
    out.dropped.set(layer, cur);
  };
  const push = (layer: string, a: MPoint, b: MPoint, arc?: MeasureSegment['arc']) => {
    seq += 1;
    out.segments.push({ id: `s${seq}`, layer, a, b, arc });
    out.layers.add(layer);
  };

  // POLYLINE/VERTEX (3D-файл) — збираємо вершини між POLYLINE і SEQEND
  let poly: { layer: string; pts: MPoint[]; closed: boolean } | null = null;

  for (const e of entities) {
    const layer = e.layer;
    const get = (code: number): string | undefined => e.props.find(([c]) => c === code)?.[1];

    if (e.type === 'VERTEX' && poly) {
      poly.pts.push({ x: num(get(10) ?? '0'), y: num(get(20) ?? '0'), z: num(get(30) ?? '0') });
      continue;
    }
    if (e.type === 'SEQEND' && poly) {
      emitPolyline(poly.layer, poly.pts, poly.closed);
      poly = null;
      continue;
    }
    if (e.type === 'POLYLINE') {
      poly = { layer, pts: [], closed: (num(get(70) ?? '0') & 1) === 1 };
      continue;
    }

    if (e.type === 'LWPOLYLINE') {
      out.hasLwPolyline = true;
      const pts: MPoint[] = [];
      let x: number | null = null;
      for (const [c, v] of e.props) {
        if (c === 10) x = num(v);
        else if (c === 20 && x !== null) { pts.push({ x, y: num(v) }); x = null; }
      }
      const closed = (num(get(70) ?? '0') & 1) === 1;
      emitPolyline(layer, pts, closed);
      continue;
    }

    if (e.type === 'LINE') {
      const a = { x: num(get(10) ?? '0'), y: num(get(20) ?? '0'), z: num(get(30) ?? '0') };
      const b = { x: num(get(11) ?? '0'), y: num(get(21) ?? '0'), z: num(get(31) ?? '0') };
      // ЗМ-Т9: карта висот — вертикальні відрізки (та сама x,y, різні z)
      if (layer === ZLINES_LAYER || (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && (a.z ?? 0) !== (b.z ?? 0))) {
        out.heights.push({ x: a.x, y: a.y, z: (a.z ?? 0) - (b.z ?? 0) });
        out.layers.add(layer);
        continue;
      }
      if (SERVICE_LAYERS.has(layer)) { drop(layer, 'службовий шар (РМ-1, ЗМ-Т8)'); continue; }
      push(layer, a, b);
      continue;
    }

    if (e.type === 'ARC') {
      if (SERVICE_LAYERS.has(layer)) { drop(layer, 'службовий шар'); continue; }
      const cx = num(get(10) ?? '0'); const cy = num(get(20) ?? '0'); const r = num(get(40) ?? '0');
      const s = num(get(50) ?? '0'); const t = num(get(51) ?? '0');
      const a = { x: cx + r * Math.cos((s * Math.PI) / 180), y: cy + r * Math.sin((s * Math.PI) / 180) };
      const b = { x: cx + r * Math.cos((t * Math.PI) / 180), y: cy + r * Math.sin((t * Math.PI) / 180) };
      push(layer, a, b, { cx, cy, r, startDeg: s, endDeg: t });
      continue;
    }

    if (e.type === 'TEXT' || e.type === 'MTEXT') {
      const text = (get(1) ?? '').trim();
      if (!text) continue;
      out.marks.push({ text, x: num(get(10) ?? '0'), y: num(get(20) ?? '0'), layer });
      continue;
    }

    if (e.type === 'INSERT') { drop(layer, 'блоки точок 3D-файла — довідка, не геометрія (ФР-1, ТМ-1)'); continue; }
    if (e.type === 'POINT') { drop(layer, 'точка без ребра'); continue; }
  }
  if (poly) emitPolyline(poly.layer, poly.pts, poly.closed);

  function emitPolyline(layer: string, pts: MPoint[], closed: boolean) {
    if (pts.length < 2) return;
    // РМ-1: рамка кадру — закритий 4-кутник на шарі «Фреймы». Запам'ятовуємо
    // для дедуплікації (ЗМ-Т3), у геометрію не пускаємо.
    if (layer === 'Фреймы') {
      if (pts.length >= 4) out.frames.push(pts);
      drop(layer, 'рамка кадру зйомки (РМ-1)');
      return;
    }
    if (SERVICE_LAYERS.has(layer)) { drop(layer, 'службовий шар (ЗМ-Т8)'); return; }
    for (let i = 0; i + 1 < pts.length; i += 1) push(layer, pts[i], pts[i + 1]);
    if (closed && pts.length > 2) push(layer, pts[pts.length - 1], pts[0]);
  }

  return out;
}

// ── Дедуплікація за рамками (ЗМ-Т3) ───────────────────────────────────

function bboxOf(pts: MPoint[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { minX, minY, maxX, maxY };
}

/**
 * У файлі кожна «площина» зйомки експортована окремим видом: ті самі
 * контури повторені зі зсувом по Y. Лишаємо геометрію всередині ПЕРШОЇ
 * рамки (за площею), решту, що лежить у інших рамках, відкидаємо.
 */
function dedupeByFrames(segments: MeasureSegment[], frames: MPoint[][]): { kept: MeasureSegment[]; removed: number } {
  if (frames.length < 2) return { kept: segments, removed: 0 };
  const boxes = frames.map(bboxOf).sort((p, q) => (q.maxX - q.minX) * (q.maxY - q.minY) - (p.maxX - p.minX) * (p.maxY - p.minY));
  const main = boxes[0];
  const inside = (p: MPoint, b: typeof main) => p.x >= b.minX - 1 && p.x <= b.maxX + 1 && p.y >= b.minY - 1 && p.y <= b.maxY + 1;
  const kept: MeasureSegment[] = [];
  let removed = 0;
  for (const s of segments) {
    const inMain = inside(s.a, main) && inside(s.b, main);
    const inOther = boxes.slice(1).some((b) => inside(s.a, b) && inside(s.b, b));
    if (!inMain && inOther) { removed += 1; continue; }
    kept.push(s);
  }
  return { kept, removed };
}

// ── Ланцюги і кути ────────────────────────────────────────────────────

function dist(a: MPoint, b: MPoint) { return Math.hypot(a.x - b.x, a.y - b.y); }

/**
 * Зшиваємо відрізки одного шару в ланцюги за близькістю кінців. Допуск —
 * 1,5 мм (радіус щупа 2,5 плюс шум). НЕ-3: результат — чернетка, не
 * затверджений контур.
 */
export function buildChains(segments: MeasureSegment[], toleranceMm = 1.5): MeasureChain[] {
  const byLayer = new Map<string, MeasureSegment[]>();
  for (const s of segments) {
    if (!byLayer.has(s.layer)) byLayer.set(s.layer, []);
    byLayer.get(s.layer)!.push(s);
  }
  const chains: MeasureChain[] = [];
  let seq = 0;
  for (const [layer, segs] of byLayer) {
    const used = new Set<string>();
    for (const start of segs) {
      if (used.has(start.id)) continue;
      used.add(start.id);
      const pts: MPoint[] = [start.a, start.b];
      let grown = true;
      while (grown) {
        grown = false;
        for (const s of segs) {
          if (used.has(s.id)) continue;
          const head = pts[0]; const tail = pts[pts.length - 1];
          if (dist(tail, s.a) <= toleranceMm) { pts.push(s.b); used.add(s.id); grown = true; }
          else if (dist(tail, s.b) <= toleranceMm) { pts.push(s.a); used.add(s.id); grown = true; }
          else if (dist(head, s.b) <= toleranceMm) { pts.unshift(s.a); used.add(s.id); grown = true; }
          else if (dist(head, s.a) <= toleranceMm) { pts.unshift(s.b); used.add(s.id); grown = true; }
        }
      }
      const closed = pts.length > 3 && dist(pts[0], pts[pts.length - 1]) <= toleranceMm;
      if (closed) pts.pop();
      seq += 1;
      chains.push({ id: `c${seq}`, layer, points: pts, closed, lengthMm: chainLength(pts, closed), cornerAngles: cornerAngles(pts, closed) });
    }
  }
  // Довші ланцюги — першими: стіни зазвичай найдовші. Крихти коротші за
  // 5 мм (сліди щупа R2,5, дублі точок) у таблицю не йдуть — це шум.
  return chains.filter((c) => c.lengthMm >= 5).sort((p, q) => q.lengthMm - p.lengthMm);
}

function chainLength(pts: MPoint[], closed: boolean): number {
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i += 1) len += dist(pts[i], pts[i + 1]);
  if (closed && pts.length > 2) len += dist(pts[pts.length - 1], pts[0]);
  return len;
}

/** Кут у вершині між двома сусідніми ребрами, градуси (180 = пряма). */
export function cornerAngles(pts: MPoint[], closed: boolean): Array<number | undefined> {
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = closed ? pts[(i - 1 + n) % n] : pts[i - 1];
    const next = closed ? pts[(i + 1) % n] : pts[i + 1];
    if (!prev || !next) return undefined;
    const v1 = { x: prev.x - p.x, y: prev.y - p.y };
    const v2 = { x: next.x - p.x, y: next.y - p.y };
    const l1 = Math.hypot(v1.x, v1.y); const l2 = Math.hypot(v2.x, v2.y);
    if (l1 < 1e-6 || l2 < 1e-6) return undefined;
    const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (l1 * l2)));
    return (Math.acos(cos) * 180) / Math.PI;
  });
}

// ── Головний вхід ─────────────────────────────────────────────────────

export function parseLeicaDxf(text: string, fileName = 'замір.dxf'): MeasureModel {
  const entities = readEntities(readPairs(text));
  const parsed = parseEntities(entities);
  const { kept, removed } = dedupeByFrames(parsed.segments, parsed.frames);

  const layers = [...parsed.layers].sort();
  const variant: MeasureModel['variant'] = parsed.heights.length > 0 && !parsed.hasLwPolyline
    ? 'zlines'
    : layers.some((l) => l === 'External' || l === 'Internal')
      ? 'external-internal'
      : parsed.hasLwPolyline
        ? 'polylines'
        : 'unknown';

  const all: MPoint[] = [];
  for (const s of kept) { all.push(s.a, s.b); }
  for (const h of parsed.heights) all.push({ x: h.x, y: h.y });
  const bbox = all.length ? bboxOf(all) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  return {
    fileName,
    variant,
    layers,
    segments: kept,
    marks: parsed.marks.filter((m) => m.layer !== 'Фреймы'),
    heights: parsed.heights,
    chains: buildChains(kept),
    bbox,
    dropped: [...parsed.dropped].map(([layer, d]) => ({ layer, count: d.count, reason: d.reason })),
    frames: parsed.frames.length,
    dedupedSegments: removed,
  };
}

/** Головний закритий контур приміщення — найдовший закритий ланцюг на стінових шарах. */
export function roomContourOf(model: MeasureModel): MeasureChain | undefined {
  const wallish = (layer: string) => layer === 'External' || /^Стінова/i.test(layer) || layer === 'Layer 0' || layer === '0';
  return model.chains.find((c) => c.closed && wallish(c.layer)) ?? model.chains.find((c) => c.closed);
}
