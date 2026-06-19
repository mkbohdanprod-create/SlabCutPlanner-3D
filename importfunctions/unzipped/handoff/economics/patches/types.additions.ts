// =====================================================================
//  ПАТЧ ДО: src/domain/types.ts
//  Antigravity: ДОДАЙ ці типи у файл (будь-де серед інших export type/interface,
//  логічно — поряд з CutAllowances). НЕ дублюй, якщо вже існують.
// =====================================================================

export type CommercialMaterialMode = 'slab' | 'area';
export type CommercialGluePricingMode = 'linear' | 'element';

export interface CommercialManualLine {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  visible: boolean;
}

export interface CommercialLineOverride {
  quantity?: number;
  unitPrice?: number;
  visible?: boolean;
}

export interface CommercialQuoteSettings {
  materialMode: CommercialMaterialMode;
  currency: string;
  slabPrice: number;
  squareMeterPrice: number;
  sawCutPricePerM: number;
  waterjetCutPricePerM: number;
  edgePrices: Partial<Record<EdgeProfileType, number>>;
  gluePricingMode: CommercialGluePricingMode;
  gluePricePerM: number;
  gluePricePerElement: number;
  manualLines: CommercialManualLine[];
  lineOverrides: Record<string, CommercialLineOverride>;
  adjustmentType: 'discount' | 'markup';
  adjustmentPercent: number;
  includeInCuttingPdf: boolean;
}

// =====================================================================
//  І ОБОВ'ЯЗКОВО: у interface Project { ... } ДОДАЙ поле:
//
//      commercialQuote: CommercialQuoteSettings;
//
//  (поряд з allowances). Без цього pricing.ts не скомпілюється.
// =====================================================================
