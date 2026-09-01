import { describe, expect, it } from 'vitest';
import type { DrainGrate } from '../../domain/types';
import { buildGrateCutters, validateDrainGrate, defaultDrainGrate, grateCutLengthMm, GRATE_LIMITS } from '../drainGrate';

// Решітка живе в круглій деталі дна Ø114 — саме вона задає межі
const BOTTOM_W = 114;
const BOTTOM_H = 114;
const T = 12;

function grate(patch: Partial<DrainGrate> = {}): DrainGrate {
  return { ...defaultDrainGrate(), ...patch };
}

describe('перевірка здійсненності решітки зливу', () => {
  it('типова решітка з виробу проходить без зауважень', () => {
    expect(validateDrainGrate(grate(), BOTTOM_W, BOTTOM_H)).toEqual([]);
  });

  it('проріз тонший за струмінь води — так не ріжеться', () => {
    const issues = validateDrainGrate(grate({ slotWidth: 0.5 }), BOTTOM_W, BOTTOM_H);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('струмінь'))).toBe(true);
  });

  it('замало каменю між кільцями — викришиться', () => {
    // крок 5 при прорізі 3 лишає 2 мм стінки
    const issues = validateDrainGrate(grate({ ringGap: 5 }), BOTTOM_W, BOTTOM_H);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('викришиться'))).toBe(true);
  });

  it('вузька перемичка на внутрішньому кільці — камінь не втримається', () => {
    const issues = validateDrainGrate(grate({ bridgeDeg: 2, rings: 4 }), BOTTOM_W, BOTTOM_H);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('Перемичка'))).toBe(true);
  });

  it('кілець більше, ніж вміщується в діаметр', () => {
    const issues = validateDrainGrate(grate({ rings: 12, ringGap: 9, outerDiameter: 150 }), BOTTOM_W, BOTTOM_H);
    expect(issues.some((i) => i.level === 'error')).toBe(true);
  });

  it('решітка більша за дно — помилка з габаритами', () => {
    const issues = validateDrainGrate(grate({ outerDiameter: 300 }), BOTTOM_W, BOTTOM_H);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('краю'))).toBe(true);
  });

  it('межі цеху лишаються осмисленими', () => {
    expect(GRATE_LIMITS.minSlotMm).toBeGreaterThan(0);
    expect(GRATE_LIMITS.minBridgeMm).toBeGreaterThanOrEqual(3);
  });
});

describe('геометрія решітки', () => {
  it('кількість різаків = кільця × сегменти', () => {
    const g = grate({ rings: 4, segmentsPerRing: 3 });
    expect(buildGrateCutters(g, BOTTOM_W, BOTTOM_H, T)).toHaveLength(12);
  });

  it('нездійсненна решітка не малюється взагалі', () => {
    expect(buildGrateCutters(grate({ slotWidth: 0.2 }), BOTTOM_W, BOTTOM_H, T)).toEqual([]);
  });

  it('різ проходить НАСКРІЗЬ — вода мусить текти', () => {
    const cutters = buildGrateCutters(grate(), BOTTOM_W, BOTTOM_H, T);
    const geom = cutters[0];
    geom.computeBoundingBox();
    const box = geom.boundingBox!;
    expect(box.min.y * 1000).toBeLessThan(-T / 2);
    expect(box.max.y * 1000).toBeGreaterThan(T / 2);
  });

  it('решітка вписана в заданий діаметр', () => {
    const g = grate({ outerDiameter: 96, slotWidth: 3 });
    const cutters = buildGrateCutters(g, BOTTOM_W, BOTTOM_H, T);
    const half = g.outerDiameter / 2 + g.slotWidth;
    for (const geom of cutters) {
      geom.computeBoundingBox();
      const box = geom.boundingBox!;
      expect(Math.abs(box.min.x * 1000)).toBeLessThanOrEqual(half + 0.5);
      expect(Math.abs(box.max.z * 1000)).toBeLessThanOrEqual(half + 0.5);
    }
  });

  it('зсув центру рухає всю решітку', () => {
    // Дрібніша решітка, щоб зсув лишався в межах диска Ø114
    const [a] = buildGrateCutters(grate({ outerDiameter: 80 }), BOTTOM_W, BOTTOM_H, T);
    const [b] = buildGrateCutters(grate({ outerDiameter: 80, offsetX: 8 }), BOTTOM_W, BOTTOM_H, T);
    a.computeBoundingBox(); b.computeBoundingBox();
    expect(b.boundingBox!.min.x * 1000 - a.boundingBox!.min.x * 1000).toBeCloseTo(8, 0);
  });

  it('довжина водоструменевого різу рахується для кошторису', () => {
    expect(grateCutLengthMm(grate())).toBeGreaterThan(0);
    expect(grateCutLengthMm(undefined)).toBe(0);
  });
});
