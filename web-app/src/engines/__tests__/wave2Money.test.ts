/**
 * Хвиля 2, гроші: FG-22 (торець на дугах/фасках/вирізах) і FG-33 (поверхня
 * акрилу). Обидва — той самий клас діри: цех робить, рахунок мовчить.
 */
import { describe, it, expect } from 'vitest';
import { explodeDetails } from '../geometry';
import { extractProductionFacts } from '../productionFacts';
import { computeQuoteCalc } from '../quoteCalc';
import { createQuoteCalcDoc } from '../../domain/quoteCalc';
import { createEmptyProject } from '../../domain/defaults';
import type { Detail, Project } from '../../domain/types';

const base = { type: 'Стільниця', quantity: 1, thickness: 20 } as const;

function factsFor(detail: Detail) {
  const parts = explodeDetails([detail]);
  const project: Project = { ...createEmptyProject(), details: [detail] };
  return extractProductionFacts(project, parts, { details: [detail] });
}

describe('FG-22 · торець на дугах, фасках і вирізах', () => {
  it('радіус із фрезеруванням дає метри дуги', () => {
    const detail = {
      ...base, id: 'r', shape: 'Прямокутна', label: 'Стільниця',
      geometry: {
        width: 2000, height: 600,
        corners: { AB: { type: 'radius', radius: 150, edgeProcessing: 'Стандарт' } },
      },
    } as unknown as Detail;

    const edges = factsFor(detail).filter((f) => f.kind === 'edge' && f.ref?.cornerId === 'AB');
    expect(edges).toHaveLength(1);
    // Чверть кола R150 = 235.6 мм ≈ 0.236 м.
    expect(edges[0].qty).toBeCloseTo(0.236, 2);
    expect(edges[0].variant).toBe('Стандарт');
  });

  it('фаска — гіпотенузою, а «Без фрезерування» не дає нічого', () => {
    const detail = {
      ...base, id: 'c', shape: 'Прямокутна', label: 'Стільниця',
      geometry: {
        width: 2000, height: 600,
        corners: {
          AB: { type: 'chamfer', sizeB: 300, sizeC: 400, edgeProcessing: 'Стандарт' },
          CD: { type: 'chamfer', sizeB: 100, sizeC: 100, edgeProcessing: 'Без фрезерування' },
        },
      },
    } as unknown as Detail;

    const edges = factsFor(detail).filter((f) => f.kind === 'edge' && f.ref?.cornerId);
    expect(edges).toHaveLength(1);
    // Гіпотенуза 300×400 = 500 мм.
    expect(edges[0].qty).toBeCloseTo(0.5, 3);
  });

  it('виріз із фрезеруванням дає периметр', () => {
    const detail = {
      ...base, id: 'k', shape: 'Прямокутна', label: 'Стільниця',
      geometry: {
        width: 2000, height: 600,
        cutouts: {
          c1: { id: 'c1', shape: 'rect', type: 'custom', bindCorner: 'DA', x: 300, y: 100, width: 500, height: 400, edgeProcessing: 'Стандарт' },
        },
      },
    } as unknown as Detail;

    const edges = factsFor(detail).filter((f) => f.kind === 'edge' && f.ref?.cutoutIndex !== undefined);
    expect(edges).toHaveLength(1);
    // 2×(500+400) = 1800 мм.
    expect(edges[0].qty).toBeCloseTo(1.8, 3);
  });
});

describe('FG-33 · поверхня акрилового каменю', () => {
  const doc = (surfaceType: string | undefined, materialType = 'Акриловий камінь') => ({
    ...createQuoteCalcDoc(),
    materialType,
    surfaceType,
    items: [{
      id: 'i1', productTypeId: 'countertop', label: 'Стільниця', count: 1,
      shape: 'Прямокутна', dims: { w: 2000, h: 600 }, areaM2: 1.44,
    }],
  } as never);

  it('глянець на акрилі дає рядок обробки поверхні на всю площу', () => {
    const lines = computeQuoteCalc(doc('Глянець')).lines;
    const surface = lines.find((line) => line.id === 'surface:processing');
    expect(surface).toBeDefined();
    expect(surface!.qty).toBeCloseTo(1.44, 2);
  });

  it('напівглянець — базовий стан, рядка немає', () => {
    expect(computeQuoteCalc(doc('Напівглянець')).lines.find((l) => l.id === 'surface:processing')).toBeUndefined();
  });

  it('на керамограніті поверхня не нараховується взагалі', () => {
    expect(computeQuoteCalc(doc('Глянець', 'Керамограніт')).lines.find((l) => l.id === 'surface:processing')).toBeUndefined();
  });
});
