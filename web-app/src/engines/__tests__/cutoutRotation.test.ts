// =====================================================================
//  №161 — ПОВОРОТ ВИРІЗУ МУСИТЬ ДОЇХАТИ ДО РОЗКРОЮ.
//
//  Скарга власника 08.09: «в розкрій невірно попадає виріз мийки, коли його
//  крутиш — мийка покрутилась, а виріз ні». У 3D отвір повертався (його
//  будує shapeBuilder), а розкрій має власний будівник отворів
//  (`buildHolesFromCutouts` у engines/geometry) — і він про поворот не знав.
//  Наслідок грошовий: на верстат їде прямий отвір під повернуту чашу.
//
//  Тест дивиться на те, що реально йде в цех: контур отвору в деталі
//  розкрою.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { explodeDetails } from '../geometry';
import { buildGeometry } from '../../domain/elementToDetail';
import { DEFAULT_ALLOWANCES } from '../../domain/defaults';
import type { Detail, DetailPart, ElementDefinition, Point } from '../../domain/types';

const detailWith = (cutout: Record<string, unknown>): Detail => {
  const def = {
    type: 'Стільниця', kind: 'rect', quantity: 1, thickness: 20, width: 2000, height: 600,
    wholeDetail: false, edgeProfiles: {}, corners: {}, skirtings: {}, wallPanels: {}, legs: {},
    cutouts: { c1: cutout },
  } as unknown as ElementDefinition;
  return {
    id: 'det_1', type: def.type, shape: 'Прямокутна', quantity: 1, thickness: 20,
    name: 'Деталь', label: 'Деталь', isProduct: true,
    geometry: buildGeometry(def), skirtings: {}, wallPanels: {}, legs: {},
  } as unknown as Detail;
};

const holeOf = (detail: Detail): Point[] => {
  const main = explodeDetails([detail], DEFAULT_ALLOWANCES, 'Кварцит').find((p: DetailPart) => p.isMain);
  const holes = (main as unknown as { holes?: Point[][] })?.holes ?? [];
  return holes[0] ?? [];
};

const span = (pts: Point[]) => ({
  w: Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)),
  h: Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)),
});

const base = { id: 'c1', shape: 'rect', type: 'custom', bindCorner: 'DA', x: 400, y: 200, width: 600, height: 300, cornerRadius: 5 };

describe('№161: поворот вирізу в розкрої', () => {
  it('без повороту отвір лишається прямим 600×300', () => {
    const pts = holeOf(detailWith(base));
    expect(pts.length).toBeGreaterThanOrEqual(4);
    const { w, h } = span(pts);
    expect(w).toBeCloseTo(600, 3);
    expect(h).toBeCloseTo(300, 3);
  });

  it('поворот 90° міняє габарит отвору місцями — 300×600', () => {
    const pts = holeOf(detailWith({ ...base, rotation: 90 }));
    const { w, h } = span(pts);
    expect(w).toBeCloseTo(300, 3);
    expect(h).toBeCloseTo(600, 3);
  });

  it('поворот 30° дає скісний отвір із тією самою площею', () => {
    const straight = holeOf(detailWith(base));
    const turned = holeOf(detailWith({ ...base, rotation: 30 }));
    const area = (pts: Point[]) => Math.abs(pts.reduce((sum, p, i) => {
      const q = pts[(i + 1) % pts.length];
      return sum + p.x * q.y - q.x * p.y;
    }, 0) / 2);
    // Габарит виріс — отвір справді скісний.
    expect(span(turned).w).toBeGreaterThan(span(straight).w + 50);
    // А самої дірки в камені стало рівно стільки ж: 600 × 300.
    expect(area(turned)).toBeCloseTo(area(straight), 1);
  });

  it('центр отвору не зʼїхав від повороту', () => {
    const mid = (pts: Point[]) => ({
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    });
    const straight = mid(holeOf(detailWith(base)));
    const turned = mid(holeOf(detailWith({ ...base, rotation: 45 })));
    expect(turned.x).toBeCloseTo(straight.x, 3);
    expect(turned.y).toBeCloseTo(straight.y, 3);
  });
});
