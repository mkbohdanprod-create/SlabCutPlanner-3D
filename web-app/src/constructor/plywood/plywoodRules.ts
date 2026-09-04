/**
 * ПРАВИЛА ФАНЕРНОГО ПІДКЛАДУ — 04.09.2026.
 *
 * Джерело: `06_ОБУЧАЛОЧКА/ПРАВИЛА_ФАНЕРА.md`. Кожна функція носить код
 * правила, за яким її можна знайти в обучалочці, тесті й журналі.
 * Статуси правил (ФАКТ/ГІПОТЕЗА) — у коментарях; гіпотези віддані
 * параметрами, які конструктор міняє руками, а не зашиті.
 *
 *   КП-7  підклад потрібен під профілі з високим бортом: acr_* (крім
 *         плоских без борту) + SharkNose — список нижче, ФАКТ по каталогу;
 *   КП-8  ознака — висота кромки, НЕ матеріал;
 *   КП-1  товщина фанери = висота кромки − товщина плити;
 *   КП-2  смуга по периметру 80 мм (ФАКТ, 2 кейси);
 *   КП-3  відступ від краю плити 15 мм (1 приклад → параметр);
 *   КП-4  рама + ребра;
 *   КП-5  крок ребер — ГІПОТЕЗА (380–560; 200–290 біля вирізів) → параметр;
 *   КП-6  ребра «в кліщі» навколо вирізу мийки/плити;
 *   ПВ-1  підворот 18, не 30;
 *   ТБ-1  таблиця: № | назва | розмір | к-сть | матеріал.
 */
import type { Detail, EdgeProfileSelection } from '../../domain/types';
import type { PlywoodParams } from '../store';

/** КП-7: профілі, під якими потрібен підклад (борт вищий за плиту). */
export const SUBSTRATE_PROFILES: ReadonlySet<string> = new Set([
  'sharknose',
  'acr_r20', 'acr_ch_10x10', 'acr_bullnose_r10', 'acr_bullnose_r12',
  'acr_shark45_r0', 'acr_shark45_r3', 'acr_shark45_r6',
  'acr_shark55_r0', 'acr_shark55_r2', 'acr_shark55_r3', 'acr_shark55_r6',
  'acr_shark225_r0', 'acr_shark225_r3', 'acr_shark225_r6',
  'acr_modern', 'acr_spill_stop', 'acr_classic1', 'acr_classic2',
]);

/** КП-7/КП-8: чи потрібен підклад під цю деталь — за профілями і бортом. */
export function needsSubstrate(detail: Detail, edgeHeightMm?: number): { needed: boolean; reason: string; sides: string[] } {
  const profiles: EdgeProfileSelection = detail.edgeProfiles ?? {};
  const sides = Object.entries(profiles)
    .filter(([, p]) => typeof p === 'string' && SUBSTRATE_PROFILES.has(p))
    .map(([side]) => side);
  if (sides.length > 0) return { needed: true, reason: `КП-7: профіль з бортом на ${sides.join(', ')}`, sides };
  if (edgeHeightMm && edgeHeightMm > detail.thickness) {
    return { needed: true, reason: `КП-8: висота кромки ${edgeHeightMm} > плита ${detail.thickness}`, sides: [] };
  }
  const thick = detail.thickening;
  if (thick?.enabled && thick.sides.length > 0) {
    return { needed: true, reason: `КП-8: потовщення ${thick.size} мм на ${thick.sides.join(', ')}`, sides: thick.sides };
  }
  return { needed: false, reason: 'борт не вищий за плиту — підклад не потрібен', sides: [] };
}

/** КП-1: товщина фанери = висота кромки − товщина плити. */
export function plywoodThickness(edgeHeightMm: number, plateMm: number): number {
  return Math.max(0, edgeHeightMm - plateMm);
}

export interface Rect { x: number; y: number; w: number; h: number; name: string; kind: 'strip' | 'rib' | 'clamp' }

export interface PlywoodLayout {
  /** Габарит плити, за яким будували, мм. */
  outerW: number;
  outerH: number;
  parts: Rect[];
  /** ТБ-1 — рядки таблиці. */
  table: Array<{ no: number; name: string; size: string; qty: number; material: string }>;
  notes: string[];
}

export interface CutoutRect { x: number; y: number; w: number; h: number; label: string }

/**
 * КП-4 + КП-2 + КП-3 + КП-5 + КП-6: рама зі смуг по периметру, ребра з
 * кроком, «кліщі» навколо вирізів. Габарит — bbox контуру; довільний
 * контур у v1 не обрізає смуги (борг — записано в СТАРТЕР).
 */
export function buildPlywoodLayout(
  outerW: number,
  outerH: number,
  params: PlywoodParams,
  cutouts: CutoutRect[],
  thicknessMm: number,
): PlywoodLayout {
  const parts: Rect[] = [];
  const o = params.edgeOffset; // КП-3
  const s = params.stripWidth; // КП-2
  const innerW = outerW - 2 * o;
  const innerH = outerH - 2 * o;
  const notes: string[] = [];
  if (innerW < 3 * s || innerH < 3 * s) {
    notes.push('плита замала для рами зі смуг — перевірте вручну');
  }
  // Рама (КП-4): дві довгі по X, дві короткі між ними
  parts.push({ x: o, y: o, w: innerW, h: s, name: 'Смуга передня', kind: 'strip' });
  parts.push({ x: o, y: outerH - o - s, w: innerW, h: s, name: 'Смуга задня', kind: 'strip' });
  parts.push({ x: o, y: o + s, w: s, h: innerH - 2 * s, name: 'Смуга ліва', kind: 'strip' });
  parts.push({ x: outerW - o - s, y: o + s, w: s, h: innerH - 2 * s, name: 'Смуга права', kind: 'strip' });

  // Кліщі навколо вирізів (КП-6): дві поперечні смуги по боках вирізу
  const clampXs: number[] = [];
  for (const c of cutouts) {
    const left = c.x - s;
    const right = c.x + c.w;
    for (const x of [left, right]) {
      if (x > o + s && x + s < outerW - o - s) {
        parts.push({ x, y: o + s, w: s, h: innerH - 2 * s, name: `Ребро біля ${c.label}`, kind: 'clamp' });
        clampXs.push(x);
      }
    }
  }

  // Ребра з кроком (КП-5 — гіпотеза, крок з параметра)
  const step = Math.max(100, params.ribStep);
  const free = innerW - 2 * s;
  const count = Math.max(0, Math.round(free / step) - 1);
  for (let i = 1; i <= count; i += 1) {
    const x = o + s + (free * i) / (count + 1) - s / 2;
    // не ставимо ребро, якщо воно потрапляє у виріз або поруч уже є кліщі
    const inCutout = cutouts.some((c) => x + s > c.x - s && x < c.x + c.w + s);
    const nearClamp = clampXs.some((cx) => Math.abs(cx - x) < params.ribStepNearCutout);
    if (inCutout || nearClamp) continue;
    parts.push({ x, y: o + s, w: s, h: innerH - 2 * s, name: `Ребро ${i}`, kind: 'rib' });
  }

  // ТБ-1: групуємо однакові розміри
  const material = `Фанера ${thicknessMm} мм`;
  const groups = new Map<string, { name: string; size: string; qty: number }>();
  for (const p of parts) {
    const w = Math.round(Math.max(p.w, p.h)); const h = Math.round(Math.min(p.w, p.h));
    const key = `${w}x${h}|${p.kind}`;
    const cur = groups.get(key);
    if (cur) { cur.qty += 1; continue; }
    const name = p.kind === 'strip' ? 'Смуга периметра' : p.kind === 'clamp' ? 'Ребро біля вирізу (кліщі)' : 'Ребро';
    groups.set(key, { name, size: `${w}×${h}`, qty: 1 });
  }
  const table = [...groups.values()].map((g, i) => ({ no: i + 1, name: g.name, size: g.size, qty: g.qty, material }));

  return { outerW, outerH, parts, table, notes };
}
