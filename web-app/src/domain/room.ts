/**
 * ПРИМІЩЕННЯ (БАЗА) — модель і чиста математика. 01.09.2026, рішення власника.
 *
 * Навіщо. Половина ТУ цеху — про стосунок деталі до кімнати: зазор до
 * стіни 2 мм, панель стоїть на стільниці біля стіни, підвіконня — від
 * прорізу. Досі ці правила жили в цифрах без місця; виріб знав лише
 * висоту від підлоги. База дає правилам геометрію, а менеджеру —
 * контекст. Це перший камінь VS Архітектури і VS Конструктора.
 *
 * Що це і чого НЕ є:
 *   · не елемент і не деталь — у розкрій не йде, у гроші не потрапляє;
 *   · одна база на проєкт — `Project.room`, поле необов'язкове, старі
 *     файли не помітять (normalizeProject робить ...project);
 *   · опційний шар у 3D Підборі (`visibleInAssembly`).
 *
 * Модель — навмисно «три інструменти зі SketchUp» і жодного більше:
 *   1. лінія / прямокутник на плані → замкнений контур (грань);
 *   2. push/pull → контур стає призмою (heightMm), вдавлювання —
 *      призма-«мінус» (kind: 'cut'), яку CSG віднімає від сусідів;
 *   3. фарба → колір грані.
 * Це не B-rep-ядро: список призм із плюсом чи мінусом. Для стін, колон,
 * подіумів, ніш і прорізів цього досить; довільні криві стіни — ні, і не
 * планується в першій версії.
 *
 * Координати: план у мм, x вправо, y «вглиб» (у сцені це Z), висота — від
 * підлоги вгору (сцена Y). Ті самі осі, що в розстановці виробів
 * (`engines/sceneLayout`, `Product.scenePlacement`), тому виріб і база
 * стоять в одному світі без перерахунків.
 */

export interface RoomPoint {
  x: number;
  y: number;
}

export type RoomSolidKind = 'add' | 'cut';

/**
 * Вісь призми (01.09, друга ітерація — «як у SketchUp», малюємо на
 * будь-якій грані):
 *   up — контур на плані (u→X, v→Z), витягується вгору по Y (стіни з
 *        контуру, тумби, подіуми);
 *   z  — контур на стіні, що дивиться вздовж Z (u→X, v→Y), витягується
 *        по Z (прорізи й навісні шафи на такій стіні);
 *   x  — контур на стіні, що дивиться вздовж X (u→Z, v→Y), витягується
 *        по X.
 * `points` завжди в локальних (u, v) грані, `baseMm` — зсув площини
 * вздовж осі, `heightMm` — довжина витягування від baseMm у +вісь.
 */
export type RoomAxis = 'up' | 'x' | 'z';

export interface RoomSolid {
  id: string;
  /** add — тіло (стіна, колона, подіум); cut — вибірка (ніша, проріз). */
  kind: RoomSolidKind;
  /** Вісь витягування; порожньо = 'up' (файли першої версії). */
  axis?: RoomAxis;
  /** Контур у локальних (u, v) грані, мм. ≥ 3 точок, без самоперетинів. */
  points: RoomPoint[];
  /** Початок призми вздовж осі, мм (для 'up' — низ від підлоги). */
  baseMm: number;
  /** Довжина призми вздовж +осі, мм (push/pull). 0 — плоска грань, ще не витягнута. */
  heightMm: number;
  /**
   * Куди дивиться грань-господар, на якій намальовано плоску грань
   * (+1 — у +вісь). Push/pull у цей бік — тіло, у протилежний — вибірка.
   */
  faceNormal?: 1 | -1;
  /** Колір грані, hex. Порожньо — колір за замовчуванням для виду. */
  color?: string;
  label?: string;
  /** Службова роль — щоб стіни й підлогу з контуру можна було впізнати. */
  role?: 'wall' | 'floor' | 'custom';
}

export interface RoomModel {
  formatVersion: 1;
  solids: RoomSolid[];
  /** Показувати базу у 3D Підборі. */
  visibleInAssembly: boolean;
  /** Замовчування для інструмента «Стіни з контуру». */
  wallHeightMm: number;
  wallThicknessMm: number;
}

export const ROOM_DEFAULTS = {
  wallHeightMm: 2700,
  wallThicknessMm: 150,
  floorSlabMm: 20,
  gridMm: 10,
  /** Радіус прив'язки до кінців і кутів, мм плану. */
  snapRadiusMm: 60,
  wallColor: '#e9e5dd',
  floorColor: '#d9d3c7',
  faceColor: '#cfd8e3',
} as const;

/** Палітра фарби — 8 пресетів, без бібліотеки матеріалів (перша версія). */
export const ROOM_PALETTE: ReadonlyArray<{ id: string; label: string; hex: string }> = [
  { id: 'wall', label: 'Стіна', hex: '#e9e5dd' },
  { id: 'white', label: 'Білий', hex: '#f4f4f2' },
  { id: 'grey', label: 'Сірий', hex: '#b8bec6' },
  { id: 'graphite', label: 'Графіт', hex: '#4a5058' },
  { id: 'wood', label: 'Дерево', hex: '#c8a47a' },
  { id: 'oak', label: 'Дуб темний', hex: '#7a5a3a' },
  { id: 'tile', label: 'Плитка', hex: '#dfe6ea' },
  { id: 'accent', label: 'Акцент', hex: '#3b7dd8' },
];

export function emptyRoom(): RoomModel {
  return {
    formatVersion: 1,
    solids: [],
    visibleInAssembly: true,
    wallHeightMm: ROOM_DEFAULTS.wallHeightMm,
    wallThicknessMm: ROOM_DEFAULTS.wallThicknessMm,
  };
}

let seq = 0;
export function roomId(prefix = 'rs'): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

/* ── геометрія плану ──────────────────────────────────────────────── */

export function signedArea(points: RoomPoint[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Прямокутник за двома протилежними кутами — завжди 4 точки за годинниковою (y вниз). */
export function rectPoints(a: RoomPoint, b: RoomPoint): RoomPoint[] {
  const x1 = Math.min(a.x, b.x); const x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y); const y2 = Math.max(a.y, b.y);
  return [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
}

export function polygonBounds(points: RoomPoint[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

export function pointInPolygon(p: RoomPoint, poly: RoomPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]; const b = poly[j];
    const cross = (a.y > p.y) !== (b.y > p.y)
      && p.x < ((b.x - a.x) * (p.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x;
    if (cross) inside = !inside;
  }
  return inside;
}

/**
 * Зміщений контур: кожне ребро зсувається на `offsetMm` назовні (додатне)
 * або всередину (від'ємне), сусідні зміщені прямі перетинаються — мітра.
 * Орієнтація довільна: «назовні» визначається за знаком площі.
 */
export function offsetPolygon(points: RoomPoint[], offsetMm: number): RoomPoint[] {
  const n = points.length;
  if (n < 3 || offsetMm === 0) return points.map((p) => ({ ...p }));
  // y вниз: додатна площа = за годинниковою на екрані; зовнішня нормаль
  // для такого обходу — ліворуч від руху.
  const clockwise = signedArea(points) > 0;
  const sign = clockwise ? -1 : 1;
  const out: RoomPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const d1 = norm({ x: cur.x - prev.x, y: cur.y - prev.y });
    const d2 = norm({ x: next.x - cur.x, y: next.y - cur.y });
    const n1 = { x: -d1.y * sign, y: d1.x * sign };
    const n2 = { x: -d2.y * sign, y: d2.x * sign };
    // Бісектриса нормалей із мітрою 1/cos(θ/2); стеля — щоб гострі кути
    // не вистрілювали в нескінченність.
    let bx = n1.x + n2.x; let by = n1.y + n2.y;
    const bl = Math.hypot(bx, by);
    if (bl < 1e-9) { bx = n1.x; by = n1.y; } else { bx /= bl; by /= bl; }
    const cos = Math.max(bx * n1.x + by * n1.y, 0.2);
    const k = offsetMm / cos;
    out.push({ x: cur.x + bx * k, y: cur.y + by * k });
  }
  return out;
}

function norm(v: RoomPoint): RoomPoint {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

/**
 * «Стіни з контуру»: намалював периметр кімнати — стіни виросли назовні
 * від нього (кімната всередині, розміри в світлі — ті, що виміряв
 * замірник), плюс тонка плита підлоги всередині контуру.
 */
export function wallsFromContour(
  contour: RoomPoint[],
  thicknessMm: number,
  heightMm: number,
  opts?: { floor?: boolean; wallColor?: string; floorColor?: string },
): RoomSolid[] {
  const n = contour.length;
  if (n < 3) return [];
  const outer = offsetPolygon(contour, Math.max(1, thicknessMm));
  const solids: RoomSolid[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = contour[i];
    const b = contour[(i + 1) % n];
    const qa = outer[i];
    const qb = outer[(i + 1) % n];
    solids.push({
      id: roomId('wall'),
      kind: 'add',
      role: 'wall',
      label: `Стіна ${i + 1}`,
      points: [a, b, qb, qa],
      baseMm: 0,
      heightMm: Math.max(1, heightMm),
      color: opts?.wallColor ?? ROOM_DEFAULTS.wallColor,
    });
  }
  if (opts?.floor !== false) {
    solids.push({
      id: roomId('floor'),
      kind: 'add',
      role: 'floor',
      label: 'Підлога',
      points: contour.map((p) => ({ ...p })),
      baseMm: -ROOM_DEFAULTS.floorSlabMm,
      heightMm: ROOM_DEFAULTS.floorSlabMm,
      color: opts?.floorColor ?? ROOM_DEFAULTS.floorColor,
    });
  }
  return solids;
}

/**
 * Стіна на ОДНОМУ ребрі контуру (сценарій власника: «малюю квадрат, потім
 * вказую, по яких ребрах ростуть стіни»). Стіна росте назовні від
 * контуру на товщину; кути сусідніх стін на цьому етапі не зводяться
 * мітрою — вони перекриваються на товщину, чого для бази досить.
 */
export function wallOnEdge(
  contour: RoomPoint[],
  edgeIndex: number,
  thicknessMm: number,
  heightMm: number,
  color: string = ROOM_DEFAULTS.wallColor,
): RoomSolid | undefined {
  const n = contour.length;
  if (n < 3) return undefined;
  const a = contour[edgeIndex % n];
  const b = contour[(edgeIndex + 1) % n];
  const clockwise = signedArea(contour) > 0;
  const sign = clockwise ? -1 : 1;
  const d = norm({ x: b.x - a.x, y: b.y - a.y });
  const nx = -d.y * sign; const ny = d.x * sign;
  const t = Math.max(1, thicknessMm);
  // Подовжуємо стіну на товщину з обох кінців — щоб сусідні стіни
  // сходились у куті без щілини.
  const ea = { x: a.x - d.x * t, y: a.y - d.y * t };
  const eb = { x: b.x + d.x * t, y: b.y + d.y * t };
  return {
    id: roomId('wall'),
    kind: 'add',
    role: 'wall',
    label: `Стіна ${edgeIndex + 1}`,
    points: [ea, eb, { x: eb.x + nx * t, y: eb.y + ny * t }, { x: ea.x + nx * t, y: ea.y + ny * t }],
    baseMm: 0,
    heightMm: Math.max(1, heightMm),
    color,
  };
}

/** Найближче ребро контуру до точки (мм плану) у межах `withinMm`. */
export function nearestContourEdge(
  contour: RoomPoint[],
  p: RoomPoint,
  withinMm: number,
): { index: number; distance: number } | undefined {
  let best: { index: number; distance: number } | undefined;
  for (let i = 0; i < contour.length; i += 1) {
    const a = contour[i]; const b = contour[(i + 1) % contour.length];
    const dx = b.x - a.x; const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const dist = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    if (dist <= withinMm && (!best || dist < best.distance)) best = { index: i, distance: dist };
  }
  return best;
}

/* ── прив'язки ────────────────────────────────────────────────────── */

export interface SnapOptions {
  gridMm?: number;
  /** Точки, до яких липнемо (кінці, кути наявних тіл). */
  anchors?: RoomPoint[];
  snapRadiusMm?: number;
  /** Ортогональ від попередньої точки: тримаємо X або Y. */
  orthoFrom?: RoomPoint | null;
}

export interface SnapResult {
  point: RoomPoint;
  /** Що спрацювало — для підказки в статусі. */
  kind: 'anchor' | 'ortho' | 'grid' | 'free';
}

export function snapPoint(raw: RoomPoint, opts: SnapOptions = {}): SnapResult {
  const grid = opts.gridMm ?? ROOM_DEFAULTS.gridMm;
  const radius = opts.snapRadiusMm ?? ROOM_DEFAULTS.snapRadiusMm;

  // 1. Кінці й кути — найсильніша прив'язка.
  let best: RoomPoint | undefined;
  let bestD = radius;
  for (const a of opts.anchors ?? []) {
    const d = Math.hypot(a.x - raw.x, a.y - raw.y);
    if (d < bestD) { bestD = d; best = a; }
  }
  if (best) return { point: { ...best }, kind: 'anchor' };

  // 2. Ортогональ від попередньої точки.
  let p: RoomPoint = { ...raw };
  let kind: SnapResult['kind'] = 'free';
  if (opts.orthoFrom) {
    const dx = Math.abs(raw.x - opts.orthoFrom.x);
    const dy = Math.abs(raw.y - opts.orthoFrom.y);
    p = dx >= dy ? { x: raw.x, y: opts.orthoFrom.y } : { x: opts.orthoFrom.x, y: raw.y };
    kind = 'ortho';
  }

  // 3. Сітка.
  if (grid > 0) {
    p = { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
    if (kind === 'free') kind = 'grid';
  }
  return { point: p, kind };
}

/** Усі вершини всіх тіл — якорі для прив'язки. */
export function roomAnchors(room: RoomModel): RoomPoint[] {
  const out: RoomPoint[] = [];
  for (const s of room.solids) for (const p of s.points) out.push(p);
  return out;
}

/**
 * Точка на відстані `lengthMm` від `from` у напрямку `toward` — для
 * введення довжини з клавіатури під час малювання (як у SketchUp:
 * тягнеш і набираєш 3200).
 */
export function pointAtLength(from: RoomPoint, toward: RoomPoint, lengthMm: number): RoomPoint {
  const d = norm({ x: toward.x - from.x, y: toward.y - from.y });
  return { x: from.x + d.x * lengthMm, y: from.y + d.y * lengthMm };
}

/* ── осі, локальні координати грані, габарити ──────────────────────── */

export interface RoomWorld { x: number; y: number; z: number }

export function solidAxis(solid: Pick<RoomSolid, 'axis'>): RoomAxis {
  return solid.axis ?? 'up';
}

/** Локальні (u, v) грані + зсув уздовж осі → світ (мм; X вправо, Y вгору, Z вглиб). */
export function worldFromLocal(axis: RoomAxis, u: number, v: number, along: number): RoomWorld {
  if (axis === 'up') return { x: u, y: along, z: v };
  if (axis === 'z') return { x: u, y: v, z: along };
  return { x: along, y: v, z: u };
}

/** Світ → локальні (u, v, along) для осі. */
export function localFromWorld(axis: RoomAxis, w: RoomWorld): { u: number; v: number; along: number } {
  if (axis === 'up') return { u: w.x, v: w.z, along: w.y };
  if (axis === 'z') return { u: w.x, v: w.y, along: w.z };
  return { u: w.z, v: w.y, along: w.x };
}

/** Одиничний вектор осі у світі. */
export function axisVector(axis: RoomAxis): RoomWorld {
  if (axis === 'up') return { x: 0, y: 1, z: 0 };
  if (axis === 'z') return { x: 0, y: 0, z: 1 };
  return { x: 1, y: 0, z: 0 };
}

/** Вісь за нормаллю грані у світі (|n| по одній координаті ≈ 1), або undefined. */
export function axisFromNormal(n: RoomWorld): { axis: RoomAxis; sign: 1 | -1 } | undefined {
  if (Math.abs(n.y) > 0.9) return { axis: 'up', sign: n.y > 0 ? 1 : -1 };
  if (Math.abs(n.z) > 0.9) return { axis: 'z', sign: n.z > 0 ? 1 : -1 };
  if (Math.abs(n.x) > 0.9) return { axis: 'x', sign: n.x > 0 ? 1 : -1 };
  return undefined;
}

/** Усі вершини тіла у світі (низ і верх призми). */
export function solidCorners(solid: RoomSolid): RoomWorld[] {
  const axis = solidAxis(solid);
  const out: RoomWorld[] = [];
  for (const p of solid.points) {
    out.push(worldFromLocal(axis, p.x, p.y, solid.baseMm));
    out.push(worldFromLocal(axis, p.x, p.y, solid.baseMm + solid.heightMm));
  }
  return out;
}

export function solidAabb(solid: RoomSolid): { min: RoomWorld; max: RoomWorld } {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const c of solidCorners(solid)) {
    min.x = Math.min(min.x, c.x); min.y = Math.min(min.y, c.y); min.z = Math.min(min.z, c.z);
    max.x = Math.max(max.x, c.x); max.y = Math.max(max.y, c.y); max.z = Math.max(max.z, c.z);
  }
  return { min, max };
}

/**
 * Посунути ребра контуру, що дивляться назовні в напрямку (nu, nv) і
 * лежать на координаті `at` (мм, з допуском), на `deltaMm` уздовж цієї
 * нормалі — «потягнути бік блока». Полігон не дозволяємо вивернути:
 * зсув обмежується так, щоб від протилежного краю лишалось ≥ 10 мм.
 */
export function moveContourEdge(
  points: RoomPoint[],
  normal: { u: number; v: number },
  at: number,
  deltaMm: number,
  toleranceMm = 2,
): RoomPoint[] {
  const alongU = Math.abs(normal.u) > 0.5;
  const sign = alongU ? Math.sign(normal.u) : Math.sign(normal.v);
  const coord = (p: RoomPoint) => (alongU ? p.x : p.y);
  const moving = points.map((p) => Math.abs(coord(p) - at) <= toleranceMm);
  if (!moving.some(Boolean) || moving.every(Boolean)) return points;
  // Скільки можна рухати всередину: до найближчої нерухомої координати.
  const fixed = points.filter((_, i) => !moving[i]).map(coord);
  const limit = sign > 0 ? at - Math.max(...fixed) - 10 : Math.min(...fixed) - at - 10;
  const delta = Math.max(deltaMm, -Math.max(0, limit));
  return points.map((p, i) => {
    if (!moving[i]) return p;
    return alongU ? { x: p.x + sign * delta, y: p.y } : { x: p.x, y: p.y + sign * delta };
  });
}

/* ── операції над моделлю (усі — нові об'єкти, без мутацій) ────────── */

export function addSolid(room: RoomModel, solid: RoomSolid): RoomModel {
  return { ...room, solids: [...room.solids, solid] };
}

export function updateSolid(room: RoomModel, id: string, patch: Partial<RoomSolid>): RoomModel {
  return { ...room, solids: room.solids.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

export function removeSolid(room: RoomModel, id: string): RoomModel {
  return { ...room, solids: room.solids.filter((s) => s.id !== id) };
}

/**
 * Push/pull за торець призми. `end: 'top'` — тягнемо дальній торець
 * (у +вісь), `'base'` — ближній. Перетягнув через протилежний торець —
 * призма «вивертається»: довжина стає модулем, початок зсувається.
 */
export function pushPull(solid: RoomSolid, deltaMm: number, end: 'top' | 'base' = 'top'): RoomSolid {
  const base = solid.baseMm;
  const top = solid.baseMm + solid.heightMm;
  const a = end === 'top' ? base : base + deltaMm;
  const b = end === 'top' ? top + deltaMm : top;
  const lo = Math.min(a, b); const hi = Math.max(a, b);
  return { ...solid, baseMm: Math.round(lo), heightMm: Math.round(hi - lo) };
}

/** Чи два тіла перетинаються за габаритом у світі (для CSG «мінусів»), будь-які осі. */
export function solidsOverlap(a: RoomSolid, b: RoomSolid): boolean {
  const A = solidAabb(a); const B = solidAabb(b);
  return A.min.x < B.max.x && B.min.x < A.max.x
    && A.min.y < B.max.y && B.min.y < A.max.y
    && A.min.z < B.max.z && B.min.z < A.max.z;
}

/**
 * Куди підуть push/pull-и плоскої грані: у бік нормалі господаря — тіло,
 * усередину — вибірка. `forceCut` — перемикач «Вибірка» в редакторі.
 */
export function kindAfterPull(face: RoomSolid, deltaMm: number, forceCut = false): RoomSolidKind {
  if (forceCut) return 'cut';
  if (face.heightMm > 0) return face.kind;
  const n = face.faceNormal ?? 1;
  return Math.sign(deltaMm) === n ? 'add' : 'cut';
}
