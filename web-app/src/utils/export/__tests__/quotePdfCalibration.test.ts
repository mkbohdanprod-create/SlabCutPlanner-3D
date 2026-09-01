/**
 * Режим калібрування має бути ВИДНО на самому документі.
 *
 * Рішення власника 25.08.2026 у відповідь на питання «ручна ціна в
 * клієнтському КП ніяк не позначена». Позначена — усім документом:
 * бланк виходить блідо-червоним, із смугою «клієнту не передавати»
 * і поіменним підписом на кожному ручному рядку.
 *
 * Тест тримає обидві сторони контракту: у звичайному режимі жодного
 * сліду калібрування бути не має, у режимі калібрування — має бути
 * неможливо переплутати документи.
 */
import { describe, expect, it } from 'vitest';
import { referenceData } from '../../../domain/defaults';
import { renderQuotePdfSvgPages } from '../quotePdf';
import { computeQuoteCalc } from '../../../engines/quoteCalc';
import { createQuoteCalcDoc, mergeQuotePriceBook } from '../../../domain/quoteCalc';

const project = {
  orderNumber: '77', customer: 'Тест', uiLanguage: 'uk',
  products: [], details: [], placements: [], slabs: [],
  referenceData: { edgeProfiles: referenceData.edgeProfiles },
} as never;

const doc = {
  ...createQuoteCalcDoc(),
  materialType: 'Керамограніт', manufacturer: 'Laminam',
  items: [{ id: 'qi1', productTypeId: 'countertop_plain', count: 1, shape: 'Пряма',
            dims: { w: 2000, h: 900 }, areaM2: 1.8 }],
  materialSheets: 1,
} as never;

/** Ціна від сервісу на «Виготовлення стільниці (керамограніт Laminam)» */
const fromCost = { '292336': 3100 };

const plain = computeQuoteCalc(doc, mergeQuotePriceBook(), fromCost, false);
const calibrated = computeQuoteCalc(
  doc,
  mergeQuotePriceBook({ fabrication: { countertop_plain: 3600 } }),
  fromCost,
  true,
);

const page = (result: typeof plain, calibration: boolean) =>
  renderQuotePdfSvgPages(project, doc, result, calibration).join('');

describe('режим калібрування на документі', () => {
  it('калькуляція справді різна — інакше тест нічого не ловить', () => {
    expect(plain.lines.find((l) => l.id === 'fab:countertop_plain')!.source).toBe('erp');
    expect(calibrated.lines.find((l) => l.id === 'fab:countertop_plain')!.source).toBe('manual');
    expect(plain.total).not.toBe(calibrated.total);
  });

  it('звичайний бланк — синій і без жодного сліду калібрування', () => {
    const svg = page(plain, false);
    expect(svg).toContain('#0084ff');
    expect(svg).toContain('ПРОРАХУНОК ЗАМОВЛЕННЯ');
    expect(svg).not.toMatch(/калібрув|не передавати|ЧЕРНЕТКА|ручна ціна/i);
  });

  it('бланк калібрування — червоний, із попередженням і без слова «прорахунок» у шапці', () => {
    const svg = page(calibrated, true);
    expect(svg).toContain('#e0554e');
    expect(svg).not.toContain('#0084ff');
    expect(svg).toContain('ЧЕРНЕТКА · НЕ КОМЕРЦІЙНА ПРОПОЗИЦІЯ');
    expect(svg).toContain('РЕЖИМ КАЛІБРУВАННЯ ЦІН — КЛІЄНТУ НЕ ПЕРЕДАВАТИ');
  });

  it('ручний рядок підписаний поіменно і несе ціну сервісу для порівняння', () => {
    const svg = page(calibrated, true);
    // Пробіл у тисячах — нерозривний (toLocaleString), тому нормалізуємо.
    expect(svg.replace(/[\u00a0\u202f]/g, ' ')).toContain('ручна ціна · 1С давала 3 100,00');
  });

  it('палітра перемикається назад — наступний звичайний бланк знову синій', () => {
    page(calibrated, true);
    const svg = page(plain, false);
    expect(svg).toContain('#0084ff');
    expect(svg).not.toContain('#e0554e');
  });
});
