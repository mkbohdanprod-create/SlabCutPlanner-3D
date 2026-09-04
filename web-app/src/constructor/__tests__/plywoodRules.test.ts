/**
 * Правила фанерного підкладу — коди КП-* з `ПРАВИЛА_ФАНЕРА.md`.
 */
import { describe, expect, it } from 'vitest';
import { buildPlywoodLayout, needsSubstrate, plywoodThickness } from '../plywood/plywoodRules';
import { PLYWOOD_DEFAULTS } from '../store';
import type { Detail } from '../../domain/types';

const detail = (patch: Partial<Detail> = {}): Detail => ({
  id: 'd1', type: 'Стільниця', shape: 'Прямокутна', quantity: 1, thickness: 20,
  geometry: { width: 2400, height: 600 },
  ...patch,
} as Detail);

describe('КП-7/КП-8 needsSubstrate', () => {
  it('профіль з бортом (SharkNose) → підклад потрібен', () => {
    const r = needsSubstrate(detail({ edgeProfiles: { A: 'sharknose' as never } }));
    expect(r.needed).toBe(true);
    expect(r.sides).toEqual(['A']);
    expect(r.reason).toMatch(/КП-7/);
  });
  it('плоский полірований торець → не потрібен', () => {
    expect(needsSubstrate(detail({ edgeProfiles: { A: 'polished_straight' as never } })).needed).toBe(false);
  });
  it('КП-8: висота кромки більша за плиту → потрібен, матеріал не важить', () => {
    expect(needsSubstrate(detail(), 40).needed).toBe(true);
    expect(needsSubstrate(detail(), 20).needed).toBe(false);
  });
  it('потовщення на сторонах → потрібен', () => {
    expect(needsSubstrate(detail({ thickening: { enabled: true, size: 20, sides: ['A'] } })).needed).toBe(true);
  });
});

describe('КП-1 plywoodThickness', () => {
  it('= висота кромки − плита', () => {
    expect(plywoodThickness(40, 20)).toBe(20);
    expect(plywoodThickness(12, 20)).toBe(0);
  });
});

describe('КП-2…КП-6 buildPlywoodLayout', () => {
  it('КП-2/КП-3/КП-4: рама з чотирьох смуг 80 із відступом 15', () => {
    const l = buildPlywoodLayout(2400, 600, PLYWOOD_DEFAULTS, [], 20);
    const strips = l.parts.filter((p) => p.kind === 'strip');
    expect(strips).toHaveLength(4);
    expect(strips[0]).toMatchObject({ x: 15, y: 15, w: 2370, h: 80 });
    expect(strips[2]).toMatchObject({ x: 15, y: 95, w: 80, h: 410 });
  });
  it('КП-5: крок ребер із параметра (гіпотеза) — 2400 при кроці 450 дає 4 ребра', () => {
    const l = buildPlywoodLayout(2400, 600, PLYWOOD_DEFAULTS, [], 20);
    expect(l.parts.filter((p) => p.kind === 'rib')).toHaveLength(4);
  });
  it('КП-6: біля вирізу — два ребра «в кліщі», ребра всередині вирізу не ставляться', () => {
    const l = buildPlywoodLayout(2400, 600, PLYWOOD_DEFAULTS, [{ x: 1000, y: 100, w: 500, h: 400, label: 'мийка' }], 20);
    const clamps = l.parts.filter((p) => p.kind === 'clamp');
    expect(clamps).toHaveLength(2);
    expect(clamps[0].x).toBe(920);
    expect(clamps[1].x).toBe(1500);
    const inside = l.parts.filter((p) => p.kind === 'rib' && p.x + p.w > 1000 && p.x < 1500);
    expect(inside).toHaveLength(0);
  });
  it('ТБ-1: таблиця групує однакові розміри і несе матеріал', () => {
    const l = buildPlywoodLayout(2400, 600, PLYWOOD_DEFAULTS, [], 20);
    expect(l.table[0]).toMatchObject({ no: 1, material: 'Фанера 20 мм' });
    expect(l.table.reduce((a, r) => a + r.qty, 0)).toBe(l.parts.length);
  });
});
