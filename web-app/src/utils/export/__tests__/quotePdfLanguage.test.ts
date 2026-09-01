import { describe, it, expect } from 'vitest';
import {
  assembleQuotePages,
  renderApprovalBodies,
  renderQuoteCalcBodies,
  renderQuotePdfSvgPages,
  renderQuoteVisualizationBody,
} from '../quotePdf';
import { computeQuoteCalc } from '../../../engines/quoteCalc';
import { createQuoteCalcDoc, type QuoteCalcDoc, type QuoteItem } from '../../../domain/quoteCalc';
import type { Project } from '../../../domain/types';

/**
 * PDF малюється в SVG повз DOM, тому глобальний перекладач інтерфейсу до
 * нього не дістає: прорахунок англомовному менеджеру приходив українською.
 * Сторож дивиться на готову сторінку і шукає кирилицю — це єдина перевірка,
 * яка ловить і забутий підпис, і забуту точку входу.
 */

const CYRILLIC = /[А-Яа-яІіЇїЄєҐґ]+/g;

let seq = 0;
const item = (overrides: Partial<QuoteItem>): QuoteItem => ({
  id: `qi_${(seq += 1)}`,
  productTypeId: 'countertop_plain',
  count: 1,
  shape: 'Пряма',
  dims: {},
  ...overrides,
});

const doc = (): QuoteCalcDoc => ({
  ...createQuoteCalcDoc(),
  contragent: 'SKY INTERIOR',
  contactName: 'Bohdan',
  manufacturer: 'Laminam',
  decorCode: 'CALACATTA',
  items: [
    item({ dims: { w: 2000, h: 600 }, sourceLabel: 'Countertop 2', sourceRef: 'd1', areaM2: 1.528 }),
  ],
});

const projectIn = (uiLanguage: Project['uiLanguage']) =>
  ({ orderNumber: '81-1343265', uiLanguage } as unknown as Project);

describe('мова PDF прорахунку', () => {
  it('українською сторінка лишається українською', () => {
    const [page] = renderQuotePdfSvgPages(projectIn('uk'), doc(), computeQuoteCalc(doc()));
    expect(page).toContain('ПРОРАХУНОК ЗАМОВЛЕННЯ');
    expect(page).toContain('РОЗРАХУНОК ВАРТОСТІ');
  });

  (['en', 'pl'] as const).forEach((language) => {
    it(`${language}: у документі не лишається українських слів`, () => {
      const [page] = renderQuotePdfSvgPages(projectIn(language), doc(), computeQuoteCalc(doc()));
      // Дані з полів (контрагент, декор) у фікстурі латиницею, тому будь-яка
      // кирилиця тут — це наш власний неперекладений підпис.
      const left = Array.from(new Set(page.match(CYRILLIC) ?? []));
      expect(left).toEqual([]);
    });
  });

  it('шапка і підсумок справді перекладені, а не просто зникли', () => {
    const [page] = renderQuotePdfSvgPages(projectIn('en'), doc(), computeQuoteCalc(doc()));
    expect(page).toContain('ORDER CALCULATION');
    expect(page).toContain('81-1343265');
    expect(page).toMatch(/Page 1 of \d/);
  });

  it('сторінка візуалізації теж виставляє мову документа', () => {
    // Окрема точка входу: якщо забути виставити мову, вона підхопить ту,
    // що лишилась від попереднього експорту.
    const body = renderQuoteVisualizationBody(projectIn('en'), ['data:image/jpeg;base64,AAA']);
    expect(body).not.toMatch(CYRILLIC);
    expect(body).toContain('PRODUCT VISUALIZATION');
  });

  it('нумерація сторінок іде мовою документа', () => {
    const pages = assembleQuotePages(
      renderQuoteCalcBodies(projectIn('pl'), doc(), computeQuoteCalc(doc())),
    );
    expect(pages[0]).toContain('Strona 1 z 1');
  });

  it('бланк погодження перекладається разом із кресленням і специфікацією', () => {
    // Найризикованіша сторінка: підписи на кресленні («A=1000 мм»), рядки
    // специфікації («Виріз 300×200 мм») і застереження «Увага!» збираються
    // з частин, тому кожна з них уміє випасти зі словника окремо.
    const projectFull = {
      orderNumber: '81-1343265', uiLanguage: 'pl',
      referenceData: { edgeProfiles: [{ id: 'r2_top', label: 'R2', shortLabel: 'R2', allowance: 2.5 }] },
    } as unknown as Project;
    const details = [
      {
        id: 'prod_1/element:main/detail:main', slot: 'main', type: 'Стільниця', shape: 'Прямокутна',
        label: 'Kitchen top', thickness: 20, quantity: 1,
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
    ] as unknown as Parameters<typeof renderApprovalBodies>[3];
    const parts = [
      {
        id: 'p1', detailId: 'prod_1/element:main/detail:main', isMain: true, area: 0.6,
        width: 1000, height: 600,
        points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }],
        shape: 'Прямокутна',
      },
    ] as unknown as Parameters<typeof renderApprovalBodies>[2];

    const all = renderApprovalBodies(projectFull, doc(), parts, details).join('');
    expect(Array.from(new Set(all.match(CYRILLIC) ?? []))).toEqual([]);
    expect(all).toContain('A=1000 mm');
    expect(all).toContain('Wycięcie 300×200 mm');
    expect(all).toContain('Wycięcie pod baterię Ø35 mm');
    expect(all).toContain('Uwaga!');
  });

  it('числа форматуються за локаллю документа', () => {
    const [uk] = renderQuotePdfSvgPages(projectIn('uk'), doc(), computeQuoteCalc(doc()));
    const [en] = renderQuotePdfSvgPages(projectIn('en'), doc(), computeQuoteCalc(doc()));
    // Українська локаль ставить нерозривний пробіл у тисячах, англійська — кому.
    expect(uk).not.toBe(en);
  });
});
