import type { SurfaceGrooveGroup } from './types';

/**
 * КАТАЛОГ ПРОТОЧОК ЦЕХУ (28.08.2026).
 *
 * Джерело — креслення «Проточки Кераміка / Кварцит» від 12.03.25,
 * ділянка «Робочий стіл». Це не наші вигадані числа, а те, що верстат
 * реально ріже, тому каталог — джерело істини для розмірів.
 *
 * ГОЛОВНЕ, ЩО ДАЛИ КРЕСЛЕННЯ (і чого ми не знали):
 *
 *  1. ШИРИНА КАНАВКИ НЕ ЗАДАЄТЬСЯ — вона ПОХІДНА від радіуса фрези і
 *     глибини. Фреза R7 на глибині 3 мм лишає слід рівно 11.5 мм:
 *     2·√(R² − (R−h)²) = 2·√(49−16) = 11.49. На 3.5 мм — 12.1 мм.
 *     Те саме для кераміки з R8: 12.5 і 13.3 мм. Усі чотири числа з
 *     креслень сходяться з формулою до десятих.
 *
 *  2. ПРОТОЧКА ЙДЕ З УХИЛОМ. Глибина не стала: 0.5 мм на дальньому
 *     краю і 3 мм біля мийки (або 1.5 → 3.5 у «глибокій» серії). Це
 *     фізика: вода мусить текти В МИЙКУ, а не стояти в канавці.
 *
 *  3. Радіус фрези РІЗНИЙ ПО МАТЕРІАЛУ: кварцит — R7, кераміка — R8.
 *
 * Коди читаються так: `QGR02-350` = Quartz GRoove, схема 02, довжина
 * 350 мм. `CGR…` — те саме для кераміки (Ceramic).
 */

export type GroovePresetId =
  | 'QGR01-350' | 'QGR02-350' | 'QGR03-350' | 'QGR04-350'
  | 'QGR01-250' | 'QGR02-250' | 'QGR03-250' | 'QGR04-250'
  | 'CGR01-350' | 'CGR02-350' | 'CGR03-350' | 'CGR04-350'
  | 'CGR01-250' | 'CGR02-250' | 'CGR03-250' | 'CGR04-250';

export interface GroovePreset {
  id: GroovePresetId;
  /** Матеріал, для якого креслення виписане */
  materialGroup: 'Кварцит' | 'Керамограніт';
  /** Радіус фрези, мм — він і задає ширину сліду */
  cutterRadius: number;
  /** Кількість канавок */
  count: number;
  /** Крок між осями канавок, мм (з креслення: просвіт + ширина) */
  pitch: number;
  /** Довжина канавки, мм */
  length: number;
  /** Глибина на ДАЛЬНЬОМУ краю (від мийки), мм */
  depthFar: number;
  /** Глибина біля МИЙКИ, мм — сюди тече вода */
  depthNear: number;
  /** Ширина сліду з креслення, мм — для звірки з формулою */
  widthFromDrawing: number;
}

/** Ширина сліду радіусної фрези на заданій глибині, мм. */
export function grooveWidthFor(cutterRadius: number, depth: number): number {
  const r = Math.max(0.1, cutterRadius);
  const h = Math.min(Math.max(0, depth), r);
  return 2 * Math.sqrt(Math.max(0, r * r - (r - h) * (r - h)));
}

/**
 * Каталог. `pitch` = просвіт із креслення + ширина канавки: на кресленні
 * підписаний просвіт МІЖ канавками, а нам потрібна відстань між осями.
 */
export const GROOVE_PRESETS: GroovePreset[] = [
  // ── Кварцит, фреза R7 ─────────────────────────────────────────────
  { id: 'QGR01-350', materialGroup: 'Кварцит', cutterRadius: 7, count: 6, pitch: 44 + 11.5, length: 350, depthFar: 0.5, depthNear: 3, widthFromDrawing: 11.5 },
  { id: 'QGR02-350', materialGroup: 'Кварцит', cutterRadius: 7, count: 5, pitch: 71 + 11.5, length: 350, depthFar: 0.5, depthNear: 3, widthFromDrawing: 11.5 },
  { id: 'QGR03-350', materialGroup: 'Кварцит', cutterRadius: 7, count: 6, pitch: 43 + 12.1, length: 350, depthFar: 1.5, depthNear: 3.5, widthFromDrawing: 12.1 },
  { id: 'QGR04-350', materialGroup: 'Кварцит', cutterRadius: 7, count: 5, pitch: 71 + 12.1, length: 350, depthFar: 1.5, depthNear: 3.5, widthFromDrawing: 12.1 },
  { id: 'QGR01-250', materialGroup: 'Кварцит', cutterRadius: 7, count: 6, pitch: 44 + 11.5, length: 250, depthFar: 0.5, depthNear: 3, widthFromDrawing: 11.5 },
  { id: 'QGR02-250', materialGroup: 'Кварцит', cutterRadius: 7, count: 5, pitch: 71 + 11.5, length: 250, depthFar: 0.5, depthNear: 3, widthFromDrawing: 11.5 },
  { id: 'QGR03-250', materialGroup: 'Кварцит', cutterRadius: 7, count: 6, pitch: 43 + 12.1, length: 250, depthFar: 1.5, depthNear: 3.5, widthFromDrawing: 12.1 },
  { id: 'QGR04-250', materialGroup: 'Кварцит', cutterRadius: 7, count: 5, pitch: 71 + 12.1, length: 250, depthFar: 1.5, depthNear: 3.5, widthFromDrawing: 12.1 },
  // ── Кераміка, фреза R8 ────────────────────────────────────────────
  { id: 'CGR01-350', materialGroup: 'Керамограніт', cutterRadius: 8, count: 6, pitch: 43 + 12.5, length: 350, depthFar: 0.5, depthNear: 3, widthFromDrawing: 12.5 },
  { id: 'CGR02-350', materialGroup: 'Керамограніт', cutterRadius: 8, count: 5, pitch: 70 + 12.5, length: 350, depthFar: 0.5, depthNear: 3, widthFromDrawing: 12.5 },
  { id: 'CGR03-350', materialGroup: 'Керамограніт', cutterRadius: 8, count: 6, pitch: 42 + 13.3, length: 350, depthFar: 1.5, depthNear: 3.5, widthFromDrawing: 13.3 },
  { id: 'CGR04-350', materialGroup: 'Керамограніт', cutterRadius: 8, count: 5, pitch: 69 + 13.3, length: 350, depthFar: 1.5, depthNear: 3.5, widthFromDrawing: 13.3 },
  { id: 'CGR01-250', materialGroup: 'Керамограніт', cutterRadius: 8, count: 6, pitch: 43 + 12.5, length: 250, depthFar: 0.5, depthNear: 3, widthFromDrawing: 12.5 },
  { id: 'CGR02-250', materialGroup: 'Керамограніт', cutterRadius: 8, count: 5, pitch: 70 + 12.5, length: 250, depthFar: 0.5, depthNear: 3, widthFromDrawing: 12.5 },
  { id: 'CGR03-250', materialGroup: 'Керамограніт', cutterRadius: 8, count: 6, pitch: 42 + 13.3, length: 250, depthFar: 1.5, depthNear: 3.5, widthFromDrawing: 13.3 },
  { id: 'CGR04-250', materialGroup: 'Керамограніт', cutterRadius: 8, count: 5, pitch: 69 + 13.3, length: 250, depthFar: 1.5, depthNear: 3.5, widthFromDrawing: 13.3 },
];

/**
 * ПРОТОЧКИ ПІД БАТАРЕЇ (ТУ цеху 26.03.2025, остання сторінка).
 *
 * Інша операція, ніж проточки біля мийки: тут не стік води, а
 * вентиляція над радіатором, тому й межі свої — по матеріалу.
 * Числа з креслень: акрил — крок 25, ширина 13, фреза R6.5, зона до
 * 500 мм; кварцит — крок 10, ширина 10, R5, до 600 мм; кераміка —
 * крок 25, ширина 10, R5, до 300 мм на секцію.
 */
export const BATTERY_GROOVE_RULES: Record<string, {
  cutterRadius: number;
  pitch: number;
  maxZoneLength: number;
  note: string;
}> = {
  'Акрил': { cutterRadius: 6.5, pitch: 25, maxZoneLength: 500, note: 'Зона до 500 мм; під проточками фанера ≥20 мм' },
  'Кварцит': { cutterRadius: 5, pitch: 10, maxZoneLength: 600, note: 'Зона до 600 мм, часті вузькі прорізи' },
  'Керамограніт': { cutterRadius: 5, pitch: 25, maxZoneLength: 300, note: 'Секція до 300 мм; довша зона ділиться на секції' },
};

export function batteryGrooveRuleFor(material?: string | null) {
  if (!material) return undefined;
  if (material === 'Натуральний камінь') return BATTERY_GROOVE_RULES['Кварцит'];
  return BATTERY_GROOVE_RULES[material];
}

export function groovePresetById(id: string | undefined): GroovePreset | undefined {
  return GROOVE_PRESETS.find((preset) => preset.id === id);
}

/** Пресети, доречні для матеріалу проєкту. Порожній матеріал — усі. */
export function groovePresetsForMaterial(material?: string | null): GroovePreset[] {
  if (!material) return GROOVE_PRESETS;
  const matched = GROOVE_PRESETS.filter((preset) => preset.materialGroup === material);
  return matched.length ? matched : GROOVE_PRESETS;
}

/**
 * Пресет → група канавок на деталі. `x`/`y` — де стоїть перша канавка;
 * решта чисел приходить із креслення і руками не задається.
 */
export function grooveGroupFromPreset(
  preset: GroovePreset,
  x: number,
  y: number,
  direction: SurfaceGrooveGroup['direction'] = 'horizontal',
): SurfaceGrooveGroup {
  return {
    id: `groove_${preset.id}_${Math.random().toString(36).slice(2, 6)}`,
    presetId: preset.id,
    x,
    y,
    direction,
    count: preset.count,
    pitch: preset.pitch,
    length: preset.length,
    cutterRadius: preset.cutterRadius,
    // Глибина = біля мийки; далекий край задає ухил
    depth: preset.depthNear,
    depthFar: preset.depthFar,
    width: grooveWidthFor(preset.cutterRadius, preset.depthNear),
    profile: 'round',
    face: 'top',
    label: `Проточки ${preset.id}`,
  };
}
