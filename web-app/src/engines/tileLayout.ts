/**
 * РУШІЙ РОЗКЛАДОК — Viyar Stone Архітектор (06.09.2026, перша версія).
 *
 * Що робить: бере поверхню (контур + отвори) і розкладку (патерн, формат,
 * шов, старт, кут) → генерує плитки, ріже їх по контуру, рахує числа:
 * квадратуру, цілі й підрізані плитки, метраж швів і різів, листи з
 * запасом, вагу, клей, фугу, монтаж. З цих чисел збирається відомість
 * обсягів (BOQ) — `boqForLayout`.
 *
 * Правила побудови патернів (перша версія — ПРАВИЛА_РОЗКЛАДОК.md,
 * обрано агентом як найлогічніші 06.09, команда ще вирішить практичне):
 *  · РЗ-1/РЗ-5: старт `auto` — сітка центрується по габариту поверхні,
 *    щоб підрізи по протилежних краях були однакові; якщо вони вужчі за
 *    мінімум (РЗ-4: ⅓ плитки і ≥ 100 мм) — зсув на пів кроку, підрізи
 *    стають ≥ пів плитки. Для повернутих патернів (діагональ, ялинка)
 *    балансу по осях нема — центр габариту. `corner`/`center` — ручні;
 *    плюс ручний зсув; кут повороту — навколо точки старту;
 *  · розбіжка: кожен наступний ряд зміщений на `offsetFraction` довжини
 *    плитки (½ — стандарт; ⅓ — великий формат, бо ½ на довгих плитках
 *    підкреслює прогин);
 *  · діагональ: та сама пряма сітка, повернута на 45°;
 *  · ялинка: ґратка з пар «Г» (горизонтальна L×W + вертикальна праворуч,
 *    верхом урівень); сходинка (W, W), зсув ланцюжків (L, −L) — з
 *    урахуванням шва; класична ялинка = ця ґратка під 45°;
 *  · периметр + центр: бордюр шириною `borderMm` уздовж контуру (смуги
 *    довжиною плитки), всередині — `innerPattern` на зміщеному контурі.
 *
 * Числа, які поки УМОВНІ (норми в `DEFAULT_ARCH_NORMS`): запас на бій за
 * патерном, клей кг/м², темп монтажу, машини. Різ по краю рахується як
 * периметр контуру й отворів (кожен міліметр межі — різ).
 *
 * Чисте ядро: без React і сторів (`coreBoundary.test.ts`).
 */
import {
  type ArchitectureModel, type ArchitectureNorms, type LayoutPattern, type PlanPoint, type Surface, type TileLayout,
  DEFAULT_ARCH_NORMS, LAYOUT_PATTERN_LABELS, polygonArea, polygonPerimeter, minCutMm, withNormDefaults,
} from '../domain/architecture';
import { offsetPolygon } from '../domain/room';

export interface TilePiece {
  id: string;
  /** Полігон шматка після обрізання по контуру, мм плану. */
  points: PlanPoint[];
  /** Ціла плитка (не торкнулась межі й отворів). */
  full: boolean;
  areaMm2: number;
  /** Бордюрна смуга «периметр + центр». */
  border?: boolean;
}

export interface LayoutStats {
  areaM2: number;
  fullCount: number;
  cutCount: number;
  /** Площа підрізаних шматків, м². */
  cutAreaM2: number;
  /** Скільки плиток потрібно з урахуванням запасу. */
  tilesNeeded: number;
  wastePct: number;
  /** Скільки плиток виходить з одного листа постачальника (0 — плитка = лист). */
  tilesPerSheet: number;
  sheetsNeeded: number;
  seamLengthM: number;
  cutLengthM: number;
  materialAreaM2: number;
  weightKg: number;
  adhesiveKg: number;
  groutKg: number;
  installHours: number;
  cutHours: number;
  trucks: number;
}

export interface LayoutResult {
  pieces: TilePiece[];
  stats: LayoutStats;
  /** Контур поверхні і отвори — для малювання. */
  outline: PlanPoint[];
  openings: PlanPoint[][];
}

/* ── геометрія ──────────────────────────────────────────────────── */

function cross(o: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Сазерленд–Годжман: обрізати довільний (можливо, увігнутий) полігон
 * опуклим вікном. Вікно — плитка (прямокутник, повернутий на кут).
 */
export function clipByConvex(subject: PlanPoint[], clip: PlanPoint[]): PlanPoint[] {
  if (subject.length < 3 || clip.length < 3) return [];
  // орієнтація вікна — щоб «всередині» було з одного боку кожного ребра
  const orient = Math.sign(clip.reduce((s, p, i) => {
    const q = clip[(i + 1) % clip.length]; return s + (p.x * q.y - q.x * p.y);
  }, 0)) || 1;
  let output = subject;
  for (let i = 0; i < clip.length && output.length; i += 1) {
    const a = clip[i]; const b = clip[(i + 1) % clip.length];
    const input = output; output = [];
    const inside = (p: PlanPoint) => cross(a, b, p) * orient >= -1e-7;
    for (let j = 0; j < input.length; j += 1) {
      const cur = input[j]; const prev = input[(j - 1 + input.length) % input.length];
      const curIn = inside(cur); const prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) output.push(intersect(prev, cur, a, b));
        output.push(cur);
      } else if (prevIn) {
        output.push(intersect(prev, cur, a, b));
      }
    }
  }
  return dedupe(output);
}

function intersect(p1: PlanPoint, p2: PlanPoint, a: PlanPoint, b: PlanPoint): PlanPoint {
  const d1 = { x: p2.x - p1.x, y: p2.y - p1.y };
  const d2 = { x: b.x - a.x, y: b.y - a.y };
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-12) return { ...p2 };
  const t = ((a.x - p1.x) * d2.y - (a.y - p1.y) * d2.x) / den;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

function dedupe(points: PlanPoint[]): PlanPoint[] {
  const out: PlanPoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-6) out.push(p);
  }
  if (out.length > 1) {
    const f = out[0]; const l = out[out.length - 1];
    if (Math.hypot(f.x - l.x, f.y - l.y) <= 1e-6) out.pop();
  }
  return out.length >= 3 ? out : [];
}

function bounds(points: PlanPoint[]) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  return { minX, minY, maxX, maxY };
}

function rotate(p: PlanPoint, origin: PlanPoint, rad: number): PlanPoint {
  const c = Math.cos(rad); const s = Math.sin(rad);
  const dx = p.x - origin.x; const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

/* ── генератори сіток у ЛОКАЛЬНИХ координатах патерну ───────────── */

interface LocalTile { x: number; y: number; w: number; h: number }

/** Скільки плиток треба покласти, щоб накрити коло радіусом R навколо старту. */
function gridRange(R: number, stepX: number, stepY: number): { i0: number; i1: number; j0: number; j1: number } {
  return { i0: Math.floor(-R / stepX) - 2, i1: Math.ceil(R / stepX) + 2, j0: Math.floor(-R / stepY) - 2, j1: Math.ceil(R / stepY) + 2 };
}

function straightTiles(R: number, w: number, h: number, joint: number, offsetFraction: number): LocalTile[] {
  const sx = w + joint; const sy = h + joint;
  const r = gridRange(R, sx, sy);
  const out: LocalTile[] = [];
  for (let j = r.j0; j <= r.j1; j += 1) {
    const shift = offsetFraction ? ((j % Math.round(1 / offsetFraction)) + Math.round(1 / offsetFraction)) % Math.round(1 / offsetFraction) * offsetFraction * sx : 0;
    for (let i = r.i0; i <= r.i1; i += 1) {
      out.push({ x: i * sx + shift, y: j * sy, w, h });
    }
  }
  return out;
}

/**
 * Ялинка (без повороту). Пара «Г»: горизонтальна H = [0,L]×[0,W] і
 * вертикальна V праворуч від неї, верхом урівень з верхом H:
 * V = [L', L'+W]×[W−L, W] (L' = L+шов, W' = W+шов). Ґратка пар:
 * сходинка t1 = (W', W') уздовж ланцюжка, зсув ланцюжків t2 = (L', −L').
 * |det| = 2·L'·W' = площа пари зі швами → без дір і накладань (тест
 * покриття). Під кутом 45° — класична ялинка.
 */
function herringboneTiles(R: number, L: number, W: number, joint: number): LocalTile[] {
  const Lj = L + joint; const Wj = W + joint;
  const out: LocalTile[] = [];
  const spanA = Math.ceil(R / Wj) + 3;
  const spanB = Math.ceil(R / Lj) + 3;
  for (let a = -spanA; a <= spanA; a += 1) {
    for (let b = -spanB; b <= spanB; b += 1) {
      const px = a * Wj + b * Lj;
      const py = a * Wj - b * Lj;
      if (Math.hypot(px, py) > R + Lj + Wj) continue;
      out.push({ x: px, y: py, w: L, h: W });                 // горизонтальна
      out.push({ x: px + Lj, y: py + W - L, w: W, h: L });    // вертикальна, верх урівень
    }
  }
  return out;
}

/* ── головне ────────────────────────────────────────────────────── */

function tileQuad(t: LocalTile, origin: PlanPoint, rad: number): PlanPoint[] {
  const raw = [
    { x: origin.x + t.x, y: origin.y + t.y },
    { x: origin.x + t.x + t.w, y: origin.y + t.y },
    { x: origin.x + t.x + t.w, y: origin.y + t.y + t.h },
    { x: origin.x + t.x, y: origin.y + t.y + t.h },
  ];
  return rad ? raw.map((p) => rotate(p, origin, rad)) : raw;
}

/**
 * РЗ-1 по одній осі: довжина L, крок сітки s (плитка + шов), сторона
 * плитки t. n цілих кроків, залишок r. Варіант А — підрізи r/2 з обох
 * боків (плитка або шов рівно по центру); якщо r/2 вужчий за мінімум —
 * варіант Б: зсув на пів кроку, підрізи (r + s)/2 ≥ пів плитки.
 * Повертає початок першої (можливо, частково видимої) плитки.
 */
export function balancedStart(min: number, L: number, s: number, t: number, norms: ArchitectureNorms): number {
  if (s <= 0 || L <= 0) return min;
  // Плитка (панель) не коротша за поверхню — один шматок на всю довжину,
  // без шва посередині (РЗ-7: панель на всю висоту стіни).
  if (L <= t) return min;
  const r = L - Math.floor(L / s) * s;
  const half = r / 2;
  if (half < 1e-6) return min;                       // ідеально вкладається — без підрізів
  if (half >= minCutMm(t, norms)) return min + half - s;  // А: підрізи r/2
  return min + half - s / 2;                          // Б: підрізи (r + s)/2
}

function layoutOrigin(region: PlanPoint[], layout: TileLayout, pattern: LayoutPattern, norms: ArchitectureNorms): PlanPoint {
  const b = bounds(region);
  let base: PlanPoint;
  if (layout.origin === 'corner') base = { x: b.minX, y: b.minY };
  else if (layout.origin === 'center') base = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  else {
    const angle = pattern === 'diagonal' ? 45 + layout.angleDeg : layout.angleDeg;
    const axisAligned = Math.abs(((angle % 180) + 180) % 180) < 1e-6 && pattern !== 'herringbone';
    base = axisAligned
      ? {
        x: balancedStart(b.minX, b.maxX - b.minX, layout.tileW + layout.jointMm, layout.tileW, norms),
        y: balancedStart(b.minY, b.maxY - b.minY, layout.tileH + layout.jointMm, layout.tileH, norms),
      }
      : { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }
  return { x: base.x + layout.originShift.x, y: base.y + layout.originShift.y };
}

function fillRegion(
  region: PlanPoint[], openings: PlanPoint[][], layout: TileLayout, pattern: Exclude<LayoutPattern, 'perimeter_center'>, origin: PlanPoint, idPrefix: string,
): TilePiece[] {
  if (region.length < 3) return [];
  const b = bounds(region);
  const R = Math.hypot(Math.max(b.maxX - origin.x, origin.x - b.minX), Math.max(b.maxY - origin.y, origin.y - b.minY)) + Math.max(layout.tileW, layout.tileH);
  const angle = pattern === 'diagonal' ? 45 + layout.angleDeg : layout.angleDeg;
  const rad = (angle * Math.PI) / 180;
  const tiles = pattern === 'herringbone'
    ? herringboneTiles(R, layout.tileW, layout.tileH, layout.jointMm)
    : straightTiles(R, layout.tileW, layout.tileH, layout.jointMm, pattern === 'brick' ? layout.offsetFraction : 0);
  const tileArea = layout.tileW * layout.tileH;
  const out: TilePiece[] = [];
  let n = 0;
  for (const t of tiles) {
    const quad = tileQuad(t, origin, rad);
    const qb = bounds(quad);
    if (qb.maxX < b.minX || qb.minX > b.maxX || qb.maxY < b.minY || qb.minY > b.maxY) continue;
    const clipped = clipByConvex(region, quad);
    if (clipped.length < 3) continue;
    let area = polygonArea(clipped);
    if (area < 1) continue;
    let touched = area < tileArea * 0.995;
    for (const o of openings) {
      const ob = bounds(o);
      if (qb.maxX < ob.minX || qb.minX > ob.maxX || qb.maxY < ob.minY || qb.minY > ob.maxY) continue;
      const inter = clipByConvex(o, quad);
      if (inter.length >= 3) {
        const ia = polygonArea(inter);
        if (ia > 1) { area -= ia; touched = true; }
      }
    }
    if (area < 1) continue;
    n += 1;
    out.push({ id: `${idPrefix}${n}`, points: clipped, full: !touched, areaMm2: area });
  }
  return out;
}

export function generateLayout(surface: Surface, layout: TileLayout, normsIn: ArchitectureNorms = DEFAULT_ARCH_NORMS): LayoutResult {
  const norms = withNormDefaults(normsIn);
  const outline = surface.points;
  const openings = surface.openings ?? [];
  let pieces: TilePiece[] = [];
  let borderPieces = 0;
  let borderAreaMm2 = 0;
  if (layout.pattern === 'perimeter_center' && outline.length >= 3) {
    const inner = offsetPolygon(outline, -layout.borderMm);
    // бордюр: смуги довжиною плитки вздовж периметра; малюємо як кільце
    const per = polygonPerimeter(outline);
    borderPieces = Math.ceil(per / (layout.tileW + layout.jointMm));
    borderAreaMm2 = Math.max(0, polygonArea(outline) - polygonArea(inner));
    const origin = layoutOrigin(inner, layout, layout.innerPattern, norms);
    pieces = fillRegion(inner, openings, layout, layout.innerPattern, origin, 'c');
    // кільце як один «шматок» для картинки (площа бордюра)
    pieces.unshift({ id: 'border', points: outline, full: false, areaMm2: borderAreaMm2, border: true });
  } else {
    const origin = layoutOrigin(outline, layout, layout.pattern, norms);
    pieces = fillRegion(outline, openings, layout, layout.pattern as Exclude<LayoutPattern, 'perimeter_center'>, origin, 't');
  }
  const stats = computeStats(surface, layout, pieces, norms, borderPieces, borderAreaMm2);
  return { pieces, stats, outline, openings };
}

function computeStats(surface: Surface, layout: TileLayout, pieces: TilePiece[], norms: ArchitectureNorms, borderPieces: number, borderAreaMm2: number): LayoutStats {
  const openings = surface.openings ?? [];
  const areaMm2 = Math.max(0, polygonArea(surface.points) - openings.reduce((s, o) => s + polygonArea(o), 0));
  const areaM2 = areaMm2 / 1e6;
  const field = pieces.filter((p) => !p.border);
  const fullCount = field.filter((p) => p.full).length;
  const cutPieces = field.filter((p) => !p.full);
  const cutAreaMm2 = cutPieces.reduce((s, p) => s + p.areaMm2, 0);
  const tileArea = layout.tileW * layout.tileH;
  const large = Math.max(layout.tileW, layout.tileH) >= 600;
  const wastePct = layout.wastePctOverride ?? (norms.wastePctByPattern[layout.pattern] + (large ? norms.largeFormatExtraPct : 0));
  // бордюр: смуги borderMm × tileW ріжуться з плиток; одна плитка дає floor(tileH/borderMm) смуг
  const stripsPerTile = layout.pattern === 'perimeter_center' ? Math.max(1, Math.floor(layout.tileH / Math.max(1, layout.borderMm))) : 1;
  const borderTiles = layout.pattern === 'perimeter_center' ? borderPieces / stripsPerTile : 0;
  // Скільки плиток з'їдають підрізи: шматок більший за пів плитки — ціла
  // плитка (другий такий з решти не вийде), менший — за площею (два
  // вузькі підрізи ріжуться з однієї). Панель, підрізана по висоті, —
  // це одна панель, а не 0,9.
  const cutTiles = cutPieces.reduce((s, p) => s + (p.areaMm2 > tileArea * 0.5 ? 1 : p.areaMm2 / tileArea), 0);
  const tilesRaw = fullCount + cutTiles + borderTiles;
  const tilesNeeded = Math.ceil(tilesRaw * (1 + wastePct / 100));
  let tilesPerSheet = 0;
  const m = layout.material;
  if (m.sheetW > 0 && m.sheetH > 0 && !(layout.tileW >= m.sheetW && layout.tileH >= m.sheetH) && !(layout.tileH >= m.sheetW && layout.tileW >= m.sheetH)) {
    const k = norms.kerfMm;
    const fit = (W: number, H: number) => Math.floor((W + k) / (layout.tileW + k)) * Math.floor((H + k) / (layout.tileH + k));
    tilesPerSheet = Math.max(fit(m.sheetW, m.sheetH), fit(m.sheetH, m.sheetW));
  }
  const sheetsNeeded = tilesPerSheet > 0 ? Math.ceil(tilesNeeded / tilesPerSheet) : tilesNeeded;
  const perimeters = field.reduce((s, p) => s + polygonPerimeter(p.points), 0);
  const boundary = polygonPerimeter(surface.points) + openings.reduce((s, o) => s + polygonPerimeter(o), 0);
  const seamLengthM = Math.max(0, (perimeters - boundary) / 2 + (layout.pattern === 'perimeter_center' ? polygonPerimeter(offsetPolygon(surface.points, -layout.borderMm)) : 0)) / 1000;
  const cutLengthM = boundary / 1000 + (layout.pattern === 'perimeter_center' ? borderPieces * layout.borderMm / 1000 : 0);
  const materialAreaM2 = tilesNeeded * tileArea / 1e6;
  const weightKg = materialAreaM2 * m.kgPerM2;
  const adhesiveKg = areaM2 * norms.adhesiveKgPerM2;
  const groutKg = seamLengthM * layout.jointMm * m.thicknessMm * norms.groutKgPerL / 1000;
  const installHours = areaM2 / Math.max(0.1, norms.installM2PerHourByPattern[layout.pattern]);
  const cutHours = cutLengthM / Math.max(0.1, norms.cutMPerHour);
  const trucks = weightKg > 0 ? Math.ceil(weightKg / 1000 / norms.truckTonnage) : 0;
  return {
    areaM2, fullCount, cutCount: cutPieces.length + borderPieces, cutAreaM2: (cutAreaMm2 + borderAreaMm2) / 1e6,
    tilesNeeded, wastePct, tilesPerSheet, sheetsNeeded, seamLengthM, cutLengthM, materialAreaM2, weightKg, adhesiveKg, groutKg, installHours, cutHours, trucks,
  };
}

/* ── відомість обсягів ──────────────────────────────────────────── */

export interface BoqLine {
  /** Група: матеріал / роботи / витратні / логістика. */
  group: 'material' | 'works' | 'consumables' | 'logistics';
  code: string;
  name: string;
  unit: 'м²' | 'шт' | 'м' | 'кг' | 'год' | 'т' | 'маш';
  qty: number;
  /** УМОВНО — норма не підтверджена кейсом. */
  provisional: boolean;
  surfaceName: string;
  layoutName: string;
}

export const BOQ_GROUP_LABELS: Record<BoqLine['group'], string> = {
  material: 'Матеріал', works: 'Роботи', consumables: 'Витратні', logistics: 'Логістика',
};

export function boqForLayout(surface: Surface, layout: TileLayout, stats: LayoutStats): BoqLine[] {
  const s = surface.name; const l = layout.name; const m = layout.material;
  const lines: BoqLine[] = [];
  const push = (group: BoqLine['group'], code: string, name: string, unit: BoqLine['unit'], qty: number, provisional = false) => {
    if (qty > 0) lines.push({ group, code, name, unit, qty, provisional, surfaceName: s, layoutName: l });
  };
  push('material', 'AR-M1', `${m.name} — площа облицювання (${LAYOUT_PATTERN_LABELS[layout.pattern]})`, 'м²', stats.areaM2);
  push('material', 'AR-M2', `${m.name} — з запасом ${stats.wastePct} %`, 'м²', stats.materialAreaM2, true);
  if (stats.tilesPerSheet > 0) {
    push('material', 'AR-M3', `Листи ${m.sheetW}×${m.sheetH} (по ${stats.tilesPerSheet} плиток ${layout.tileW}×${layout.tileH})`, 'шт', stats.sheetsNeeded);
  } else {
    push('material', 'AR-M3', `Плитки/панелі ${layout.tileW}×${layout.tileH}`, 'шт', stats.tilesNeeded);
  }
  push('works', 'AR-W1', 'Розкрій листів на плитки (кількість плиток)', 'шт', stats.tilesPerSheet > 0 ? stats.tilesNeeded : 0);
  push('works', 'AR-W2', 'Підрізка по контуру й отворах', 'м', stats.cutLengthM, true);
  push('works', 'AR-W3', 'Монтаж облицювання', 'м²', stats.areaM2);
  push('works', 'AR-W4', `Монтаж — час бригади (${LAYOUT_PATTERN_LABELS[layout.pattern]})`, 'год', stats.installHours, true);
  push('works', 'AR-W5', 'Затирка швів', 'м', stats.seamLengthM);
  push('consumables', 'AR-C1', 'Клей C2 S1/S2, подвійне нанесення', 'кг', stats.adhesiveKg, true);
  push('consumables', 'AR-C2', `Фуга, шов ${layout.jointMm} мм`, 'кг', stats.groutKg, true);
  push('logistics', 'AR-L1', 'Вага матеріалу', 'т', stats.weightKg / 1000);
  push('logistics', 'AR-L2', 'Машини на доставку', 'маш', stats.trucks, true);
  return lines;
}

export interface BoqTotals {
  areaM2: number; materialAreaM2: number; sheets: number; tiles: number; seamsM: number; cutsM: number;
  weightKg: number; adhesiveKg: number; groutKg: number; installHours: number; trucks: number;
}

export function computeArchitecture(model: ArchitectureModel): { results: Array<{ layout: TileLayout; surface: Surface; result: LayoutResult; boq: BoqLine[] }>; totals: BoqTotals } {
  const results: Array<{ layout: TileLayout; surface: Surface; result: LayoutResult; boq: BoqLine[] }> = [];
  const totals: BoqTotals = { areaM2: 0, materialAreaM2: 0, sheets: 0, tiles: 0, seamsM: 0, cutsM: 0, weightKg: 0, adhesiveKg: 0, groutKg: 0, installHours: 0, trucks: 0 };
  const norms = withNormDefaults(model.norms);
  for (const layout of model.layouts) {
    const surface = model.surfaces.find((sf) => sf.id === layout.surfaceId);
    if (!surface) continue;
    const result = generateLayout(surface, layout, norms);
    const boq = boqForLayout(surface, layout, result.stats);
    results.push({ layout, surface, result, boq });
    const st = result.stats;
    totals.areaM2 += st.areaM2; totals.materialAreaM2 += st.materialAreaM2; totals.sheets += st.sheetsNeeded; totals.tiles += st.tilesNeeded;
    totals.seamsM += st.seamLengthM; totals.cutsM += st.cutLengthM; totals.weightKg += st.weightKg; totals.adhesiveKg += st.adhesiveKg;
    totals.groutKg += st.groutKg; totals.installHours += st.installHours;
  }
  totals.trucks = totals.weightKg > 0 ? Math.ceil(totals.weightKg / 1000 / norms.truckTonnage) : 0;
  return { results, totals };
}
