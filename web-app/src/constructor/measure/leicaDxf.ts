/**
 * ЧИТАННЯ ЗАМІРУ З ПРИЛАДУ (Leica DISTO D2G + iCONtrades) — 04.09.2026,
 * переписано під 3D 07.09.2026 (журнал №126).
 *
 * Окремий модуль, НЕ правка `parsers/dxf/parser.ts` (інваріант 2.48):
 * замір — сирі дані з поля, і в них інша структура, ніж у кресленні для
 * різання. Правила — з `06_ОБУЧАЛОЧКА/ПРАВИЛА_ФАЙЛІВ_ЗАМІРУ.md` (ЗМ-Т) і
 * `ПРАВИЛА_ОБРОБКИ_ЗАМІРУ_КОНСТРУКТОР.md` (ЗК), кожна позначена кодом там,
 * де вона застосована:
 *
 *   ЗК-0/ЗМ-Т21  2D-файл — точна проєкція 3D; читаємо 3D як головний вхід,
 *                2D — як звірку (ЗК-27);
 *   ЗК-21/51     три сім'ї об'єктів: план на `Layer 0` (z = 0), площини
 *                стін `Стінова N` (вертикальні 3D-полілінії), сирі точки;
 *                назви шарів — шаблон застосунку, вміст важливіший за назву;
 *   ЗК-52        сира точка = `INSERT` блока `RAW-POINT` (+ `TEXT` RAW_P_nnn і
 *                «28,2 mm» у старішому форматі) + вертикальна `LINE` до z = 0,
 *                яку відкидаємо як ребро; у AC1018 сирі точки — `POINT`;
 *   ЗК-24        розетки — закриті полілінії в площині стіни зі справжнім z;
 *   ЗК-25        `Лінія лазера` — горизонтальний референс (розкид 0,8 мм);
 *   ЗК-16        гліфи «М»/«В» — короткі полілінії, не чіпаємо;
 *   ЗМ-Т19       назви шарів у AC1018 — escape `\U+XXXX`, декодуємо;
 *   ВК-1   контури відкриті — прапорець `closed` НЕ є ознакою геометрії;
 *   РМ-1   єдиний закритий контур — рамка кадру на шарі `Фреймы`, не деталь;
 *   ЗМ-Т3  файл несе дублі геометрії, зсунуті по одній площині на «вид» —
 *          дедуплікуємо за рамками; підписи кадрів — ЗК-61;
 *   ЗМ-Т8  `Level` (трикутник 50×50) і `MchOrg` (хрестик у точці стояння)
 *          — службові маркери, у геометрію не йдуть;
 *   ЗМ-Т9  `ZLines` — вертикальні відрізки = карта висот;
 *   МТ-1   мітки — одна-дві літери; показуємо як є, не розшифровуємо (МТ-2).
 *
 * Що модуль НЕ робить (НЕ-3): не видає зшитий контур як затверджений.
 * Він віддає ланцюги з кутами, а рішення — людині у вкладці «Зведення».
 * Операції над моделлю (дублети, зшивання, доворот, переріз, панель) —
 * у `measureOps.ts`.
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
  /** Відрізки, з яких зшито (№130) — щоб мітки М/В можна було відняти від геометрії. */
  segmentIds: string[];
  points: MPoint[];
  closed: boolean;
  lengthMm: number;
  /** Кути в вершинах між сусідніми ребрами, градуси; для відкритого ланцюга крайні — undefined. */
  cornerAngles: Array<number | undefined>;
}

/** Сира точка приладу (ЗК-52): звідки прийшла і що прилад про неї сказав. */
export interface RawPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  layer: string;
  /** `INSERT RAW-POINT` · `POINT` · `TEXT RAW_P_nnn` без блока. */
  source: 'insert' | 'point' | 'text';
  /** Підпис RAW_P_nnn, якщо був (81-1395178); у AC1018 підписів немає. */
  label?: string;
  /** «28,2 mm» поруч із точкою — оцінка якості від приладу, мм. */
  qualityMm?: number;
}

export type PolylineRole = 'plan' | 'wall' | 'socket' | 'glyph' | 'laser' | 'frame' | 'other';

/** Полілінія як прийшла — з усіма z і ролью, яку ми їй призначили (ЗК-21). */
export interface MeasurePolyline {
  id: string;
  layer: string;
  points: MPoint[];
  closed: boolean;
  role: PolylineRole;
  /** Для ролей wall/socket — індекс площини стіни в `model.walls`. */
  wallIndex?: number;
}

/** Вертикальна площина стіни, підігнана по точках контуру (ЗК-22). */
export interface WallPlane {
  index: number;
  layer: string;
  /** Точка на площині (початок осі u) і одиничний напрям уздовж стіни в XY. */
  origin: MPoint;
  dir: { x: number; y: number };
  /** Нормаль у XY (перпендикуляр до dir). */
  normal: { x: number; y: number };
  /** Контур стіни в координатах розгортки (u вздовж стіни, z вгору). */
  contourUZ: Array<{ u: number; z: number }>;
  contourClosed: boolean;
  /** Джерело контуру — полілінія в `model.polylines`. */
  polylineId: string;
  /** Довжина по u і межі по z. */
  uMin: number; uMax: number; zMin: number; zMax: number;
  /** Найбільше відхилення точок контуру від площини (нуль = площина ідеальна). */
  planeRmsMm: number;
  /** Розетки/вирізи в цій площині (ЗК-24): прямокутник у (u, z). */
  sockets: Array<{ polylineId: string; uMin: number; uMax: number; zMin: number; zMax: number; closed: boolean }>;
}

export interface LaserLine {
  /** Усі точки лінії лазера (може бути кілька полілиній — по стіні на кожну). */
  points: MPoint[];
  zMean: number;
  zMin: number;
  zMax: number;
  /** Розкид zMax − zMin, мм (ЗК-25: 0,8 мм у кейсі). */
  spreadMm: number;
}

export interface MeasureModel {
  fileName: string;
  /** Формат, який упізнали: пара 2D, «External/Internal», один файл із ZLines, нативний 3D. */
  variant: 'polylines' | 'external-internal' | 'zlines' | '3d' | 'unknown';
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

  // ── v2 (07.09, ЗК) ─────────────────────────────────────────────────
  /** Файл 3D: є полілінії з z ≠ 0, або сирі точки, або площини стін. */
  is3d: boolean;
  /** Версія DXF з HEADER ($ACADVER), якщо є: AC1018, AC1024… */
  acadVersion?: string;
  rawPoints: RawPoint[];
  polylines: MeasurePolyline[];
  walls: WallPlane[];
  laser: LaserLine | null;
  /** Підписи кадрів 2D-файла (ЗК-61): «Обзор», «Vertical Plane 1»… */
  frameLabels: string[];
  /** Скільки вертикальних «опускань» на z = 0 відкинуто (ЗК-52). */
  verticalDrops: number;
  /** Ланцюг операцій, які вже застосовано до цієї моделі (провенанс, ЗК-31). */
  ops: string[];
  /** Що людина прийняла в інструменті (ЗК-9: сирий файл не правимо — кладемо копію поруч). */
  derived?: MeasureDerived;
  /** 2D-файл тієї ж пари, якщо прийшов ZIP: звірка «2D = проєкція 3D» (ЗК-27). */
  check2d?: { fileName: string; polylines: number; matched: number; maxDeltaMm: number; frameLabels: string[] };
}

/** Похідні шари інструмента — оброблений план, панелі зі стін, перерізи. Кожен знає своє джерело. */
export interface MeasureDerived {
  plan?: { sourceChainId: string; layer: string; points: MPoint[]; closed: boolean; replaced: number; provenance: Array<{ index: number; kind: 'raw' | 'intersection'; from: number[] }> };
  panels: Array<{ wallIndex: number; layer: string; polygon: Array<{ u: number; v: number }>; widthMm: number; heightMm: number; sockets: Array<{ uMin: number; uMax: number; vMin: number; vMax: number; wMm: number; hMm: number }>; baseZ: number }>;
  sections: MeasureSegment[];
}

/** Службові шари, які в геометрію не йдуть (РМ-1, ЗМ-Т8, ТМ-1). */
const SERVICE_LAYERS = new Set([
  'Фреймы', 'Level', 'MchOrg', 'Control Points', 'POINT-NAME', 'POINT-ELEV',
  'Сырые измерения', 'Текст', 'Defpoints',
]);

/** Шар карти висот (ЗМ-Т9). */
const ZLINES_LAYER = 'ZLines';
const RAW_LAYER = 'Сырые измерения';
const LASER_LAYER = 'Лінія лазера';

// ── Декодування назв (ЗМ-Т19) ─────────────────────────────────────────

/**
 * AutoCAD пише не-ASCII у назвах шарів як `\U+0421`; архіватори — як
 * `#U0421`. Обидва варіанти — у звичайний текст.
 */
export function decodeDxfText(s: string): string {
  return s
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/#U([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

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

function readEntities(pairs: Pair[]): { entities: RawEntity[]; acadVersion?: string } {
  const entities: RawEntity[] = [];
  let inEntities = false;
  let acadVersion: string | undefined;
  let current: RawEntity | null = null;
  for (let i = 0; i < pairs.length; i += 1) {
    const { code, value } = pairs[i];
    if (code === 9 && value === '$ACADVER') { acadVersion = pairs[i + 1]?.value; continue; }
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
    if (code === 8) current.layer = decodeDxfText(value);
    current.props.push([code, value]);
  }
  if (current) entities.push(current);
  return { entities, acadVersion };
}

function num(v: string): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// ── Сутності → відрізки ───────────────────────────────────────────────

interface Parsed {
  segments: MeasureSegment[];
  marks: MeasureMark[];
  heights: Array<{ x: number; y: number; z: number }>;
  frames: MPoint[][];
  frameLabels: string[];
  layers: Set<string>;
  dropped: Map<string, { count: number; reason: string }>;
  hasLwPolyline: boolean;
  rawPoints: RawPoint[];
  polylines: MeasurePolyline[];
  laserPoints: MPoint[];
  verticalDrops: number;
  hasZ: boolean;
}

function parseEntities(entities: RawEntity[]): Parsed {
  const out: Parsed = {
    segments: [], marks: [], heights: [], frames: [], frameLabels: [], layers: new Set(), dropped: new Map(), hasLwPolyline: false,
    rawPoints: [], polylines: [], laserPoints: [], verticalDrops: 0, hasZ: false,
  };
  let seq = 0;
  let pseq = 0;
  let rseq = 0;
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
  const rawTexts: Array<{ text: string; x: number; y: number; z: number }> = [];

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
      const elev = num(get(38) ?? '0');
      let x: number | null = null;
      for (const [c, v] of e.props) {
        if (c === 10) x = num(v);
        else if (c === 20 && x !== null) { pts.push({ x, y: num(v), z: elev }); x = null; }
      }
      const closed = (num(get(70) ?? '0') & 1) === 1;
      emitPolyline(layer, pts, closed);
      continue;
    }

    if (e.type === 'LINE') {
      const a = { x: num(get(10) ?? '0'), y: num(get(20) ?? '0'), z: num(get(30) ?? '0') };
      const b = { x: num(get(11) ?? '0'), y: num(get(21) ?? '0'), z: num(get(31) ?? '0') };
      const vertical = Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && (a.z ?? 0) !== (b.z ?? 0);
      // ЗК-52: вертикальне опускання сирої точки на z = 0 — це не ребро
      if (vertical && layer === RAW_LAYER) { out.verticalDrops += 1; out.hasZ = true; continue; }
      // ЗМ-Т9: карта висот — вертикальні відрізки (та сама x,y, різні z)
      if (layer === ZLINES_LAYER || vertical) {
        out.heights.push({ x: a.x, y: a.y, z: (a.z ?? 0) - (b.z ?? 0) });
        out.layers.add(layer);
        continue;
      }
      if (layer === RAW_LAYER) {
        // опускання точки, що вже лежить на z = 0, — вироджене (0 мм), але це те саме опускання
        if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) { out.verticalDrops += 1; continue; }
        drop(layer, 'службовий шар (ЗК-52)'); continue;
      }
      if (SERVICE_LAYERS.has(layer)) { drop(layer, 'службовий шар (РМ-1, ЗМ-Т8)'); continue; }
      if ((a.z ?? 0) !== 0 || (b.z ?? 0) !== 0) out.hasZ = true;
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
      const text = decodeDxfText((get(1) ?? '').trim());
      if (!text) continue;
      const x = num(get(10) ?? '0'); const y = num(get(20) ?? '0'); const z = num(get(30) ?? '0');
      if (layer === RAW_LAYER) { rawTexts.push({ text, x, y, z }); continue; }
      if (layer === 'Фреймы') { out.frameLabels.push(text); continue; }
      out.marks.push({ text, x, y, layer });
      continue;
    }

    if (e.type === 'INSERT') {
      const name = decodeDxfText(get(2) ?? '');
      if (/^RAW-POINT$/i.test(name) || layer === RAW_LAYER) {
        rseq += 1;
        out.rawPoints.push({ id: `r${rseq}`, x: num(get(10) ?? '0'), y: num(get(20) ?? '0'), z: num(get(30) ?? '0'), layer, source: 'insert' });
        out.hasZ = true;
        continue;
      }
      drop(layer, 'блок без геометрії точки (ЗК-52)');
      continue;
    }
    if (e.type === 'POINT') {
      rseq += 1;
      out.rawPoints.push({ id: `r${rseq}`, x: num(get(10) ?? '0'), y: num(get(20) ?? '0'), z: num(get(30) ?? '0'), layer, source: 'point' });
      if (num(get(30) ?? '0') !== 0) out.hasZ = true;
      continue;
    }
  }
  if (poly) emitPolyline(poly.layer, poly.pts, poly.closed);

  // Підписи сирих точок: RAW_P_nnn і «28,2 mm» стоять над точкою (та сама x, z; y +12,5 / +56)
  for (const t of rawTexts) {
    const isLabel = /^RAW_P/i.test(t.text);
    const q = t.text.match(/^(\d+(?:[.,]\d+)?)\s*mm$/i);
    let best: RawPoint | undefined; let bestD = Infinity;
    for (const r of out.rawPoints) {
      const d = Math.hypot(r.x - t.x, (r.z ?? 0) - t.z) + Math.abs(r.y - t.y) * 0.1;
      if (d < bestD && Math.abs(r.y - t.y) < 120 && Math.abs(r.x - t.x) < 1) { bestD = d; best = r; }
    }
    if (best) {
      if (isLabel) best.label = t.text;
      else if (q) best.qualityMm = Number(q[1].replace(',', '.'));
    } else if (isLabel) {
      rseq += 1;
      out.rawPoints.push({ id: `r${rseq}`, x: t.x, y: t.y, z: t.z, layer: RAW_LAYER, source: 'text', label: t.text });
    }
  }

  function emitPolyline(layer: string, pts: MPoint[], closed: boolean) {
    if (pts.length < 2) return;
    // РМ-1: рамка кадру — закритий 4-кутник на шарі «Фреймы». Запам'ятовуємо
    // для дедуплікації (ЗМ-Т3), у геометрію не пускаємо.
    if (layer === 'Фреймы') {
      if (pts.length >= 4) out.frames.push(pts);
      drop(layer, 'рамка кадру зйомки (РМ-1)');
      return;
    }
    if (layer === LASER_LAYER) {
      pseq += 1;
      out.polylines.push({ id: `p${pseq}`, layer, points: pts, closed, role: 'laser' });
      out.laserPoints.push(...pts);
      out.layers.add(layer);
      out.hasZ = true;
      return;
    }
    if (SERVICE_LAYERS.has(layer)) { drop(layer, 'службовий шар (ЗМ-Т8)'); return; }
    if (pts.some((p) => (p.z ?? 0) !== 0)) out.hasZ = true;
    pseq += 1;
    out.polylines.push({ id: `p${pseq}`, layer, points: pts, closed, role: 'other' });
    out.layers.add(layer);
  }

  return out;
}

// ── Дедуплікація за рамками (ЗМ-Т3) ───────────────────────────────────

export function bboxOf(pts: MPoint[]) {
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
 * 1,5 мм (радіус щупа 2,5 плюс шум); для розсипаних примітивів ніш —
 * 5 мм (ЗК-15). НЕ-3: результат — чернетка, не затверджений контур.
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
      const mine: string[] = [start.id];
      const pts: MPoint[] = [start.a, start.b];
      /*
       * НАЙБЛИЖЧИЙ, А НЕ ПЕРШИЙ-ЛІПШИЙ (07.09.2026, №129).
       *
       * Було: перебір відрізків у порядку масиву, і перший, що потрапив у
       * поріг, приклеювався. На малому порозі це майже те саме, але з
       * ростом порога ланцюг починав хапати чужий кінець і рвати сусідів —
       * на кейсі 81-1430086 поріг 10 мм давав 11 ланцюгів, а 13 мм — уже
       * 12, 20 мм — 13. Тобто «зшити сильніше» ламало більше, ніж
       * зшивало, і власник справедливо сказав, що воно не зшивається.
       * Тепер на кожному кроці беремо НАЙБЛИЖЧИЙ кінець із усіх вільних —
       * результат монотонний: більший поріг ніколи не дає більше ланцюгів.
       */
      let grown = true;
      while (grown) {
        grown = false;
        const head = pts[0]; const tail = pts[pts.length - 1];
        let best: { seg: MeasureSegment; d: number; atTail: boolean; add: MPoint } | null = null;
        for (const s of segs) {
          if (used.has(s.id)) continue;
          const cands: Array<{ d: number; atTail: boolean; add: MPoint }> = [
            { d: dist(tail, s.a), atTail: true, add: s.b },
            { d: dist(tail, s.b), atTail: true, add: s.a },
            { d: dist(head, s.b), atTail: false, add: s.a },
            { d: dist(head, s.a), atTail: false, add: s.b },
          ];
          for (const c of cands) {
            if (c.d > toleranceMm) continue;
            if (!best || c.d < best.d) best = { seg: s, ...c };
          }
        }
        if (best) {
          if (best.atTail) pts.push(best.add); else pts.unshift(best.add);
          used.add(best.seg.id);
          mine.push(best.seg.id);
          grown = true;
        }
      }
      const closed = pts.length > 3 && dist(pts[0], pts[pts.length - 1]) <= toleranceMm;
      if (closed) pts.pop();
      seq += 1;
      chains.push({ id: `c${seq}`, layer, segmentIds: mine, points: pts, closed, lengthMm: chainLength(pts, closed), cornerAngles: cornerAngles(pts, closed) });
    }
  }
  // Довші ланцюги — першими: стіни зазвичай найдовші. Крихти коротші за
  // 5 мм (сліди щупа R2,5, дублі точок) у таблицю не йдуть — це шум.
  return chains.filter((c) => c.lengthMm >= 5).sort((p, q) => q.lengthMm - p.lengthMm);
}

export function chainLength(pts: MPoint[], closed: boolean): number {
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

// ── Площини стін і ролі поліліній (ЗК-21, ЗК-22, ЗК-24) ───────────────

const PLAN_LAYER = (l: string) => l === 'Layer 0' || l === '0' || l === 'External' || l === 'Internal';
const WALL_LAYER = (l: string) => /^Стінова\s*\d*/i.test(l) || /^Стеновая\s*\d*/i.test(l) || /^Wall/i.test(l);

/**
 * Підганяємо вертикальну площину по (x, y) точок: напрям — головна вісь
 * розкиду (PCA у площині), нормаль — перпендикуляр. Повертаємо RMS
 * відхилення від площини — нуль означає, що прилад уже підігнав (ЗК-22).
 */
export function fitVerticalPlane(pts: MPoint[]): { origin: MPoint; dir: { x: number; y: number }; normal: { x: number; y: number }; rmsMm: number } {
  const n = pts.length;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p.x; my += p.y; }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { const dx = p.x - mx; const dy = p.y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  // головний власний вектор 2×2
  const tr = sxx + syy; const det = sxx * syy - sxy * sxy;
  const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  let dx: number; let dy: number;
  if (Math.abs(sxy) > 1e-9) { dx = l1 - syy; dy = sxy; }
  else if (sxx >= syy) { dx = 1; dy = 0; }
  else { dx = 0; dy = 1; }
  const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  // напрям — щоб u ріс уздовж обходу від першої точки до останньої
  const first = pts[0]; const last = pts[n - 1];
  if ((last.x - first.x) * dx + (last.y - first.y) * dy < 0) { dx = -dx; dy = -dy; }
  const normal = { x: -dy, y: dx };
  let ss = 0;
  for (const p of pts) { const d = (p.x - mx) * normal.x + (p.y - my) * normal.y; ss += d * d; }
  return { origin: { x: mx, y: my, z: 0 }, dir: { x: dx, y: dy }, normal, rmsMm: Math.sqrt(ss / n) };
}

export function toUZ(p: MPoint, plane: { origin: MPoint; dir: { x: number; y: number } }): { u: number; z: number } {
  return { u: (p.x - plane.origin.x) * plane.dir.x + (p.y - plane.origin.y) * plane.dir.y, z: p.z ?? 0 };
}

export function fromUZ(uz: { u: number; z: number }, plane: { origin: MPoint; dir: { x: number; y: number } }): MPoint {
  return { x: plane.origin.x + uz.u * plane.dir.x, y: plane.origin.y + uz.u * plane.dir.y, z: uz.z };
}

function distToPlaneXY(p: MPoint, plane: { origin: MPoint; normal: { x: number; y: number } }): number {
  return Math.abs((p.x - plane.origin.x) * plane.normal.x + (p.y - plane.origin.y) * plane.normal.y);
}

const zSpan = (pts: MPoint[]) => { let a = Infinity, b = -Infinity; for (const p of pts) { a = Math.min(a, p.z ?? 0); b = Math.max(b, p.z ?? 0); } return b - a; };
const xySpan = (pts: MPoint[]) => { const b = bboxOf(pts); return Math.max(b.maxX - b.minX, b.maxY - b.minY); };
const span3 = (pts: MPoint[]) => Math.max(xySpan(pts), zSpan(pts));

/**
 * Замірник веде одну полілінію далі: обійшов стіну — і тим самим обходом
 * обвів розетку (81-1130988: контур 11 точок + коло 11 точок в одній
 * полілінії). Відрізаємо хвіст/голову, що вкладаються в кулю ≤ `maxMm`,
 * в окрему полілінію.
 */
export function splitTrailingClusters(polylines: MeasurePolyline[], maxMm = 250): MeasurePolyline[] {
  const out: MeasurePolyline[] = [];
  let seq = polylines.length;
  for (const p of polylines) {
    if (p.closed || p.points.length < 9 || span3(p.points) < maxMm * 2) { out.push(p); continue; }
    let pts = p.points;
    const parts: MPoint[][] = [];
    for (const side of ['tail', 'head'] as const) {
      let k = 4;
      let best = 0;
      while (k < pts.length - 4) {
        const cluster = side === 'tail' ? pts.slice(pts.length - k) : pts.slice(0, k);
        if (span3(cluster) > maxMm) break;
        best = k; k += 1;
      }
      if (best >= 5) {
        parts.push(side === 'tail' ? pts.slice(pts.length - best) : pts.slice(0, best));
        pts = side === 'tail' ? pts.slice(0, pts.length - best) : pts.slice(best);
      }
    }
    if (!parts.length) { out.push(p); continue; }
    out.push({ ...p, points: pts });
    for (const c of parts) { seq += 1; out.push({ id: `p${seq}`, layer: p.layer, points: c, closed: true, role: 'other' }); }
  }
  return out;
}

/** Розкласти полілінії по ролях і зібрати площини стін. Мутує `polylines[i].role`. */
export function classifyPolylines(polylines: MeasurePolyline[]): WallPlane[] {
  const walls: WallPlane[] = [];
  // 1) стіни: вертикальні полілінії (z-розкид помітний) — найбільша на шарі = контур стіни
  const wallCandidates = polylines.filter((p) => p.role === 'other' && zSpan(p.points) > 30 && p.points.length >= 4);
  const byLayer = new Map<string, MeasurePolyline[]>();
  for (const p of wallCandidates) { if (!byLayer.has(p.layer)) byLayer.set(p.layer, []); byLayer.get(p.layer)!.push(p); }
  for (const [layer, list] of byLayer) {
    list.sort((a, b) => xySpan(b.points) * zSpan(b.points) - xySpan(a.points) * zSpan(a.points));
    const main = list[0];
    if (xySpan(main.points) < 100) continue; // не стіна — щось дрібне вертикальне
    const plane = fitVerticalPlane(main.points);
    const uz = main.points.map((p) => toUZ(p, plane));
    const wall: WallPlane = {
      index: walls.length, layer, origin: plane.origin, dir: plane.dir, normal: plane.normal,
      contourUZ: uz, contourClosed: main.closed, polylineId: main.id,
      uMin: Math.min(...uz.map((q) => q.u)), uMax: Math.max(...uz.map((q) => q.u)),
      zMin: Math.min(...uz.map((q) => q.z)), zMax: Math.max(...uz.map((q) => q.z)),
      planeRmsMm: plane.rmsMm, sockets: [],
    };
    main.role = 'wall'; main.wallIndex = wall.index;
    walls.push(wall);
  }
  // 2) розетки: інші вертикальні полілінії в площині якоїсь стіни (ЗК-24)
  for (const p of polylines) {
    if (p.role !== 'other' || zSpan(p.points) <= 20 || xySpan(p.points) <= 20 || p.points.length < 4) continue;
    const near = walls.map((w) => ({ w, d: Math.max(...p.points.map((q) => distToPlaneXY(q, w))) })).filter((x) => x.d < 25).sort((a, b) => a.d - b.d)[0];
    if (!near) continue;
    const uz = p.points.map((q) => toUZ(q, near.w));
    near.w.sockets.push({ polylineId: p.id, uMin: Math.min(...uz.map((q) => q.u)), uMax: Math.max(...uz.map((q) => q.u)), zMin: Math.min(...uz.map((q) => q.z)), zMax: Math.max(...uz.map((q) => q.z)), closed: p.closed });
    p.role = 'socket'; p.wallIndex = near.w.index;
  }
  // 3) план, гліфи, решта
  for (const p of polylines) {
    if (p.role !== 'other') continue;
    if (p.points.length <= 6 && xySpan(p.points) < 150 && zSpan(p.points) < 1) { p.role = 'glyph'; continue; } // ЗК-16 «М»/«В»
    if (PLAN_LAYER(p.layer) && zSpan(p.points) < 1) { p.role = 'plan'; continue; }
    if (WALL_LAYER(p.layer) && zSpan(p.points) < 1) { p.role = 'plan'; continue; } // лінія стіни на плані у 2D-файлі (ЗК-7)
    if (zSpan(p.points) < 1) p.role = 'plan';
  }
  return walls;
}

function laserOf(points: MPoint[]): LaserLine | null {
  if (!points.length) return null;
  const zs = points.map((p) => p.z ?? 0);
  const zMin = Math.min(...zs); const zMax = Math.max(...zs);
  return { points, zMean: zs.reduce((a, b) => a + b, 0) / zs.length, zMin, zMax, spreadMm: zMax - zMin };
}

/**
 * Відрізки для плану і зведення: план, гліфи, решта — як є; площини стін
 * і розетки на план не проєктуємо (обхід «туди-назад» ламає ланцюги), а
 * кладемо слід стіни на плані одним відрізком uMin→uMax по її шару.
 */
export function segmentsFromPolylines(polylines: MeasurePolyline[], walls: WallPlane[]): MeasureSegment[] {
  const out: MeasureSegment[] = [];
  let seq = 0;
  const push = (layer: string, a: MPoint, b: MPoint) => { seq += 1; out.push({ id: `q${seq}`, layer, a, b }); };
  for (const p of polylines) {
    if (p.role === 'wall' || p.role === 'socket' || p.role === 'laser' || p.role === 'frame') continue;
    for (let i = 0; i + 1 < p.points.length; i += 1) push(p.layer, p.points[i], p.points[i + 1]);
    if (p.closed && p.points.length > 2) push(p.layer, p.points[p.points.length - 1], p.points[0]);
  }
  for (const w of walls) push(w.layer, fromUZ({ u: w.uMin, z: 0 }, w), fromUZ({ u: w.uMax, z: 0 }, w));
  return out;
}

// ── Головний вхід ─────────────────────────────────────────────────────

export function parseLeicaDxf(text: string, fileName = 'замір.dxf'): MeasureModel {
  const { entities, acadVersion } = readEntities(readPairs(text));
  const parsed = parseEntities(entities);
  const polylines = splitTrailingClusters(parsed.polylines);
  const walls = classifyPolylines(polylines);
  const segments = [...parsed.segments, ...segmentsFromPolylines(polylines, walls)];
  const { kept, removed } = dedupeByFrames(segments, parsed.frames);

  const layers = [...parsed.layers].sort();
  const is3d = parsed.rawPoints.length > 0 || walls.length > 0 || (parsed.hasZ && !parsed.hasLwPolyline);
  const variant: MeasureModel['variant'] = is3d
    ? '3d'
    : parsed.heights.length > 0 && !parsed.hasLwPolyline
      ? 'zlines'
      : layers.some((l) => l === 'External' || l === 'Internal')
        ? 'external-internal'
        : parsed.hasLwPolyline
          ? 'polylines'
          : 'unknown';

  const all: MPoint[] = [];
  for (const s of kept) { all.push(s.a, s.b); }
  for (const h of parsed.heights) all.push({ x: h.x, y: h.y });
  for (const r of parsed.rawPoints) all.push(r);
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
    is3d,
    acadVersion,
    rawPoints: parsed.rawPoints,
    polylines,
    walls,
    laser: laserOf(parsed.laserPoints),
    frameLabels: parsed.frameLabels,
    verticalDrops: parsed.verticalDrops,
    ops: [],
  };
}

/** Головний закритий контур приміщення — найдовший закритий ланцюг на стінових шарах. */
export function roomContourOf(model: MeasureModel): MeasureChain | undefined {
  const wallish = (layer: string) => layer === 'External' || /^Стінова/i.test(layer) || layer === 'Layer 0' || layer === '0';
  return model.chains.find((c) => c.closed && wallish(c.layer)) ?? model.chains.find((c) => c.closed);
}

/**
 * Контур стін на плані (ЗК-5): найдовший ланцюг на плановому шарі —
 * відкритий чи закритий, байдуже (ЗК-14: контур стін не деталь).
 */
export function planContourOf(model: MeasureModel): MeasureChain | undefined {
  const planish = (layer: string) => PLAN_LAYER(layer) || WALL_LAYER(layer);
  return model.chains.find((c) => planish(c.layer) && c.points.length >= 4) ?? model.chains[0];
}
