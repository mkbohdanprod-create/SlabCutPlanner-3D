// =====================================================================
//  ПАТЧ ДО: src/domain/defaults.ts
//  Antigravity, два кроки:
// =====================================================================

// КРОК 1 — ДОДАЙ імпорт типу зверху файлу (якщо ще не імпортовано):
//   import type { CommercialQuoteSettings } from './types';

// КРОК 2 — ДОДАЙ цю константу (перед createEmptyProject):
export const defaultCommercialQuoteSettings: CommercialQuoteSettings = {
  materialMode: 'slab',
  currency: 'UAH',
  slabPrice: 0,
  squareMeterPrice: 0,
  sawCutPricePerM: 0,
  waterjetCutPricePerM: 0,
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

// КРОК 3 — у createEmptyProject() в об'єкт, що повертається (return { ... }),
//          ДОДАЙ рядок (поряд з allowances):
//
//              commercialQuote: defaultCommercialQuoteSettings,
