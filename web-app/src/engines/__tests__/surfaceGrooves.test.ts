import { describe, expect, it } from 'vitest';
import type { SurfaceGrooveGroup } from '../../domain/types';
import { buildGrooveCutters, validateGrooveGroup, grooveTotalLengthMm, GROOVE_LIMITS } from '../surfaceGrooves';

/** Типова проточка для води біля мийки: 6 канавок через 50 мм. */
function drainGrooves(patch: Partial<SurfaceGrooveGroup> = {}): SurfaceGrooveGroup {
  return {
    id: 'g1',
    x: 800,
    y: 100,
    direction: 'horizontal',
    count: 6,
    pitch: 50,
    length: 400,
    width: 10,
    depth: 5,
    profile: 'round',
    ...patch,
  };
}

const W = 1600;
const H = 600;
const T = 20;

function boundsMm(geometry: import('three').BufferGeometry) {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox!;
  return {
    minX: b.min.x * 1000, maxX: b.max.x * 1000,
    minY: b.min.y * 1000, maxY: b.max.y * 1000,
    minZ: b.min.z * 1000, maxZ: b.max.z * 1000,
  };
}

describe('перевірка здійсненності канавок', () => {
  it('нормальна проточка проходить без зауважень', () => {
    expect(validateGrooveGroup(drainGrooves(), W, H, T)).toEqual([]);
  });

  it('канавка тонша за фрезу — помилка, а не мовчазне малювання', () => {
    const issues = validateGrooveGroup(drainGrooves({ width: 3 }), W, H, T);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('фрезу'))).toBe(true);
  });

  it('глибина ≥ товщини — це наскрізний різ, не фрезерування', () => {
    const issues = validateGrooveGroup(drainGrooves({ depth: T }), W, H, T);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('наскрізний'))).toBe(true);
  });

  it('замало каменю під дном — плита трісне', () => {
    // 20 − 17 = 3 мм дна, менше за мінімум
    const issues = validateGrooveGroup(drainGrooves({ depth: 17 }), W, H, T);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('трісне'))).toBe(true);
    expect(GROOVE_LIMITS.minFloorMm).toBeGreaterThan(3);
  });

  it('крок менший за ширину — канавки зіллються', () => {
    const issues = validateGrooveGroup(drainGrooves({ width: 20, pitch: 15 }), W, H, T);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('зіллються'))).toBe(true);
  });

  it('група за габаритом деталі — помилка з числами', () => {
    const issues = validateGrooveGroup(drainGrooves({ x: 1400, length: 400 }), W, H, T);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('габарит'))).toBe(true);
  });

  it('тісні перемички між канавками — попередження, не заборона', () => {
    const issues = validateGrooveGroup(drainGrooves({ width: 10, pitch: 11 }), W, H, T);
    expect(issues.some((i) => i.level === 'warning')).toBe(true);
    expect(issues.some((i) => i.level === 'error')).toBe(false);
  });
});

describe('геометрія канавок', () => {
  it('шість канавок — шість різаків', () => {
    expect(buildGrooveCutters([drainGrooves()], W, H, T)).toHaveLength(6);
  });

  it('нездійсненна група не малюється взагалі', () => {
    expect(buildGrooveCutters([drainGrooves({ depth: 19 })], W, H, T)).toEqual([]);
  });

  it('канавка врізається рівно на задану глибину і не проходить наскрізь', () => {
    const [cutter] = buildGrooveCutters([drainGrooves({ depth: 5 })], W, H, T);
    const b = boundsMm(cutter);
    // Верх плити +10; різак виступає над нею і сягає 10−5 = +5
    expect(b.maxY).toBeGreaterThan(T / 2);
    expect(b.minY).toBeCloseTo(T / 2 - 5, 1);
    expect(b.minY).toBeGreaterThan(-T / 2); // дно плити ціле
  });

  it('горизонтальна група лягає вздовж X і множиться кроком по Z', () => {
    const cutters = buildGrooveCutters([drainGrooves()], W, H, T);
    const first = boundsMm(cutters[0]);
    const second = boundsMm(cutters[1]);
    // Довжина 400 мм уздовж X, від x=800 (у центрованих: 0 … +400)
    expect(first.maxX - first.minX).toBeCloseTo(400, 0);
    // Крок 50 мм по Z між сусідніми
    expect(second.minZ - first.minZ).toBeCloseTo(50, 0);
  });

  it('вертикальна група лягає вздовж Z і множиться по X', () => {
    const cutters = buildGrooveCutters([drainGrooves({ direction: 'vertical', x: 200, y: 50, length: 300, count: 3 })], W, H, T);
    const first = boundsMm(cutters[0]);
    const second = boundsMm(cutters[1]);
    expect(first.maxZ - first.minZ).toBeCloseTo(300, 0);
    expect(second.minX - first.minX).toBeCloseTo(50, 0);
  });

  it('фрезерування з тилу йде від нижньої площини', () => {
    const [cutter] = buildGrooveCutters([drainGrooves({ face: 'bottom', depth: 5 })], W, H, T);
    const b = boundsMm(cutter);
    expect(b.minY).toBeLessThan(-T / 2);
    expect(b.maxY).toBeCloseTo(-T / 2 + 5, 1);
  });

  it('погонні метри рахуються для кошторису', () => {
    expect(grooveTotalLengthMm([drainGrooves()])).toBe(6 * 400);
    expect(grooveTotalLengthMm(undefined)).toBe(0);
  });
});
