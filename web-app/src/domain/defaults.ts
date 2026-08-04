import type { Project, ReferenceData, CommercialQuoteSettings } from './types';

export const referenceData: ReferenceData = {
  materials: ['Керамограніт', 'Кварцит', 'Натуральний камінь', 'Акрил', 'Компакт-плита'],
  detailTypes: ['Стільниця', 'Стінова панель', 'Мийка', 'Фасад', 'Опора', 'Довільний елемент'],
  detailShapes: ['Прямокутна', 'Г-подібна', 'П-подібна', 'Кругла', 'Овальна'],
  slabSizes: [
    { width: 3200, height: 1600 },
    { width: 3000, height: 1400 },
    { width: 3000, height: 2000 },
  ],
  thicknesses: [12, 20, 30, 40],
  serviceParams: { defaultMinMargin: 10, roundingDecimals: 3, sawOvercut: 70 },
  edgeProfiles: [
    { id: 'polished_straight', label: 'Пряма полірована кромка', shortLabel: 'Полір.', description: 'Straight edge', allowance: 0, operations: [{ serviceId: 'EDGE_POLISH', multiplier: 1 }] },
    { id: 'chamfer_2x2', label: 'Фаска 2×2', shortLabel: 'Фаска 2×2', description: 'фаска зверху 2 мм', allowance: 2.5, operations: [{ serviceId: 'EDGE_BEVEL', multiplier: 1 }] },
    { id: 'chamfer_2x2_top_bottom', label: 'Фаска 2×2 верх/низ', shortLabel: '2×2 в/н', description: 'фаска зверху і знизу', allowance: 2.5, operations: [{ serviceId: 'EDGE_BEVEL', multiplier: 2 }] },
    { id: 'r2_top', label: 'R2 верх', shortLabel: 'R2', description: 'радіус 2 мм зверху', allowance: 2.5, operations: [{ serviceId: 'EDGE_ROUND', multiplier: 1 }] },
    { id: 'r2_top_bottom', label: 'R2 верх/низ', shortLabel: 'R2 в/н', description: 'радіус 2 мм зверху і знизу', allowance: 2.5, operations: [{ serviceId: 'EDGE_ROUND', multiplier: 2 }] },
    { id: 'chamfer_45_r2', label: 'Фаска 45° з R2', shortLabel: '45° R2', description: 'скошена кромка 45° з мікрорадіусом', allowance: 0, operations: [{ serviceId: 'CUT_45', multiplier: 1 }, { serviceId: 'EDGE_ROUND', multiplier: 1 }] },
    { id: 'chamfered_edge', label: 'Chamfered edge', shortLabel: 'Chamfer', description: 'скошена фаска', allowance: 2.5, operations: [{ serviceId: 'EDGE_BEVEL', multiplier: 1 }] },
    { id: 'half_bullnose', label: 'Half bullnose', shortLabel: 'Half bull', description: 'верхній великий радіус', allowance: 2.5, operations: [{ serviceId: 'EDGE_ROUND', multiplier: 1 }] },
    { id: 'full_bullnose', label: 'Full bullnose', shortLabel: 'Full bull', description: 'повний радіус торця', allowance: 2.5, operations: [{ serviceId: 'EDGE_ROUND', multiplier: 2 }] },
    { id: 'sharknose', label: 'Sharknose', shortLabel: 'Shark', description: 'скошена піднутрена кромка', allowance: 2.5, operations: [{ serviceId: 'CUT_45', multiplier: 1 }, { serviceId: 'EDGE_POLISH', multiplier: 1 }] },
    { id: 'straight_edge', label: 'Straight edge', shortLabel: 'Straight', description: 'пряма кромка без фаски/радіуса', allowance: 0, operations: [{ serviceId: 'CUT_STRAIGHT', multiplier: 1 }] },
    { id: 'd_12', label: 'Торець D-12', shortLabel: 'D-12', description: 'Спеціальний торець (припуск 4.5 мм на сторону)', allowance: 4.5, operations: [] },
  ],
};

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const DEFAULT_ALLOWANCES = {
  detailLength: 0,
  detailWidth: 0,
  detailSmallCutout: 0,
  detailLargeCutout: 0,
  elementLength: 0,
  elementWidth: 0,
  elementSmallCutout: 0,
  elementLargeCutout: 0,
  interPartSpacing: 0,
  show: false,
  applyToImports: false,
};

export const defaultCommercialQuoteSettings: CommercialQuoteSettings = {
  materialMode: 'slab',
  currency: 'UAH',
  slabPrice: 0,
  squareMeterPrice: 0,
  sawCutPricePerM: 0,
  waterjetCutPricePerM: 0,
  holePricePerPcs: 0,
  edgePrices: {
    chamfer_2x2: 0,
    chamfer_2x2_top_bottom: 0,
    r2_top: 0,
    r2_top_bottom: 0,
    chamfer_45_r2: 0,
    chamfered_edge: 0,
    half_bullnose: 0,
    full_bullnose: 0,
    sharknose: 0,
    polished_straight: 0,
    straight_edge: 0,
  },
  gluePricingMode: 'linear',
  gluePricePerM: 0,
  gluePricePerElement: 0,
  manualLines: [],
  lineOverrides: {},
  adjustmentType: 'discount',
  adjustmentPercent: 0,
  includeInCuttingPdf: false,
};

export function createEmptyProject(): Project {
  return {
    id: uid('project'),
    orderNumber: '',
    customer: '',
    uiLanguage: 'uk',
    textureSelectionEnabled: false,
    slabTypes: [],
    slabs: [],
    details: [],
    placements: [],
    textureLayouts: [],
    textureFrames: [],
    manualDimensions: [],
    calculationStatus: 'failed',
    unplacedPartIds: [],
    unplacedReasons: {},
    referenceData,
    versions: [{ id: uid('version'), timestamp: new Date().toISOString(), note: 'Створено проєкт' }],
    updatedAt: new Date().toISOString(),
    allowances: { ...DEFAULT_ALLOWANCES },
    commercialQuote: defaultCommercialQuoteSettings,
  };
}
