import { describe, it, expect } from 'vitest';
import {
  autoQuoteServices,
  mergeQuoteServices,
  computeQuoteCalc,
  itemAreaM2,
  quoteItemsFromProject,
  suggestPyramidLength,
} from '../quoteCalc';
import {
  createQuoteCalcDoc,
  DEFAULT_QUOTE_PRICE_BOOK,
  mergeQuotePriceBook,
  type QuoteCalcDoc,
  type QuoteItem,
} from '../../domain/quoteCalc';

// Числа з ТЗ «Логіка калькуляції» порахованi руками в коментарях.

let itemSeq = 0;
function item(overrides: Partial<QuoteItem>): QuoteItem {
  itemSeq += 1;
  return {
    id: `qi_${itemSeq}`,
    productTypeId: 'countertop_plain',
    count: 1,
    shape: 'Пряма',
    dims: {},
    ...overrides,
  };
}

function doc(overrides: Partial<QuoteCalcDoc> = {}): QuoteCalcDoc {
  return { ...createQuoteCalcDoc(), ...overrides };
}

const book = () => JSON.parse(JSON.stringify(DEFAULT_QUOTE_PRICE_BOOK));

/**
 * Розрахунок у режимі калібрування — тільки в ньому ціни прайсу взагалі
 * доходять до рядків. У звичайному режимі (за умовчанням) єдине джерело
 * ціни — сервіс вартості, тож перевірки арифметики за прайсом мають
 * вмикати режим явно.
 */
const calcManual = (
  order: QuoteCalcDoc,
  priceBook?: ReturnType<typeof book>,
  erpPrices?: Record<string, number>,
) => computeQuoteCalc(order, priceBook, erpPrices, true);
const line = (result: ReturnType<typeof computeQuoteCalc>, id: string) =>
  result.lines.find((entry) => entry.id === id);

describe('площа виробу', () => {
  it('пряма 2000×600 у двох екземплярах — 2.4 м²', () => {
    expect(itemAreaM2(item({ dims: { w: 2000, h: 600 }, count: 2 }))).toBe(2.4);
  });

  it('Г-подібна — сума двох плечей: 2000×600 + 1500×600 = 2.1 м²', () => {
    expect(itemAreaM2(item({ shape: 'Г-подібна', dims: { w: 2000, h: 600, w2: 1500, h2: 600 } }))).toBe(2.1);
  });

  it('П-подібна — три плеча', () => {
    expect(itemAreaM2(item({
      shape: 'П-подібна',
      dims: { w: 2000, h: 600, w2: 1000, h2: 600, w3: 1000, h3: 600 },
    }))).toBe(2.4);
  });
});

describe('виготовлення', () => {
  it('однотипні вироби зливаються в один рядок номенклатури з виробником у назві', () => {
    const result = computeQuoteCalc(doc({
      manufacturer: 'Laminam',
      items: [
        item({ dims: { w: 2000, h: 600 } }),
        item({ dims: { w: 1000, h: 600 } }),
      ],
    }));
    const fab = line(result, 'fab:countertop_plain')!;
    expect(fab.qty).toBe(1.8);
    expect(fab.unit).toBe('m2');
    expect(fab.label).toContain('Laminam');
    expect(result.lines.filter((entry) => entry.group === 'fabrication')).toHaveLength(1);
  });

  it('ціна виробника перекриває базову ціну типу', () => {
    const prices = book();
    prices.fabrication.countertop_plain = 1000;
    prices.fabricationByManufacturer.countertop_plain = { Laminam: 1500 };
    const order = doc({ manufacturer: 'Laminam', items: [item({ dims: { w: 1000, h: 1000 } })] });
    expect(line(calcManual(order, prices), 'fab:countertop_plain')!.sum).toBe(1500);
  });

  it('нога вливається у стільницю з потовщенням, а не в окремий рядок (Логіка §4)', () => {
    const result = computeQuoteCalc(doc({
      items: [
        item({ productTypeId: 'countertop_thick', dims: { w: 2000, h: 600 } }),
        item({ productTypeId: 'leg', dims: { w: 900, h: 600 } }),
      ],
    }));
    expect(line(result, 'fab:countertop_thick')!.qty).toBe(1.74); // 1.2 + 0.54
    expect(line(result, 'fab:leg')).toBeUndefined();
  });

  it('влита нога ВИДИМА: назва рядка стільниці показує її площу', () => {
    const result = computeQuoteCalc(doc({
      items: [
        item({ productTypeId: 'countertop_thick', dims: { w: 2000, h: 600 } }),
        item({ productTypeId: 'leg', dims: { w: 900, h: 600 } }),
      ],
    }));
    expect(line(result, 'fab:countertop_thick')!.label).toContain('(з ногою 0.54 м²)');
  });

  it('нога без послуги стикування — нагадування; з послугою — тиша', () => {
    const withLeg = doc({
      items: [
        item({ productTypeId: 'countertop_thick', dims: { w: 2000, h: 600 } }),
        item({ productTypeId: 'leg', dims: { w: 900, h: 600 } }),
      ],
    });
    expect(computeQuoteCalc(withLeg).warnings.some((warning) => warning.includes('Стикування'))).toBe(true);

    const withService = computeQuoteCalc(doc({ ...withLeg, services: { joint_leg: 0.9 } }));
    expect(withService.warnings.some((warning) => warning.includes('Стикування “Ноги”'))).toBe(false);
  });

  it('нога без стільниці — площа за номенклатурою стільниці з попередженням', () => {
    const result = computeQuoteCalc(doc({ items: [item({ productTypeId: 'leg', dims: { w: 900, h: 600 } })] }));
    expect(line(result, 'fab:countertop_thick')!.qty).toBe(0.54);
    expect(result.warnings.some((warning) => warning.includes('без стільниці'))).toBe(true);
  });

  it('підвіконня рахується в м.п. за довжиною', () => {
    const result = computeQuoteCalc(doc({
      items: [item({ productTypeId: 'windowsill', dims: { l: 1500 }, count: 2 })],
    }));
    const fab = line(result, 'fab:windowsill')!;
    expect(fab.qty).toBe(3);
    expect(fab.unit).toBe('mp');
  });

  it('мийка — штуки', () => {
    const result = computeQuoteCalc(doc({
      items: [item({ productTypeId: 'sink', count: 2, model: 'S-450' })],
    }));
    expect(line(result, 'fab:sink')!.qty).toBe(2);
    expect(line(result, 'fab:sink')!.unit).toBe('pcs');
  });
});

describe('замір, монтаж, виїзд', () => {
  const measured = (extra: Partial<QuoteCalcDoc> = {}) => doc({
    method: 'measure_install',
    address: 'вул. Тестова, 1',
    items: [
      item({ productTypeId: 'countertop_plain', dims: { w: 2000, h: 600 } }),
      item({ productTypeId: 'leg', dims: { w: 900, h: 600 } }),
      item({ productTypeId: 'sink', count: 1 }),
      item({ productTypeId: 'facade', dims: { w: 600, h: 700 } }),
      item({ productTypeId: 'windowsill', dims: { l: 1500 } }),
    ],
    ...extra,
  });

  it('замір — один на замовлення, номенклатура за типом матеріалу', () => {
    const result = computeQuoteCalc(measured());
    const measure = line(result, 'measure')!;
    expect(measure.qty).toBe(1);
    expect(measure.label).toContain('Керамограніт');
  });

  it('за кресленням заміру й монтажу немає', () => {
    const result = computeQuoteCalc(doc({ items: [item({ dims: { w: 1000, h: 600 } })] }));
    expect(line(result, 'measure')).toBeUndefined();
    expect(result.lines.some((entry) => entry.group === 'montage')).toBe(false);
  });

  it('монтаж стільниці — площа виготовлення З НОГОЮ; мийка і фасад не монтуються', () => {
    const result = computeQuoteCalc(measured());
    expect(line(result, 'montage:countertop_plain')!.qty).toBe(1.74); // 1.2 + 0.54
    expect(line(result, 'montage:windowsill')!.qty).toBe(1.5);
    expect(result.lines.filter((entry) => entry.id.startsWith('montage:'))).toHaveLength(2);
  });

  it('зона 0 — без рядка виїзду, зона 3 — з доплатою третього рівня', () => {
    expect(line(computeQuoteCalc(measured()), 'delivery')).toBeUndefined();

    const prices = book();
    prices.deliveryZones = [0, 100, 200, 300, 400, 500];
    const result = calcManual(measured({ deliveryZone: 3 }), prices);
    expect(line(result, 'delivery')!.sum).toBe(300);
    expect(line(result, 'delivery')!.label).toContain('зона 3');
  });

  it('без адреси — попередження', () => {
    const result = computeQuoteCalc(measured({ address: '' }));
    expect(result.warnings.some((warning) => warning.includes('адресу'))).toBe(true);
  });
});

describe('пакування', () => {
  it('піраміда підбирається за найдовшою деталлю', () => {
    expect(suggestPyramidLength([item({ dims: { w: 2450, h: 600 } })])).toBe(2800);
    expect(suggestPyramidLength([item({ dims: { w: 800, h: 600 } })])).toBe(1200);
    expect(suggestPyramidLength([item({ dims: { w: 3500, h: 600 } })])).toBe(3200);
  });

  it('за кресленням піраміда в розрахунку, довжина авто', () => {
    const result = computeQuoteCalc(doc({ items: [item({ dims: { w: 2450, h: 600 } })] }));
    expect(line(result, 'pack:pyramid')!.label).toContain('2800');
  });

  it('на монтажі пакування не рахується', () => {
    const result = computeQuoteCalc(doc({
      method: 'measure_install',
      address: 'адреса',
      items: [item({ dims: { w: 1000, h: 600 } })],
    }));
    expect(line(result, 'pack:pyramid')).toBeUndefined();
  });

  it('короб — у м² додатково до піраміди', () => {
    const prices = book();
    prices.boxPerM2 = 50;
    const result = calcManual(doc({
      items: [item({ dims: { w: 1000, h: 600 } })],
      packaging: { pyramidLength: 0, pyramidQty: 0, boxM2: 1.2 },
    }), prices);
    expect(line(result, 'pack:box')!.sum).toBe(60);
  });
});

describe('послуги, ціни, підсумок', () => {
  it('додаткова послуга з кількістю потрапляє в розрахунок', () => {
    const prices = book();
    prices.services.hob_cutout = 400;
    const result = calcManual(doc({
      items: [item({ dims: { w: 1000, h: 600 } })],
      services: { hob_cutout: 2 },
    }), prices);
    expect(line(result, 'svc:hob_cutout')!.sum).toBe(800);
  });


  it('ціна від сервісу вартості перекриває локальний прайс', () => {
    const prices = book();
    prices.fabrication.countertop_plain = 1000;
    // Код номенклатури «Виготовлення стільниці без потовщень (керамограніт Laminam)»
    const result = computeQuoteCalc(
      doc({ manufacturer: 'Laminam', items: [item({ dims: { w: 1000, h: 1000 } })] }),
      prices,
      { '292336': 1800 },
    );
    const fab = line(result, 'fab:countertop_plain')!;
    expect(fab.code).toBe('292336');
    expect(fab.unitPrice).toBe(1800);
    expect(fab.source).toBe('erp');
  });

  it('ціна від сервісу перекриває прайс і тоді, коли в прайсі є своя', () => {
    const prices = book();
    prices.fabrication.countertop_plain = 1000;
    const result = computeQuoteCalc(
      doc({ manufacturer: 'Laminam', items: [item({ dims: { w: 1000, h: 1000 } })] }),
      prices,
      { '292336': 1800 },
    );
    expect(line(result, 'fab:countertop_plain')!.sum).toBe(1800);
  });

  it('коду немає у відповіді сервісу — рядок лишається без ціни, а не падає на прайс', () => {
    // Головна вимога 25.08.2026: мовчання сервісу має бути видно нулем.
    // Ручна ціна в прайсі при вимкненому калібруванні його не підміняє.
    const prices = book();
    prices.fabrication.countertop_plain = 1000;
    const result = computeQuoteCalc(
      doc({ manufacturer: 'Laminam', items: [item({ dims: { w: 1000, h: 1000 } })] }),
      prices,
      { '999999': 5 },
    );
    const fab = line(result, 'fab:countertop_plain')!;
    expect(fab.unitPrice).toBe(0);
    expect(fab.source).toBe('none');
    expect(result.warnings.some((warning) => warning.includes('Без ціни'))).toBe(true);
  });

  it('стара ціна в прайсі при вимкненому калібруванні не впливає ні на що', () => {
    const prices = book();
    prices.fabrication.countertop_plain = 1000;
    const result = computeQuoteCalc(doc({ items: [item({ dims: { w: 1000, h: 1000 } })] }), prices);
    expect(line(result, 'fab:countertop_plain')!.unitPrice).toBe(0);
    expect(line(result, 'fab:countertop_plain')!.source).toBe('none');
    expect(result.total).toBe(0);
  });

  it('калібрування ввімкнене — ручна ціна перекриває ціну сервісу і помічена як ручна', () => {
    const prices = book();
    prices.fabrication.countertop_plain = 1000;
    const result = calcManual(
      doc({ manufacturer: 'Laminam', items: [item({ dims: { w: 1000, h: 1000 } })] }),
      prices,
      { '292336': 1800 },
    );
    const fab = line(result, 'fab:countertop_plain')!;
    expect(fab.unitPrice).toBe(1000);
    expect(fab.source).toBe('manual');
    // Ціна сервісу зберігається поряд — інакше нема з чим зводити аналітику
    expect(fab.erpUnitPrice).toBe(1800);
    expect(result.warnings.some((warning) => warning.includes('калібрування'))).toBe(true);
  });

  it('калібрування ввімкнене, але ціну не вписали — працює ціна сервісу', () => {
    // Нуль у прайсі означає «не задано», а не «безкоштовно»:
    // інакше порожній прайс обнуляв би все, що дав сервіс.
    const result = calcManual(
      doc({ manufacturer: 'Laminam', items: [item({ dims: { w: 1000, h: 1000 } })] }),
      book(),
      { '292336': 1800 },
    );
    const fab = line(result, 'fab:countertop_plain')!;
    expect(fab.unitPrice).toBe(1800);
    expect(fab.source).toBe('erp');
  });

  it('підсумок — сума всіх рядків', () => {
    const prices = book();
    prices.fabrication.countertop_plain = 1000;
    prices.pyramid[1200] = 700;
    const result = calcManual(doc({ items: [item({ dims: { w: 1000, h: 1000 } })] }), prices);
    expect(result.total).toBe(1700);
  });

  it('матеріал — півлиста теж валідна кількість', () => {
    const prices = book();
    prices.sheet = 18000;
    const result = calcManual(doc({
      items: [item({ dims: { w: 1000, h: 600 } })],
      materialSheets: 1.5,
    }), prices);
    expect(line(result, 'material:sheets')!.sum).toBe(27000);
  });

  it('акрил без типу поверхні — попередження, крім «окремої мийки»', () => {
    const acrylic = doc({ materialType: 'Акриловий камінь', items: [item({ dims: { w: 1000, h: 600 } })] });
    expect(computeQuoteCalc(acrylic).warnings.some((warning) => warning.includes('тип поверхні'))).toBe(true);

    const sinkOnly = doc({
      materialType: 'Акриловий камінь',
      method: 'sink_only',
      items: [item({ productTypeId: 'sink', count: 1 })],
    });
    expect(computeQuoteCalc(sinkOnly).warnings.some((warning) => warning.includes('тип поверхні'))).toBe(false);
  });

  it('«окрема мийка» з не-мийкою — попередження', () => {
    const result = computeQuoteCalc(doc({
      method: 'sink_only',
      items: [item({ productTypeId: 'countertop_plain', dims: { w: 1000, h: 600 } })],
    }));
    expect(result.warnings.some((warning) => warning.includes('Окрема мийка'))).toBe(true);
  });

  it('нульові ціни чесно підсвічуються попередженням', () => {
    const result = computeQuoteCalc(doc({ items: [item({ dims: { w: 1000, h: 600 } })] }));
    expect(result.warnings.some((warning) => warning.includes('Без ціни'))).toBe(true);
  });

  it('фактична площа з розкрою перекриває обчислення з габаритів', () => {
    // Габарит 1000×600 = 0.6 м², але фактична площа (з радіусом) — 0.55
    const result = computeQuoteCalc(doc({
      items: [item({ dims: { w: 1000, h: 600 }, areaM2: 0.55 })],
    }));
    expect(line(result, 'fab:countertop_plain')!.qty).toBe(0.55);
  });
});

describe('вбудований довідник 1С «Виготовлення …»', async () => {
  const { QUOTE_1C_FABRICATION, fabrication1cCode } = await import('../../domain/quote1cCatalog');

  it('70 позицій, коди унікальні', () => {
    expect(QUOTE_1C_FABRICATION).toHaveLength(70);
    expect(new Set(QUOTE_1C_FABRICATION.map((item) => item.code)).size).toBe(70);
  });

  it('контрольні коди з оригінального переліку на місці', () => {
    // Розгортка «база+зсув» мусить збігатися з переліком 1С позиція в позицію
    const byCode = new Map(QUOTE_1C_FABRICATION.map((item) => [item.code, item.name]));
    expect(byCode.get('292335')).toBe('Виготовлення стільниці з потовщенням (керамограніт Laminam)');
    expect(byCode.get('292356')).toBe('Виготовлення стільниці без потовщень (керамограніт Під проект)');
    expect(byCode.get('292372')).toBe('Виготовлення стінової панелі (штучний кварцит TermopalStone)');
    expect(byCode.get('292388')).toBe('Виготовлення мийки (натуральний камінь Під проект)');
    expect(byCode.get('292404')).toBe('Виготовлення раковини (акриловий камінь Grandex)');
  });

  it('кожен матеріал має «Під проект» для всіх п\'яти видів', () => {
    const fallbacks = QUOTE_1C_FABRICATION.filter((item) => item.manufacturer === 'Під проект');
    expect(fallbacks).toHaveLength(20); // 4 матеріали × 5 видів
  });

  it('точний виробник знаходиться, невідомий лягає на «Під проект»', () => {
    expect(fabrication1cCode('countertop_thick', 'Керамограніт', 'Laminam')?.code).toBe('292335');
    expect(fabrication1cCode('countertop_plain', 'Керамограніт', 'Невідомий')?.code).toBe('292356');
    expect(fabrication1cCode('sink', 'Акриловий камінь', '')?.code).toBe('292393');
  });

  it('обидві товщини панелі — одна номенклатура 1С', () => {
    expect(fabrication1cCode('wall_panel_ge12', 'Керамограніт', 'Laminam')?.code).toBe('292337');
    expect(fabrication1cCode('wall_panel_lt12', 'Керамограніт', 'Laminam')?.code).toBe('292337');
  });

  it('типи без номенклатури 1С чесно повертають undefined', () => {
    expect(fabrication1cCode('windowsill', 'Керамограніт', 'Laminam')).toBeUndefined();
    expect(fabrication1cCode('facade', 'Керамограніт', 'Laminam')).toBeUndefined();
  });
});

describe('коди 1С', () => {
  it('виготовлення отримує вбудований код без жодних налаштувань', () => {
    const result = computeQuoteCalc(doc({
      manufacturer: 'Laminam',
      items: [item({ productTypeId: 'countertop_thick', dims: { w: 1000, h: 600 } })],
    }));
    expect(line(result, 'fab:countertop_thick')!.code).toBe('292335');
  });

  it('«Під проект» іншого матеріалу — інший код (кварцит проти керамограніту)', () => {
    const quartz = computeQuoteCalc(doc({
      materialType: 'Штучний кварцит',
      manufacturer: 'Під проект',
      items: [item({ dims: { w: 1000, h: 600 } })],
    }));
    expect(line(quartz, 'fab:countertop_plain')!.code).toBe('292376');

    const ceramic = computeQuoteCalc(doc({
      manufacturer: 'Під проект',
      items: [item({ dims: { w: 1000, h: 600 } })],
    }));
    expect(line(ceramic, 'fab:countertop_plain')!.code).toBe('292356');
  });

  it('ручний код із точним ключем «тип:матеріал:виробник» перекриває довідник', () => {
    const prices = book();
    prices.codes1c = { 'fab:countertop_plain:Керамограніт:Laminam': '999111' };
    const result = computeQuoteCalc(doc({
      manufacturer: 'Laminam',
      items: [item({ dims: { w: 1000, h: 600 } })],
    }), prices);
    expect(line(result, 'fab:countertop_plain')!.code).toBe('999111');
  });

  it('ціна пари «матеріал:виробник» перемагає ціну виробника і базову', () => {
    const prices = book();
    prices.fabrication.countertop_plain = 1000;
    prices.fabricationByManufacturer.countertop_plain = {
      'Під проект': 2000,
      'Штучний кварцит:Під проект': 3000,
    };
    const result = calcManual(doc({
      materialType: 'Штучний кварцит',
      manufacturer: 'Під проект',
      items: [item({ dims: { w: 1000, h: 1000 } })],
    }), prices);
    expect(line(result, 'fab:countertop_plain')!.sum).toBe(3000);
  });

  it('код виробника перемагає базовий код типу — це різні номенклатури', () => {
    const prices = book();
    prices.codes1c = { 'fab:countertop_plain': '100001', 'fab:countertop_plain:Laminam': '100777' };
    const generic = calcManual(doc({ items: [item({ dims: { w: 1000, h: 600 } })] }), prices);
    expect(line(generic, 'fab:countertop_plain')!.code).toBe('100001');

    const laminam = calcManual(doc({ manufacturer: 'Laminam', items: [item({ dims: { w: 1000, h: 600 } })] }), prices);
    expect(line(laminam, 'fab:countertop_plain')!.code).toBe('100777');
  });

  it('замір, монтаж, виїзд і послуги отримують коди за своїми ключами', () => {
    const prices = book();
    prices.codes1c = {
      'measure:Керамограніт': '200100',
      'montage:countertop_plain': '200200',
      'delivery:3': '200303',
      'svc:hob_cutout': '200400',
      sheet: '200500',
    };
    const result = computeQuoteCalc(doc({
      method: 'measure_install',
      address: 'адреса',
      deliveryZone: 3,
      items: [item({ dims: { w: 1000, h: 600 } })],
      services: { hob_cutout: 1 },
      materialSheets: 1,
    }), prices);
    expect(line(result, 'measure')!.code).toBe('200100');
    expect(line(result, 'montage:countertop_plain')!.code).toBe('200200');
    expect(line(result, 'delivery')!.code).toBe('200303');
    expect(line(result, 'svc:hob_cutout')!.code).toBe('200400');
    expect(line(result, 'material:sheets')!.code).toBe('200500');
  });

  it('тип без номенклатури 1С їде без коду — нічого не вигадуємо', () => {
    const result = computeQuoteCalc(doc({
      items: [item({ productTypeId: 'windowsill', dims: { l: 1500 } })],
    }));
    expect(line(result, 'fab:windowsill')!.code).toBeUndefined();
  });
});

describe('злиття прайсу (mergeQuotePriceBook)', () => {
  it('порожнє збереження дає повні замовчування', () => {
    const merged = mergeQuotePriceBook(undefined);
    expect(merged.montage.countertop_plain).toBe(0);
    expect(merged.deliveryZones).toHaveLength(6);
    // Коди 1С радіусних послуг лишаються в замовчуваннях: саме за ними
    // питається ціна. А самих цін у замовчуваннях більше немає —
    // прибрані 25.08.2026, щоб застарілий прайс не поїхав у продакшн.
    expect(merged.codes1c['svc:radius_ct80']).toBe('298634');
    expect(merged.services.radius_bend).toBeUndefined();
    expect(Object.keys(merged.services)).toHaveLength(0);
  });

  it('виставлені ціни й коди не перетираються, нові поля доїжджають', () => {
    const merged = mergeQuotePriceBook({
      fabrication: { countertop_plain: 4800 },
      codes1c: { 'svc:hob_cutout': '300100' },
      deliveryZones: [0, 150],
      // montage відсутній у збереженні — має прийти із замовчувань
    } as never);
    expect(merged.fabrication.countertop_plain).toBe(4800);
    expect(merged.codes1c['svc:hob_cutout']).toBe('300100');
    expect(merged.deliveryZones[1]).toBe(150);
    expect(merged.deliveryZones[5]).toBe(0); // доїхала нова зона
    expect(merged.montage.stairs).toBe(0);   // доїхала нова категорія
  });
});

describe('авто-заповнення додаткових послуг', () => {
  const project = (overrides: Record<string, unknown> = {}) =>
    ({ id: 'proj', details: [], products: [], slabs: [], placements: [], ...overrides }) as never as Parameters<typeof autoQuoteServices>[0];

  const projectWithLeg = (jointOverrides: Record<string, unknown> = {}) => project({
    products: [{
      id: 'prod_1',
      elements: [{
        id: 'prod_1/element:main',
        joints: [{
          id: 'joint_leg_B',
          a: { elementPath: 'prod_1/element:main', sideId: 'B', from: 0, to: 900 },
          b: { elementPath: 'prod_1/element:leg_B', sideId: 'A', from: 0, to: 900 },
          type: 'miter45',
          ...jointOverrides,
        }],
        additions: [],
      }],
    }],
  });

  it('стикування ноги — з довжини стику у виробі, м.п.', () => {
    const auto = autoQuoteServices(projectWithLeg(), []);
    expect(auto.joint_leg).toBe(0.9);
  });

  it('стики в площині: розрізана Г — 1, П — 2, ціла — нічого', () => {
    const details = [
      { shape: 'Г-подібна', geometry: {} },
      { shape: 'П-подібна', geometry: {} },
      { shape: 'Г-подібна', geometry: { wholeDetail: true } },
    ] as never;
    const auto = autoQuoteServices(project(), details);
    expect(auto.joint_flat).toBe(3); // 1 + 2, ціла не рахується
  });

  it('підбір текстури — з прапорця проєкту', () => {
    expect(autoQuoteServices(project({ textureSelectionEnabled: true }), []).texture_match).toBe(1);
    expect(autoQuoteServices(project(), []).texture_match).toBeUndefined();
  });

  it('збережений нуль не блокує авто — це слід від порожнього поля', () => {
    const auto = autoQuoteServices(projectWithLeg(), []);
    const merged = mergeQuoteServices(auto, { joint_leg: 0, hob_cutout: 0 });
    expect(merged.joint_leg).toBe(0.9); // авто перемогло залишковий нуль
    expect(merged.hob_cutout).toBe(0);  // без авто нуль лишається нулем
  });

  it('ручне значення > 0 перемагає авто', () => {
    const auto = autoQuoteServices(projectWithLeg(), []);
    expect(mergeQuoteServices(auto, { joint_leg: 1.4 }).joint_leg).toBe(1.4);
  });

  it('авто підставляється в розрахунок, а ручне значення його перемагає', () => {
    const auto = autoQuoteServices(projectWithLeg(), []);
    // так робить панель: авто під сподом, ручні зверху
    const withAuto = computeQuoteCalc(doc({
      items: [item({ dims: { w: 1000, h: 600 } })],
      services: { ...auto },
    }));
    expect(line(withAuto, 'svc:joint_leg')!.qty).toBe(0.9);
    // нога є, послуга авто-заповнена — нагадування не потрібне
    const withLegItem = computeQuoteCalc(doc({
      items: [
        item({ productTypeId: 'countertop_thick', dims: { w: 2000, h: 600 } }),
        item({ productTypeId: 'leg', dims: { w: 900, h: 600 } }),
      ],
      services: { ...auto },
    }));
    expect(withLegItem.warnings.some((warning) => warning.includes('Стикування'))).toBe(false);

    const manual = computeQuoteCalc(doc({
      items: [item({ dims: { w: 1000, h: 600 } })],
      services: { ...auto, joint_leg: 1.4 },
    }));
    expect(line(manual, 'svc:joint_leg')!.qty).toBe(1.4);
  });
});

describe('підтягування виробів із розкрою', () => {
  // Мінімальний зліпок проєкту: виріб prod_1 зі стільницею, підворотом,
  // опорою і стіновою панеллю + сирітська деталь із DXF.
  const detail = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
    id, type, shape: 'Прямокутна', thickness: 20, label: type, quantity: 1, geometry: {}, ...extra,
  });
  const partOf = (detailId: string, area: number, extra: Record<string, unknown> = {}) => ({
    id: `part_${detailId}_${area}`, detailId, isMain: true, area, width: 1000, height: 600, points: [], ...extra,
  });

  const details = [
    detail('prod_1/element:main/detail:main', 'Стільниця'),
    detail('prod_1/element:fold_C/detail:main', 'Потовщення'),
    detail('prod_1/element:leg_A/detail:main', 'Опора'),
    detail('prod_1/element:wall_panel_F/detail:main', 'Стінова панель'),
    detail('det_dxf_1', 'Стільниця', { label: 'DXF стільниця' }),
  ] as never;
  const parts = [
    partOf('prod_1/element:main/detail:main', 0.9),
    partOf('prod_1/element:fold_C/detail:main', 0.07),
    partOf('prod_1/element:leg_A/detail:main', 0.54),
    partOf('prod_1/element:wall_panel_F/detail:main', 0.66),
    partOf('det_dxf_1', 0.5),
  ] as never;

  it('стільниця з підворотом стає «з потовщенням», опуск влитий у площу', () => {
    const items = quoteItemsFromProject(details, parts, 20);
    const countertop = items.find((entry) => entry.sourceRef === 'prod_1/element:main/detail:main')!;
    expect(countertop.productTypeId).toBe('countertop_thick');
    expect(countertop.areaM2).toBe(0.97); // 0.9 + 0.07
    // сам підворот окремою позицією не йде
    expect(items.some((entry) => entry.sourceRef?.includes('fold_C'))).toBe(false);
  });

  it('опора стає ногою, панель — «від 12 мм» за товщиною', () => {
    const items = quoteItemsFromProject(details, parts, 20);
    expect(items.find((entry) => entry.sourceRef?.includes('leg_A'))!.productTypeId).toBe('leg');
    expect(items.find((entry) => entry.sourceRef?.includes('wall_panel'))!.productTypeId).toBe('wall_panel_ge12');
  });

  it('сирітська деталь без підворотів — стільниця без потовщень', () => {
    const items = quoteItemsFromProject(details, parts, 20);
    const dxf = items.find((entry) => entry.sourceRef === 'det_dxf_1')!;
    expect(dxf.productTypeId).toBe('countertop_plain');
    expect(dxf.areaM2).toBe(0.5);
    expect(dxf.sourceLabel).toBe('DXF стільниця');
  });

  it('наскрізно: підтягнуте замовлення рахує ногу в стільниці з потовщенням', () => {
    const items = quoteItemsFromProject(details, parts, 20);
    const result = computeQuoteCalc(doc({ items }));
    // 0.97 (стільниця з опуском) + 0.54 (нога влита движком)
    expect(line(result, 'fab:countertop_thick')!.qty).toBe(1.51);
    expect(line(result, 'fab:wall_panel_ge12')!.qty).toBe(0.66);
    expect(line(result, 'fab:leg')).toBeUndefined();
  });

  it('легасі-смуги потовщення на самій стільниці теж дають «з потовщенням»', () => {
    const legacyDetails = [detail('det_1', 'Стільниця')] as never;
    const legacyParts = [
      partOf('det_1', 0.9),
      partOf('det_1', 0.05, { isMain: false, edgeKind: 'fold' }),
    ] as never;
    const items = quoteItemsFromProject(legacyDetails, legacyParts, 20);
    expect(items[0].productTypeId).toBe('countertop_thick');
    expect(items[0].areaM2).toBe(0.95); // площа деталі З опуском
  });
});

/**
 * Радіусні (гнуті) елементи в Прорахунку — ТЗ 19.08.
 *
 * Кошторис (виробничий BOM) їх уже рахує; але прорахунок для клієнта —
 * ОКРЕМИЙ документ зі своїми рядками, і саме там Богдан їх не побачив.
 * Тест тримає міст: позначка на деталі розкрою → рядок «Додаткових послуг»
 * з роздрібною ціною з номенклатури.
 */
describe('радіусні елементи в додаткових послугах', () => {
  const partWith = (mark: Partial<import('../../domain/types').RadiusElementMark>, type = 'Потовщення') => ({
    id: `p-${mark.cornerId}`,
    detailId: `d-${mark.cornerId}`,
    type,
    width: 306,
    height: 100,
    isMain: false,
    points: [],
    radiusElement: {
      radiusMm: 150,
      arcLengthMm: 235.6,
      cornerId: 'AB',
      arcAngleDeg: 90,
      bandSizeMm: 100,
      method: 'segments' as const,
      role: 'countertop' as const,
      ...mark,
    },
  }) as unknown as import('../../domain/types').DetailPart;

  const project = (material?: string) => ({
    ...({} as import('../../domain/types').Project),
    projectMaterial: material,
    products: [],
    details: [],
    textureSelectionEnabled: false,
  }) as unknown as import('../../domain/types').Project;

  it('камінь: край 100 мм падає в рядок «80–200» з ціною 15 872,15', () => {
    const auto = autoQuoteServices(project('Керамограніт'), [], [partWith({ cornerId: 'a' })]);
    expect(auto.radius_ct200).toBe(1);
    expect(auto.radius_matrix).toBeUndefined();

    const doc = { ...createQuoteCalcDoc(), services: auto, materialSheets: 1, items: [] };
    // Ціну на цю номенклатуру дає сервіс вартості за кодом 1С; локального
    // прайсу більше немає, тому в тесті сервіс імітуємо явно.
    const result = computeQuoteCalc(doc as never, DEFAULT_QUOTE_PRICE_BOOK, { '298635': 15872.15 });
    const line = result.lines.find((l) => l.id === 'svc:radius_ct200');
    expect(line).toBeDefined();
    expect(line!.code).toBe('298635');
    expect(line!.source).toBe('erp');
    expect(line!.sum).toBeCloseTo(15872.15, 2);
  });

  it('акрил: два однакові радіуси — два гнуття і ОДНА матриця', () => {
    const marks = [
      partWith({ cornerId: 'a', method: 'bending' }),
      partWith({ cornerId: 'b', method: 'bending' }),
    ];
    const auto = autoQuoteServices(project('Акрил'), [], marks);
    expect(auto.radius_bend).toBe(2);
    expect(auto.radius_matrix).toBe(1);
  });

  it('акрил: інша геометрія — друга матриця', () => {
    const marks = [
      partWith({ cornerId: 'a', method: 'bending', bandSizeMm: 100 }),
      partWith({ cornerId: 'b', method: 'bending', bandSizeMm: 40 }),
    ];
    const auto = autoQuoteServices(project('Акрил'), [], marks);
    expect(auto.radius_bend).toBe(2);
    expect(auto.radius_matrix).toBe(2);
  });

  it('опора вище 900 мм іде дорожчою категорією', () => {
    const auto = autoQuoteServices(project('Кварцит'), [], [
      partWith({ cornerId: 'a', role: 'leg', bandSizeMm: 1100 }, 'Опора'),
    ]);
    expect(auto.radius_leg_tall).toBe(1);
  });

  it('без партів радіусних рядків немає — і нічого не падає', () => {
    const auto = autoQuoteServices(project('Керамограніт'), []);
    expect(Object.keys(auto).some((key) => key.startsWith('radius_'))).toBe(false);
  });
});

/*
 * Стик ноги: розбір слота замість префікса (виправлення 26.08).
 * Продажі помітили завищену кількість: опуски САМОЇ НОГИ (слот
 * leg_B_fold_C → стик joint_leg_B_fold_C) підпадали під префікс
 * joint_leg_ і роздували «стикування ноги з виробом».
 */
describe('joint_leg: тільки стики самої ноги', () => {
  const project = (joints: Array<{ id: string; len: number }>) => ({
    products: [{
      id: 'prod_1',
      name: 'Тест',
      elements: [{
        id: 'el_1',
        joints: joints.map(({ id, len }) => ({
          id,
          a: { from: 0, to: len },
          b: { from: 0, to: len },
        })),
        additions: [],
      }],
    }],
  } as never);

  it('стик ноги зі стільницею рахується', () => {
    const auto = autoQuoteServices(project([{ id: 'joint_leg_B', len: 600 }]), []);
    expect(auto.joint_leg).toBe(0.6);
  });

  it('склейка ОПУСКА НА НОЗІ не рахується — саме вона роздувала кількість', () => {
    const auto = autoQuoteServices(project([
      { id: 'joint_leg_B', len: 600 },
      { id: 'joint_leg_B_fold_C', len: 900 },
      { id: 'joint_leg_B_thickening_A', len: 700 },
    ]), []);
    expect(auto.joint_leg).toBe(0.6);
  });

  it('нога на СТІНОВІЙ ПАНЕЛІ рахується — префікс її не бачив', () => {
    const auto = autoQuoteServices(project([{ id: 'joint_wall_panel_B_leg_C', len: 450 }]), []);
    expect(auto.joint_leg).toBe(0.45);
  });

  it('підворот стільниці не рахується як нога', () => {
    const auto = autoQuoteServices(project([{ id: 'joint_fold_E', len: 1200 }]), []);
    expect(auto.joint_leg).toBeUndefined();
  });
});

/*
 * Бортик у прорахунку — стінова панель (рішення продажів 26.08).
 * Раніше гілки не було, і бортик мовчки випадав з КП.
 */
describe('бортик тарифікується як стінова панель', () => {
  const detail = (over: Record<string, unknown>) => ({
    id: 'prod_1/el_skirt',
    type: 'Бортик',
    shape: 'Прямокутна',
    quantity: 1,
    geometry: { width: 1200, height: 100 },
    thickness: 20,
    ...over,
  } as never);
  const part = {
    id: 'p1', detailId: 'prod_1/el_skirt', name: 'Бортик', type: 'Стільниця',
    shape: 'Прямокутна', width: 1200, height: 100, rotation: 0,
    area: 0.12, points: [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 100 }, { x: 0, y: 100 }],
    isMain: true, parentLabel: '', dimsLabel: '',
  } as never;

  it('бортик 20 мм → стінова панель ≥12', () => {
    const items = quoteItemsFromProject([detail({})], [part]);
    const skirt = items.find((item) => item.sourceRef === 'prod_1/el_skirt');
    expect(skirt?.productTypeId).toBe('wall_panel_ge12');
    expect(skirt?.areaM2).toBeCloseTo(0.12, 3);
  });

  it('бортик 6 мм → стінова панель <12', () => {
    const items = quoteItemsFromProject([detail({ thickness: 6 })], [part]);
    const skirt = items.find((item) => item.sourceRef === 'prod_1/el_skirt');
    expect(skirt?.productTypeId).toBe('wall_panel_lt12');
  });
});
