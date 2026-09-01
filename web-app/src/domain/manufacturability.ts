// =====================================================================
//  src/domain/manufacturability.ts
//  Перевірка виробничості: чи можна це фізично зробити і чи не втрачає
//  клієнт гарантію.
//
//  Числа з InstructionsRules/Послуги/CUTTING_RULES_TZ.md. Це не поради —
//  за ними стоять присоски, які тримають деталь під час різу, крихкість
//  кварциту після гідроабразиву й діаметр фрези, яка фізично не зайде в
//  малий радіус.
//
//  Дві категорії строгості:
//    · error      — так зробити не можна, верстат не візьме
//    · guarantee  — зробити можна, але клієнт втрачає гарантію на виріб.
//                   Саме так це і має бути сформульовано користувачу:
//                   не заборона, а свідомий вибір із наслідком.
//
//  Модуль чистий: типи + geometryUtils, жодного store і React.
// =====================================================================

import type { CornerProcessing, Detail, DetailPart, MaterialType, Point, Product, ProductElement, Project } from './types';
import { pointsBounds, polygonDistance } from '../engines/geometryUtils';

// ── Межі ─────────────────────────────────────────────────────────────

/** Мінімальні габарити деталі, яка піде на подальшу обробку (ЧПК), мм */
export const MIN_PART_WITH_PROCESSING = { long: 400, short: 200 } as const;

/** Максимальні габарити деталі для обробки торця на NC300, мм */
export const MAX_PART_FOR_PROCESSING = { long: 3100, short: 1500 } as const;

/**
 * ПОРІГ КОРОТКОЇ СТОРОНИ (FG-10).
 *
 * До 20.08 число 150 було зашите просто в компонент вікна деталі й
 * ГАСИЛО кнопку «Зберегти». Фокус-група вперлась у це на реальному
 * замовленні: смугу 2800×32 завести стало неможливо, хоча цех такі
 * ріже — на підкладці або з іншим базуванням.
 *
 * Тому це поріг ПОПЕРЕДЖЕННЯ, а не заборони: система каже, що деталь
 * ризикована, і лишає рішення менеджеру. Заборонами лишаються тільки
 * ті правила, де верстат фізично не візьме деталь (severity 'error'
 * нижче в цьому файлі).
 *
 * Число залежить від матеріалу — керамограніт і акрил ламаються
 * по-різному, — тому воно перевизначається в налаштуваннях. Порожньо
 * означає «як було»: 150 мм.
 */
export const DEFAULT_MIN_SIDE_MM = 150;

/**
 * Поріг для конкретного матеріалу. `overrides` — з налаштувань
 * (`useSettingsStore.minSideMm`), ключ — назва матеріалу проєкту.
 *
 * Нуль і від'ємне трактуються як «перевірку вимкнено»: старший менеджер
 * має право зняти попередження зовсім, і це не помилка вводу.
 */
export function minSideMmFor(
  material: string | undefined,
  overrides?: Record<string, number>,
): number {
  const value = material ? overrides?.[material] : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_MIN_SIDE_MM;
}

/**
 * Мінімальна ширина чорнової деталі залежно від довжини, мм.
 * Тонка деталь має бути короткою, інакше зламається на вібрації пили;
 * довга — достатньо широкою, щоб не тріснути.
 */
export function minRawWidthForLength(lengthMm: number): number {
  return lengthMm <= 200 ? 10 : 30;
}

export const HOLE_LIMITS = {
  /** Мінімальний діаметр отвору, мм */
  minDiameter: 6,
  /** Поріг «малий / великий» отвір, мм */
  sizeThreshold: 100,
  /** Мінімальний відступ малого отвору від краю, мм */
  minEdgeDistanceSmall: 12.5,
  /** Мінімальний відступ великого отвору від краю, мм */
  minEdgeDistanceLarge: 50,
  /** Ширина деталі, від якої максимальний діаметр рахується як ширина − 100 */
  wideDetailThreshold: 700,
} as const;

export const CUTOUT_LIMITS = {
  /** Гарантійний відступ вирізу від краю деталі, мм */
  minEdgeDistance: 50,
  /** Гарантійна відстань між сусідніми вирізами, мм */
  minDistanceBetween: 100,
} as const;

export const RADIUS_LIMITS = {
  /** Мінімальний зовнішній радіус деталі, мм */
  outerMin: 60,
  /** Мінімальний внутрішній радіус, якщо на ньому замовлена крайка, мм */
  innerWithEdgeMin: 15,
  /**
   * Радіус, нижче якого гнуту ділянку треба узгодити з технологом, мм.
   *
   * Рішення Богдана (19.08): для ВСІХ матеріалів. Це не заборона — виріб
   * рахується і йде далі, — а попередження, бо чи вдасться зігнути смугу на
   * такому радіусі, залежить від матеріалу, товщини й вильоту, і цього
   * програма не знає.
   */
  technologistConsultMin: 100,
} as const;

/** Мінімальний радіус у куті вирізу — залежить від крихкості матеріалу, мм */
export const CUTOUT_CORNER_RADIUS_MIN: Partial<Record<MaterialType, number>> = {
  'Керамограніт': 5,
  'Кварцит': 3,
};

// ── Результат ────────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'guarantee';

export type IssueCode =
  | 'part_too_small'
  | 'part_too_large'
  | 'raw_part_too_narrow'
  | 'hole_too_small'
  | 'hole_too_close_to_edge'
  | 'hole_too_large_for_part'
  | 'cutout_too_close_to_edge'
  | 'cutouts_too_close'
  | 'cutout_corner_radius'
  | 'outer_radius_too_small'
  | 'inner_radius_with_edge'
  | 'radius_needs_technologist'
  | 'radius_material_unpriced';

export interface ManufacturabilityIssue {
  code: IssueCode;
  severity: IssueSeverity;
  /** Що саме не так — готовий текст для користувача */
  message: string;
  /** Чому так, простими словами */
  reason?: string;
  ref: {
    partId?: string;
    detailId?: string;
    partName?: string;
    cutoutIndex?: number;
    cornerId?: string;
    elementPath?: string;
  };
}

export interface ManufacturabilityOptions {
  details?: Detail[];
}

// ── Дрібне ───────────────────────────────────────────────────────────

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

/** Чи схожий полігон на коло — та сама перевірка, що в рушії фактів */
function isCircleLike(points: Point[], tolerance = 0.08): boolean {
  if (points.length < 8) return false;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  let min = Infinity;
  let max = 0;
  for (const p of points) {
    const r = Math.hypot(p.x - cx, p.y - cy);
    if (r < min) min = r;
    if (r > max) max = r;
  }
  if (max <= 0) return false;
  return (max - min) / max <= tolerance;
}

function walkElements(products: Product[] | undefined) {
  const out: { productId: string; path: string; element: ProductElement }[] = [];
  const visit = (productId: string, element: ProductElement, path: string) => {
    out.push({ productId, path, element });
    (element.additions ?? []).forEach((child, index) => visit(productId, child, `${path}/${child.id ?? index}`));
  };
  (products ?? []).forEach((product) => {
    (product.elements ?? []).forEach((element, index) => visit(product.id, element, `${product.id}/${element.id ?? index}`));
  });
  return out;
}

// ── Перевірка ────────────────────────────────────────────────────────

export function checkManufacturability(
  project: Project,
  parts: DetailPart[],
  options: ManufacturabilityOptions = {},
): ManufacturabilityIssue[] {
  const issues: ManufacturabilityIssue[] = [];
  const details = options.details ?? project.details ?? [];
  const detailsById = new Map(details.map((detail) => [detail.id, detail]));
  const material = project.projectMaterial as MaterialType | undefined;

  const mainParts = (parts ?? []).filter((part) => part.isMain && (part.points?.length ?? 0) >= 3);

  mainParts.forEach((part) => {
    const bounds = pointsBounds(part.points);
    const long = Math.max(bounds.width, bounds.height);
    const short = Math.min(bounds.width, bounds.height);
    const detail = detailsById.get(part.detailId);
    const ref = { partId: part.id, detailId: part.detailId, partName: part.name };

    const hasEdgeProcessing = Object.values(detail?.edgeProfiles ?? {}).some(Boolean);
    const hasHoles = (part.holes?.length ?? 0) > 0;
    const needsMachining = hasEdgeProcessing || hasHoles;

    // ── габарити деталі ──────────────────────────────────────────────
    if (needsMachining) {
      if (long < MIN_PART_WITH_PROCESSING.long || short < MIN_PART_WITH_PROCESSING.short) {
        issues.push({
          code: 'part_too_small',
          severity: 'error',
          message: `«${part.name}» — ${round1(long)}×${round1(short)} мм. Деталь із обробкою не може бути меншою за ${MIN_PART_WITH_PROCESSING.long}×${MIN_PART_WITH_PROCESSING.short} мм`,
          reason: 'Менша деталь не втримається присосками верстата під час фрезерування',
          ref,
        });
      }
      if (long > MAX_PART_FOR_PROCESSING.long || short > MAX_PART_FOR_PROCESSING.short) {
        issues.push({
          code: 'part_too_large',
          severity: 'error',
          message: `«${part.name}» — ${round1(long)}×${round1(short)} мм. Більше за ${MAX_PART_FOR_PROCESSING.long}×${MAX_PART_FOR_PROCESSING.short} мм на верстат не заходить`,
          reason: 'Робоче поле NC300 обмежене — деталь треба ділити стиком',
          ref,
        });
      }
    } else {
      const minWidth = minRawWidthForLength(long);
      if (short < minWidth) {
        issues.push({
          code: 'raw_part_too_narrow',
          severity: 'error',
          message: `«${part.name}» — ${round1(long)}×${round1(short)} мм. За довжини ${round1(long)} мм ширина має бути від ${minWidth} мм`,
          reason: 'Вузька довга деталь тріскає від вібрації пили',
          ref,
        });
      }
    }

    // ── отвори та вирізи ─────────────────────────────────────────────
    const holes = part.holes ?? [];
    holes.forEach((hole, cutoutIndex) => {
      if (!hole || hole.length < 3) return;
      const holeBounds = pointsBounds(hole);
      const size = Math.max(holeBounds.width, holeBounds.height);
      const edgeDistance = polygonDistance(part.points, hole);
      const holeRef = { ...ref, cutoutIndex };

      if (isCircleLike(hole)) {
        if (size < HOLE_LIMITS.minDiameter) {
          issues.push({
            code: 'hole_too_small',
            severity: 'error',
            message: `«${part.name}»: отвір Ø${round1(size)} мм. Мінімум — Ø${HOLE_LIMITS.minDiameter} мм`,
            reason: 'Тоншого інструмента для наскрізного отвору немає',
            ref: holeRef,
          });
        }

        const isSmall = size < HOLE_LIMITS.sizeThreshold;
        const required = isSmall ? HOLE_LIMITS.minEdgeDistanceSmall : HOLE_LIMITS.minEdgeDistanceLarge;
        if (edgeDistance < required) {
          issues.push({
            code: 'hole_too_close_to_edge',
            severity: 'guarantee',
            message: `«${part.name}»: отвір Ø${round1(size)} мм за ${round1(edgeDistance)} мм від краю. Гарантійний мінімум — ${required} мм`,
            reason: 'Ближче до краю деталь може розколотись при транспортуванні або монтажі — гарантія не діє',
            ref: holeRef,
          });
        }

        if (!isSmall && short > HOLE_LIMITS.wideDetailThreshold) {
          const maxDiameter = short - 2 * HOLE_LIMITS.minEdgeDistanceLarge;
          if (size > maxDiameter) {
            issues.push({
              code: 'hole_too_large_for_part',
              severity: 'guarantee',
              message: `«${part.name}»: отвір Ø${round1(size)} мм при ширині деталі ${round1(short)} мм. Максимум — Ø${round1(maxDiameter)} мм`,
              reason: 'По 50 мм матеріалу з кожного боку — це те, що тримає деталь цілою',
              ref: holeRef,
            });
          }
        }
      } else {
        if (edgeDistance < CUTOUT_LIMITS.minEdgeDistance) {
          issues.push({
            code: 'cutout_too_close_to_edge',
            severity: 'guarantee',
            message: `«${part.name}»: виріз за ${round1(edgeDistance)} мм від краю. Гарантійний мінімум — ${CUTOUT_LIMITS.minEdgeDistance} мм`,
            reason: 'Гострі кути вирізу — концентратори напруги; вузька перемичка до краю ламається першою',
            ref: holeRef,
          });
        }
      }

      // ── відстань між вирізами ──────────────────────────────────────
      for (let other = cutoutIndex + 1; other < holes.length; other += 1) {
        const neighbour = holes[other];
        if (!neighbour || neighbour.length < 3) continue;
        const between = polygonDistance(hole, neighbour);
        if (between < CUTOUT_LIMITS.minDistanceBetween) {
          issues.push({
            code: 'cutouts_too_close',
            severity: 'guarantee',
            message: `«${part.name}»: між вирізами ${round1(between)} мм. Гарантійний мінімум — ${CUTOUT_LIMITS.minDistanceBetween} мм`,
            reason: 'Перемичка між двома вирізами — найслабше місце стільниці',
            ref: { ...ref, cutoutIndex },
          });
        }
      }
    });
  });

  // ── кути ───────────────────────────────────────────────────────────
  const checkCorners = (
    corners: Record<string, CornerProcessing> | undefined,
    ref: ManufacturabilityIssue['ref'],
    label: string,
  ) => {
    Object.entries(corners ?? {}).forEach(([cornerId, corner]) => {
      if (!corner || corner.type !== 'radius') return;
      const radius = corner.radius ?? 0;
      if (radius <= 0) return;

      if (corner.reflex) {
        // Увігнутий кут — це внутрішній радіус. Крайка на ньому потребує
        // радіуса, у який фізично зайде фреза.
        if (corner.edgeProcessing && corner.edgeProcessing !== 'Без фрезерування' && radius < RADIUS_LIMITS.innerWithEdgeMin) {
          issues.push({
            code: 'inner_radius_with_edge',
            severity: 'error',
            message: `${label}, кут ${cornerId}: внутрішній радіус ${round1(radius)} мм із обробкою крайки. Мінімум — ${RADIUS_LIMITS.innerWithEdgeMin} мм`,
            reason: 'У менший радіус фреза профілю не зайде — торець не сформується',
            ref: { ...ref, cornerId },
          });
        }
        return;
      }

      if (radius < RADIUS_LIMITS.outerMin) {
        issues.push({
          code: 'outer_radius_too_small',
          severity: 'guarantee',
          message: `${label}, кут ${cornerId}: зовнішній радіус ${round1(radius)} мм. Рекомендований мінімум — ${RADIUS_LIMITS.outerMin} мм`,
          reason: 'Дрібний зовнішній радіус — вразливе місце при монтажі й транспортуванні',
          ref: { ...ref, cornerId },
        });
      } else if (radius < RADIUS_LIMITS.technologistConsultMin) {
        // Окреме попередження, а не жорсткіший поріг: радіус 60–100 мм для
        // самої деталі нормальний, питання виникає до ГНУТОЇ смуги на ньому.
        issues.push({
          code: 'radius_needs_technologist',
          severity: 'guarantee',
          message: `${label}, кут ${cornerId}: радіус ${round1(radius)} мм — узгодьте з технологом можливість обробки`,
          reason: 'Чи вдасться зігнути смугу на такому радіусі, залежить від матеріалу, товщини й вильоту',
          ref: { ...ref, cornerId },
        });
      }
    });
  };

  /**
   * Радіусний елемент на матеріалі, для якого прайс не має номенклатури.
   *
   * ТЗ описує чотири матеріали: керамограніт, натуральний камінь, кварцит і
   * акрил. Компакт-плити в переліку немає. Мовчки порахувати нуль — це рівно
   * та хвороба, від якої ми лікували стики і крайку, тому кажемо вголос.
   */
  const RADIUS_PRICED_MATERIALS = new Set(['Керамограніт', 'Натуральний камінь', 'Кварцит', 'Акрил']);
  const projectMaterial = project.projectMaterial;
  if (projectMaterial && !RADIUS_PRICED_MATERIALS.has(projectMaterial)) {
    (parts ?? []).filter((part) => part.radiusElement).forEach((part) => {
      issues.push({
        code: 'radius_material_unpriced',
        severity: 'guarantee',
        message: `${part.name}: радіусний елемент на матеріалі «${projectMaterial}» — тарифу в прайсі немає`,
        reason: 'Ціну на цей радіус треба узгодити з конструктором вручну, автоматично він порахується як нуль',
        ref: { partId: part.id, detailId: part.detailId },
      });
    });
  }

  walkElements(project.products).forEach(({ path, element }) => {
    checkCorners(
      element.baseDefinition?.corners as Record<string, CornerProcessing> | undefined,
      { elementPath: path },
      element.baseDefinition?.label || 'Елемент',
    );

    // Радіуси в кутах вирізів — залежать від матеріалу
    const minCornerRadius = material ? CUTOUT_CORNER_RADIUS_MIN[material] : undefined;
    if (minCornerRadius === undefined) return;
    Object.entries(element.baseDefinition?.cutouts ?? {}).forEach(([cutoutId, cutout]) => {
      if (!cutout || cutout.shape !== 'rect') return;
      const cornerRadius = cutout.cornerRadius ?? 0;
      if (cornerRadius > 0 && cornerRadius < minCornerRadius) {
        issues.push({
          code: 'cutout_corner_radius',
          severity: 'error',
          message: `Виріз ${cutoutId}: радіус у куті ${round1(cornerRadius)} мм. Для матеріалу «${material}» мінімум — ${minCornerRadius} мм`,
          reason: 'Менший радіус гідроабразив не витримає — у куті піде тріщина',
          ref: { elementPath: path },
        });
      }
    });
  });

  details.forEach((detail) => {
    if (detail.isProduct) return;
    checkCorners(
      detail.geometry?.corners as Record<string, CornerProcessing> | undefined,
      { detailId: detail.id },
      detail.label || 'Деталь',
    );
  });

  return issues;
}

/** Скільки з чого — для компактного підпису в інтерфейсі */
export function summarizeIssues(issues: ManufacturabilityIssue[]) {
  return {
    errors: issues.filter((issue) => issue.severity === 'error').length,
    guarantee: issues.filter((issue) => issue.severity === 'guarantee').length,
    total: issues.length,
  };
}
