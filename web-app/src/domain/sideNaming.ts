/**
 * ІМЕНА СТОРІН — ЄДИНЕ ДЖЕРЕЛО (П-2, хвиля 3, крок 3.1).
 *
 * ═══ ГОЛОВНЕ, ЩО ТРЕБА ЗНАТИ ═══
 *
 * Сторона «A» — це ПЕРШЕ ребро контуру. Одна угода на весь застосунок.
 *
 * Контур прямокутника 2000×600 (перевірено рушієм):
 *
 *     points[0] (0,0) ──A──> points[1] (2000,0)
 *         ^                        |
 *         D                        B
 *         |                        v
 *     points[3] (0,600) <──C── points[2] (2000,600)
 *
 * Так само вважає 2D-креслення (`Detail2DBlueprint`: i===0 → 'A'), і саме
 * тому на екрані A підписана знизу — SVG креслення перевернутий по Y
 * (`scaleY(-1)`), і верхнє ребро моделі показується внизу.
 *
 * ІСТОРІЯ, ЯКУ ВАЖЛИВО ЗНАТИ (хвиля 3, кроки 3.1–3.2). До цього в коді
 * жили ДВІ угоди, зсунуті рівно на одне ребро. Позначки обробки на карті
 * крою, маркери PDF і підсвітка фактів (`utils/edgeProfiles`) вважали
 * стороною A ЛІВЕ ребро, тоді як рушій, пакер, розкладка текстури,
 * геометрія PDF, 3D і саме креслення — перше.
 *
 * Ціна розбіжності: на стільниці 2000×600 менеджер ставив обробку торця
 * на сторону A (2000 мм), а в цех їхала позначка на лівому ребрі —
 * 600 мм. Втричі менше полірування, ніж продано. На квадратній деталі це
 * не було видно взагалі, тому й прожило так довго.
 *
 * Тепер угода одна, і живе вона тут.
 */
import type { DetailShape } from './types';

// ── Єдина угода ──────────────────────────────────────────────────────

/**
 * Індекс ребра контуру за іменем сторони, за формою деталі.
 * A — перше ребро, далі за обходом контуру.
 */
export const SEGMENT_SIDE_INDEX: Record<string, Partial<Record<string, number>>> = {
  'Прямокутна': { A: 0, B: 1, C: 2, D: 3 },
  'Г-подібна': { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 },
  'П-подібна': { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7 },
};

// ── Угода «контурна» ─────────────────────────────────────────────────

/**
 * Те саме, але за КІЛЬКІСТЮ точок контуру — для форм, яких немає в списку
 * `DetailShape`: імпорт із DXF, довільний елемент, розрізані сегменти.
 * Значення збігаються з `SEGMENT_SIDE_INDEX` — це одна угода, два ключі.
 */
export const CONTOUR_SIDE_INDEX: Record<number, Partial<Record<string, number>>> = {
  4: { A: 0, B: 1, C: 2, D: 3 },
  6: { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 },
  8: { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7 },
};

// ── Спільна математика ───────────────────────────────────────────────

/**
 * Чверті повороту: 0°→0, 90°→1, 180°→2, 270°→3.
 *
 * Пакер обертає деталі лише кратно 90°, тому дрібні кути тут — це шум
 * після перетворень, і його треба округлити, а не втратити.
 */
export function rotationQuarter(rotation: number): number {
  return Math.round((((rotation % 360) + 360) % 360) / 90) % 4;
}

/**
 * Індекс сторони в списку ребер ГАБАРИТНОГО БОКСУ [left, top, right, bottom].
 *
 * Модельне ребро 0 (сторона A) йде від (minX,minY) до (maxX,minY) — це
 * «top» боксу, тобто індекс 1. Далі за обходом: B→right, C→bottom, D→left.
 */
export function boxEdgeIndexForSide(side: string): number | undefined {
  const base: Record<string, number> = { A: 1, B: 2, C: 3, D: 0 };
  return base[side];
}

/**
 * Куди «переїхала» сторона прямокутної деталі після повороту на слябі.
 *
 * Серце FG-28: поворот за годинниковою зсуває ребра по колу
 * left → top → right → bottom, тож позначка обробки має їхати разом із
 * деталлю, а не лишатись на місці габаритного боксу.
 */
export function rotatedBoxEdgeIndex(side: string, rotation: number): number | undefined {
  const index = boxEdgeIndexForSide(side);
  if (index === undefined) return undefined;
  return (index + rotationQuarter(rotation)) % 4;
}

/**
 * Сторони, між якими лежить кут (те саме правило, що в radiusElement).
 *
 * Прямокутник називає кути парою літер: `DA` — між сторонами D і A.
 * Складні форми називають кут однією літерою — тією ж, що й сторона, яка
 * з нього ПОЧИНАЄТЬСЯ. Кут `start` стоїть між останньою стороною і першою.
 */
export function cornerSides(cornerId: string, shape?: DetailShape | string): [string, string] | undefined {
  if (/^[A-Z]{2}$/.test(cornerId)) return [cornerId[0], cornerId[1]];
  if (cornerId === 'start') {
    if (shape === 'Г-подібна' || shape === 'l') return ['F', 'A'];
    if (shape === 'П-подібна' || shape === 'u') return ['H', 'A'];
    return undefined;
  }
  if (/^[A-Z]$/.test(cornerId)) {
    return [cornerId, String.fromCharCode(cornerId.charCodeAt(0) + 1)];
  }
  return undefined;
}

/**
 * ПОРЯДОК ВЕРШИН КОНТУРУ — той самий, у якому їх віддає
 * `jointAnchorPoints`, і той самий, у якому рушій будує полігон.
 *
 * Потрібен там, де замало знати ім'я кута: щоб порахувати, куди від нього
 * «всередину деталі», треба бачити сусідні вершини (FG-18).
 */
export function contourVertexOrder(shape: DetailShape | string | undefined): string[] | undefined {
  if (shape === 'Г-подібна' || shape === 'l') return ['start', 'A', 'B', 'C', 'D', 'E'];
  if (shape === 'П-подібна' || shape === 'u') return ['start', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
  if (shape === 'Прямокутна' || shape === 'rect') return ['DA', 'AB', 'BC', 'CD'];
  return undefined;
}

/**
 * ЗВОРОТНЕ ДО `cornerSides` — ім'я кута, яке БАЧИТЬ людина, у ключ даних.
 *
 * Серце FG-18. Вікно вирізу пропонує кути парами літер — `DE`, `FA` —
 * бо так їх називає менеджер і так їх підписує креслення. Але у складних
 * форм ключ у даних — це ім'я ВЕРШИНИ: `D`, `start`. Прив'язка шукала
 * `anchors['DE']`, не знаходила нічого і мовчки міряла від лівого
 * верхнього кута деталі — виріз опинявся зовсім не там, куди його
 * поставили.
 *
 * Для прямокутника пара і є ключем (`DA`, `AB`…), тому там нічого не
 * змінюється.
 */
export function cornerIdForSides(
  displayName: string,
  shape?: DetailShape | string,
): string | undefined {
  const order = contourVertexOrder(shape);
  if (!order) return undefined;
  // Прямокутник уже названий парами — шукати нема чого.
  if (order.includes(displayName)) return displayName;
  return order.find((vertexId) => {
    const sides = cornerSides(vertexId, shape);
    return sides ? `${sides[0]}${sides[1]}` === displayName : false;
  });
}

/**
 * Сторож єдиної угоди: обидві таблиці мусять давати той самий індекс.
 *
 * Лишається назавжди. Якщо колись хтось поправить одну таблицю і забуде
 * другу — розбіжність, яка коштувала нам 1.4 м полірування на кожній
 * стільниці, повернеться мовчки. Тепер вона впаде на тестах.
 */
export function sideIndexesAgree(shape: string, pointCount: number, side: string): boolean {
  const byShape = SEGMENT_SIDE_INDEX[shape]?.[side];
  const byCount = CONTOUR_SIDE_INDEX[pointCount]?.[side];
  if (byShape === undefined || byCount === undefined) return true;
  return byShape === byCount;
}
