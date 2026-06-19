// =====================================================================
//  src/engines/pricing.ts
//  Чистий двигун розрахунку комерційної пропозиції (Задача #3).
//  Портовано з оригіналу src/utils/commercialQuote.ts без зміни логіки.
//  Залежності: тільки domain/types + utils/edgeProfiles. Жодного зв'язку
//  зі store чи React — повністю тестопридатна чиста функція.
// =====================================================================

import type {
  CommercialQuoteSettings,
  DetailPart,
  EdgeProfileType,
  Point,
  Project,
} from '../domain/types';
import { EDGE_PROFILE_OPTIONS, edgeProfileLabel } from '../utils/edgeProfiles';

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
  glueLengthM: number;
  glueElements: number;
  edgeLengths: Partial<Record<EdgeProfileType, number>>;
};

export type CommercialQuoteCalculation = {
  metrics: CommercialQuoteMetrics;
  lines: CommercialQuoteLine[];
  visibleLines: CommercialQuoteLine[];
  totals: CommercialQuoteTotals;
};

// --- локальні математичні хелпери (навмисно self-contained, щоб модуль був
//     drop-in незалежно від стану консолідації geometryUtils). Пізніше можна
//     замінити на спільні з src/engines/geometryUtils.ts. ---

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}

function pointDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polygonPerimeter(points: Point[]) {
  if (points.length < 2) return 0;
  return points.reduce((sum, point, index) => sum + pointDistance(point, points[(index + 1) % points.length]), 0);
}

// Довжина тільки НЕ-осьових різів (для розрахунку водяної різки)
function polygonWaterjetLength(points: Point[]) {
  if (points.length < 2) return 0;
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    const dx = Math.abs(point.x - next.x);
    const dy = Math.abs(point.y - next.y);
    const isAxisAligned = dx < 0.001 || dy < 0.001;
    return sum + (isAxisAligned ? 0 : pointDistance(point, next));
  }, 0);
}

function sideSegment(part: DetailPart, side: string) {
  const custom = part.sideSegments?.[side];
  if (custom) return custom;
  const resolvedSide = part.sideAliases?.[side] ?? side;
  const byPointCount: Record<number, Partial<Record<string, number>>> = {
    4: { B: 0, C: 1, D: 2, A: 3 },
    6: { B: 0, C: 1, D: 2, E: 3, F: 4, A: 5 },
    8: { B: 0, C: 1, D: 2, E: 3, F: 4, G: 5, H: 6, A: 7 },
  };
  const index = byPointCount[part.points.length]?.[resolvedSide];
  if (index === undefined || !part.points[index]) return undefined;
  return { start: part.points[index], end: part.points[(index + 1) % part.points.length] };
}

function edgeLengthForSide(part: DetailPart, side: string) {
  const segment = sideSegment(part, side);
  if (segment) return pointDistance(segment.start, segment.end);
  const edges = Math.max(1, part.points.length);
  return polygonPerimeter(part.points) / edges;
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

function projectDetailsById(project: Project) {
  return new Map(project.details.map((detail) => [detail.id, detail]));
}

export function calculateCommercialQuote(project: Project, parts: DetailPart[]): CommercialQuoteCalculation {
  const settings = project.commercialQuote;
  const detailsById = projectDetailsById(project);
  const mainParts = parts.filter((part) => part.isMain);
  const elementParts = parts.filter((part) => !part.isMain || part.edgeKind);
  const placedSlabs = new Set(project.placements.map((placement) => placement.slabId));
  const usedSlabs = placedSlabs.size || project.slabs.length;

  const detailAreaM2 = round(mainParts.reduce((sum, part) => sum + part.area, 0), 3);
  const sawCutM = round(mainParts.reduce((sum, part) => sum + polygonPerimeter(part.points), 0) / 1000, 3);
  const waterjetCutM = round(mainParts.reduce((sum, part) => {
    const holeLength = (part.holes ?? []).reduce((holeSum, hole) => holeSum + polygonPerimeter(hole), 0);
    return sum + holeLength + polygonWaterjetLength(part.points);
  }, 0) / 1000, 3);
  const glueLengthM = round(elementParts.reduce((sum, part) => sum + polygonPerimeter(part.points), 0) / 1000, 3);
  const glueElements = elementParts.length;
  const edgeLengths: Partial<Record<EdgeProfileType, number>> = {};

  mainParts.forEach((part) => {
    const detail = detailsById.get(part.detailId);
    Object.entries(detail?.edgeProfiles ?? {}).forEach(([side, profile]) => {
      if (!profile) return;
      edgeLengths[profile] = round((edgeLengths[profile] ?? 0) + edgeLengthForSide(part, side) / 1000, 3);
    });
  });

  const metrics: CommercialQuoteMetrics = {
    detailAreaM2,
    usedSlabs,
    sawCutM,
    waterjetCutM,
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

  EDGE_PROFILE_OPTIONS.forEach((profile) => {
    const quantity = round(edgeLengths[profile.value] ?? 0, 3);
    if (quantity <= 0) return;
    addLine(lines, settings, {
      id: `edge-${profile.value}`,
      category: 'processing',
      name: `Кромка: ${edgeProfileLabel(profile.value)}`,
      quantity,
      unit: 'пог. м',
      unitPrice: settings.edgePrices[profile.value] ?? 0,
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
