import { describe, it, expect } from 'vitest';
import { withSinkCutouts, sinkCutoutRecord, sinkAdditionElements, createProductSink } from '../productSink';
import { elementToDetail, buildGeometry } from '../elementToDetail';
import { explodeDetails } from '../../engines/geometry';
import { autoQuoteServices } from '../../engines/quoteCalc';
import type { ElementDefinition, ProductElement, Project } from '../types';

// Мийка, ВСТАНОВЛЕНА в стільницю: одне джерело істини (draft.sinks) має
// породжувати і виріз у стільниці, і комплект деталей чаші в розкрої.
// Тести ловлять розсинхрон: виріз без чаші або чашу без вирізу.

const allowances = {
  detailLength: 0, detailWidth: 0, elementLength: 0, elementWidth: 0,
  interPartSpacing: 0, detailSmallCutout: 0, detailLargeCutout: 0,
  elementSmallCutout: 0, elementLargeCutout: 0, show: false, applyToImports: false,
} as never;

const countertopDef = (sinks?: ElementDefinition['sinks']): ElementDefinition => ({
  type: 'Стільниця', kind: 'rect', quantity: 1, thickness: 20,
  width: 2000, height: 600, sinks,
} as unknown as ElementDefinition);

const sink = { id: '1', kind: 'rect' as const, x: 600, y: 300, width: 500, height: 400, depth: 200 };

describe('мийка в стільниці: похідний виріз', () => {
  it('виріз = внутрішній контур чаші, по центру мийки', () => {
    const cuts = sinkCutoutRecord({ sinks: { '1': sink } });
    const cut = cuts['sink_cut_1'];
    expect(cut).toBeDefined();
    expect(cut.shape).toBe('rect');
    expect(cut.x).toBe(600);
    expect(cut.y).toBe(300);
    expect(cut.width).toBe(500);
    expect(cut.height).toBe(400);
  });

  it('без мийок повертається ТА САМА довідка (мемоізація React)', () => {
    const def = countertopDef();
    expect(withSinkCutouts(def)).toBe(def);
  });

  it('buildGeometry домішує виріз до геометрії стільниці', () => {
    const g = buildGeometry(countertopDef({ '1': sink }));
    expect(g.cutouts?.['sink_cut_1']).toBeDefined();
    expect(g.cutouts?.['sink_cut_1'].width).toBe(500);
  });

  it('виріз доходить до розкрою: у головній деталі стільниці зʼявляється отвір', () => {
    const element = {
      id: 'prod_1/element:main', type: 'Стільниця', additions: [], joints: [],
      baseDefinition: countertopDef({ '1': sink }),
    } as unknown as ProductElement;
    const detail = elementToDetail(element, 1, true, undefined, undefined, 'Стільниця');
    const parts = explodeDetails([detail], allowances);
    const main = parts.find((part) => part.isMain)!;
    expect(main.holes?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('мийка в стільниці: елемент чаші', () => {
  it('кожна мийка стає доповненням зі слотом sink_<id>', () => {
    const els = sinkAdditionElements('7', countertopDef({ '1': sink }));
    expect(els).toHaveLength(1);
    expect(els[0].id).toBe('prod_7/element:sink_1');
    expect(els[0].type).toBe('Мийка');
    expect((els[0].baseDefinition as { kind?: string }).kind).toBe('sink_rect');
  });

  it('чаша розкладається на комплект деталей у розкрої', () => {
    const [el] = sinkAdditionElements('7', countertopDef({ '1': sink }));
    const detail = elementToDetail(el, 1, false, 'parent-id');
    expect(detail.geometry.sinkKind).toBe('rect');
    const parts = explodeDetails([detail], allowances);
    expect(parts.length).toBe(14);
  });

  it('щілинна мийка передає kind далі', () => {
    const slotSink = { ...sink, kind: 'slot' as const };
    const [el] = sinkAdditionElements('7', countertopDef({ '1': slotSink }));
    const detail = elementToDetail(el, 1, false, 'parent-id');
    expect(detail.geometry.sinkKind).toBe('slot');
  });

  it('дефолтна мийка стає по центру деталі', () => {
    const created = createProductSink('2', countertopDef());
    expect(created.x).toBe(1000);
    expect(created.y).toBe(300);
    expect(created.kind).toBe('rect');
  });
});

describe('мийка в стільниці: авто-послуга «Виріз під мийку»', () => {
  it('рахує мийки з урахуванням кількості виробів', () => {
    const project = {
      products: [{
        id: 'p1', name: 'Кухня',
        elements: [{
          id: 'prod_1/element:main', type: 'Стільниця', additions: [], joints: [],
          baseDefinition: { ...countertopDef({ '1': sink, '2': { ...sink, id: '2', x: 1500 } }), quantity: 2 },
        }],
      }],
    } as unknown as Project;
    const auto = autoQuoteServices(project, []);
    expect(auto.sink_cutout).toBe(4);
  });

  it('без мийок послуга не проставляється', () => {
    const project = {
      products: [{
        id: 'p1', name: 'Кухня',
        elements: [{
          id: 'prod_1/element:main', type: 'Стільниця', additions: [], joints: [],
          baseDefinition: countertopDef(),
        }],
      }],
    } as unknown as Project;
    expect(autoQuoteServices(project, []).sink_cutout).toBeUndefined();
  });
});
