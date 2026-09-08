/**
 * Б-159 — РАДІУС НА КУТІ З'ЇДАВ СТОРОНУ В СТИКАХ.
 *
 * Скарга власника 08.09: «коли радіус, то пропадає сторона C у стиках і
 * відповідно можливість проставити стик C–A, хоча радіус не забороняє цього».
 *
 * Причина була не в стиках, а в КОНТУРІ, який їм передавали: він збирався як
 * `sides.map(s => s.v1)` — по одній точці на сторону. Без радіусів це те саме
 * кільце. З радіусом між кінцем C і початком D з'являється дуга, обидві її
 * точки в такому кільці зникають, і «сторона C + дуга» замінюються однією
 * діагоналлю. Ця діагональ накриває порожнечу як матеріал, пробна точка біля
 * середини C потрапляє «всередину», нормаль сторони перевертається — і пара
 * C↔A перестає бути парою (нормалі вже не назустріч).
 *
 * Тест бере РЕАЛЬНУ геометрію (той самий `buildDetailShape`, що й 3D) і
 * перевіряє: пара C↔A є і без радіуса, і з радіусом 200/400/600.
 */
import { describe, expect, it } from 'vitest';
import { buildDetailShape, getDetailPointsAndBounds } from '../../engines/shapeBuilder';
import { jointFieldPairs, outlineFromSides, type JointSideSegment } from '../joints';

function sidesOf(radius: number): JointSideSegment[] {
  const detail = {
    kind: 'l',
    outerWidth: 2000,
    outerHeight: 1600,
    innerHorizontal: 1200,
    innerVertical: 1000,
    thickness: 20,
    corners: radius ? { C: { type: 'radius', radius } } : {},
  } as never;
  const { points, bounds } = getDetailPointsAndBounds(detail);
  const built = buildDetailShape(detail, points as never, bounds as never) as unknown as {
    shape: { curves: Array<{ type: string; v1: { x: number; y: number }; v2: { x: number; y: number } }> };
    edgeMap: Record<number, string>;
  };
  const w = (bounds.maxX - bounds.minX) || 1;
  const h = (bounds.maxY - bounds.minY) || 1;
  const toMm = (p: { x: number; y: number }) => ({ x: bounds.minX + p.x * w, y: bounds.minY + p.y * h });
  return built.shape.curves
    .map((curve, i) => ({ curve, id: built.edgeMap[i] ?? `#${i}` }))
    .filter(({ curve }) => curve.type === 'LineCurve')
    .map(({ curve, id }) => ({ id, v1: toMm(curve.v1), v2: toMm(curve.v2) }))
    .filter((side) => !side.id.startsWith('inner'));
}

const hasPair = (pairs: Array<{ sideId: string; otherId: string }>, a: string, b: string) =>
  pairs.some((pair) => pair.sideId === a && pair.otherId === b);

describe('Б-159: стик C–A на Г-подібній з радіусом', () => {
  it('без радіуса пара C↔A є (так було завжди)', () => {
    const sides = sidesOf(0);
    const pairs = jointFieldPairs(sides, outlineFromSides(sides));
    expect(hasPair(pairs, 'C', 'A')).toBe(true);
    expect(hasPair(pairs, 'A', 'C')).toBe(true);
  });

  it.each([200, 400, 600])('з радіусом %d мм пара C↔A лишається', (radius) => {
    const sides = sidesOf(radius);
    const pairs = jointFieldPairs(sides, outlineFromSides(sides));
    expect(hasPair(pairs, 'C', 'A')).toBe(true);
    expect(hasPair(pairs, 'A', 'C')).toBe(true);
  });

  it('старий контур із самих v1 саме тут і ламався — фіксуємо різницю', () => {
    const sides = sidesOf(400);
    const broken = jointFieldPairs(sides, sides.map((side) => side.v1));
    const fixed = jointFieldPairs(sides, outlineFromSides(sides));
    expect(hasPair(broken, 'C', 'A')).toBe(false);
    expect(hasPair(fixed, 'C', 'A')).toBe(true);
    // Решта пар не постраждала: виправлення нічого не додало «зайвого»
    expect(fixed.length).toBe(broken.length + 2);
  });
});
