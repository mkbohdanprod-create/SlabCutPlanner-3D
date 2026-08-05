import { describe, it, expect } from 'vitest';
import { buildGeometry, elementToDetail } from '../elementToDetail';
import { explodeDetails } from '../../engines/geometry';
import type { ProductElement } from '../types';

// Мийка з редактора виробу мусить давати рівно те саме, що й зі старого
// «Додати деталь»: 13 деталей у розкрої (стінки, трикутники дна,
// підклейки). Вмикає це одне поле geometry.sinkKind — без нього мийка
// мовчки ставала звичайною плитою.

const allowances = {
  detailLength: 10, detailWidth: 10, elementLength: 5, elementWidth: 5,
  interPartSpacing: 10, detailSmallCutout: 5, detailLargeCutout: 5,
  elementSmallCutout: 5, elementLargeCutout: 5, show: true, applyToImports: true,
};

const sinkElement = (kind: 'sink_rect' | 'sink_slot'): ProductElement => ({
  id: 'prod_1/element:main',
  type: 'Мийка',
  additions: [],
  joints: [],
  baseDefinition: {
    type: 'Мийка', kind, quantity: 1, thickness: 20,
    width: 500, height: 400, innerVertical: 200,
  },
} as unknown as ProductElement);

describe('мийка з редактора виробу', () => {
  it('buildGeometry переносить тип мийки в геометрію', () => {
    expect(buildGeometry({ kind: 'sink_rect' } as never).sinkKind).toBe('rect');
    expect(buildGeometry({ kind: 'sink_slot' } as never).sinkKind).toBe('slot');
    expect(buildGeometry({ kind: 'rect' } as never).sinkKind).toBeUndefined();
  });

  it('прямокутна мийка розкладається на комплект деталей, а не на одну плиту', () => {
    const detail = elementToDetail(sinkElement('sink_rect'), 1, true, undefined, undefined, 'Мийка 1');
    expect(detail.geometry.sinkKind).toBe('rect');

    const parts = explodeDetails([detail], allowances);
    // 4 стінки + 4 трикутники дна + підклейки + злив
    expect(parts.length).toBe(14);
    // стінки, трикутники дна й підклейки — з іменами, за якими 3D збирає чашу
    const names = parts.map((part) => part.name.toLowerCase()).join(' | ');
    expect(names).toContain('стінка');
    expect(names).toContain('трикутник');
    expect(names).toContain('підклейка');
  });

  it('щілинна мийка теж дає збірку, а не плиту', () => {
    const detail = elementToDetail(sinkElement('sink_slot'), 1, true, undefined, undefined, 'Мийка 2');
    expect(detail.geometry.sinkKind).toBe('slot');
    expect(explodeDetails([detail], allowances).length).toBeGreaterThan(1);
  });

  it('звичайна стільниця мийкою не стає', () => {
    const element = {
      id: 'prod_1/element:main', type: 'Стільниця', additions: [], joints: [],
      baseDefinition: { type: 'Стільниця', kind: 'rect', quantity: 1, thickness: 20, width: 1000, height: 600 },
    } as unknown as ProductElement;
    const detail = elementToDetail(element, 1, true, undefined, undefined, 'Стільниця');
    expect(detail.geometry.sinkKind).toBeUndefined();
    expect(explodeDetails([detail], allowances).length).toBe(1);
  });
});
