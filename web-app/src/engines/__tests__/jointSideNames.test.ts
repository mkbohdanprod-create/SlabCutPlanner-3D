/**
 * СТОРОЖ №105 (04.09.2026): імена сторін на шматках після стику НЕ
 * з'їжджають, коли є припуск.
 *
 * Корінь: `cleanPolygonForOffset` викидала «майже пряму» вершину на межі
 * ребра різу і сторони (стик по внутрішньому куту ніжки П/Г — ребро різу
 * колінеарне зі стороною), а `pushRingParts` чіпляла імена сторін за
 * індексом — усі сторони після викинутої точки зсувались на одне ребро.
 * З припуском 0 гілка чистки не працює, тому решта тестів цього не
 * ловила. Цей — навмисне з припуском.
 */
import { describe, it, expect } from 'vitest';
import { explodeDetails } from '../geometry';
import { buildGeometry } from '../../domain/elementToDetail';
import { DEFAULT_ALLOWANCES } from '../../domain/defaults';
import { edgeLengthForSide } from '../geometryUtils';
import { edgeMarkersForPart } from '../../utils/edgeProfiles';
import type { Detail, DetailPart, ElementDefinition } from '../../domain/types';

const base = {
  type: 'Стільниця', quantity: 1, thickness: 20, elevation: 900,
  innerHorizontal: 500, innerVertical: 400, wholeDetail: true,
  diameter: 800, circleSizeMode: 'diameter', ellipseWidth: 1200, ellipseHeight: 600,
  corners: {}, cutouts: {}, skirtings: {}, wallPanels: {}, legs: {},
};

const detailOf = (def: ElementDefinition, shape: Detail['shape']): Detail => ({
  id: 'det_1', type: 'Стільниця', shape, quantity: 1, thickness: 20, name: 'Виріб', label: 'Виріб', isProduct: true,
  geometry: buildGeometry(def), edgeProfiles: def.edgeProfiles, skirtings: {}, wallPanels: {}, legs: {},
} as unknown as Detail);

const PAD = 2.5;
const WITH_PAD = { ...DEFAULT_ALLOWANCES, detailLength: PAD, detailWidth: PAD };
/** Сторона з припуском довша на ≤ 2·припуск (по припуску з кожного кінця, крім ребра різу). */
const PAD_TOL = 2 * PAD + 0.1;
const near = (actual: number, nominal: number) => Math.abs(actual - nominal) <= PAD_TOL;
const byName = (parts: DetailPart[], name: string) => parts.find((p) => p.name === name)!;
const markerLen = (part: DetailPart, profiles: ElementDefinition['edgeProfiles'], side: string) => {
  const m = edgeMarkersForPart(part, profiles, 0, 16, false).find((x) => x.side === side);
  return m ? Math.hypot(m.end.x - m.start.x, m.end.y - m.start.y) : 0;
};

describe('№105: сторони шматків після стику з припуском', () => {
  // П 2400×2800 (кейс власника): ніжки різної висоти, XD20 на D/E/F,
  // вертикальні стики по внутрішніх кутах ніжок — x = 600 і x = 1800.
  const U = {
    ...base, kind: 'u', width: 2400, height: 2800, outerWidth: 2400, outerHeight: 2800,
    innerCutWidth: 1200, innerCutDepth: 2200, innerCutOffset: 600, innerCutSide: 'bottom',
    leftLegHeight: 2100, rightLegHeight: 2800,
    edgeProfiles: { D: 'xd_20', E: 'xd_20', F: 'xd_20' },
    manualJoints: [{ id: 'j1', axis: 'vertical', offset: 600 }, { id: 'j2', axis: 'vertical', offset: 1800 }],
  } as unknown as ElementDefinition;

  it('П: кромка F лишається на довгій внутрішній стороні, D — без ребра різу', () => {
    const parts = explodeDetails([detailOf(U, 'П-подібна')], WITH_PAD, 'Кварцит').filter((p) => p.isMain);
    expect(parts.map((p) => p.name)).toEqual(['Виріб.1', 'Виріб.2', 'Виріб.3']);
    const p1 = byName(parts, 'Виріб.1');
    const p3 = byName(parts, 'Виріб.3');
    // Контур з припуском зберіг усі вершини — межу «різ | F» не викинуто
    expect(p1.points.length).toBe(p1.nominalPoints?.length);
    expect(p1.points.some((q) => q.cut)).toBe(true);
    expect(p3.points.some((q) => q.cut)).toBe(true);
    // Метраж профілю — по своїх сторонах, не по сусідніх і не по різу.
    // До виправлення (04.09.2026): F = 605 (коротка сторона), D = 2805 (з різом).
    expect(near(edgeLengthForSide(p1, 'F'), 1500)).toBe(true);
    expect(near(edgeLengthForSide(p3, 'D'), 2200)).toBe(true);
    expect(near(edgeLengthForSide(byName(parts, 'Виріб.2'), 'E'), 1200)).toBe(true);
    // Позначка на дошці — на довгому ребрі, а не на короткій 600
    expect(markerLen(p1, U.edgeProfiles, 'F')).toBeGreaterThan(1400);
    expect(markerLen(p3, U.edgeProfiles, 'D')).toBeGreaterThan(2100);
  });

  it('П: з припуском і без — ті самі імена сторін і довжини', () => {
    const detail = detailOf(U, 'П-подібна');
    const a = explodeDetails([detail], DEFAULT_ALLOWANCES, 'Кварцит').filter((p) => p.isMain);
    const b = explodeDetails([detail], WITH_PAD, 'Кварцит').filter((p) => p.isMain);
    for (const pa of a) {
      const pb = byName(b, pa.name);
      expect(Object.keys(pb.sideSegments ?? {}).sort()).toEqual(Object.keys(pa.sideSegments ?? {}).sort());
      for (const side of Object.keys(pa.sideSegments ?? {})) {
        expect(near(edgeLengthForSide(pb, side), edgeLengthForSide(pa, side))).toBe(true);
      }
    }
  });

  it('Г: стик по внутрішньому куту з припуском не з\'їжджає кромку', () => {
    // Г 3000×1200, виріз 900×500, профіль на A і E; стик рівно по
    // внутрішньому куту x = 2100. [ФАКТ] до фіксу цей кейс НЕ падав —
    // лишаю як паритет-сторож; відтворення бага — П вище.
    const L = {
      ...base, kind: 'l', width: 3000, height: 1200, outerWidth: 3000, outerHeight: 1200,
      innerHorizontal: 900, innerVertical: 500,
      edgeProfiles: { A: 'xd_20', E: 'xd_20' },
      manualJoints: [{ id: 'j1', axis: 'vertical', offset: 2100 }],
    } as unknown as ElementDefinition;
    const detail = detailOf(L, 'Г-подібна');
    const a = explodeDetails([detail], DEFAULT_ALLOWANCES, 'Кварцит').filter((p) => p.isMain);
    const b = explodeDetails([detail], WITH_PAD, 'Кварцит').filter((p) => p.isMain);
    expect(b.length).toBe(a.length);
    for (const pa of a) {
      const pb = byName(b, pa.name);
      expect(Object.keys(pb.sideSegments ?? {}).sort()).toEqual(Object.keys(pa.sideSegments ?? {}).sort());
      for (const side of ['A', 'E']) {
        expect(near(edgeLengthForSide(pb, side), edgeLengthForSide(pa, side))).toBe(true);
      }
    }
  });
});
