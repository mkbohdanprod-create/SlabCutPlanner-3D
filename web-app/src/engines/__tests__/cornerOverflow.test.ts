import { describe, it, expect } from 'vitest';
import { explodeDetails } from '../geometry';
import type { Detail, Point } from '../../domain/types';

/**
 * FG-11: розміри «Кут» (фаска) і «Г-виріз» ніде не обмежувались розмірами
 * деталі. Два сусідні вирізи по 1500 мм на стороні 700 мм гнали контур у
 * зворотний бік — полігон самоперетинався, і на кресленні з'являвся
 * діагональний «зріз» замість прямого кута.
 *
 * Для радіусів захист (cap + fitPair) існував — ці тести фіксують, що
 * тепер він діє і для фасок та Г-вирізів, в обох будівниках контуру
 * (прямокутному і полігонному).
 */

const ALLOWANCES = { kerf: 0, waterjet: 0, drill: 0 } as never;

function bounds(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Контур простий, якщо жодна пара несуміжних ребер не перетинається. */
function isSimplePolygon(points: Point[]): boolean {
  const n = points.length;
  const seg = (i: number) => [points[i], points[(i + 1) % n]] as const;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const intersects = (p1: Point, p2: Point, p3: Point, p4: Point) => {
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // суміжні через замикання
      const [a1, a2] = seg(i);
      const [b1, b2] = seg(j);
      if (intersects(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

function mainPart(details: Detail[]) {
  const parts = explodeDetails(details, ALLOWANCES);
  const main = parts.find((p) => p.isMain);
  expect(main).toBeDefined();
  return main!;
}

describe('FG-11: розміри обробки кутів затискаються межами деталі', () => {
  it('Г-виріз 1500×1500 на деталі 700×450 не ламає контур', () => {
    const part = mainPart([{
      id: 'd1', type: 'Стільниця', shape: 'Прямокутна', quantity: 1, thickness: 20,
      geometry: { width: 700, height: 450, corners: { AB: { type: 'l-cut', sizeB: 1500, sizeC: 1500 } } },
    } as unknown as Detail]);
    const b = bounds(part.points);
    expect(b.minX).toBeGreaterThanOrEqual(-0.01);
    expect(b.minY).toBeGreaterThanOrEqual(-0.01);
    expect(b.maxX).toBeLessThanOrEqual(700.01);
    expect(b.maxY).toBeLessThanOrEqual(450.01);
    expect(isSimplePolygon(part.points)).toBe(true);
  });

  it('два сусідні Г-вирізи по 1500 на стороні 700 діляться пропорційно', () => {
    const part = mainPart([{
      id: 'd2', type: 'Стільниця', shape: 'Прямокутна', quantity: 1, thickness: 20,
      geometry: {
        width: 700, height: 1600,
        corners: {
          DA: { type: 'l-cut', sizeB: 10, sizeC: 1500 },
          AB: { type: 'l-cut', sizeB: 1500, sizeC: 10 },
        },
      },
    } as unknown as Detail]);
    expect(isSimplePolygon(part.points)).toBe(true);
    const b = bounds(part.points);
    expect(b.maxX - b.minX).toBeLessThanOrEqual(700.01);
  });

  it('фаска, більша за сторону, затискається і поруч із радіусом', () => {
    const part = mainPart([{
      id: 'd3', type: 'Стільниця', shape: 'Прямокутна', quantity: 1, thickness: 20,
      geometry: {
        width: 600, height: 600,
        corners: {
          DA: { type: 'radius', radius: 400 },
          AB: { type: 'chamfer', sizeB: 500, sizeC: 100 },
        },
      },
    } as unknown as Detail]);
    expect(isSimplePolygon(part.points)).toBe(true);
    const b = bounds(part.points);
    expect(b.maxX - b.minX).toBeLessThanOrEqual(600.01);
    expect(b.maxY - b.minY).toBeLessThanOrEqual(600.01);
  });

  it('нормальні розміри не змінюються (регресія)', () => {
    const part = mainPart([{
      id: 'd4', type: 'Стільниця', shape: 'Прямокутна', quantity: 1, thickness: 20,
      geometry: { width: 700, height: 450, corners: { AB: { type: 'l-cut', sizeB: 200, sizeC: 150 } } },
    } as unknown as Detail]);
    // Кутова точка Г-вирізу стоїть рівно там, де замовили.
    const hasCutCorner = part.points.some((p) => Math.abs(p.x - (700 - 200)) < 0.01 && Math.abs(p.y - 150) < 0.01);
    expect(hasCutCorner).toBe(true);
    expect(isSimplePolygon(part.points)).toBe(true);
  });
});
