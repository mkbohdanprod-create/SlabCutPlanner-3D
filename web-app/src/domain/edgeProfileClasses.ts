import type { EdgeProfileDef, MaterialType } from './types';

/**
 * КЛАСИФІКАЦІЯ ПРОФІЛІВ ТОРЦЯ ПО МАТЕРІАЛУ І СПОСОБУ ВИКОНАННЯ (01.09.2026).
 *
 * НАВІЩО. Випадачка «форма кромки» показує всі 70 профілів підряд на будь-
 * якому матеріалі (фільтр вимкнений 26.08 рішенням власника — список тоді
 * мовчки звузився до 16). Але форми не рівні між собою: одні універсальні
 * (фаска 2×2, R2), інші існують лише на певному матеріалі (серія 12 — на
 * керамограніті, серія 20 — на кварциті), а треті можливі ЛИШЕ з потовщенням
 * методом зрощення плит — підворот/опуск на фанері (борт 40 у кварциту,
 * підклейка 33 в акрилу). Запит власника 01.09: «розсортуй по типу
 * матеріалу … деякі універсальні, а інші лише в певному типі матеріалу або
 * мають інший принцип виконання: в одному це товщина, а в іншому —
 * потовщення методом склейки».
 *
 * ЧОМУ ТУТ, А НЕ В referenceData. Довідник профілів зберігається РАЗОМ із
 * проєктом (referenceData.edgeProfiles) і доливається лише відсутніми id
 * (mergeBuiltinEdgeProfiles) — нове поле в defaults.ts старі проєкти не
 * побачили б. Таблиця по id, як PROFILE_CUTS у edgeCutters.ts, працює для
 * всіх проєктів одразу і не редагується випадково з модалки довідника.
 *
 * ДЖЕРЕЛО. Каталог цеху «Все кромки» (PDF 17.09.25, 9 стор.) і папка JPG
 * «Кромки/Торці»; звірка — 03_КРОМКИ/КАТАЛОГ_КРОМОК_ПО_МАТЕРІАЛАХ_01-09.md.
 * Натуральний камінь у каталозі відсутній: усюди нижче він іде поруч із
 * кварцитом як ГІПОТЕЗА «як кварцит 20» (materialRules.ts робить так само
 * для меж ТУ) — до підтвердження цеху.
 *
 * Нічого не ховає: групування лише впорядковує список. Рішення власника
 * «показувати все» лишається в силі.
 */

/** Як форма виконується в цеху. */
export type EdgeExecution =
  /** ріжеться в базовій товщині плити (12 керамограніт, 20 кварцит, 10–12 акрил) */
  | 'base'
  /** лише на потовщенні — зрощення плит: опуск/підворот на фанері, борт 40, підклейка 33 */
  | 'buildup'
  /** і в товщині плити, і на потовщенні (та сама форма на зовнішньому ребрі опуску) */
  | 'both';

export type EdgeProfileKind =
  /** форма кромки з каталогу цеху */
  | 'form'
  /** операція на торці, не форма: стик Z, «Антик», торець 45° */
  | 'operation'
  /** спадок першого SlabCutPlanner — у каталозі цеху такої форми нема */
  | 'legacy';

export interface EdgeProfileClass {
  /** На яких матеріалах існує; порожньо = універсальна. */
  materials?: readonly MaterialType[];
  execution: EdgeExecution;
  kind: EdgeProfileKind;
  /** Як робиться в цеху — словами, для підказки в списку і довідника. */
  how?: string;
  /** Форма словами, як у каталозі: «фаска 2×2 зверху і знизу». */
  form?: string;
  /** Код у каталозі цеху, якщо відрізняється від назви в програмі (ZR20 для r_3 — гіпотеза). */
  catalogCode?: string;
  /**
   * Контексти з каталогу цеху: П плінтус/стінова панель · С стільниця в базовій
   * товщині · О опуск/борт (фанера, підклейка 33, борт 40) · М мийка · В виріз під мийку (акрил).
   */
  ctx?: string;
}

/** ГІПОТЕЗА 01.09: натуральний камінь ріжеться як кварцит 20 — до підтвердження цеху. */
const QUARTZ: readonly MaterialType[] = ['Кварцит', 'Натуральний камінь'];
const CERAMIC: readonly MaterialType[] = ['Керамограніт'];
const ACRYLIC: readonly MaterialType[] = ['Акрил'];
/** AR20 / ZS20 прайс знає і на кварциті (219991 / 219993), і на керамограніті (203099 / 203100). */
const QUARTZ_AND_CERAMIC: readonly MaterialType[] = ['Кварцит', 'Натуральний камінь', 'Керамограніт'];

const HOW = {
  ceramicBase: 'Фрезерується на ребрі плити 12 мм.',
  ceramicBoth: 'Фрезерується на ребрі плити 12 мм; на опуску — та сама форма на зовнішньому ребрі приклеєної смуги (прямий стик або стик 45°, фанера позаду).',
  quartzBase: 'Фрезерується на ребрі плити 20 мм.',
  quartzBoth: 'Фрезерується на ребрі плити 20 мм; на опуску — на зовнішньому ребрі смуги 20, приклеєної під плиту (стик 45° або прямий), фанера позаду.',
  quartz40: 'Лише борт 40: дві плити 20 склеюються (лінія клею посередині), профіль фрезерується фасонною фрезою по всій висоті 40.',
  acrylicBase: 'Фрезерується на ребрі листа 10–12 мм.',
  acrylicBoth: 'На ребрі листа 10–12 або на борті з фанерою / підклейці — після склеювання й шліфування шва форма фрезерується по складеному торцю.',
  acrylicBuildup: 'Лише на потовщенні: борт з фанерою або підклейка 33 — смуга акрилу приклеюється під лист без видимого шва, далі фрезерування по складеному торцю.',
  acrylicShark: 'Підклейка 33: низ потовщеного торця зрізається під кутом, спереду кромка виглядає тонкою.',
} as const;

export const EDGE_PROFILE_CLASSES: Record<string, EdgeProfileClass> = {
  // ── універсальні форми (без коду в каталозі: плінтус, стінова панель, акрил) ──
  polished_straight: { execution: 'base', kind: 'form', form: 'пряма полірована (R0)', ctx: 'С О В', how: 'Пряма полірована (R0): полірування торця в товщині плити.' },
  tech_chamfer: { execution: 'base', kind: 'form', form: 'мікрофаска <1×1, захисна', ctx: 'С', how: 'Захисна мікрофаска <1 мм на ребрі плити; каталог показує її на керамограніті й кварциті.' },
  chamfer_2x2: { execution: 'both', kind: 'form', form: 'фаска 2×2 зверху', ctx: 'П С О В', how: 'Фаска 2×2 зверху; та сама форма, що ZS12 / ZS20. На плінтусі й опуску — без коду.' },
  chamfer_2x2_top_bottom: { execution: 'both', kind: 'form', form: 'фаска 2×2 зверху і знизу', ctx: 'С О', how: 'Фаска 2×2 зверху і знизу; та сама форма, що AR12 / AR20.' },
  r2_top: { execution: 'both', kind: 'form', form: 'радіус 2 зверху', ctx: 'П С О В', how: 'R2 зверху; та сама форма, що ZR12.' },
  r2_top_bottom: { execution: 'both', kind: 'form', form: 'R2 зверху і знизу', ctx: 'С О', how: 'R2 зверху і знизу; та сама форма, що T12.' },

  // ── керамограніт, серія 12 ──
  ar_12: { materials: CERAMIC, execution: 'both', kind: 'form', form: 'фаска 2×2 зверху і знизу', ctx: 'С О М', how: HOW.ceramicBoth },
  t_12: { materials: CERAMIC, execution: 'both', kind: 'form', form: 'R2 зверху і знизу', ctx: 'С О М', how: HOW.ceramicBoth },
  zr_12: { materials: CERAMIC, execution: 'both', kind: 'form', form: 'R2 зверху', ctx: 'С О М', how: HOW.ceramicBoth },
  zs_12: { materials: CERAMIC, execution: 'both', kind: 'form', form: 'фаска 2×2 зверху', ctx: 'С О М', how: HOW.ceramicBoth },
  d_12: { materials: CERAMIC, execution: 'both', kind: 'form', form: 'R2 зверху, під ним скіс 45° до низу', ctx: 'С', how: 'R2 зверху і скіс 45° під ним. ГІПОТЕЗА: це підготовка ребра під стик 45° опуску (підворот) з R2 на куті; припуск 4.5.' },
  zs_4: { materials: CERAMIC, execution: 'base', kind: 'form', form: 'фаска 1.5×1.5 на плиті 4 мм', ctx: 'С', how: 'Тонкий керамограніт 4 мм, фаска 1.5×1.5 (ділянка PANDA); креслення в каталозі нема.' },
  zs_6_15: { materials: CERAMIC, execution: 'base', kind: 'form', form: 'фаска 1.5×1.5 на плиті 6 мм', ctx: 'С', how: 'Тонкий керамограніт 6 мм, фаска 1.5×1.5 (PANDA); креслення нема.' },
  zs_6_3: { materials: CERAMIC, execution: 'base', kind: 'form', form: 'фаска 3×3 на плиті 6 мм', ctx: 'С', how: 'Тонкий керамограніт 6 мм, фаска 3×3 (PANDA); креслення нема.' },
  z_12: { materials: CERAMIC, execution: 'base', kind: 'operation', form: 'підготовка ребра під стик', how: 'Підготовка ребра під стик (припуск 1.5) — операція, а не видима форма.' },

  // ── кварцит, серія 20 (+ натуральний камінь як гіпотеза) ──
  ar_20: { materials: QUARTZ_AND_CERAMIC, execution: 'both', kind: 'form', form: 'фаска 2×2 зверху і знизу', ctx: 'С О М', how: HOW.quartzBoth },
  zs_20: { materials: QUARTZ_AND_CERAMIC, execution: 'both', kind: 'form', form: 'фаска 2×2 зверху', ctx: 'С О М', how: HOW.quartzBoth },
  r_3: { materials: QUARTZ, execution: 'both', kind: 'form', form: 'R3 зверху', ctx: 'П С О М', catalogCode: 'ZR20', how: 'ZR20 з каталогу (R3 зверху) — прив\'язка до «Крайка R3» не підтверджена. ' + HOW.quartzBoth },
  r_5: { materials: QUARTZ, execution: 'both', kind: 'form', form: 'R5 зверху', ctx: 'С О М', catalogCode: 'A20R5', how: 'A20R5 з каталогу (R5 зверху) — прив\'язка не підтверджена. ' + HOW.quartzBoth },
  r_10: { materials: QUARTZ, execution: 'both', kind: 'form', form: 'R10 зверху (пів товщини)', ctx: 'С О', catalogCode: 'A20', how: 'A20 з каталогу (R10 зверху) — прив\'язка не підтверджена. ' + HOW.quartzBoth },
  t_20: { materials: QUARTZ, execution: 'base', kind: 'form', form: 'R3 зверху і знизу', ctx: 'С М', how: HOW.quartzBase + ' На опуску в каталозі не показаний.' },
  l_20: { materials: QUARTZ, execution: 'base', kind: 'form', form: 'увігнутий R10 зверху', ctx: 'С', how: 'Увігнутий R10 зверху; ' + HOW.quartzBase.toLowerCase() },
  xd_20: { materials: QUARTZ, execution: 'base', kind: 'form', form: 'R7,5 зверху, під ним скіс 45° до низу', ctx: 'С', how: 'R7,5 зверху і скіс 45° під ним. ГІПОТЕЗА: як D12 — підготовка під стик 45°.' },
  d_20: { materials: QUARTZ, execution: 'base', kind: 'form', form: 'форма без креслення в каталозі', how: 'У каталозі 17.09.25 форми нема; питання цеху відкрите з 20.08.' },
  lv_40: { materials: QUARTZ, execution: 'buildup', kind: 'form', form: 'фігурний борт 40, хвиля', ctx: 'О', how: HOW.quartz40 },
  lv_40_inv: { materials: QUARTZ, execution: 'buildup', kind: 'form', form: 'LV40 дзеркально по вертикалі', ctx: 'О', how: HOW.quartz40 },
  o_40: { materials: QUARTZ, execution: 'buildup', kind: 'form', form: 'борт 40, виступ з увігнутим низом', ctx: 'О', how: HOW.quartz40 },
  u_40: { materials: QUARTZ, execution: 'buildup', kind: 'form', form: 'борт 40, півкругла хвиля', ctx: 'О', how: HOW.quartz40 },
  h_40: { materials: QUARTZ, execution: 'buildup', kind: 'form', form: 'борт 40, виступ з півкруглим низом', ctx: 'О', how: HOW.quartz40 },
  z_20: { materials: QUARTZ, execution: 'base', kind: 'operation', form: 'підготовка ребра під стик', how: 'Підготовка ребра під стик — операція, а не форма.' },
  antik: { materials: QUARTZ, execution: 'base', kind: 'operation', form: 'алмазні щітки, матовий фініш торця', how: 'Алмазні щітки для матових покриттів — фініш торця, не форма.' },
  edge_45: { execution: 'base', kind: 'operation', form: 'фрезування ребра під 45° (стик опуску)', how: 'Фрезування ребра під 45° — стик опуску/підвороту; операція, а не форма.' },

  // ── акрил ──
  acr_r3: { materials: ACRYLIC, execution: 'both', kind: 'form', form: 'радіус 3 зверху', ctx: 'П С О В', how: HOW.acrylicBoth },
  acr_r6: { materials: ACRYLIC, execution: 'both', kind: 'form', form: 'радіус 6 зверху', ctx: 'П С О В', how: HOW.acrylicBoth },
  acr_r8: { materials: ACRYLIC, execution: 'both', kind: 'form', form: 'радіус 8 зверху', ctx: 'П С О В', how: HOW.acrylicBoth },
  acr_r10: { materials: ACRYLIC, execution: 'both', kind: 'form', form: 'радіус 10 зверху', ctx: 'П С О В', how: HOW.acrylicBoth },
  acr_r12: { materials: ACRYLIC, execution: 'both', kind: 'form', form: 'радіус 12 зверху (вся товщина)', ctx: 'П С О', how: HOW.acrylicBoth },
  acr_r20: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'радіус 20 зверху', ctx: 'О', how: HOW.acrylicBuildup },
  acr_r3_3: { materials: ACRYLIC, execution: 'both', kind: 'form', form: 'R3 зверху і знизу', ctx: 'С О', how: HOW.acrylicBoth },
  acr_r6_6: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'R6 зверху і знизу', ctx: 'О', how: HOW.acrylicBuildup },
  acr_r8_8: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'R8 зверху і знизу', ctx: 'О', how: HOW.acrylicBuildup },
  acr_bullnose_r10: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'повний заокруглений торець R10+R10', ctx: 'О', how: HOW.acrylicBuildup },
  acr_bullnose_r12: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'повний заокруглений торець R12+R12', ctx: 'О', how: HOW.acrylicBuildup },
  acr_ch_5x5: { materials: ACRYLIC, execution: 'both', kind: 'form', form: 'фаска 5×5 зверху', ctx: 'П С О В', how: HOW.acrylicBoth },
  acr_ch_10x10: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'фаска 10×10 зверху', ctx: 'О В', how: HOW.acrylicBuildup },
  acr_ch_5x5_5x5: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'фаска 5×5 зверху і знизу', ctx: 'О', how: HOW.acrylicBuildup },
  acr_ch_10x10_10x10: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'фаска 10×10 зверху і знизу', ctx: 'О', how: HOW.acrylicBuildup },
  acr_cove_r6: { materials: ACRYLIC, execution: 'both', kind: 'form', form: 'увігнутий R6 зверху', ctx: 'П С О', how: HOW.acrylicBoth },
  acr_cove_r6_6: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'увігнутий R6 зверху і знизу', ctx: 'О', how: HOW.acrylicBuildup },
  acr_fillet_r10r12: { materials: ACRYLIC, execution: 'base', kind: 'form', form: 'галтель R10+R12 — перехід плінтуса в стільницю', ctx: 'П', how: 'Галтель — перехід плінтуса в стільницю, фрезерується на плінтусі.' },
  acr_shark45_r0: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'підклейка 33, скіс 45°, верх прямий', ctx: 'О', how: HOW.acrylicShark },
  acr_shark45_r3: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'підклейка 33, скіс 45° з R3', ctx: 'О', how: HOW.acrylicShark },
  acr_shark45_r6: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'підклейка 33, скіс 45° з R6', ctx: 'О', how: HOW.acrylicShark },
  acr_shark55_r0: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'підклейка 33, скіс 55°, верх прямий', ctx: 'О', how: HOW.acrylicShark },
  acr_shark55_r2: { materials: ACRYLIC, execution: 'base', kind: 'form', form: 'скіс 55° з R2 у базовій товщині', ctx: 'С', how: 'Скіс 55° з R2 у базовій товщині 10–12 (без підклейки).' },
  acr_shark55_r3: { materials: ACRYLIC, execution: 'both', kind: 'form', form: 'скіс 55° з R3', ctx: 'С О', how: 'Скіс 55° з R3: і в базовій товщині 10–12, і на підклейці 33.' },
  acr_shark55_r6: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'підклейка 33, скіс 55° з R6', ctx: 'О', how: HOW.acrylicShark },
  acr_shark225_r0: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'підклейка 33, скіс 22,5°, верх прямий', ctx: 'О', how: HOW.acrylicShark },
  acr_shark225_r3: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'підклейка 33, скіс 22,5° з R3', ctx: 'О', how: HOW.acrylicShark },
  acr_shark225_r6: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'підклейка 33, скіс 22,5° з R6', ctx: 'О', how: HOW.acrylicShark },
  acr_modern: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'тонкий верх R2 над утопленою підклейкою', ctx: 'О', how: 'Підклейка: тонкий верх R2 нависає над утопленою смугою.' },
  acr_spill_stop: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'бортик R12/R12 проти стікання', ctx: 'О', how: 'Підклейка: бортик R12/R12 проти стікання, формується на потовщеному торці.' },
  acr_classic1: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'R12 з полицею 2 зверху', ctx: 'О', how: 'Підклейка: R12 з полицею 2 мм зверху.' },
  acr_classic2: { materials: ACRYLIC, execution: 'buildup', kind: 'form', form: 'R12 з полицями 2 зверху і знизу', ctx: 'О', how: 'Підклейка: R12 з полицями 2 мм зверху і знизу.' },

  // ── спадок першого SlabCutPlanner: у каталозі цеху таких форм нема ──
  chamfer_45_r2: { execution: 'base', kind: 'legacy', form: 'скіс 45° з R2 (≈ D12)', how: 'Схоже на D12 (R2 + скіс 45°).' },
  chamfered_edge: { execution: 'base', kind: 'legacy', form: 'фаска 5 (≈ фаска 5×5)', how: 'Схоже на фаску 5×5 (акрил).' },
  half_bullnose: { execution: 'base', kind: 'legacy', form: 'пів-bullnose (≈ A20 / R12)', how: 'Схоже на A20 (R10) / R12 акрил.' },
  full_bullnose: { execution: 'base', kind: 'legacy', form: 'повний bullnose (≈ R10+R10 / R12+R12)', how: 'Схоже на BullNose R10+R10 / R12+R12 (акрил, підклейка).' },
  sharknose: { execution: 'base', kind: 'legacy', form: 'скіс 45° (≈ зріз 45° / SharkNose 45°)', how: 'Схоже на зріз 45° / SharkNose 45° (акрил, підклейка 33).' },
  straight_edge: { execution: 'base', kind: 'legacy', form: 'пряма без полірування (≈ R0)', how: 'Пряма без полірування — ≈ R0.' },
};

/** Клас невідомого id (профіль, доданий власником у довіднику руками). */
const UNKNOWN: EdgeProfileClass = { execution: 'base', kind: 'form' };

export function edgeProfileClass(id: string): EdgeProfileClass {
  return EDGE_PROFILE_CLASSES[id] ?? UNKNOWN;
}

export const EXECUTION_LABEL: Record<EdgeExecution, string> = {
  base: 'у товщині плити',
  buildup: 'лише з потовщенням (зрощення плит)',
  both: 'у товщині плити і на потовщенні',
};

/** Чи існує форма на матеріалі (порожній матеріал або універсальна форма — так). */
export function edgeProfileFitsMaterial(id: string, material?: string | null): boolean {
  const cls = edgeProfileClass(id);
  if (!cls.materials || !material) return true;
  return cls.materials.includes(material as MaterialType);
}

/** Підпис матеріалів для довідника: «Кварцит, Натуральний камінь» або «універсальна». */
export function edgeProfileMaterialsLabel(id: string): string {
  const cls = edgeProfileClass(id);
  return cls.materials ? cls.materials.join(', ') : 'універсальна';
}

export type EdgeProfileGroupKey =
  | 'universal'
  | 'base'
  | 'buildup'
  | 'operations'
  | 'other'
  | 'legacy';

export interface EdgeProfileGroup<T extends { id: string } = EdgeProfileDef> {
  key: EdgeProfileGroupKey;
  /** Заголовок групи у випадачці. */
  label: string;
  profiles: T[];
}

const MATERIAL_ORDER: readonly MaterialType[] = ['Керамограніт', 'Кварцит', 'Натуральний камінь', 'Акрил', 'Компакт-плита'];

function primaryMaterial(cls: EdgeProfileClass): string {
  if (!cls.materials?.length) return '';
  // «Кварцит» стоїть перед «Натуральний камінь» у власному списку — беремо перший
  return cls.materials[0];
}

/**
 * Розкласти профілі по групах для випадачки — порядок груп і є сортуванням
 * «по типу матеріалу»:
 *
 *   1. універсальні форми;
 *   2. форми ЦЬОГО матеріалу в товщині плити;
 *   3. форми ЦЬОГО матеріалу лише з потовщенням (зрощення плит);
 *   4. операції на торці (стик, антик, 45°);
 *   5. форми інших матеріалів — лишаються видимими (рішення 26.08), але внизу;
 *   6. спадок без каталогу.
 *
 * Без матеріалу (2)+(3) розкладаються по кожному матеріалу окремо, у порядку
 * MATERIAL_ORDER. Порожні групи не повертаються. Профілі всередині групи
 * зберігають порядок довідника.
 */
export function groupEdgeProfiles<T extends { id: string }>(
  profiles: readonly T[] | undefined,
  material?: string | null,
): EdgeProfileGroup<T>[] {
  const all = profiles ?? [];
  const universal: T[] = [];
  const base: T[] = [];
  const buildup: T[] = [];
  const operations: T[] = [];
  const legacy: T[] = [];
  const other: T[] = [];
  // без матеріалу: окремі групи по матеріалах
  const perMaterial = new Map<string, { base: T[]; buildup: T[] }>();

  for (const p of all) {
    const cls = edgeProfileClass(p.id);
    if (cls.kind === 'legacy') { legacy.push(p); continue; }
    if (cls.kind === 'operation') {
      if (edgeProfileFitsMaterial(p.id, material)) operations.push(p);
      else other.push(p);
      continue;
    }
    if (!cls.materials) { universal.push(p); continue; }
    if (!material) {
      const key = primaryMaterial(cls);
      const bucket = perMaterial.get(key) ?? { base: [], buildup: [] };
      (cls.execution === 'buildup' ? bucket.buildup : bucket.base).push(p);
      perMaterial.set(key, bucket);
      continue;
    }
    if (!cls.materials.includes(material as MaterialType)) { other.push(p); continue; }
    (cls.execution === 'buildup' ? buildup : base).push(p);
  }

  const groups: EdgeProfileGroup<T>[] = [];
  const push = (key: EdgeProfileGroupKey, label: string, list: T[]) => { if (list.length) groups.push({ key, label, profiles: list }); };

  push('universal', 'Універсальні', universal);
  if (material) {
    push('base', `${material} — у товщині плити`, base);
    push('buildup', `${material} — лише з потовщенням (зрощення плит)`, buildup);
  } else {
    const keys = [...perMaterial.keys()].sort((a, b) => MATERIAL_ORDER.indexOf(a as MaterialType) - MATERIAL_ORDER.indexOf(b as MaterialType));
    for (const key of keys) {
      const bucket = perMaterial.get(key)!;
      push('base', `${key} — у товщині плити`, bucket.base);
      push('buildup', `${key} — лише з потовщенням (зрощення плит)`, bucket.buildup);
    }
  }
  push('operations', 'Операції торця (не форма)', operations);
  // інші матеріали — за порядком матеріалів, потім порядок довідника
  other.sort((a, b) => MATERIAL_ORDER.indexOf(primaryMaterial(edgeProfileClass(a.id)) as MaterialType) - MATERIAL_ORDER.indexOf(primaryMaterial(edgeProfileClass(b.id)) as MaterialType));
  push('other', 'Інші матеріали', other);
  push('legacy', 'Спадок — у каталозі цеху нема', legacy);
  return groups;
}

/** Підказка для option/рядка довідника: «Кварцит, Натуральний камінь · лише з потовщенням … · як робиться». */
export function edgeProfileHint(id: string): string {
  const cls = edgeProfileClass(id);
  const parts = [edgeProfileMaterialsLabel(id), EXECUTION_LABEL[cls.execution]];
  if (cls.kind === 'operation') parts.push('операція, не форма');
  if (cls.kind === 'legacy') parts.push('спадок, у каталозі нема');
  if (cls.how) parts.push(cls.how);
  return parts.join(' · ');
}
