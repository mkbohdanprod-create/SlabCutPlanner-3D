import { describe, it, expect } from 'vitest';
import {
  renderQuotePdfSvgPages,
  renderQuoteCalcBodies,
  renderQuoteVisualizationBody,
  renderApprovalBodies,
  assembleQuotePages,
} from '../quotePdf';
import { computeQuoteCalc } from '../../../engines/quoteCalc';
import { createQuoteCalcDoc, type QuoteCalcDoc, type QuoteItem } from '../../../domain/quoteCalc';
import type { Project } from '../../../domain/types';

// PDF для клієнта збирається з чистих SVG-рядків — сторінки можна
// перевіряти без браузера. Растеризація (svg → png → jsPDF) — єдиний
// крок, що потребує DOM, і він тут не викликається.

const project = { orderNumber: '81-1343265', uiLanguage: 'uk' } as unknown as Project;

let seq = 0;
const item = (overrides: Partial<QuoteItem>): QuoteItem => ({
  id: `qi_${(seq += 1)}`,
  productTypeId: 'countertop_plain',
  count: 1,
  shape: 'Пряма',
  dims: {},
  ...overrides,
});

const doc = (overrides: Partial<QuoteCalcDoc> = {}): QuoteCalcDoc => ({
  ...createQuoteCalcDoc(),
  contragent: 'СКАЙ ІНТЕРІОР',
  contactName: 'Богдан',
  contactPhone: '+380001112233',
  manufacturer: 'Laminam',
  decorCode: 'CALACATTA',
  items: [
    item({ dims: { w: 2000, h: 600 }, sourceLabel: 'Стільниця 2', sourceRef: 'd1', areaM2: 1.528 }),
    item({ productTypeId: 'wall_panel_ge12', dims: { w: 1100, h: 600 }, areaM2: 1.834, sourceRef: 'd2', sourceLabel: 'Стінова панель 1' }),
  ],
  ...overrides,
});

/**
 * Ціни в рядки приходять від сервісу вартості за кодом 1С — локального
 * прайсу як джерела більше немає (рішення 25.08.2026). '292336' —
 * «Виготовлення стільниці без потовщень (керамограніт Laminam)», тобто
 * номенклатура саме цього тестового проекту.
 */
const erpPrices = (countertopPrice: number) => ({ '292336': countertopPrice });

describe('PDF прорахунку', () => {
  it('шапка — фірмова: логотип, номер замовлення, плашка бренду', () => {
    const [page] = renderQuotePdfSvgPages(project, doc(), computeQuoteCalc(doc()));
    expect(page).toContain('viyar');
    expect(page).toContain('stone');
    expect(page).toContain('ПРОРАХУНОК ЗАМОВЛЕННЯ');
    expect(page).toContain('81-1343265');
    expect(page).toContain('#303f50');
  });

  it('інфоблок несе контрагента, матеріал і контакт', () => {
    const [page] = renderQuotePdfSvgPages(project, doc(), computeQuoteCalc(doc()));
    expect(page).toContain('СКАЙ ІНТЕРІОР');
    expect(page).toContain('Керамограніт · Laminam');
    expect(page).toContain('Богдан, +380001112233');
    expect(page).toContain('CALACATTA');
  });

  it('вироби — з назвами з розкрою і фактичними площами', () => {
    const [page] = renderQuotePdfSvgPages(project, doc(), computeQuoteCalc(doc()));
    expect(page).toContain('Стільниця 2');
    expect(page).toContain('1.528 м²');
    expect(page).toContain('1.834 м²');
  });

  it('кожен виріб несе ціну виготовлення за своєю номенклатурою', () => {
    const order = doc();
    const [page] = renderQuotePdfSvgPages(project, order, computeQuoteCalc(order, undefined, erpPrices(2500)));
    const normalized = page.replace(/[  ]/g, ' ');
    expect(page).toContain('Вартість, грн');
    // стільниця: 1.528 м² × 2500 = 3820.00
    expect(normalized).toContain('3 820,00');
  });

  it('нога показує свою частку за ставкою стільниці з позначкою', () => {
    const order = doc({
      items: [
        item({ dims: { w: 2000, h: 600 }, areaM2: 1.2, sourceRef: 'd1', sourceLabel: 'Стільниця' }),
        item({ productTypeId: 'leg', areaM2: 0.45, dims: { w: 900 }, sourceRef: 'd2', sourceLabel: 'Опора (B)' }),
      ],
    });
    const [page] = renderQuotePdfSvgPages(project, order, computeQuoteCalc(order, undefined, erpPrices(2000)));
    // 0.45 × 2000 = 900.00 — частка ноги за ставкою стільниці
    expect(page).toContain('900,00');
    expect(page).toContain('у складі стільниці');
  });

  it('розрахунок — з цінами і загальною сумою', () => {
    const order = doc();
    const result = computeQuoteCalc(order, undefined, erpPrices(2500));
    const [page] = renderQuotePdfSvgPages(project, order, result);
    expect(page).toContain('РОЗРАХУНОК ВАРТОСТІ');
    expect(page).toContain('ЗАГАЛЬНА ВАРТІСТЬ');
    // 1.528 × 2500 = 3820.00 — ставка стільниці
    expect(result.total).toBeCloseTo(3820, 2);
    expect(page.replace(/ | /g, ' ')).toContain('3 820,00');
  });

  it('адреса і зона виїзду — лише у способі «з заміром та монтажем»', () => {
    const measured = doc({ method: 'measure_install', address: 'Київ, вул. Тестова, 1', deliveryZone: 2 });
    const [withAddress] = renderQuotePdfSvgPages(project, measured, computeQuoteCalc(measured));
    expect(withAddress).toContain('Тестова');
    expect(withAddress).toContain('зона виїзду 2');

    const [without] = renderQuotePdfSvgPages(project, doc(), computeQuoteCalc(doc()));
    expect(without).not.toContain('Адреса');
  });

  it('внутрішні попередження в клієнтський PDF не потрапляють', () => {
    const order = doc({ items: [item({ productTypeId: 'leg', dims: { w: 900, h: 600 } })] });
    const result = computeQuoteCalc(order);
    expect(result.warnings.length).toBeGreaterThan(0);
    const pages = renderQuotePdfSvgPages(project, order, result);
    pages.forEach((page) => {
      expect(page).not.toContain('без стільниці');
      expect(page).not.toContain('Без ціни');
    });
  });

  it('сторінка візуалізацій: великий ракурс + два менші, з приміткою', () => {
    const body = renderQuoteVisualizationBody(project, [
      'data:image/jpeg;base64,AAA',
      'data:image/jpeg;base64,BBB',
      'data:image/jpeg;base64,CCC',
    ]);
    expect(body).toContain('ВІЗУАЛІЗАЦІЯ ВИРОБУ');
    expect(body).toContain('Зображення попередні');
    expect((body.match(/<image /g) ?? [])).toHaveLength(3);
  });

  it('один знімок займає всю сторінку', () => {
    const body = renderQuoteVisualizationBody(project, ['data:image/jpeg;base64,AAA']);
    expect((body.match(/<image /g) ?? [])).toHaveLength(1);
    expect(body).toContain('height="1168"'); // 1180 − рамка
  });

  it('КП + візуалізація нумеруються наскрізно', () => {
    const bodies = [
      ...renderQuoteCalcBodies(project, doc(), computeQuoteCalc(doc())),
      renderQuoteVisualizationBody(project, ['data:image/jpeg;base64,AAA']),
    ];
    const pages = assembleQuotePages(bodies);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('Сторінка 1 з 2');
    expect(pages[1]).toContain('Сторінка 2 з 2');
    expect(pages[1]).toContain('ВІЗУАЛІЗАЦІЯ ВИРОБУ');
  });

  it('бланк погодження: шапка, контур із літерами сторін, специфікація, підпис', () => {
    // Стільниця 1000×600 з крайкою R2 по C і заусовкою 45° по C (слот fold_C —
    // цех називає це «Потовщення», див. EDGE_KIND_LABEL)
    const projectFull = {
      orderNumber: '81-1343265',
      referenceData: { edgeProfiles: [{ id: 'r2_top', label: 'Крайка R2', shortLabel: 'R2', allowance: 2.5 }] },
    } as unknown as Project;
    const details = [
      {
        id: 'prod_1/element:main/detail:main', slot: 'main', type: 'Стільниця', shape: 'Прямокутна',
        label: 'Стільниця кухня', thickness: 20, quantity: 1,
        geometry: {
          width: 1000, height: 600,
          corners: { DA: { type: 'radius', radius: 300 } },
          cutouts: {
            c1: { id: 'c1', shape: 'rect', x: 200, y: 150, width: 300, height: 200, type: 'custom' },
            c2: { id: 'c2', shape: 'circle', x: 700, y: 300, diameter: 35, type: 'faucet' },
          },
        },
        edgeProfiles: { C: 'r2_top' },
      },
      {
        id: 'prod_1/element:fold_C/detail:main', slot: 'fold_C', parentDetailSide: 'C', type: 'Підворот',
        shape: 'Прямокутна', thickness: 20, quantity: 1, geometry: { width: 1000, height: 100 },
      },
    ] as unknown as Parameters<typeof renderApprovalBodies>[3];
    const parts = [
      {
        id: 'p1', detailId: 'prod_1/element:main/detail:main', isMain: true, area: 0.6,
        width: 1000, height: 600,
        points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }],
        holes: [[{ x: 200, y: 150 }, { x: 500, y: 150 }, { x: 500, y: 350 }, { x: 200, y: 350 }]],
        shape: 'Прямокутна',
      },
    ] as unknown as Parameters<typeof renderApprovalBodies>[2];
    const order = doc({ contragent: 'ЛИТВИНЧУК АНДРІЙ', contactName: 'Андрій', contactPhone: '+380501112233' });

    const bodies = renderApprovalBodies(projectFull, order, parts, details);
    const all = bodies.join('');
    expect(all).toContain('БЛАНК ПОГОДЖЕННЯ ВИРОБУ');
    expect(all).toContain('ЛИТВИНЧУК АНДРІЙ');
    expect(all).toContain('Виріб №1 — Стільниця кухня (0.600 м.кв)');
    // Єдина угода (хвиля 3): A — перше ребро контуру (верх, 1000 мм),
    // B — наступне за обходом (право, 600 мм).
    expect(all).toContain('A=1000 мм');       // літера сторони з довжиною
    expect(all).toContain('B=600 мм');
    expect(all).toContain('потовщення');       // позначка всередині контуру
    expect(all).toContain('Крайка — Крайка R2');
    expect(all).toContain('Тип елементу виробу');
    // Радіус кута і вирізи з розмірами — у специфікації
    expect(all).toContain('Радіус R300');
    expect(all).toContain('Виріз 300×200 мм');
    expect(all).toContain('Виріз під змішувач Ø35 мм');
    // Розмір вирізу підписаний і на кресленні (з отвору парта)
    expect(all).toContain('300×200');
    expect(all).toContain('Увага!');
    expect(all).toContain('видами обробки згоден:');
  });

  it('бланк: мийка отримує паспорт із трьома проєкціями, а не контур стінки', () => {
    const details = [
      {
        id: 'prod_1/element:sink_1/detail:main', slot: 'sink_1', type: 'Мийка',
        shape: 'Прямокутна', label: 'Мийка (1)', thickness: 20, quantity: 1,
        geometry: { width: 500, height: 400, innerVertical: 200, sinkKind: 'rect' },
      },
    ] as unknown as Parameters<typeof renderApprovalBodies>[3];
    const parts = [
      {
        id: 'p1', detailId: 'prod_1/element:sink_1/detail:main', isMain: true, area: 0.105,
        width: 524, height: 200,
        points: [{ x: 0, y: 0 }, { x: 524, y: 0 }, { x: 524, y: 200 }, { x: 0, y: 200 }],
        name: 'Мийка (1) 1. задня стінка мийки',
      },
    ] as unknown as Parameters<typeof renderApprovalBodies>[2];

    const bodies = renderApprovalBodies(project, doc({}), parts, details);
    const all = bodies.join('');
    expect(all).toContain('Виріб №1 — Мийка (1) (0.105 м.кв)');
    expect(all).toContain('Вид спереду (розріз)');
    expect(all).toContain('Вид збоку (розріз)');
    expect(all).toContain('Вид зверху');
    expect(all).toContain('Кількість');
    // контур стінки з розкрою НЕ малюється (немає літер сторін цієї стінки)
    expect(all).not.toContain('A=524 мм');
  });

  it('довгий розрахунок розливається на сторінки з нумерацією', () => {
    const many = doc({
      items: Array.from({ length: 40 }, (_, index) =>
        item({ dims: { w: 1000 + index, h: 600 }, processingNote: `позиція ${index}` })),
    });
    const pages = renderQuotePdfSvgPages(project, many, computeQuoteCalc(many));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]).toContain('Сторінка 1 з ' + pages.length);
    expect(pages[pages.length - 1]).toContain(`Сторінка ${pages.length} з ${pages.length}`);
    // шапка таблиці повторюється на продовженні
    expect(pages[1]).toContain('продовження');
  });
});
