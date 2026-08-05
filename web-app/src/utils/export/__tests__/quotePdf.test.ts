import { describe, it, expect } from 'vitest';
import { renderQuotePdfSvgPages } from '../quotePdf';
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
  priceOverrides: { 'fab:countertop_plain': 2500 },
  ...overrides,
});

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

  it('розрахунок — з цінами і загальною сумою', () => {
    const order = doc();
    const result = computeQuoteCalc(order);
    const [page] = renderQuotePdfSvgPages(project, order, result);
    expect(page).toContain('РОЗРАХУНОК ВАРТОСТІ');
    expect(page).toContain('ЗАГАЛЬНА ВАРТІСТЬ');
    // 1.528 × 2500 = 3820.00 — ручна ціна з документа
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
