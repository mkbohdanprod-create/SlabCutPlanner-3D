/**
 * FG-27 у ВИРОБІ: гнутий елемент має народжуватись і з редактора виробу.
 *
 * У виробі потовщення/підворот — окремі Елементи, а не галочки на деталі,
 * тому автоматика легасі-шляху (edgeParts) там не спрацьовує. Дугу створює
 * buildProductFromSession окремим доповненням, а позначка їде наскрізно:
 * чернетка → елемент → деталь → парт → факти.
 */
import { describe, it, expect } from 'vitest';
import { explodeDetails } from '../geometry';
import { extractProductionFacts } from '../productionFacts';
import { elementToDetail } from '../../domain/elementToDetail';
import { radiusElementSpecs } from '../../domain/radiusElement';
import { createDraft } from '../../components/forms/utils/draftHelpers';
import { createEmptyProject } from '../../domain/defaults';
import type { Detail, Project } from '../../domain/types';

describe('гнутий елемент через шлях виробу', () => {
  it('позначка доживає від чернетки доповнення до факту в кошторисі', () => {
    // Те, що робить buildProductFromSession для дуги, — у мініатюрі.
    const spec = radiusElementSpecs(
      { enabled: true, size: 100, sides: ['A', 'B'] },
      { AB: { type: 'radius', radius: 150 } },
      'rect',
    )[0];
    expect(spec).toBeDefined();

    const draft = {
      ...createDraft(),
      type: 'Потовщення' as const,
      width: Math.round(spec.lengthMm),
      height: spec.bandSizeMm,
      radiusElement: { radiusMm: spec.radiusMm, arcLengthMm: spec.arcLengthMm, cornerId: spec.cornerId },
    };
    const element = {
      id: 'prod_1:fold_arc_AB',
      type: draft.type,
      baseDefinition: draft,
      additions: [],
      joints: [],
    } as never;

    const detail = elementToDetail(element, 1, false, 'parent-1', 'AB');
    expect(detail.geometry.radiusElement?.radiusMm).toBe(150);

    const parts = explodeDetails([detail]);
    const marked = parts.filter((part) => part.radiusElement);
    expect(marked).toHaveLength(1);

    const project: Project = { ...createEmptyProject(), details: [detail as Detail] };
    const facts = extractProductionFacts(project, parts, { details: [detail as Detail] });
    // Послуга — за штуку. Матеріал рахується окремо, по прямокутнику
    // в розкрої, тому окремого факту «площа гнутого» більше немає.
    expect(facts.filter((fact) => fact.kind === 'radius_element')).toHaveLength(1);
  });

  it('дуга на П-подібній: кут B між сторонами B і C', () => {
    const specs = radiusElementSpecs(
      { enabled: true, size: 40, sides: ['B', 'C'] },
      { B: { type: 'radius', radius: 200 } },
      'u',
    );
    expect(specs).toHaveLength(1);
    expect(specs[0].sides).toEqual(['B', 'C']);
    expect(specs[0].arcLengthMm).toBeCloseTo(Math.PI * 200 / 2, 1);
  });

  it('кут start у Г-форми з\'єднує останню сторону з першою', () => {
    const specs = radiusElementSpecs(
      { enabled: true, size: 40, sides: ['F', 'A'] },
      { start: { type: 'radius', radius: 120 } },
      'l',
    );
    expect(specs).toHaveLength(1);
    expect(specs[0].sides).toEqual(['F', 'A']);
  });
});

/**
 * Доповнення, повішене на ДУГУ явно (нога чи панель зі слота
 * `wall_panel_B_radius`) — теж гнутий елемент і теж дає обидві послуги.
 */
describe('нога і панель на дузі', () => {
  it('деталь із позначкою дуги дає послугу, а категорія залежить від типу', () => {
    for (const type of ['Опора', 'Стінова панель'] as const) {
      const draft = {
        ...createDraft(),
        type,
        width: 306,
        height: type === 'Опора' ? 900 : 600,
        radiusElement: {
          radiusMm: 150,
          arcLengthMm: Math.PI * 150 / 2,
          cornerId: 'B',
          arcAngleDeg: 90,
          bandSizeMm: type === 'Опора' ? 900 : 600,
          method: 'segments' as const,
          role: type === 'Опора' ? ('leg' as const) : ('other' as const),
        },
      };
      const element = {
        id: `prod_1:${type === 'Опора' ? 'leg' : 'wall_panel'}_B_radius`,
        type,
        baseDefinition: draft,
        additions: [],
        joints: [],
      } as never;

      const detail = elementToDetail(element, 1, false, 'parent-1', 'B_radius');
      const parts = explodeDetails([detail]);
      const project: Project = { ...createEmptyProject(), details: [detail as Detail] };
      const facts = extractProductionFacts(project, parts, { details: [detail as Detail] });

      const elements = facts.filter((fact) => fact.kind === 'radius_element');
      expect(elements).toHaveLength(1);
      // Роль читається з типу деталі: опора класифікується за висотою,
      // стінова панель — жодною зі стандартних категорій, тобто складна.
      expect(elements[0].variant).toBe(type === 'Опора' ? 'leg_le900' : 'complex');
    }
  });
});
