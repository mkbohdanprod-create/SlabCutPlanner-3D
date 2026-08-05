import type { QuoteMaterialType } from './quoteCalc';

/**
 * ЗГЕНЕРОВАНО з переліку номенклатур 1С «Виготовлення …» (05.08.2026).
 * 70 позицій: 5 видів виробів × 14 пар (матеріал + виробник).
 *
 * У 1С коди йдуть блоками по 5 на кожну пару, завжди в одному порядку:
 *   база+0 — стільниця з потовщенням
 *   база+1 — стільниця без потовщень
 *   база+2 — стінова панель (ОДНА номенклатура — без поділу до/від 12 мм)
 *   база+3 — мийка
 *   база+4 — раковина
 * Тому тут зберігаються лише базові коди пар, а тест на цілісність
 * звіряє розгортку з контрольними кодами з оригінального переліку.
 * Якщо 1С колись зламає послідовність — правити цей файл, тест упіймає.
 *
 * «Під проект» — офіційний фолбек кожного матеріалу: на нього лягають
 * виробники, яких у переліку (ще) немає.
 */

export type QuoteFabKind = 'countertop_thick' | 'countertop_plain' | 'wall_panel' | 'sink' | 'washbasin';

const KIND_ORDER: QuoteFabKind[] = ['countertop_thick', 'countertop_plain', 'wall_panel', 'sink', 'washbasin'];

const KIND_NAMES: Record<QuoteFabKind, string> = {
  countertop_thick: 'Виготовлення стільниці з потовщенням',
  countertop_plain: 'Виготовлення стільниці без потовщень',
  wall_panel: 'Виготовлення стінової панелі',
  sink: 'Виготовлення мийки',
  washbasin: 'Виготовлення раковини',
};

/** Як матеріал пишеться всередині назви номенклатури */
const MATERIAL_IN_NAME: Record<QuoteMaterialType, string> = {
  'Керамограніт': 'керамограніт',
  'Штучний кварцит': 'штучний кварцит',
  'Натуральний камінь': 'натуральний камінь',
  'Акриловий камінь': 'акриловий камінь',
};

/** Пара (матеріал, виробник) → базовий код блоку з 5 номенклатур */
const FAB_BLOCKS: Array<{ material: QuoteMaterialType; manufacturer: string; base: number }> = [
  { material: 'Керамограніт', manufacturer: 'Laminam', base: 292335 },
  { material: 'Керамограніт', manufacturer: 'Supernova', base: 292340 },
  { material: 'Керамограніт', manufacturer: 'Inalco', base: 292345 },
  { material: 'Керамограніт', manufacturer: 'Marazzi', base: 292350 },
  { material: 'Керамограніт', manufacturer: 'Під проект', base: 292355 },
  { material: 'Штучний кварцит', manufacturer: 'Avant', base: 292360 },
  { material: 'Штучний кварцит', manufacturer: 'Caesarstone', base: 292365 },
  { material: 'Штучний кварцит', manufacturer: 'TermopalStone', base: 292370 },
  { material: 'Штучний кварцит', manufacturer: 'Під проект', base: 292375 },
  { material: 'Натуральний камінь', manufacturer: 'Antolini', base: 292380 },
  { material: 'Натуральний камінь', manufacturer: 'Під проект', base: 292385 },
  { material: 'Акриловий камінь', manufacturer: 'Під проект', base: 292390 },
  { material: 'Акриловий камінь', manufacturer: 'Getacore', base: 292395 },
  { material: 'Акриловий камінь', manufacturer: 'Grandex', base: 292400 },
];

export interface Quote1cItem {
  code: string;
  kind: QuoteFabKind;
  material: QuoteMaterialType;
  manufacturer: string;
  name: string;
}

/** Повний розгорнутий довідник — 70 позицій */
export const QUOTE_1C_FABRICATION: Quote1cItem[] = FAB_BLOCKS.flatMap((block) =>
  KIND_ORDER.map((kind, offset) => ({
    code: String(block.base + offset),
    kind,
    material: block.material,
    manufacturer: block.manufacturer,
    name: `${KIND_NAMES[kind]} (${MATERIAL_IN_NAME[block.material]} ${block.manufacturer})`,
  })),
);

/** Типи виробів прорахунку → вид номенклатури 1С */
const PRODUCT_TYPE_TO_KIND: Record<string, QuoteFabKind> = {
  countertop_plain: 'countertop_plain',
  countertop_thick: 'countertop_thick',
  // У 1С стінова панель одна — обидві товщини лягають на ту саму номенклатуру
  wall_panel_ge12: 'wall_panel',
  wall_panel_lt12: 'wall_panel',
  sink: 'sink',
  washbasin: 'washbasin',
};

/**
 * Вбудований код 1С для виготовлення: точний виробник, а якщо його в
 * довіднику немає (або не вказано) — «Під проект» цього ж матеріалу.
 * Для типів без номенклатури 1С (підвіконня, сходи, фасад…) — undefined.
 */
export function fabrication1cCode(
  productTypeId: string,
  material: string,
  manufacturer: string,
): Quote1cItem | undefined {
  const kind = PRODUCT_TYPE_TO_KIND[productTypeId];
  if (!kind) return undefined;
  const ofMaterial = QUOTE_1C_FABRICATION.filter(
    (item) => item.material === material && item.kind === kind,
  );
  if (!ofMaterial.length) return undefined;
  return ofMaterial.find((item) => item.manufacturer === manufacturer)
    ?? ofMaterial.find((item) => item.manufacturer === 'Під проект');
}
