// =====================================================================
//  src/engines/pricing.ts
//  Чистий двигун розрахунку комерційної пропозиції (Задача #3).
//  Портовано з оригіналу src/utils/commercialQuote.ts без зміни логіки.
//  Залежності: тільки domain/types + utils/edgeProfiles. Жодного зв'язку
//  зі store чи React — повністю тестопридатна чиста функція.
// =====================================================================

import type {
  CommercialQuoteSettings,
  Detail,
  DetailPart,
  EdgeProfileType,
  Project,
} from '../domain/types';
import { DEFAULT_SERVICE_CATALOG } from '../domain/services';
import { polygonPerimeter } from './geometryUtils';
import { extractProductionFacts, sumFacts } from './productionFacts';

export type CommercialQuoteLineCategory = 'material' | 'processing' | 'additional' | 'adjustment';

export type CommercialQuoteLine = {
  id: string;
  category: CommercialQuoteLineCategory;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  visible: boolean;
  automatic: boolean;
};

export type CommercialQuoteTotals = {
  material: number;
  processing: number;
  additional: number;
  adjustment: number;
  grandTotal: number;
};

export type CommercialQuoteMetrics = {
  detailAreaM2: number;
  usedSlabs: number;
  sawCutM: number;
  waterjetCutM: number;
  /** Отвори до 100 мм — рахуються штуками, не метрами */
  holeCount: number;
  glueLengthM: number;
  glueElements: number;
  edgeLengths: Record<string, number>;
};

export type CommercialQuoteCalculation = {
  metrics: CommercialQuoteMetrics;
  lines: CommercialQuoteLine[];
  visibleLines: CommercialQuoteLine[];
  totals: CommercialQuoteTotals;
};

// --- математика винесена у engines/geometryUtils.ts: тими самими формулами
//     рахує рушій виробничих фактів, і дві копії означали б два різні числа
//     в кошторисі й у КП. Тут лишається тільки округлення під гроші. ---

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}


function addLine(
  lines: CommercialQuoteLine[],
  settings: CommercialQuoteSettings,
  line: Omit<CommercialQuoteLine, 'amount' | 'visible'> & { visible?: boolean },
) {
  const override = settings.lineOverrides[line.id];
  const quantity = round(override?.quantity ?? line.quantity, 3);
  const unitPrice = round(override?.unitPrice ?? line.unitPrice, 2);
  const visible = override?.visible ?? line.visible ?? true;
  lines.push({
    ...line,
    quantity,
    unitPrice,
    visible,
    amount: round(quantity * unitPrice, 2),
  });
}

export function calculateCommercialQuote(
  project: Project,
  parts: DetailPart[],
  details?: Detail[],
): CommercialQuoteCalculation {
  const settings = project.commercialQuote;
  const elementParts = parts.filter((part) => !part.isMain || part.edgeKind);

  // Числа беруться з того самого рушія фактів, що й кошторис. До цього тут
  // була власна математика, у якій пила рахувала ВЕСЬ периметр, а вода —
  // ще раз ті самі дуги: непрямі різи потрапляли в суму двічі.
  const facts = extractProductionFacts(project, parts, { details });
  const detailAreaM2 = sumFacts(facts, 'detail_area');
  const usedSlabs = sumFacts(facts, 'slabs_used');
  const sawCutM = sumFacts(facts, 'saw_cut');
  const waterjetCutM = round(
    sumFacts(facts, 'waterjet_cut') + sumFacts(facts, 'cutout_perimeter') + sumFacts(facts, 'hole_large'),
    3,
  );
  const holeCount = sumFacts(facts, 'hole_small');

  // Склейка доповнень лишається за партами: підворот і потовщення — це не
  // стик, а окремий елемент, і у фактах вони не мають власного виду.
  const glueLengthM = round(elementParts.reduce((sum, part) => sum + polygonPerimeter(part.points), 0) / 1000, 3);
  const glueElements = elementParts.length;

  const edgeLengths: Record<string, number> = {};
  facts.filter((fact) => fact.kind === 'edge' && fact.variant).forEach((fact) => {
    const profileId = fact.variant as string;
    edgeLengths[profileId] = round((edgeLengths[profileId] ?? 0) + fact.qty, 3);
  });

  const metrics: CommercialQuoteMetrics = {
    detailAreaM2,
    usedSlabs,
    sawCutM,
    waterjetCutM,
    holeCount,
    glueLengthM,
    glueElements,
    edgeLengths,
  };

  const lines: CommercialQuoteLine[] = [];
  if (settings.materialMode === 'slab') {
    addLine(lines, settings, {
      id: 'material-slabs',
      category: 'material',
      name: 'Матеріал за лист/сляб',
      quantity: usedSlabs,
      unit: 'лист',
      unitPrice: settings.slabPrice,
      automatic: true,
    });
  } else {
    addLine(lines, settings, {
      id: 'material-area',
      category: 'material',
      name: 'Матеріал за м² виробу',
      quantity: detailAreaM2,
      unit: 'м²',
      unitPrice: settings.squareMeterPrice,
      automatic: true,
    });
  }

  addLine(lines, settings, {
    id: 'saw-cut',
    category: 'processing',
    name: 'Порізка диском',
    quantity: sawCutM,
    unit: 'пог. м',
    unitPrice: settings.sawCutPricePerM,
    automatic: true,
  });

  addLine(lines, settings, {
    id: 'waterjet-cut',
    category: 'processing',
    name: 'Водяна різка',
    quantity: waterjetCutM,
    unit: 'пог. м',
    unitPrice: settings.waterjetCutPricePerM,
    visible: waterjetCutM > 0,
    automatic: true,
  });

  addLine(lines, settings, {
    id: 'holes',
    category: 'processing',
    name: 'Отвори до 100 мм',
    quantity: holeCount,
    unit: 'шт',
    unitPrice: settings.holePricePerPcs ?? 0,
    visible: holeCount > 0,
    automatic: true,
  });

  const edgeProfiles = project.referenceData?.edgeProfiles || [];
  edgeProfiles.forEach((profile) => {
    const quantity = round(edgeLengths[profile.id] ?? 0, 3);
    if (quantity <= 0) return;
    const calcPrice = profile.operations?.reduce((acc, op) => acc + ((DEFAULT_SERVICE_CATALOG[op.serviceId]?.price ?? 0) * op.multiplier), 0) ?? 0;
    addLine(lines, settings, {
      id: `edge-${profile.id}`,
      category: 'processing',
      name: `Кромка: ${profile.label}`,
      quantity,
      unit: 'пог. м',
      unitPrice: calcPrice,
      automatic: true,
    });
  });

  addLine(lines, settings, {
    id: 'glue',
    category: 'processing',
    name: settings.gluePricingMode === 'linear' ? 'Склейка / підклейка' : 'Склейка / підклейка за елемент',
    quantity: settings.gluePricingMode === 'linear' ? glueLengthM : glueElements,
    unit: settings.gluePricingMode === 'linear' ? 'пог. м' : 'елем.',
    unitPrice: settings.gluePricingMode === 'linear' ? settings.gluePricePerM : settings.gluePricePerElement,
    visible: settings.gluePricingMode === 'linear' ? glueLengthM > 0 : glueElements > 0,
    automatic: true,
  });

  settings.manualLines.forEach((manual) => {
    addLine(lines, settings, {
      id: manual.id,
      category: 'additional',
      name: manual.name,
      quantity: manual.quantity,
      unit: manual.unit,
      unitPrice: manual.unitPrice,
      visible: manual.visible,
      automatic: false,
    });
  });

  const subtotal = lines.filter((line) => line.visible).reduce((sum, line) => sum + line.amount, 0);
  const adjustmentValue = round(subtotal * Math.max(0, settings.adjustmentPercent) / 100, 2);
  if (settings.adjustmentPercent > 0) {
    lines.push({
      id: 'adjustment',
      category: 'adjustment',
      name: settings.adjustmentType === 'discount' ? 'Знижка' : 'Націнка',
      quantity: settings.adjustmentPercent,
      unit: '%',
      unitPrice: 0,
      visible: true,
      automatic: true,
      amount: settings.adjustmentType === 'discount' ? -adjustmentValue : adjustmentValue,
    });
  }

  const visibleLines = lines.filter((line) => line.visible);
  const totalBy = (category: CommercialQuoteLineCategory) => round(visibleLines
    .filter((line) => line.category === category)
    .reduce((sum, line) => sum + line.amount, 0), 2);
  const totals = {
    material: totalBy('material'),
    processing: totalBy('processing'),
    additional: totalBy('additional'),
    adjustment: totalBy('adjustment'),
    grandTotal: round(visibleLines.reduce((sum, line) => sum + line.amount, 0), 2),
  };

  return { metrics, lines, visibleLines, totals };
}
