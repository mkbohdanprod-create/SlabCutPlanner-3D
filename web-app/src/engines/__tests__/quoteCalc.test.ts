import { describe, it, expect } from 'vitest';
import {
  computeQuoteCalc,
  itemAreaM2,
  quoteItemsFromProject,
  suggestPyramidLength,
} from '../quoteCalc';
import {
  createQuoteCalcDoc,
  DEFAULT_QUOTE_PRICE_BOOK,
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
    expect(line(computeQuoteCalc(order, prices), 'fab:countertop_plain')!.sum).toBe(1500);
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
    const result = computeQuoteCalc(measured({ deliveryZone: 3 }), prices);
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
    const result = computeQuoteCalc(doc({
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
    const result = computeQuoteCalc(doc({
      items: [item({ dims: { w: 1000, h: 600 } })],
      services: { hob_cutout: 2 },
    }), prices);
    expect(line(result, 'svc:hob_cutout')!.sum).toBe(800);
  });

  it('ручна ціна рядка перекриває прайс і позначається', () => {
    const prices = book();
    prices.fabrication.countertop_plain = 1000;
    const result = computeQuoteCalc(doc({
      items: [item({ dims: { w: 1000, h: 1000 } })],
      priceOverrides: { 'fab:countertop_plain': 2500 },
    }), prices);
    const fab = line(result, 'fab:countertop_plain')!;
    expect(fab.sum).toBe(2500);
    expect(fab.overridden).toBe(true);
  });

  it('підсумок — сума всіх рядків', () => {
    const prices = book();
    prices.fabrication.countertop_plain = 1000;
    prices.pyramid[1200] = 700;
    const result = computeQuoteCalc(doc({ items: [item({ dims: { w: 1000, h: 1000 } })] }), prices);
    expect(result.total).toBe(1700);
  });

  it('матеріал — півлиста теж валідна кількість', () => {
    const prices = book();
    prices.sheet = 18000;
    const result = computeQuoteCalc(doc({
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
    detail('prod_1/element:fold_C/detail:main', 'Підворот'),
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
