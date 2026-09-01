/**
 * РАДІУСНІ (ГНУТІ) ЕЛЕМЕНТИ — FG-27, ТЗ від 19.08.2026.
 *
 * Смуга потовщення, підвороту, ноги чи панелі, яка проходить обидві сторони
 * скругленого кута, мусить обійти його по дузі. Пряма смуга рахується по
 * сегментах сторін, а вони закінчуються там, де починається скруглення, —
 * тобто на дугу не списувався ані матеріал, ані найдорожча операція цеху.
 *
 * ЩО КАЖЕ ТЗ, коротко:
 *
 *   · Два способи виготовлення, і вибір диктує МАТЕРІАЛ, а не користувач:
 *     камінь ріжуть сегментами і склеюють, акрил гнуть на матриці.
 *   · Послуга нараховується ЗА ШТУКУ — за кожен радіусний елемент.
 *     Категорія залежить від того, це стільниця чи опора, і від розміру.
 *   · Матеріал рахується окремо, по прямокутнику в розкрої, із технологічним
 *     запасом: 30% на сегментацію, 20% на гнуття.
 *   · Для гнуття додається МАТРИЦЯ — але не за кількістю радіусів, а за
 *     кількістю унікальних геометрій: чотири однакові R500 гнуть на одній
 *     матриці, а R400+R500+R800 потребують трьох.
 *
 * Модуль спільний навмисно: смуги народжуються у ДВОХ місцях — у виробі це
 * окремі Елементи (`buildProductFromSession`), у легасі-деталях це галочки
 * `detail.fold`/`detail.thickening` (рушій). Правило має бути одне, інакше
 * виріб і імпортована деталь порахуються по-різному.
 */
import type { CornerProcessing, EdgeFeature, MaterialType } from './types';

// ── Спосіб виготовлення ──────────────────────────────────────────────

export type RadiusMethod = 'segments' | 'bending';

/**
 * Спосіб виготовлення за матеріалом (ТЗ, розділ 1).
 *
 * Керамограніт, натуральний камінь і кварцит ріжуть сегментами; акрил
 * термоформують на матриці. Компакт-плити в таблиці ТЗ немає — вона
 * поводиться як листовий матеріал, який ріжуть, тому за замовчуванням
 * іде в сегментацію. Якщо цех робить інакше — міняти тут, одне місце.
 */
export function radiusMethodFor(material: MaterialType | undefined): RadiusMethod {
  return material === 'Акрил' ? 'bending' : 'segments';
}

/**
 * Технологічний запас матеріалу (ТЗ, п. 2.3 і 3.5).
 *
 * Гнуту деталь не можна відрізати в розмір: частина довжини йде в стик
 * сегментів або в затиск матриці. Сегментація дорожча за втратами — 30%,
 * гнуття — 20%.
 */
export function radiusReserveFor(method: RadiusMethod): number {
  return method === 'bending' ? 1.2 : 1.3;
}

// ── Роль елемента ────────────────────────────────────────────────────

/**
 * Чим є ця смуга для прайсу: краєм стільниці чи опорою.
 *
 * Стільниця класифікується за товщиною (до 80 / 80–200 мм), опора — за
 * висотою (до 900 / понад 900 мм). Усе, що не лягає в жодну категорію
 * (стінова панель на дузі, товщина понад 200 мм), іде як складний радіус:
 * краще окрема позиція, яку конструктор оцінить вручну, ніж мовчазне
 * підведення під найдешевший тариф.
 */
export type RadiusRole = 'countertop' | 'leg' | 'other';

export function radiusRoleForType(detailType: string | undefined): RadiusRole {
  if (detailType === 'Опора') return 'leg';
  if (detailType === 'Потовщення' || detailType === 'Підворот' || detailType === 'Бортик') return 'countertop';
  return 'other';
}

// ── Категорія послуги ────────────────────────────────────────────────

/** Пороги з ТЗ. Винесені константами — це числа бізнесу, не магія коду. */
export const RADIUS_LIMITS_SPEC = {
  /** Товщина потовщеної стільниці: межа між першою і другою категорією, мм */
  countertopThin: 80,
  /** Максимальна товщина стільниці, яку прайс іще знає, мм */
  countertopMax: 200,
  /** Висота опори: межа між третьою і четвертою категорією, мм */
  legShort: 900,
  /** Радіус гнуття: межа між категоріями матриці й гнуття, мм */
  bendRadius: 600,
} as const;

/** Радіус, нижче якого треба узгодити з технологом (не заборона). */
export const RADIUS_TECHNOLOGIST_MIN = 100;

export type RadiusServiceKind =
  // Сегментація
  | 'countertop_le80'
  | 'countertop_80_200'
  | 'leg_le900'
  | 'leg_gt900'
  | 'complex'
  // Гнуття
  | 'bend_le600'
  | 'bend_gt600';

export type RadiusMatrixKind = 'matrix_le600' | 'matrix_gt600' | 'matrix_complex';

export interface RadiusClassifyInput {
  method: RadiusMethod;
  role: RadiusRole;
  /** Виліт смуги, мм: товщина краю стільниці або висота опори */
  bandSizeMm: number;
  radiusMm: number;
  /** Користувач позначив кут як складний — його вибір сильніший за автомат */
  complex?: boolean;
}

/** Категорія послуги виготовлення радіусного елемента (ТЗ, п. 2.2 і 3.2). */
export function classifyRadiusService(input: RadiusClassifyInput): RadiusServiceKind {
  if (input.complex) return 'complex';

  if (input.method === 'bending') {
    // Гнуття класифікується ТІЛЬКИ за радіусом — розмір смуги на нього не впливає.
    return input.radiusMm <= RADIUS_LIMITS_SPEC.bendRadius ? 'bend_le600' : 'bend_gt600';
  }

  if (input.role === 'leg') {
    return input.bandSizeMm <= RADIUS_LIMITS_SPEC.legShort ? 'leg_le900' : 'leg_gt900';
  }

  if (input.role === 'countertop') {
    if (input.bandSizeMm <= RADIUS_LIMITS_SPEC.countertopThin) return 'countertop_le80';
    if (input.bandSizeMm <= RADIUS_LIMITS_SPEC.countertopMax) return 'countertop_80_200';
    // Понад 200 мм прайс не знає — це вже нестандарт.
    return 'complex';
  }

  return 'complex';
}

/** Категорія матриці — та сама логіка, що й у гнуття (ТЗ, п. 3.3). */
export function classifyRadiusMatrix(input: RadiusClassifyInput): RadiusMatrixKind {
  if (input.complex) return 'matrix_complex';
  return input.radiusMm <= RADIUS_LIMITS_SPEC.bendRadius ? 'matrix_le600' : 'matrix_gt600';
}

/**
 * Ключ унікальності матриці (ТЗ, п. 3.4).
 *
 * «Унікальна геометрія» — це не просто радіус. Дві дуги R500 різної висоти
 * або з різним кутом розкриття потребують РІЗНИХ матриць: форма, на яку
 * кладуть лист, має збігатися з деталлю повністю. Тому в ключ ідуть радіус,
 * виліт смуги і кут дуги, округлені до цілого — щоб дрібний шум у числах не
 * породжував зайву матрицю.
 */
export function radiusMatrixKey(input: {
  radiusMm: number;
  bandSizeMm: number;
  arcAngleDeg: number;
  complex?: boolean;
}): string {
  const r = Math.round(input.radiusMm);
  const b = Math.round(input.bandSizeMm);
  const a = Math.round(input.arcAngleDeg);
  return `${input.complex ? 'X' : 'S'}|R${r}|H${b}|A${a}`;
}

// ── Геометрія ────────────────────────────────────────────────────────

/**
 * Довжина дуги скруглення по ЗОВНІШНЬОМУ радіусу, мм.
 *
 * Рішення Богдана: міряємо по зовнішньому, бо саме його довжина визначає,
 * скільки матеріалу треба відрізати. Внутрішній дав би менше — і смуга не
 * зійшлася б на місці.
 */
export function cornerArcLengthMm(radiusMm: number, angleRad: number = Math.PI / 2) {
  if (!(radiusMm > 0) || !(angleRad > 0)) return 0;
  return radiusMm * angleRad;
}

/**
 * Сторони, між якими лежить кут.
 *
 * Прямокутник називає кути парою літер: `DA` стоїть між сторонами D і A.
 * Складні форми називають кут однією літерою — тією ж, що й сторона, яка з
 * нього ПОЧИНАЄТЬСЯ; попередня сторона йде за абеткою назад. Кут `start`
 * стоїть на початку координат, між останньою стороною контуру і першою:
 * у Г-форми це F↔A, у П-форми H↔A.
 */
export function cornerAdjacentSides(cornerId: string, kind?: string): [string, string] | undefined {
  if (/^[A-Z]{2}$/.test(cornerId)) return [cornerId[0], cornerId[1]];
  if (cornerId === 'start') {
    if (kind === 'l' || kind === 'Г-подібна') return ['F', 'A'];
    if (kind === 'u' || kind === 'П-подібна') return ['H', 'A'];
    return undefined;
  }
  if (/^[A-Z]$/.test(cornerId)) {
    return [cornerId, String.fromCharCode(cornerId.charCodeAt(0) + 1)];
  }
  return undefined;
}

export interface RadiusElementSpec {
  cornerId: string;
  radiusMm: number;
  /** Кут розкриття дуги, градуси. Наразі всі скруглення чвертькола. */
  arcAngleDeg: number;
  /** Довжина дуги по зовнішньому радіусу, мм */
  arcLengthMm: number;
  /** Довжина прямокутника в розкрої, мм — дуга плюс технологічний запас */
  lengthMm: number;
  /** Виліт смуги, мм — друга сторона прямокутника */
  bandSizeMm: number;
  /** Сторони, які смуга з'єднує через цей кут */
  sides: [string, string];
  method: RadiusMethod;
  /** Застосований коефіцієнт запасу (1.3 або 1.2) */
  reserve: number;
  /** Кут позначений користувачем як складний */
  complex: boolean;
}

/**
 * Гнуті ділянки однієї смуги.
 *
 * Смуга має заходити на ОБИДВІ сторони кута — інакше вона до дуги не
 * доходить, і гнути нічого. Увігнуті кути пропускаємо: смуга обходить їх
 * зсередини, це інша операція і інша ціна.
 */
export function radiusElementSpecs(
  feature: EdgeFeature | undefined,
  corners: Record<string, CornerProcessing> | undefined,
  kind?: string,
  material?: MaterialType,
): RadiusElementSpec[] {
  if (!feature?.enabled || !(feature.size > 0) || !feature.sides?.length) return [];
  if (!corners) return [];

  const method = radiusMethodFor(material);
  const reserve = radiusReserveFor(method);
  const covered = new Set(feature.sides);
  const out: RadiusElementSpec[] = [];

  for (const [cornerId, corner] of Object.entries(corners)) {
    if (!corner || corner.type !== 'radius' || corner.reflex) continue;
    const radiusMm = corner.radius ?? 0;
    if (!(radiusMm > 0)) continue;

    const sides = cornerAdjacentSides(cornerId, kind);
    if (!sides || !covered.has(sides[0]) || !covered.has(sides[1])) continue;

    const arcLengthMm = cornerArcLengthMm(radiusMm);
    if (!(arcLengthMm > 0)) continue;

    const bandSizeMm = Math.max(
      1,
      feature.sideSizes?.[sides[0]] ?? feature.sideSizes?.[sides[1]] ?? feature.size,
    );

    out.push({
      cornerId,
      radiusMm,
      arcAngleDeg: 90,
      arcLengthMm,
      lengthMm: Math.max(1, arcLengthMm * reserve),
      bandSizeMm,
      sides,
      method,
      reserve,
      complex: Boolean(corner.complexRadius),
    });
  }

  return out;
}
