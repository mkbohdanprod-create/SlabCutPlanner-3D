import { describe, it, expect } from 'vitest';
import { explodeDetails } from '../geometry';
import { edgeLengthForSide, sidesInContourOrder } from '../geometryUtils';
import { extractProductionFacts } from '../productionFacts';
import { edgeMarkersForPart } from '../../utils/edgeProfiles';
import type { Detail, Project } from '../../domain/types';

/**
 * Б-002 (07.09.2026): ребра Г-зарізу — іменовані сторони і в розкрої.
 *
 * До цього дві полиці зарізу були «кутовим переходом» без імені: кромку
 * на них не можна було ані поставити, ані порахувати, а сусідні сторони
 * забирали собі по половині цих ребер у метраж. Тепер `CD_lcut1/2` —
 * власні сегменти парта (ключі ті самі, що в 3D-контурі та слотах
 * доповнень), і `edgeLengthForSide` віддає їхню чесну довжину, а сусідні
 * сторони закінчуються рівно на межі зарізу.
 */
const NO_ALLOWANCES = {
  detailLength: 0,
  detailWidth: 0,
  elementLength: 0,
  elementWidth: 0,
  interPartSpacing: 0,
  detailSmallCutout: 0,
  detailLargeCutout: 0,
  elementSmallCutout: 0,
  elementLargeCutout: 0,
  show: true,
  applyToImports: true,
};

function rectWithLcut(): Detail {
  return {
    id: 'det-lcut',
    type: 'Стільниця',
    shape: 'Прямокутна',
    quantity: 1,
    thickness: 20,
    geometry: {
      width: 1200,
      height: 600,
      corners: { CD: { type: 'l-cut', sizeB: 150, sizeC: 100 } },
    },
  } as Detail;
}

describe('Г-заріз — іменовані сторони парта', () => {
  it('прямокутник із зарізом CD: парт несе сегменти CD_lcut1 і CD_lcut2', () => {
    const parts = explodeDetails([rectWithLcut()], NO_ALLOWANCES);
    const main = parts.find((p) => p.isMain);
    expect(main).toBeTruthy();
    expect(main!.sideSegments).toBeTruthy();
    expect(Object.keys(main!.sideSegments!)).toEqual(
      expect.arrayContaining(['A', 'B', 'C', 'D', 'CD_lcut1', 'CD_lcut2']),
    );
  });

  it('довжини чесні: полиці 100 і 150 мм, сусідні сторони вкорочені й не тягнуть їх собі', () => {
    const parts = explodeDetails([rectWithLcut()], NO_ALLOWANCES);
    const main = parts.find((p) => p.isMain)!;
    // sizeB=150 — вздовж C (перша літера кута), sizeC=100 — вздовж D.
    // lcut1 — вертикальне ребро (∥ D) довжиною sizeC, lcut2 — горизонтальне (∥ C) довжиною sizeB.
    expect(Math.round(edgeLengthForSide(main, 'CD_lcut1'))).toBe(100);
    expect(Math.round(edgeLengthForSide(main, 'CD_lcut2'))).toBe(150);
    // Сторона C: 1200 − 150; сторона D: 600 − 100. Раніше кожна з'їдала
    // ще й «свою» половину кутового переходу — тобто чуже ребро зарізу.
    expect(Math.round(edgeLengthForSide(main, 'C'))).toBe(1050);
    expect(Math.round(edgeLengthForSide(main, 'D'))).toBe(500);
  });

  it('порядок обходу: полиці стоять між C і D', () => {
    const parts = explodeDetails([rectWithLcut()], NO_ALLOWANCES);
    const main = parts.find((p) => p.isMain)!;
    const order = sidesInContourOrder(main);
    const c = order.indexOf('C');
    expect(order.slice(c, c + 4)).toEqual(['C', 'CD_lcut1', 'CD_lcut2', 'D']);
  });

  it('кромка на ребрі зарізу їде в гроші: факт edge на 0.1 м, не на всю сторону', () => {
    const detail = rectWithLcut();
    (detail as { edgeProfiles?: Record<string, unknown> }).edgeProfiles = {
      CD_lcut1: { top: { profileId: 'l_20' }, isFullLength: true },
    };
    const parts = explodeDetails([detail], NO_ALLOWANCES);
    const project = {
      id: 'proj',
      orderNumber: 'test',
      projectMaterial: 'Керамограніт',
      details: [detail],
      products: [],
      slabs: [],
      placements: [],
    } as unknown as Project;
    const facts = extractProductionFacts(project, parts);
    const edgeFacts = facts.filter((f) => f.kind === 'edge');
    expect(edgeFacts).toHaveLength(1);
    // CD_lcut1 — вертикальна полиця зарізу, sizeC = 100 мм = 0.1 м.
    expect(edgeFacts[0].qty).toBeCloseTo(0.1, 3);
    expect(edgeFacts[0].ref?.side).toBe('CD_lcut1');
  });

  it('позначка кромки на карті крою знаходить ребро зарізу', () => {
    const detail = rectWithLcut();
    const parts = explodeDetails([detail], NO_ALLOWANCES);
    const main = parts.find((p) => p.isMain)!;
    const markers = edgeMarkersForPart(
      main,
      { CD_lcut1: { top: { profileId: 'l_20' }, isFullLength: true } } as never,
      0,
    );
    expect(markers).toHaveLength(1);
    expect(markers[0].side).toBe('CD_lcut1');
  });

  it('Г-подібна з зарізом на куті C (між сторонами C і D): сегменти C_lcut1/2 на місці', () => {
    const detail: Detail = {
      id: 'det-l-lcut',
      type: 'Стільниця',
      shape: 'Г-подібна',
      quantity: 1,
      thickness: 20,
      geometry: {
        width: 1500,
        height: 1500,
        outerWidth: 1500,
        outerHeight: 1500,
        innerHorizontal: 600,
        innerVertical: 600,
        corners: { C: { type: 'l-cut', sizeB: 120, sizeC: 80 } },
      },
    } as Detail;
    const parts = explodeDetails([detail], NO_ALLOWANCES);
    const main = parts.find((p) => p.isMain)!;
    expect(Object.keys(main.sideSegments ?? {})).toEqual(
      expect.arrayContaining(['C_lcut1', 'C_lcut2']),
    );
    expect(Math.round(edgeLengthForSide(main, 'C_lcut1'))).toBe(80);
    expect(Math.round(edgeLengthForSide(main, 'C_lcut2'))).toBe(120);
  });
});
