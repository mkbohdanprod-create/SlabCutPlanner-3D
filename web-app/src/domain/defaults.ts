import type { Project, ReferenceData } from './types';

export const referenceData: ReferenceData = {
  materials: ['Керамограніт', 'Кварцит', 'Натуральний камінь', 'Акрил', 'Компакт-плита'],
  detailTypes: ['Стільниця', 'Стінова панель', 'Мийка', 'Фасад', 'Опора'],
  detailShapes: ['Прямокутна', 'Г-подібна', 'П-подібна', 'Кругла', 'Овальна'],
  slabSizes: [
    { width: 3200, height: 1600 },
    { width: 3000, height: 1400 },
    { width: 3000, height: 2000 },
  ],
  thicknesses: [12, 20, 30, 40],
  serviceParams: { defaultMinMargin: 10, roundingDecimals: 3 },
};

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

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
    allowances: {
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
    },
  };
}
