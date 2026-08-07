import type { Project, ReferenceData, CommercialQuoteSettings } from './types';

export const referenceData: ReferenceData = {
  materials: ['Керамограніт', 'Кварцит', 'Натуральний камінь', 'Акрил', 'Компакт-плита'],
  detailTypes: ['Стільниця', 'Стінова панель', 'Мийка', 'Фасад', 'Опора', 'Довільний елемент', 'Металопрокат'],
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
    { id: 'd_12', label: 'Крайка D12', shortLabel: 'D12', description: 'Виробничий профіль NC300, припуск 4.5 мм на сторону', allowance: 4.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_D12', multiplier: 1 }] },

    // ── Виробничі профілі з прайсу ВіярПро ───────────────────────────
    //  Припуски — з CUTTING_RULES_TZ: крайка 2.5, D12 — 4.5, стик Z — 1.5.
    //  Серія 12 живе лише на керамограніті, серія 20 — на кварциті;
    //  AR20 і ZS20 — виняток, вони існують на обох матеріалах, тому без
    //  materialGroup: код послуги обирає прив'язка за матеріалом проєкту.
    { id: 'ar_12', label: 'Крайка AR12', shortLabel: 'AR12', description: 'Фрезерування крайки NC300 (219959)', allowance: 2.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 't_12', label: 'Крайка T12', shortLabel: 'T12', description: 'Фрезерування крайки NC300 (219963)', allowance: 2.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'z_12', label: 'Крайка Z (стик)', shortLabel: 'Z', description: 'Крайка під стик, припуск 1.5 мм (219966)', allowance: 1.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'zs_12', label: 'Крайка ZS12', shortLabel: 'ZS12', description: 'Фрезерування крайки NC300 (219961)', allowance: 2.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'zs_4', label: 'Крайка ZS4 (1.5×1.5)', shortLabel: 'ZS4', description: 'Тонкий керамограніт, ділянка PANDA (203090)', allowance: 2.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'zs_6_15', label: 'Крайка ZS6 (1.5×1.5)', shortLabel: 'ZS6 1.5', description: 'Тонкий керамограніт, ділянка PANDA (203092)', allowance: 2.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'zs_6_3', label: 'Крайка ZS6 (3×3)', shortLabel: 'ZS6 3', description: 'Тонкий керамограніт, ділянка PANDA (203096)', allowance: 2.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'ar_20', label: 'Крайка AR20', shortLabel: 'AR20', description: 'Кварцит 219991 / керамограніт 203099', allowance: 2.5, operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'd_20', label: 'Крайка D20', shortLabel: 'D20', description: 'Фрезерування крайки NC300 (242507)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'h_40', label: 'Крайка H40', shortLabel: 'H40', description: 'Фрезерування крайки NC300 (242508)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'r_10', label: 'Крайка R10', shortLabel: 'R10', description: 'Фрезерування крайки NC300 (242509)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'r_3', label: 'Крайка R3', shortLabel: 'R3', description: 'Фрезерування крайки NC300 (219992)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'r_5', label: 'Крайка R5', shortLabel: 'R5', description: 'Фрезерування крайки NC300 (242511)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 't_20', label: 'Крайка T20', shortLabel: 'T20', description: 'Фрезерування крайки NC300 (219994)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'xd_20', label: 'Крайка XD20', shortLabel: 'XD20', description: 'Фрезерування крайки NC300 (219995)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'z_20', label: 'Крайка Z20 (стик)', shortLabel: 'Z20', description: 'Крайка під стик, кварцит (242512); припуск 2.5 за 195666', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'zs_20', label: 'Крайка ZS20', shortLabel: 'ZS20', description: 'Кварцит 219993 / керамограніт 203100', allowance: 2.5, operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'edge_45', label: 'Торець 45°', shortLabel: '45°', description: 'Фрезування крайки 45° (195350 / 195685)', allowance: 2.5, operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'antik', label: 'Крайка «Антик»', shortLabel: 'Антик', description: 'Алмазні щітки для матових покриттів (195717)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
  ],
};

/**
 * Долити вбудовані профілі торців у довідник збереженого проєкту.
 *
 * referenceData зберігається РАЗОМ із проєктом, тому проєкт, збережений
 * до появи виробничих профілів, назавжди лишився б із дванадцятьма
 * старими — нові AR12/D20/ZS20 у випадачках просто не з'являлися б.
 * Профілі, які користувач редагував (ціна, припуск), не чіпаються:
 * доливаються лише відсутні id.
 */
export function mergeBuiltinEdgeProfiles(existing?: import('./types').EdgeProfileDef[]) {
  const current = [...(existing ?? [])];
  const have = new Set(current.map((profile) => profile.id));
  (referenceData.edgeProfiles ?? []).forEach((profile) => {
    if (!have.has(profile.id)) current.push(profile);
  });
  return current;
}

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
