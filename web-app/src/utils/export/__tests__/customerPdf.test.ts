import { describe, it, expect } from 'vitest';
import { renderTitlePage, renderOverviewPage } from '../pdfPages';
import { renderQuoteCalcBodies, renderApprovalBodies } from '../quotePdf';
import { defaultPdfExportOptions } from '../pdfTypes';
import { createQuoteCalcDoc, type QuoteCalcDoc } from '../../../domain/quoteCalc';
import { computeQuoteCalc } from '../../../engines/quoteCalc';
import type { Project } from '../../../domain/types';

// Дані контрагента приїжджають із довідника Customers Service у шапку
// проєкту. Перевіряємо, що ВСІ три поля (контрагент, контактна особа,
// телефон) доїжджають до документів — і карти крою, і прорахунку, і
// бланку погодження, — незалежно від того, де їх заповнили.

const A4L = { widthMm: 297, heightMm: 210, widthPx: 1697, heightPx: 1200 };

const project = (overrides: Partial<Project> = {}): Project => ({
  orderNumber: '81-1343265',
  customer: 'СКАЙ ІНТЕРІОР',
  customerId: 'org-1',
  customerContactName: 'Богдан Дулиш',
  customerContactPhone: '+380001112233',
  uiLanguage: 'uk',
  slabs: [],
  details: [],
  unplacedPartIds: [],
  versions: [{ id: 'v1', timestamp: '2026-08-18T09:00:00.000Z', note: '' }],
  updatedAt: '2026-08-18T09:00:00.000Z',
  calculationStatus: 'success',
  ...overrides,
} as unknown as Project);

const doc = (overrides: Partial<QuoteCalcDoc> = {}): QuoteCalcDoc => ({ ...createQuoteCalcDoc(), ...overrides });

describe('контрагент у PDF розкрою', () => {
  it('титульна сторінка несе контрагента, контактну особу й телефон', () => {
    const page = renderTitlePage(project(), [], defaultPdfExportOptions, A4L);
    expect(page).toContain('СКАЙ ІНТЕРІОР');
    expect(page).toContain('Богдан Дулиш');
    expect(page).toContain('+380001112233');
  });

  it('зведення теж показує контакт замовника', () => {
    const { svg } = renderOverviewPage(project(), [], defaultPdfExportOptions, A4L);
    expect(svg).toContain('СКАЙ ІНТЕРІОР');
    expect(svg).toContain('Богдан Дулиш');
    expect(svg).toContain('+380001112233');
  });

  it('якщо шапку не заповнили — дані беруться з прорахунку для клієнта', () => {
    const fromQuote = project({
      customer: '',
      customerContactName: undefined,
      customerContactPhone: undefined,
      quoteCalc: doc({ contragent: 'СТУДІЯ КАМЕНЮ', contactName: 'Оля', contactPhone: '+380670000000' }),
    });
    const page = renderTitlePage(fromQuote, [], defaultPdfExportOptions, A4L);
    expect(page).toContain('СТУДІЯ КАМЕНЮ');
    expect(page).toContain('Оля');
    expect(page).toContain('+380670000000');
  });

  it('порожній контрагент не ламає сторінку — лишається прочерк', () => {
    const empty = project({ customer: '', customerContactName: undefined, customerContactPhone: undefined });
    expect(() => renderTitlePage(empty, [], defaultPdfExportOptions, A4L)).not.toThrow();
    expect(renderTitlePage(empty, [], defaultPdfExportOptions, A4L)).toContain('Контрагент');
  });
});

describe('контрагент у PDF прорахунку', () => {
  it('інфоблок підхоплює контрагента з шапки проєкту, якщо документ порожній', () => {
    const [page] = renderQuoteCalcBodies(project(), doc(), computeQuoteCalc(doc()));
    expect(page).toContain('СКАЙ ІНТЕРІОР');
    expect(page).toContain('Богдан Дулиш, +380001112233');
  });

  it('дані самого документа мають перевагу над шапкою', () => {
    const own = doc({ contragent: 'СТУДІЯ КАМЕНЮ', contactName: 'Оля', contactPhone: '+380670000000' });
    const [page] = renderQuoteCalcBodies(project(), own, computeQuoteCalc(own));
    expect(page).toContain('СТУДІЯ КАМЕНЮ');
    expect(page).toContain('Оля, +380670000000');
    expect(page).not.toContain('СКАЙ ІНТЕРІОР');
  });

  it('бланк погодження бере контрагента й телефон із шапки проєкту', () => {
    const [page] = renderApprovalBodies(project(), doc(), [], []);
    expect(page).toContain('СКАЙ ІНТЕРІОР');
    expect(page).toContain('Богдан Дулиш, +380001112233');
  });
});
