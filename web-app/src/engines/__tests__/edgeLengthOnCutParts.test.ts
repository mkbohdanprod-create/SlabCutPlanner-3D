// =====================================================================
//  Сторож: метраж кромки на ШМАТКУ ПІСЛЯ РІЗУ.
//
//  Знайдено 03.09.2026 на кейсі 81-2009298 (стільниця 5645×990 з довільним
//  контуром, кромка ZS20 по фронту, два стики). Дві помилки одразу:
//    1. сторона C середнього шматка (2221 мм) рахувалась як 2814 — метраж
//       брав половину «кутового переходу» до сусідньої сторони, а на
//       розрізаній деталі цей перехід — ребро різу 593 мм;
//    2. сторони, яких на шматку взагалі немає (C_s1, C_s2 на лівому
//       шматку), діставали довжину «середнє ребро контуру» — 1836 мм кожна.
//  Разом фронт 5.7 м виставлявся як 12.7 м.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { explodeDetails } from '../geometry';
import { edgeLengthForSide } from '../geometryUtils';
import { buildGeometry } from '../../domain/elementToDetail';
import { DEFAULT_ALLOWANCES } from '../../domain/defaults';
import type { Detail, ElementDefinition } from '../../domain/types';

const CUSTOM_POINTS = [
  { id: 'D',    x: 0,    y: 345 },
  { id: 'A',    x: 3656, y: 345 },
  { id: 'A_s1', x: 3656, y: 0 },
  { id: 'A_s2', x: 5645, y: 0 },
  { id: 'B',    x: 5645, y: 990 },
  { id: 'C_s2', x: 5299, y: 990 },
  { id: 'C_s1', x: 5299, y: 938 },
  { id: 'C',    x: 0,    y: 938 },
];

const detail = (patch: Partial<ElementDefinition>): Detail => {
  const def = {
    type: 'Стільниця', kind: 'rect', quantity: 1, thickness: 20, width: 5645, height: 990,
    edgeProfiles: {}, corners: {}, cutouts: {}, skirtings: {}, wallPanels: {}, legs: {},
    ...patch,
  } as ElementDefinition;
  return {
    id: 'det_1', type: def.type, shape: 'Прямокутна', quantity: 1, thickness: 20,
    name: 'Деталь', label: 'Деталь', isProduct: true,
    geometry: buildGeometry(def), edgeProfiles: def.edgeProfiles,
    skirtings: {}, wallPanels: {}, legs: {},
  } as unknown as Detail;
};

describe('метраж кромки на шматках після різу', () => {
  const parts = explodeDetails([detail({
    customPoints: CUSTOM_POINTS, wholeDetail: false,
    edgeProfiles: { C: 'zs_20', C_s1: 'zs_20', C_s2: 'zs_20' },
    manualJoints: [
      { id: 'j1', axis: 'vertical', offset: 3078 },
      { id: 'j2', axis: 'vertical', offset: 5299 },
    ],
  } as never)], DEFAULT_ALLOWANCES, 'Кварцит').filter((p) => p.isMain);

  it('три шматки, ребра різу позначені', () => {
    expect(parts.length).toBe(3);
    // На кожному шматку є принаймні одне ребро різу.
    expect(parts.every((p) => p.points.some((pt) => pt.cut))).toBe(true);
  });

  it('сторона не тягнеться по ребру різу (було 2814 замість 2221)', () => {
    const [left, middle, right] = parts;
    expect(Math.round(edgeLengthForSide(left, 'C'))).toBe(3078);
    expect(Math.round(edgeLengthForSide(middle, 'C'))).toBe(2221);
    expect(Math.round(edgeLengthForSide(right, 'C_s2'))).toBe(346);
    expect(Math.round(edgeLengthForSide(right, 'C_s1'))).toBe(52);
  });

  it('сторони, яких на шматку немає, дають нуль, а не «середнє ребро»', () => {
    const [left, middle, right] = parts;
    expect(edgeLengthForSide(left, 'C_s1')).toBe(0);
    expect(edgeLengthForSide(left, 'C_s2')).toBe(0);
    expect(edgeLengthForSide(middle, 'C_s1')).toBe(0);
    expect(edgeLengthForSide(right, 'C')).toBe(0);
  });

  it('фронт цілком: 3078 + 2221 + 52 + 346 = 5697', () => {
    const total = parts.reduce((sum, p) => sum
      + edgeLengthForSide(p, 'C') + edgeLengthForSide(p, 'C_s1') + edgeLengthForSide(p, 'C_s2'), 0);
    expect(Math.round(total)).toBe(5697);
  });

  it('ціла проста деталь без мапи сторін — позиційна угода працює як і була', () => {
    const [whole] = explodeDetails([detail({})], DEFAULT_ALLOWANCES, 'Кварцит').filter((p) => p.isMain);
    expect(whole.sideSegments).toBeUndefined();
    expect(Math.round(edgeLengthForSide(whole, 'A'))).toBe(5645);
    expect(Math.round(edgeLengthForSide(whole, 'B'))).toBe(990);
  });
});
