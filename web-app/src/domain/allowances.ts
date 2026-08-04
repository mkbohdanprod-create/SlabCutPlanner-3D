// =====================================================================
//  src/domain/allowances.ts
//  Єдине джерело припусків, пропилів і вибігів інструменту.
//
//  До цього модуля та сама матеріальна логіка жила у трьох місцях:
//    · store/slices/projectSlice.ts   — припуск для карти крою
//    · engines/servicesExtractor.ts   — вибіг інструменту для кошторису
//    · components/2d/PlacementPropertiesPanel.tsx — те саме для прев'ю
//  Три копії означали три різні майбутні значення: варто було правити
//  одну — і карта крою розходилась із кошторисом. А розходження тут —
//  це не косметика, це деталь, яка не влізла в сляб.
//
//  Числа підтверджені замовником 31.07.2026 і звірені з
//  InstructionsRules/Послуги/CUTTING_RULES_TZ.md. Там, де довідник
//  послуг 1С (SERVICES_LIST.md) каже інше, правильним є значення звідси.
//
//  Модуль чистий: жодних імпортів зі store чи React.
// =====================================================================

import type { MaterialType } from './types';

// ── Пропил інструменту ───────────────────────────────────────────────
//  Матеріал, який фізично знищується різом. Не плутати з зазором між
//  деталями (project.allowances.interPartSpacing) — той задається
//  користувачем і може бути більшим за пропил.
//
//  Увага: SERVICES_LIST.md у позиціях 195299 / 195300 / 219977 вказує
//  «прохід пили 3 мм», а в 195304 — «прохід води 1 мм». Обидва значення
//  застарілі, підтверджені — нижче.
export const KERF_MM = {
  /** Дискова пила (Breton Combicut / Combicat) */
  saw: 4.0,
  /** Гідроабразив (WaterJet) */
  waterjet: 1.5,
} as const;

// ── Припуски на обробку торця ────────────────────────────────────────
//  Додатковий матеріал, який лишається на чорновій деталі, щоб фреза
//  на ЧПК зняла пошкоджений різом шар і сформувала чистий профіль.
export const EDGE_ALLOWANCE_MM = {
  /** Більшість профілів крайки */
  default: 2.5,
  /** D12 — профіль потребує більшого запасу під фрезу */
  d12: 4.5,
} as const;

/** Припуск на сторону, якою деталь стикується з іншою */
export const JOINT_ALLOWANCE_MM = 1.5;

/**
 * Припуск по периметру вирізу під мийку. Кварцит твердіший і крихкіший:
 * після чорнового пробиття водою по краю лишаються мікротріщини, і 4 мм —
 * це гарантія, що фреза зріже весь пошкоджений шар.
 */
export const SINK_CUTOUT_ALLOWANCE_MM: Partial<Record<MaterialType, number>> = {
  'Керамограніт': 2.0,
  'Кварцит': 4.0,
};

/** Припуск під мийку для матеріалів, яких немає в таблиці вище */
export const SINK_CUTOUT_ALLOWANCE_FALLBACK_MM = 2.0;

// ── Матеріальні групи ────────────────────────────────────────────────
//  Акрил і компакт-плита ріжуться інакше, ніж камінь: фреза не потребує
//  довгого вибігу за контур, тому припуск профілю використовується як є.
const SOFT_MATERIALS: readonly string[] = ['Акрил', 'Компакт-плита'];

export function isSoftMaterial(material?: MaterialType | string | null): boolean {
  return !!material && SOFT_MATERIALS.includes(material);
}

/** Фіксований припуск компакт-плити, мм */
export const COMPACT_ALLOWANCE_MM = 1;
/** Фіксований припуск акрилу, мм */
export const ACRYLIC_ALLOWANCE_MM = 3;

// ── Коротка кромка ───────────────────────────────────────────────────
//  Накладка довжиною до 30 мм, задана не на всю сторону, не потребує
//  припуску: вона не визначає габарит деталі на карті крою.
export const SHORT_EDGE_MAX_MM = 30;

export type EdgeTreatmentLike = {
  isFullLength?: boolean;
  size?: number;
};

export function isShortEdge(treatment?: EdgeTreatmentLike | null): boolean {
  if (!treatment) return false;
  return treatment.isFullLength === false && !!treatment.size && treatment.size <= SHORT_EDGE_MAX_MM;
}

// ── Вибіг інструменту вздовж сторони ─────────────────────────────────
//  Фреза заходить на деталь і сходить з неї за межами чистового розміру.
//  На камені це фіксовані 30 мм; на м'яких матеріалах — рівно припуск
//  профілю.
export const STONE_TOOL_OUT_MM = 30;

/**
 * Вибіг інструменту, мм.
 *
 * @param softFallbackMm  Значення для м'яких матеріалів, коли у профілю
 *   припуск = 0. Прев'ю в панелі властивостей показує 2 мм, щоб довжина
 *   обробки не дорівнювала повній стороні; рушій кошторису лишає 0.
 *   Різниця свідома і зафіксована тут явно, а не розкидана по файлах.
 */
export function edgeToolOutMm(
  material: MaterialType | string | undefined | null,
  profileAllowanceMm: number | undefined,
  opts?: { softFallbackMm?: number },
): number {
  if (isSoftMaterial(material)) {
    return (profileAllowanceMm || 0) || (opts?.softFallbackMm ?? 0);
  }
  return STONE_TOOL_OUT_MM;
}

// ── Припуск сторони для карти крою ───────────────────────────────────

export type EdgeAllowanceArgs = {
  material?: MaterialType | string | null;
  /** allowance із довідника профілю (referenceData.edgeProfiles[].allowance) */
  profileAllowanceMm?: number;
  treatment?: EdgeTreatmentLike | null;
};

/**
 * Скільки міліметрів додати до сторони деталі на карті крою під обробку
 * торця. Це те число, через яке чорнова деталь більша за чистову.
 *
 * Порядок рішень навмисно такий самий, як був у projectSlice: спершу
 * матеріал із фіксованим припуском, потім камінь із урахуванням
 * короткої кромки.
 */
export function edgeAllowanceMm({ material, profileAllowanceMm, treatment }: EdgeAllowanceArgs): number {
  if (material === 'Компакт-плита') return COMPACT_ALLOWANCE_MM;
  if (material === 'Акрил') return ACRYLIC_ALLOWANCE_MM;

  // Керамограніт, кварцит, натуральний камінь
  if (isShortEdge(treatment)) return 0;
  const fromProfile = profileAllowanceMm ?? 0;
  return fromProfile > 0 ? fromProfile : EDGE_ALLOWANCE_MM.default;
}

/** Припуск під виріз мийки для конкретного матеріалу, мм */
export function sinkCutoutAllowanceMm(material?: MaterialType | string | null): number {
  if (!material) return SINK_CUTOUT_ALLOWANCE_FALLBACK_MM;
  return SINK_CUTOUT_ALLOWANCE_MM[material as MaterialType] ?? SINK_CUTOUT_ALLOWANCE_FALLBACK_MM;
}
