import type { DetailPart, Point } from '../domain/types';

/**
 * Ключ текстурної групи — деталі з однаковим ключем нестинг кладе разом.
 *
 * Єдина реалізація на весь проєкт. Досі їх було ТРИ (`packing.ts`,
 * `canvasUtils.ts`, `core/snapping.ts`) з ідентичним тілом — рівно та хвороба,
 * від якої маніфест застерігає.
 *
 * Три випадки:
 * - `import:` — DXF і бланк погодження. Власний шлях, недоторканний.
 * - `tg:` — кластер ВИРОБУ (§7.1). Він навмисно перетинає межі деталей:
 *   стільниця, її бортик і стінова панель — це різні `Detail` з різними
 *   `detailId`, і саме тому дописувати сюди `detailId` не можна. Поки він
 *   дописувався, деталі одного виробу не могли потрапити в одну групу
 *   в принципі, і «Повна текстура» розкидала їх по слябах.
 * - решта — стара поведінка: група в межах однієї деталі.
 */
export function textureGroupKey(part: DetailPart) {
  const label = part.textureGroupLabel;
  if (label?.startsWith('import:')) return label;
  if (label?.startsWith('tg:')) return label;
  return `${part.detailId}:${label ?? part.parentLabel}`;
}

export function pointOnSegment(point: Point, a: Point, b: Point, epsilon = 0.001) {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > epsilon) return false;
  return (
    point.x >= Math.min(a.x, b.x) - epsilon
    && point.x <= Math.max(a.x, b.x) + epsilon
    && point.y >= Math.min(a.y, b.y) - epsilon
    && point.y <= Math.max(a.y, b.y) + epsilon
  );
}

export function pointInPolygonStrict(point: Point, polygon: Point[]) {
  if (polygon.some((current, index) => pointOnSegment(point, current, polygon[(index + 1) % polygon.length]))) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const crossesRay = (a.y > point.y) !== (b.y > point.y);
    if (crossesRay) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygonOrOn(point: Point, polygon: Point[]) {
  return polygon.some((current, index) => pointOnSegment(point, current, polygon[(index + 1) % polygon.length]))
    || pointInPolygonStrict(point, polygon);
}

export function outwardNormal(segment: { start: Point; end: Point }, polygon: Point[]) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  const midpoint = { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 };
  const candidates = [
    { x: -dy / length, y: dx / length },
    { x: dy / length, y: -dx / length },
  ];
  return candidates.find((normal) => !pointInPolygonStrict({ x: midpoint.x + normal.x * 8, y: midpoint.y + normal.y * 8 }, polygon)) ?? candidates[0];
}

export function pointsBounds(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// ── Спільна геометрична математика ───────────────────────────────────
//  Ці чотири функції жили копіями в engines/pricing.ts із коментарем
//  «пізніше можна замінити на спільні з geometryUtils». Пізніше настало:
//  рушій виробничих фактів рахує тими самими формулами, і дві копії
//  означали б два різні числа в кошторисі й у КП.

export function pointDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Повний периметр замкненого полігона, мм */
export function polygonPerimeter(points: Point[]) {
  if (points.length < 2) return 0;
  return points.reduce((sum, point, index) => sum + pointDistance(point, points[(index + 1) % points.length]), 0);
}

/**
 * Довжина НЕ-осьових сегментів контуру, мм.
 *
 * Дискова пила ходить лише по прямій уздовж осі. Усе інше — діагоналі,
 * хорди скруглень, дуги — це прохід гідроабразиву. Поріг 0.001 мм, бо
 * після поворотів координати не бувають ідеально цілими.
 */
export function polygonNonAxisLength(points: Point[]) {
  if (points.length < 2) return 0;
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    const dx = Math.abs(point.x - next.x);
    const dy = Math.abs(point.y - next.y);
    const isAxisAligned = dx < 0.001 || dy < 0.001;
    return sum + (isAxisAligned ? 0 : pointDistance(point, next));
  }, 0);
}

/** Довжина осьових сегментів контуру, мм — те, що ріже пила */
export function polygonAxisLength(points: Point[]) {
  return polygonPerimeter(points) - polygonNonAxisLength(points);
}

/**
 * Сегмент логічної сторони (A/B/C/D/…) на реальному контурі парта.
 * Враховує `sideSegments` (задані рушієм) і `sideAliases` (перейменування
 * сторін після повороту чи розрізу).
 */
export function sideSegmentOfPart(part: DetailPart, side: string) {
  const custom = part.sideSegments?.[side];
  if (custom) return custom;
  const resolvedSide = part.sideAliases?.[side] ?? side;
  const byPointCount: Record<number, Partial<Record<string, number>>> = {
    4: { B: 0, C: 1, D: 2, A: 3 },
    6: { B: 0, C: 1, D: 2, E: 3, F: 4, A: 5 },
    8: { B: 0, C: 1, D: 2, E: 3, F: 4, G: 5, H: 6, A: 7 },
  };
  const index = byPointCount[part.points.length]?.[resolvedSide];
  if (index === undefined || !part.points[index]) return undefined;
  return { start: part.points[index], end: part.points[(index + 1) % part.points.length] };
}

/** Довжина сторони парта, мм. Фолбек — середня довжина ребра контуру. */
export function edgeLengthForSide(part: DetailPart, side: string) {
  const segment = sideSegmentOfPart(part, side);
  if (segment) return pointDistance(segment.start, segment.end);
  const edges = Math.max(1, part.points.length);
  return polygonPerimeter(part.points) / edges;
}

/** Відстань від точки до відрізка, мм */
export function pointSegmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return pointDistance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return pointDistance(point, { x: a.x + dx * t, y: a.y + dy * t });
}

/** Найкоротша відстань між двома відрізками, мм */
export function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

/**
 * Найкоротша відстань між контурами двох полігонів, мм.
 * Нуль означає дотик або перетин.
 */
export function polygonDistance(a: Point[], b: Point[]) {
  let best = Infinity;
  for (let i = 0; i < a.length; i += 1) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j += 1) {
      best = Math.min(best, segmentDistance(a1, a2, b[j], b[(j + 1) % b.length]));
      if (best <= 0.001) return 0;
    }
  }
  return best;
}
