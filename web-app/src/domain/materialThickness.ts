import type { MaterialType } from './types';
import { MATERIALS_IN_USE } from './defaults';

/**
 * ТОВЩИНИ ЗА МАТЕРІАЛОМ (рішення власника 01.09.2026).
 *
 * У програмі буде окрема логіка створення виробів під кожен матеріал
 * (керамограніт → кварцит → натуральний камінь → акрил; компакт-плита
 * поки не показується взагалі). Перший спільний крок для всіх: матеріал
 * обирається ОБОВ'ЯЗКОВО при створенні виробу, і від нього залежить,
 * які товщини можна вживати в цьому виробі. Кілька товщин в одному
 * виробі — можна (стільниця 12, бортик 20), але лише з переліку
 * матеріалу.
 *
 * ЄДИНЕ місце, де ці переліки живуть. Модалка «Новий виріб» і
 * «Налаштування елемента» читають звідси; зашитих списків 12/20/30/40
 * у компонентах більше немає.
 *
 * Чому в кварциту немає 40, хоч ТУ згадують кромки U40/H40/O40/LV40
 * (відповідь власника 01.09): це НЕ плита 40 мм, а 20 мм + потовщення
 * (підклейка смуги під торець). Товщина плити лишається 20; «40» —
 * властивість обробки торця, не матеріалу.
 */
export const MATERIAL_THICKNESSES: Record<MaterialType, readonly number[]> = {
  'Керамограніт': [2, 3, 4, 5, 6, 9, 12, 20],
  'Натуральний камінь': [20],
  'Кварцит': [12, 20, 30],
  'Акрил': [12],
  /** Не показуємо і не пропонуємо — читаємо лише старі документи. */
  'Компакт-плита': [],
};

/**
 * Матеріали, у яких, крім переліку, дозволена ДОВІЛЬНА товщина
 * (натуральний камінь: плити приходять якими є). Це особливі умови —
 * менеджер мусить їх прочитати і підтвердити, перш ніж виріб створиться.
 */
export const MANUAL_THICKNESS_MATERIALS: ReadonlySet<MaterialType> = new Set<MaterialType>(['Натуральний камінь']);

/** Межі ручної товщини, мм — фізичний здоровий глузд, не ТУ. */
export const MANUAL_THICKNESS_RANGE = { min: 8, max: 60 } as const;

/**
 * `[ЧЕРНЕТКА — текст узгодити з власником/технологом]`
 * Що саме має прочитати менеджер, обираючи нестандартну товщину
 * натурального каменю. Формулювання нижче — робоче; після узгодження
 * правиться тільки тут.
 */
export const MANUAL_THICKNESS_CONDITIONS: readonly string[] = [
  'Товщина береться з фактичної плити, а не з довідника — перед прорахунком звірити з наявним слебом.',
  'Профілі торця, радіуси і посадочні розміри під мийку розраховані на 20 мм; на іншій товщині їх узгоджує технолог.',
  'Ціна і терміни на нестандартну товщину — після підтвердження цеху, не з автоматичного прорахунку.',
];

/** Матеріали, які пропонуються при створенні виробу (без компакт-плити). */
export function materialsForNewProduct(): MaterialType[] {
  return MATERIALS_IN_USE.filter((m) => MATERIAL_THICKNESSES[m].length > 0);
}

/** Перелік товщин для матеріалу; без матеріалу — порожньо. */
export function thicknessesFor(material?: MaterialType | null): number[] {
  if (!material) return [];
  return [...(MATERIAL_THICKNESSES[material] ?? [])];
}

/** Чи дозволена матеріалу ручна (довільна) товщина. */
export function allowsManualThickness(material?: MaterialType | null): boolean {
  return Boolean(material && MANUAL_THICKNESS_MATERIALS.has(material));
}

/**
 * Чи можна вживати товщину `t` у виробі з матеріалу `material`.
 * Ручна товщина натурального каменю проходить, якщо в межах здорового
 * глузду. Без матеріалу (старі проєкти) — не обмежуємо.
 */
export function isThicknessAllowed(material: MaterialType | null | undefined, t: number): boolean {
  if (!material) return true;
  if (!Number.isFinite(t) || t <= 0) return false;
  if (MATERIAL_THICKNESSES[material]?.includes(t)) return true;
  if (allowsManualThickness(material)) return t >= MANUAL_THICKNESS_RANGE.min && t <= MANUAL_THICKNESS_RANGE.max;
  return false;
}

/**
 * Товщина за замовчуванням для нового виробу: 20, якщо матеріал її має
 * (найпоширеніша стільниця), інакше — перша з переліку.
 */
export function defaultThicknessFor(material?: MaterialType | null): number {
  const list = thicknessesFor(material);
  if (!list.length) return 20;
  return list.includes(20) ? 20 : list[0];
}

/* ═══════════════════════════════════════════════════════════════════
   ПІДКАЗКИ ПРО ТОВЩИНУ (рішення власника 01.09.2026, друга частина).
   Це інформація для менеджера, НЕ обмеження: виріб створюється з будь-якою
   товщиною з переліку. Обмеження по деталях — наступний крок.
   ═══════════════════════════════════════════════════════════════════ */

/** Загальне для всіх матеріалів — показується біля вибору товщини. */
export const DECOR_AVAILABILITY_HINT =
  'Перед вибором товщини рекомендовано перевірити, чи є обраний декор у цій товщині.';

export interface ThicknessUsageHint {
  /** Діапазон товщин, мм (включно) */
  min: number;
  max: number;
  /** Для чого ця товщина — слова власника */
  use: string;
  /** Типи деталей, яким ця товщина «рідна»; порожньо — будь-яким */
  detailTypes: readonly string[];
}

/**
 * Керамограніт за товщиною (слова власника 01.09):
 *   2–3   — декоративні елементи, облицювання, фасади (за принципом
 *           облицювання МДФ);
 *   4–12  — стінові панелі;
 *   12–20 — стільниці.
 * 12 навмисно в обох діапазонах: і панель, і стільниця.
 */
export const THICKNESS_USAGE_HINTS: Partial<Record<MaterialType, readonly ThicknessUsageHint[]>> = {
  'Керамограніт': [
    { min: 2, max: 3, use: 'декоративні елементи, облицювання, фасади (за принципом облицювання МДФ)', detailTypes: ['Фасад', 'Довільний елемент'] },
    { min: 4, max: 12, use: 'стінові панелі', detailTypes: ['Стінова панель'] },
    { min: 12, max: 20, use: 'стільниці', detailTypes: ['Стільниця'] },
  ],
};

/** Підказки матеріалу, або порожньо. */
export function thicknessUsageFor(material?: MaterialType | null): readonly ThicknessUsageHint[] {
  if (!material) return [];
  return THICKNESS_USAGE_HINTS[material] ?? [];
}

/** Діапазони, у які потрапляє товщина `t`. */
export function usageRangesFor(material: MaterialType | null | undefined, t: number): ThicknessUsageHint[] {
  return thicknessUsageFor(material).filter((h) => t >= h.min && t <= h.max);
}

/**
 * М'яка підказка, коли тип деталі не «рідний» для обраної товщини
 * (стільниця на 3 мм). Повертає текст або undefined — ніколи не блокує.
 */
export function thicknessTypeHint(
  material: MaterialType | null | undefined,
  t: number,
  detailType: string,
): string | undefined {
  const hints = thicknessUsageFor(material);
  if (!hints.length) return undefined;
  const ranges = usageRangesFor(material, t);
  if (!ranges.length) return undefined;
  if (ranges.some((r) => !r.detailTypes.length || r.detailTypes.includes(detailType))) return undefined;
  const native = hints.filter((h) => h.detailTypes.includes(detailType));
  const nativeText = native.length
    ? ` Для «${detailType}» — ${native.map((h) => `${h.min}–${h.max} мм`).join(', ')}.`
    : '';
  return `${t} мм — це ${ranges.map((r) => r.use).join('; ')}.${nativeText}`;
}
