import type { Point } from '../domain/types';

/**
 * РОЗМІЩЕННЯ ДОПОВНЕННЯ НА РЕБРІ БАТЬКА — спільна математика для обох 3D.
 *
 * Редактор виробу (Detail3DPreview) і Підбір (ProductElement3DNode) рахували
 * позицію панелі/ноги/бортика двома окремими копіями однакових формул. Поки
 * доповнення завжди стояло на всю довжину ребра, копії збігались; щойно
 * з'явився зсув — вони б розійшлись. Тому математика тут одна, а рендери
 * лише ставлять меш у видану точку.
 *
 * Система координат групи ребра: локальний +X — уздовж ребра (від v1 до v2),
 * локальний +Z — нормаль до ребра в площині деталі.
 */
export function attachmentPlacement(
  v1: Point,
  v2: Point,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  /** Ширина доповнення, мм. Не задано — на всю довжину ребра. */
  attachmentWidth: number | undefined,
  /** Зсув уздовж ребра від його ПОЧАТКУ (v1), мм */
  attachmentOffset: number = 0,
  /** Зсув углиб батьківської деталі від ребра, мм */
  attachmentInset: number = 0,
) {
  const w = bounds.maxX - bounds.minX || 1;
  const h = bounds.maxY - bounds.minY || 1;
  const s = 0.001; // scale factor used in Viewer

  const nx1 = (v1.x - 0.5) * w * s;
  const ny1 = (v1.y - 0.5) * h * s;
  const nx2 = (v2.x - 0.5) * w * s;
  const ny2 = (v2.y - 0.5) * h * s;

  const midX = (nx1 + nx2) / 2;
  const midY = (ny1 + ny2) / 2;

  const dx = nx2 - nx1;
  const dy = ny2 - ny1;
  const angle = Math.atan2(dy, dx);
  const edgeLength = Math.sqrt(dx * dx + dy * dy) || 1e-9;

  const attachWidth = attachmentWidth !== undefined ? attachmentWidth * s : edgeLength;
  const posX = -edgeLength / 2 + attachmentOffset * s + attachWidth / 2;

  /**
   * Куди «углиб». Нормаль до ребра, повернута так само, як локальна вісь Z
   * групи: (−dy, dx)/len. Знак беремо не з припущення про напрямок обходу
   * контуру, а зі скалярного добутку з вектором «до центру деталі» — тоді
   * формула однаково правильна і на зовнішньому ребрі прямокутника, і на
   * увігнутому ребрі Г-подібної форми, де обхід локально «вивертається».
   */
  const nX = -dy / edgeLength;
  const nY = dx / edgeLength;
  const inward = nX * -midX + nY * -midY >= 0 ? 1 : -1;
  const insetZ = inward * attachmentInset * s;

  return { midX, midY, angle, edgeLength, posX, insetZ, attachWidth, scale: s, inward };
}

/**
 * SC-06 — ЄДИНА УГОДА ПРО ОРІЄНТАЦІЮ ДОПОВНЕННЯ.
 *
 * Доповнення (панель, нога, підворот, потовщення) — це власна деталь зі
 * своїм контуром. Одне з її ребер приклеєне до батька. Питання, на яке
 * досі було ДВІ різні відповіді: яке саме?
 *
 * Контур деталі (domain/sideNaming):
 *
 *     points[0] (0,0) ──A──> points[1] (W,0)
 *         ^                        |
 *         D                        B
 *         |                        v
 *     points[3] (0,H) <──C── points[2] (W,H)
 *
 * `buildProductFromSession` писав у стик `b.sideId: 'A'`. А 3D ставить
 * деталь так, що біля батька опиняється ребро y = H, тобто сторона C —
 * і для панелі, що стоїть угору, і для ноги, що звисає вниз (знак
 * повороту в `getEdgeTransform` навмисне різний саме для цього).
 *
 * Тобто контракт стику показував на ВІЛЬНЕ ребро, а не на шов. Наслідки
 * тихі, але грошові: підсвітка стику на карті крою малювала не той торець,
 * а будь-яке правило «на шві не продаємо полірування» захищало б не те
 * ребро.
 *
 * Тут — правда, виміряна з самої математики розміщення (див.
 * `__tests__/attachmentOrientation.test.ts`: тест бере `getEdgeTransform`,
 * рахує, куди фізично лягли ребра, і звіряє з цією константою). Якщо
 * колись 3D перевернуть — тест впаде і змусить оновити константу, а не
 * лишить дві розбіжні угоди, як було.
 */
export const ATTACHMENT_CONTACT_SIDE = 'C';

/**
 * Сторона доповнення, якою воно приклеєне до батька. Аргумент лишено на
 * майбутнє: якщо колись з'явиться вид кріплення з іншою орієнтацією,
 * розгалуження буде тут, а не розповзеться по викликах.
 */
export function attachmentContactSide(_kind?: 'up' | 'down' | 'fold'): string {
  return ATTACHMENT_CONTACT_SIDE;
}

export function getEdgeTransform(
  v1: Point,
  v2: Point,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  parentThickness: number = 20,
  attachmentWidth?: number,
  attachmentHeight: number = 600,
  attachmentOffset: number = 0,
  /**
   * Куди «росте» доповнення від ребра батька:
   *  'up'   — стінова панель, бортик (стоять на площині вгору)
   *  'down' — опора/нога (звисає вниз)
   *  'fold' — підворот (звисає вниз, стик 45° по торцю)
   * Формули збігаються з 3D Редактором (Detail3DPreview), щоб обидва види були однакові.
   */
  attachmentKind: 'up' | 'down' | 'fold' = 'up',
  /** Зсув углиб деталі від ребра, мм (0 = стоїть на ребрі, як було завжди) */
  attachmentInset: number = 0,
  /** Відступ від ребра в напрямку росту, мм (0 = впритул до ребра) */
  attachmentGap: number = 0,
) {
  const s = 0.001;
  const { midX, midY, angle, edgeLength, posX, insetZ } = attachmentPlacement(
    v1, v2, bounds, attachmentWidth, attachmentOffset, attachmentInset,
  );

  const zSurface = (parentThickness * s) / 2;

  const wpHeight = attachmentHeight * s;
  const wpDepth = parentThickness * s;

  // Нога/підворот звисають вниз і мають дзеркальні знаки по Y/Z та зворотний поворот.
  const goesDown = attachmentKind === 'down' || attachmentKind === 'fold';

  const gapY = attachmentGap * s;
  const childPosition: [number, number, number] = goesDown
    ? [posX, -(wpHeight / 2 + gapY), wpDepth / 2 + insetZ]
    : [posX, wpHeight / 2 + gapY, -wpDepth / 2 + insetZ];

  const childRotation: [number, number, number] = goesDown
    ? [-Math.PI / 2, 0, 0]
    : [Math.PI / 2, 0, 0];

  return {
    groupPosition: [midX, zSurface, midY] as [number, number, number],
    groupRotation: [0, -angle, 0] as [number, number, number],
    childPosition,
    childRotation,
    edgeLength,
    scale: s
  };
}
