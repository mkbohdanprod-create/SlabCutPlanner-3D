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
    const result = computeQuoteCalc(doc({
      materialType: 'Штучний кварцит',
      manufacturer: 'Під проект',
      items: [item({ dims: { w: 1000, h: 1000 } })],
    }), prices);
    expect(line(result, 'fab:countertop_plain')!.sum).toBe(3000);
  });

  it('код виробника перемагає базовий код типу — це різні номенклатури', () => {
    const prices = book();
    prices.codes1c = { 'fab:countertop_plain': '100001', 'fab:countertop_plain:Laminam': '100777' };
    const generic = computeQuoteCalc(doc({ items: [item({ dims: { w: 1000, h: 600 } })] }), prices);
    expect(line(generic, 'fab:countertop_plain')!.code).toBe('100001');

    const laminam = computeQuoteCalc(doc({ manufacturer: 'Laminam', items: [item({ dims: { w: 1000, h: 600 } })] }), prices);
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
    expect(merged.codes1c).toEqual({});
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
