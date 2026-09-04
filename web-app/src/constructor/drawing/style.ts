/**
 * СТИЛЬ КРЕСЛЕННЯ ЦЕХУ — «DWT» у коді — 04.09.2026.
 *
 * Усі числа — з `06_ОБУЧАЛОЧКА/ПРАВИЛА_ОФОРМЛЕННЯ_КРЕСЛЕНЬ.md`, розділи
 * ШАРИ / КЛ / ЛН / ШР / ШТ. Прочитано з DWG цеху, не вигадано. Якщо цех
 * дасть справжній DWT — міняти тут, і тільки тут.
 *
 * Одиниці аркуша — міліметри паперу (A3 420×297). Товщини ліній — мм.
 */

/** ШАРИ: ім'я, колір ACI → hex, товщина мм, тип лінії. */
export interface LayerStyle { color: string; weight: number; linetype: 'continuous' | 'zigzag' | 'center' | 'dashed' }

export const LAYERS = {
  /** контур деталі — найтовща лінія на аркуші (ЛН-1) */
  'Стільниця': { color: '#000000', weight: 0.40, linetype: 'continuous' },
  /** сторона з профілем — тип лінії «зигзаг» (КР-1) */
  'Кромка': { color: '#000000', weight: 0.25, linetype: 'zigzag' },
  'Фанера': { color: '#000000', weight: 0.30, linetype: 'continuous' },
  /** виріз під мийку, ACI 252 (темно-сірий) */
  'Мойка': { color: '#3b3b3b', weight: 0.20, linetype: 'continuous' },
  /** стик у цеху — ACI 40 помаранчевий (КЛ-1) */
  'Цеховской стык': { color: '#ffbf00', weight: 0.30, linetype: 'continuous' },
  /** стик на об'єкті — ACI 6 пурпуровий (КЛ-1) */
  'Монтажный стык': { color: '#ff00ff', weight: 0.30, linetype: 'continuous' },
  /** розмірні лінії — сірі (КЛ-2), 0.09 (ЛН-1) */
  'Размер': { color: '#808080', weight: 0.09, linetype: 'continuous' },
  /** робочий (чорний) тираж розмірів — ОФ-ДР */
  'Размер робочий': { color: '#000000', weight: 0.09, linetype: 'continuous' },
  'Осевая': { color: '#8c8c8c', weight: 0.05, linetype: 'center' },
  'Стены': { color: '#a0a0a0', weight: 0.18, linetype: 'continuous' },
  /** обмір кухні — ACI 1 червоний (ОФ-ЗМ) */
  'Замер кухни': { color: '#ff0000', weight: 0.18, linetype: 'continuous' },
  /** виноски — той самий клас 0.09, що й розміри (ВН-1) */
  'Виноска': { color: '#000000', weight: 0.09, linetype: 'continuous' },
  /** штрихова рамка групи отворів (ВН-5) */
  'Група': { color: '#000000', weight: 0.09, linetype: 'dashed' },
  /** металокаркас — синій (ІНС-4) */
  'Каркас': { color: '#0000ff', weight: 0.30, linetype: 'continuous' },
  /** критична примітка / вимога виконавцю — червоний (КЛ-1, ОФ-ЧВ) */
  'Вимога': { color: '#ff0000', weight: 0.09, linetype: 'continuous' },
  'Штамп': { color: '#000000', weight: 0.25, linetype: 'continuous' },
  'Рамка': { color: '#000000', weight: 0.50, linetype: 'continuous' },
} as const satisfies Record<string, LayerStyle>;
export type LayerName = keyof typeof LAYERS;

/** ШР-1/ШР-2: два шрифти з розділеними ролями і висоти з текстових стилів DWG. */
export const TEXT = {
  /** `Аннотативный` — arial 2,5: розміри, штамп, назви деталей («машинне») */
  dim: { size: 2.5, family: 'Arial, Helvetica, sans-serif', weight: 400, italic: false },
  /** `Isocpeur` 3,5 з нахилом — підписи вузлів і розрізів («це вузол/розріз») */
  node: { size: 3.5, family: 'ISOCPEUR, "Segoe UI", Arial, sans-serif', weight: 400, italic: true },
  /** Arial-BoldMT — літери розрізів (А-А, 1-1) */
  section: { size: 4.5, family: 'Arial, Helvetica, sans-serif', weight: 700, italic: false },
  /** Arial-ItalicMT — примітки-вказівки («Полірувати торці по периметру») */
  note: { size: 2.5, family: 'Arial, Helvetica, sans-serif', weight: 400, italic: true },
  /** назва деталі в тілі (ВН-6) — Arial (ШР-1) */
  name: { size: 3, family: 'Arial, Helvetica, sans-serif', weight: 400, italic: false },
  /** заголовок над рамкою (ЗГ-1) */
  title: { size: 5, family: 'Arial, Helvetica, sans-serif', weight: 400, italic: false },
  stamp: { size: 2.6, family: 'Arial, Helvetica, sans-serif', weight: 400, italic: false },
} as const;
export type TextStyleName = keyof typeof TEXT;

/**
 * ШР-3: стиль розмірів `Аннотативный` числами з DWG. Співвідношення
 * стале: винос = 0,5×тексту, відступ і зазор = 0,25×, крок рядів = 1,5×.
 */
export const DIMSTYLE = {
  dimtxt: 2.5,
  dimasz: 2.5,
  dimexe: 1.25,
  dimexo: 0.625,
  dimgap: 0.625,
  dimdli: 3.75,
  dimdec: 2,
} as const;

/** ШТ-1: матеріал упізнається штриховкою. */
export const HATCH = {
  stone: { id: 'h-stone', pattern: 'ANSI31', angle: 45, step: 1.6 },
  plywood: { id: 'h-ply', pattern: 'ANGLE', angle: 45, step: 1.4 },
} as const;

/**
 * КЛ-1: колір зв'язує елемент на плані з його розрізом. Палітра ACI —
 * «домовленість автора», не централізована (питання цеху); тут — та, що
 * зустрічалась у кейсах. Кожній кромці на аркуші дається свій колір, і
 * той самий колір несе її розріз.
 */
export const LINK_COLORS = ['#00a000', '#0000ff', '#c000c0', '#008080', '#b06000'] as const;

/** Аркуш A3 альбомний (усі креслення каменю в кейсах) і рамка. */
export const SHEET = {
  w: 420, h: 297,
  frame: { x: 10, y: 14, w: 400, h: 275 },
  /** ЗГ-1 / ОФ-ЛЦ */
  header: 'Всі деталі на кресленні зображені з лицьової сторони',
  /** ШП-2: рамка номера аркуша в нижньому правому куті */
  sheetNoBox: { w: 24, h: 6.5 },
  /** ШП-1: штамп ліворуч унизу, дві колонки */
  stamp: { w: 128, keyW: 52, rowH: 5.6 },
} as const;

/** «Круглі» масштаби, як у штампі цеху. */
export const SCALES = [2, 2.5, 4, 5, 6, 8, 10, 12.5, 15, 20, 25, 30, 40, 50] as const;

/** Зигзаг кромки — крок і амплітуда в мм аркуша (КР-1: лінія-пилка по контуру). */
export const ZIGZAG: { period: number; amp: number } = { period: 3.2, amp: 1.1 };
