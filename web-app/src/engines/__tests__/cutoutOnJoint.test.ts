// =====================================================================
//  Сторож: ВИРІЗ НА СТИКУ — виїмка на обох шматках, коротший шов.
//
//  Знайдено 03.09.2026 на кейсі 81-2009298: варильна 562×492 стоїть рівно
//  на шві Ст1/Ст2. Рушій віддавав увесь отвір тому шматку, де опинився
//  центр вирізу: 280 мм отвору висіли за краєм шматка, сусід їхав у цех
//  без своєї половини, а шов рахувався на всю висоту деталі — хоча
//  посередині там дірка.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { explodeDetails } from '../geometry';
import { buildGeometry } from '../../domain/elementToDetail';
import { DEFAULT_ALLOWANCES } from '../../domain/defaults';
import type { Detail, DetailPart, ElementDefinition, Point } from '../../domain/types';

const areaM2 = (pts: Point[]) =>
  Math.abs(pts.reduce((sum, p, i) => {
    const q = pts[(i + 1) % pts.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0) / 2) / 1e6;

const detail = (patch: Partial<ElementDefinition>): Detail => {
  const def = {
    type: 'Стільниця', kind: 'rect', quantity: 1, thickness: 20, width: 2000, height: 600,
    wholeDetail: false, edgeProfiles: {}, corners: {}, cutouts: {}, skirtings: {}, wallPanels: {}, legs: {},
    manualJoints: [{ id: 'j1', axis: 'vertical', offset: 1000 }],
    ...patch,
  } as ElementDefinition;
  return {
    id: 'det_1', type: def.type, shape: 'Прямокутна', quantity: 1, thickness: 20,
    name: 'Деталь', label: 'Деталь', isProduct: true,
    geometry: buildGeometry(def), skirtings: {}, wallPanels: {}, legs: {},
  } as unknown as Detail;
};

const mains = (d: Detail): DetailPart[] =>
  explodeDetails([d], DEFAULT_ALLOWANCES, 'Кварцит').filter((p) => p.isMain);

describe('виріз на стику', () => {
  it('прямокутний виріз на шві — виїмка на обох шматках, отвору немає', () => {
    // Варильна 500×400 центром рівно на стику x=1000: 750…1250 × 100…500.
    const parts = mains(detail({
      cutouts: { hob: { id: 'hob', shape: 'rect', type: 'custom', bindCorner: 'DA', x: 750, y: 100, width: 500, height: 400 } },
    } as never));
    expect(parts.length).toBe(2);
    // Було: лівий 4 точки без отвору, правий 4 точки + отвір, що вилазить за край.
    expect(parts.map((p) => p.points.length)).toEqual([8, 8]);
    expect(parts.every((p) => !p.holes?.length)).toBe(true);
    // Площа: 1.2 м² мінус виріз 0.2 м² = 1.0, порівну.
    expect(parts.map((p) => Number(areaM2(p.points).toFixed(4)))).toEqual([0.5, 0.5]);
    // Виїмка лівого шматка — 250 мм углиб від різу, 100…500 по висоті.
    const left = parts[0].points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`);
    expect(left).toContain('750,100');
    expect(left).toContain('750,500');
    expect(left).not.toContain('1250,100');
  });

  it('шов коротшає на висоту вирізу: 600 − 400 = 200', () => {
    const parts = mains(detail({
      cutouts: { hob: { id: 'hob', shape: 'rect', type: 'custom', bindCorner: 'DA', x: 750, y: 100, width: 500, height: 400 } },
    } as never));
    const seams = parts.flatMap((p) => p.jointSeams ?? []);
    expect(seams.length).toBe(1);
    expect(Math.round(seams[0].lengthMm)).toBe(200);
  });

  it('круглий виріз на шві — пів кола на кожному шматку, шов мінус діаметр', () => {
    const parts = mains(detail({
      // Для кола x/y — центр (так їх віддає buildGeometry), радіус 100 → діаметр 200.
      cutouts: { c: { id: 'c', shape: 'circle', type: 'faucet', bindCorner: 'DA', x: 1000, y: 200, radius: 100 } },
    } as never));
    expect(parts.length).toBe(2);
    expect(parts.every((p) => !p.holes?.length)).toBe(true);
    expect(parts.every((p) => p.points.length > 8)).toBe(true);
    const seams = parts.flatMap((p) => p.jointSeams ?? []);
    expect(Math.round(seams[0].lengthMm)).toBe(400);
    expect(Number(parts.reduce((s, p) => s + areaM2(p.points), 0).toFixed(3))).toBe(Number((1.2 - Math.PI * 0.01).toFixed(3)));
  });

  it('виріз далеко від шва — звичайний отвір на своєму шматку, шов цілий', () => {
    const parts = mains(detail({
      cutouts: { s: { id: 's', shape: 'rect', type: 'sink', bindCorner: 'DA', x: 200, y: 100, width: 400, height: 350 } },
    } as never));
    expect(parts.map((p) => p.points.length)).toEqual([4, 4]);
    expect(parts.map((p) => p.holes?.length ?? 0)).toEqual([1, 0]);
    expect(Math.round(parts.flatMap((p) => p.jointSeams ?? [])[0].lengthMm)).toBe(600);
  });

  it('виріз ширший за середній шматок — не ріжемо шматок надвоє, лишаємо отвір', () => {
    // Два стики 900 і 1100: середня смужка 200 мм, а виріз 500 — виїмка
    // розвалила б смужку. Тоді як було: отвір цілком тому, де перша точка.
    const parts = mains(detail({
      manualJoints: [
        { id: 'j1', axis: 'vertical', offset: 900 },
        { id: 'j2', axis: 'vertical', offset: 1100 },
      ],
      cutouts: { hob: { id: 'hob', shape: 'rect', type: 'custom', bindCorner: 'DA', x: 750, y: 100, width: 500, height: 400 } },
    } as never));
    expect(parts.length).toBe(3);
    // Крайні шматки дістали виїмки, середній — цілий отвір (як раніше),
    // і обидва шви коротші на 400.
    expect(parts[0].points.length).toBe(8);
    expect(parts[2].points.length).toBe(8);
    expect(parts[1].holes?.length ?? 0).toBe(1);
    const seams = parts.flatMap((p) => p.jointSeams ?? []).map((s) => Math.round(s.lengthMm));
    expect(seams).toEqual([200, 200]);
  });
});
