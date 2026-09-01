import { describe, expect, it } from 'vitest';
import { __edgeCutterInternals as internals } from '../edgeCutters';

/**
 * ПЕРЕРІЗИ ФОРМ ЗА КАТАЛОГОМ ЦЕХУ (01.09.2026, Д-1). Власник побачив XD20 у
 * 3D як повне заокруглення. Тут перевіряємо не картинку, а сам переріз:
 * скільки міліметрів різак заходить у плиту зверху, знизу і на середині.
 */
const cuts = internals.PROFILE_CUTS as Record<string, { top?: unknown; bottom?: unknown }>;
const cross = (spec: unknown, t: number) => internals.crossSectionPoints(spec as never, t) as Array<{ v: number; y: number }>;
const BITE = 0.2;

/** Найглибша точка різака (мм у плиту) на висоті y. */
function depthAt(points: Array<{ v: number; y: number }>, y: number): number {
  const eps = 1e-6;
  const hits = points.filter((p) => Math.abs(p.y - y) < eps).map((p) => -p.v + BITE);
  return hits.length ? Math.max(...hits) : NaN;
}

describe('перерізи форм із розрізів каталогу', () => {
  it('XD20: R7,5 зверху, під ним скіс 45° до низу — не бульноз', () => {
    const c = cross(cuts.xd_20.top, 20);
    expect(depthAt(c, 20)).toBeCloseTo(7.5, 5);   // верх: дуга починається на 7,5 мм від ребра
    expect(depthAt(c, 12.5)).toBeCloseTo(0, 5);   // кінець дуги — на самій лінії ребра
    expect(depthAt(c, 0)).toBeCloseTo(12.5, 5);   // низ: 45° від кінця дуги = 20 − 7,5
    expect(cuts.xd_20.bottom).toBeUndefined();
  });

  it('D12: R2 зверху, скіс 45° до низу — низ коротший на 10', () => {
    const c = cross(cuts.d_12.top, 12);
    expect(depthAt(c, 12)).toBeCloseTo(2, 5);
    expect(depthAt(c, 0)).toBeCloseTo(10, 5);
  });

  it('AR12 / AR20 — фаска 2×2 з обох боків; T12 — R2, T20 — R3 з обох боків', () => {
    expect(cuts.ar_12).toEqual({ top: { kind: 'chamfer', size: 2 }, bottom: { kind: 'chamfer', size: 2 } });
    expect(cuts.ar_20).toEqual({ top: { kind: 'chamfer', size: 2 }, bottom: { kind: 'chamfer', size: 2 } });
    expect(cuts.t_12).toEqual({ top: { kind: 'radius', size: 2 }, bottom: { kind: 'radius', size: 2 } });
    expect(cuts.t_20).toEqual({ top: { kind: 'radius', size: 3 }, bottom: { kind: 'radius', size: 3 } });
  });

  it('скіс без радіуса лишається як був: верхнє ребро на місці, низ під кутом', () => {
    const c = cross(cuts.edge_45.top, 20);
    expect(depthAt(c, 20)).toBeCloseTo(0, 5);
    expect(depthAt(c, 0)).toBeCloseTo(20, 5);
  });
});
