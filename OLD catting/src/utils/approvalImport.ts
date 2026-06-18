import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as XLSX from 'xlsx';
import { referenceData } from '../domain/defaults';
import { DetailShape, DetailType, EdgeFeature, EdgeProfileSelection, EdgeProfileType, MaterialType, Point } from '../domain/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();

const TYPE_COUNTERTOP = referenceData.detailTypes[0] as DetailType;
const TYPE_WALL_PANEL = referenceData.detailTypes[1] as DetailType;
const TYPE_SINK = referenceData.detailTypes[2] as DetailType;
const TYPE_FACADE = referenceData.detailTypes[3] as DetailType;
const SHAPE_RECT = referenceData.detailShapes[0] as DetailShape;
const SHAPE_L = referenceData.detailShapes[1] as DetailShape;
const SHAPE_U = referenceData.detailShapes[2] as DetailShape;
const SHAPE_CIRCLE = referenceData.detailShapes[3] as DetailShape;
const SHAPE_ELLIPSE = referenceData.detailShapes[4] as DetailShape;
export const APPROVAL_IMPORT_PIPELINE_VERSION = 'approval-import-v2' as const;
export const APPROVAL_IMPORT_BUILD_ID = 'approval-v2-20260610-002' as const;

export type ApprovalSpecRow = {
  side: string;
  elementType: string;
  height: number;
  width: number;
  profile: string;
};

export type ApprovalDimensionLabel = {
  side: string;
  value: number;
  source: string;
};

export type ApprovalImportStatus = 'OK' | 'Needs review' | 'Error';
export type ApprovalGeometrySource = 'pdf-vector' | 'image-contour' | 'none';
export type ApprovalShapeMode = 'customContour' | 'rectangle' | 'none';
export type ApprovalDimensionsSource = 'drawing-labels' | 'spec-calibrated' | 'visual-area' | 'none';

export type ApprovalImportItem = {
  id: string;
  sourceProductNumber: number;
  name: string;
  type: DetailType;
  shape: DetailShape;
  width: number;
  height: number;
  innerHorizontal?: number;
  innerVertical?: number;
  innerCutWidth?: number;
  innerCutDepth?: number;
  innerCutOffset?: number;
  customPoints?: Point[];
  customHoles?: Point[][];
  sideSegments?: Record<string, { start: Point; end: Point }>;
  sourcePreview?: {
    image: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  area?: number;
  quantity: number;
  jointVertical?: boolean;
  jointHorizontal?: boolean;
  sizeSource: 'drawing' | 'none';
  pipelineVersion: typeof APPROVAL_IMPORT_PIPELINE_VERSION;
  geometrySource: ApprovalGeometrySource;
  shapeMode: ApprovalShapeMode;
  dimensionsSource: ApprovalDimensionsSource;
  specSource: 'table' | 'none';
  thickening: EdgeFeature;
  fold: EdgeFeature;
  edgeProfiles: EdgeProfileSelection;
  dimensions: ApprovalDimensionLabel[];
  warnings: string[];
  importStatus: ApprovalImportStatus;
  debug: {
    sourceSize: { width: number; height: number; source: 'drawing' | 'none' };
    drawing?: { width: number; height: number; area: number };
    sourcePage?: number;
    sourceImageRegion?: { x: number; y: number; width: number; height: number };
    mappedSides: string[];
  };
  rows: ApprovalSpecRow[];
  sourceX: number;
  sourceY: number;
};

export type ApprovalImportPreview = {
  pipelineVersion: typeof APPROVAL_IMPORT_PIPELINE_VERSION;
  approvalImportBuildId: typeof APPROVAL_IMPORT_BUILD_ID;
  fileName: string;
  orderNumber: string;
  customer: string;
  material?: MaterialType;
  thickness: number;
  decor: string;
  rawText: string;
  warnings: string[];
  debug: string[];
  debugDump: ApprovalImportDebugDump;
  items: ApprovalImportItem[];
};

export type ApprovalImportDebugDump = {
  pipelineVersion: typeof APPROVAL_IMPORT_PIPELINE_VERSION;
  approvalImportBuildId: typeof APPROVAL_IMPORT_BUILD_ID;
  sourceFileName: string;
  orderNumber: string | null;
  customer: string | null;
  products: Array<{
    productNumber: number;
    productName: string;
    sourcePage: number | null;
    sourceImageRegion: { x: number; y: number; width: number; height: number } | null;
    detectedDimensions: Array<{ label: string; valueMm: number; rawText: string }>;
    detectedSpecificationRows: Array<{ side: string; type: string; height: number; width: number; form: string }>;
    detectedGeometry: {
      source: ApprovalGeometrySource;
      outerContourPointsMm: Point[];
      holesMm: Point[][];
      jointsMm: Point[][];
      boundingBoxMm: { width: number; height: number };
    };
    finalDetail: {
      id: string;
      name: string;
      kind: DetailType;
      shapeMode: ApprovalShapeMode;
      widthMm: number;
      heightMm: number;
      contourPoints: Point[];
      holes: Point[][];
      joints: Point[][];
    };
    validation: {
      status: ApprovalImportStatus;
      warnings: string[];
    };
    dimensionsSource: ApprovalDimensionsSource;
    shapeMode: ApprovalShapeMode;
    contourPointsCount: number;
    finalImportAllowed: boolean;
    blockedReason: string | null;
  }>;
};

type ApprovalDrawingGeometry = {
  points: Point[];
  holes: Point[][];
  width: number;
  height: number;
  area: number;
  sourcePage?: number;
  sourceProductNumber?: number;
  sourceBounds: { minX: number; minY: number; maxX: number; maxY: number };
  sourceImage?: string;
  sourceImageBounds?: { minX: number; minY: number; maxX: number; maxY: number };
};

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

function normalizeLines(text: string) {
  return text
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean);
}

function parseNumber(value = '') {
  const normalized = value
    .replace(/\s+(?=\d{3}\b)/g, '')
    .replace(/[^\d,.-]/g, '')
    .replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

/** Keeps product/specification blocks and removes only the final client instruction tail. */
function trimInstructionTail(lines: string[]) {
  const lastProductOrSpec = lines.reduce((last, line, index) => (
    /^(Виріб|Специфікація виробу)\s*№/iu.test(line) ? index : last
  ), -1);
  const attentionIndex = lines.findIndex((line, index) => (
    index > lastProductOrSpec && (/^Увага!?$/iu.test(line) || /^Увага!/iu.test(line))
  ));
  return attentionIndex >= 0 ? lines.slice(0, attentionIndex) : lines;
}

function isSectionStart(value: string) {
  return /^(Виріб|Специфікація виробу|Увага|П\.?І\.?Б|З розмірами)/iu.test(value);
}

function isSide(value: string) {
  return /^[A-HА-Н]$/iu.test(value);
}

function isRowNumber(value: string) {
  return /^\d{1,3}$/.test(value);
}

function nextNonHeader(lines: string[], start: number) {
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^(Порядковий|номер|Сторона|Тип елементу|Висота|Ширина|Форма елементу)$/iu.test(line)) continue;
    return { line, index };
  }
  return undefined;
}

function lineAfter(lines: string[], label: RegExp) {
  const index = lines.findIndex((line) => label.test(line));
  return index >= 0 ? nextNonHeader(lines, index + 1)?.line ?? '' : '';
}

/** Extracts the area from product headers like "Стільниця0,762 м.кв.". */
function parseProductArea(value: string) {
  return parseNumber(value.match(/(\d+[,.]\d+)\s*м\.?\s*кв/iu)?.[1] ?? '');
}

function inferMaterial(value: string): MaterialType | undefined {
  const source = value.toLocaleLowerCase('uk-UA');
  const entries: Array<[RegExp, number]> = [
    [/керам|porcelain|stoneware/u, 0],
    [/кварц/u, 1],
    [/натур|natural/u, 2],
    [/акрил|acryl/u, 3],
    [/компакт/u, 4],
  ];
  const found = entries.find(([pattern]) => pattern.test(source));
  return found ? referenceData.materials[found[1]] as MaterialType : undefined;
}

function inferDetailType(value: string): DetailType {
  const source = value.toLocaleLowerCase('uk-UA');
  if (/мийк/u.test(source)) return TYPE_SINK;
  if (/стін|панел|фартух/u.test(source)) return TYPE_WALL_PANEL;
  if (/фасад/u.test(source)) return TYPE_FACADE;
  return TYPE_COUNTERTOP;
}

function inferEdgeProfile(value = ''): EdgeProfileType {
  const label = value.toLocaleLowerCase('uk-UA');
  if (/sharknose|акул/u.test(label)) return 'sharknose';
  if (/full\s*bullnose|повн.*радіус/u.test(label)) return 'full_bullnose';
  if (/half\s*bullnose|напів.*радіус/u.test(label)) return 'half_bullnose';
  if (/r2\s*[xх×]\s*r?2|r2.*(верх.*низ|top.*bottom)|радіус.*2.*(верх.*низ)/u.test(label)) return 'r2_top_bottom';
  if (/r2|радіус\s*2/u.test(label)) return 'r2_top';
  if (/(фаск|крайк|кром).*(2\s*[xх×]\s*2).*(верх.*низ)/u.test(label)) return 'chamfer_2x2_top_bottom';
  if (/(фаск|крайк|кром).*(2\s*[xх×]\s*2)/u.test(label)) return 'chamfer_2x2';
  if (/(фаск|chamfer).*(45)/u.test(label)) return 'chamfer_45_r2';
  if (/chamfered|скош|технічна\s+фаска|фаск/u.test(label)) return 'chamfered_edge';
  if (/полір/u.test(label)) return 'polished_straight';
  return 'straight_edge';
}

function approvalSideToAppSide(side: string, shape: DetailShape) {
  const normalized = side.toUpperCase();
  const map: Record<string, string> = { A: 'B', B: 'C', C: 'D', D: 'A' };
  if (shape === SHAPE_RECT) return map[normalized] ?? normalized;
  return map[normalized] ?? normalized;
}

function cleanProductName(value: string, productNumber: number) {
  const cleaned = value
    .replace(/^\(/, '')
    .replace(/\d+[,.]\d+\s*м\.?\s*кв\.?.*/iu, '')
    .replace(/\d+\s*м\.?\s*кв\.?.*/iu, '')
    .replace(/[()]/g, '')
    .trim();
  const base = cleaned || 'Виріб';
  return `${base} ${productNumber}`.replace(/\s+/g, ' ').trim();
}

function isFoldOrThickening(row: ApprovalSpecRow) {
  return /підвор|підгин|fold|miter|опуск|потовщ|підклей|thicken/iu.test(`${row.elementType} ${row.profile}`);
}

function isEdgeRow(row: ApprovalSpecRow) {
  return /крайк|кром|фаск|радіус|r2|edge|bullnose|sharknose/iu.test(`${row.elementType} ${row.profile}`);
}

function parseSpecRows(lines: string[], start: number, end: number): ApprovalSpecRow[] {
  const rows: ApprovalSpecRow[] = [];
  let index = start + 1;
  while (index < end) {
    const current = lines[index];
    const sideCandidate = nextNonHeader(lines, index + 1);
    if (!isRowNumber(current) || !sideCandidate || !isSide(sideCandidate.line)) {
      index += 1;
      continue;
    }
    const typeCandidate = nextNonHeader(lines, sideCandidate.index + 1);
    const heightCandidate = nextNonHeader(lines, (typeCandidate?.index ?? sideCandidate.index) + 1);
    const widthCandidate = nextNonHeader(lines, (heightCandidate?.index ?? typeCandidate?.index ?? sideCandidate.index) + 1);
    if (!typeCandidate || !heightCandidate || !widthCandidate) {
      index += 1;
      continue;
    }
    const profileLines: string[] = [];
    let profileIndex = widthCandidate.index + 1;
    while (profileIndex < end) {
      const line = lines[profileIndex];
      const nextSide = nextNonHeader(lines, profileIndex + 1);
      if (isSectionStart(line)) break;
      if (isRowNumber(line) && nextSide && isSide(nextSide.line)) break;
      if (!/^(Порядковий|номер|Сторона|Тип елементу|Висота|Ширина|Форма елементу)$/iu.test(line)) {
        profileLines.push(line);
      }
      profileIndex += 1;
    }
    rows.push({
      side: sideCandidate.line.toUpperCase(),
      elementType: typeCandidate.line,
      height: parseNumber(heightCandidate.line),
      width: parseNumber(widthCandidate.line),
      profile: profileLines.join(' ').trim(),
    });
    index = profileIndex;
  }
  return rows;
}

function normalizeSourceSide(value: string) {
  return value.toUpperCase()
    .replace('\u0410', 'A')
    .replace('\u0412', 'B')
    .replace('\u0421', 'C')
    .replace('\u0415', 'E')
    .replace('\u0406', 'I')
    .replace('\u0420\u0452', 'A')
    .replace('\u0420\u2019', 'B')
    .replace('\u0420\u040E', 'C')
    .replace('\u0420\u2022', 'E')
    .replace('\u0420\u2020', 'I');
}

function parseDimensionLabels(lines: string[], start: number, end: number): ApprovalDimensionLabel[] {
  const dimensions: ApprovalDimensionLabel[] = [];
  const seen = new Set<string>();
  const labelPattern = new RegExp(String.raw`(?:^|[^\p{L}\d])(A|B|C|D|E|F|G|H|I|\u0410|\u0412|\u0421|\u0415|\u0406|\u0420\u0452|\u0420\u2019|\u0420\u040E|\u0420\u2022|\u0420\u2020)\s*=?\s*([0-9][0-9\s\u00a0]{1,8}(?:[,.]\d+)?)\s*(?:\u0420\u0458\u0420\u0458|mm)?(?:$|[^\p{L}\d])`, 'giu');
  lines.slice(start, end).forEach((line) => {
    let match: RegExpExecArray | null;
    while ((match = labelPattern.exec(line))) {
      const side = normalizeSourceSide(match[1]);
      const value = parseNumber(match[2]);
      if (!/^[A-I]$/u.test(side) || value < 80) continue;
      const key = `${side}:${value}:${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dimensions.push({ side, value, source: line });
    }
  });
  return dimensions;
}

function inferShape(rows: ApprovalSpecRow[], name = '') {
  const source = name.toLocaleLowerCase('uk-UA');
  if (/круг|коло|circle/u.test(source)) return SHAPE_CIRCLE;
  if (/овал|еліпс|ellipse|oval/u.test(source)) return SHAPE_ELLIPSE;
  const sides = new Set(rows.map((row) => row.side));
  if (sides.has('G') || sides.has('H') || sides.size >= 7) return SHAPE_U;
  if (sides.has('E') || sides.has('F') || sides.size >= 5) return SHAPE_L;
  return SHAPE_RECT;
}

function roundToMillimeters(value: number, step = 1) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(step, Math.round(value / step) * step);
}

function snapApprovalVisualDimension(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const coarseStep = value >= 500 ? 100 : 50;
  const coarse = roundToMillimeters(value, coarseStep);
  if (Math.abs(coarse - value) <= Math.max(4, coarseStep * 0.35)) return coarse;
  return roundToMillimeters(value, 10);
}

function areaFallbackSizeFromDrawing(drawing: ApprovalDrawingGeometry, area: number) {
  const scale = Math.sqrt((area * 1_000_000) / Math.max(1, drawing.area));
  let width = Math.max(1, Math.round(drawing.width * scale));
  let height = Math.max(1, Math.round(drawing.height * scale));
  const snappedHeight = snapApprovalVisualDimension(height);
  if (snappedHeight && Math.abs(snappedHeight - height) <= 5) {
    height = snappedHeight;
    width = Math.max(1, Math.round((area * 1_000_000) / height));
  } else {
    const snappedWidth = snapApprovalVisualDimension(width);
    if (snappedWidth && Math.abs(snappedWidth - width) <= 5) {
      width = snappedWidth;
      height = Math.max(1, Math.round((area * 1_000_000) / width));
    }
  }
  return { width, height };
}

/** Provides a non-destructive size for products whose drawing dimensions are not extractable as PDF text. */
function fallbackSizeFromArea(area: number, type: DetailType) {
  if (area <= 0) return { width: 600, height: 600 };
  const squareMillimeters = area * 1_000_000;
  const ratio = type === TYPE_WALL_PANEL || type === TYPE_FACADE ? 1.8 : 2.2;
  const width = Math.max(180, Math.sqrt(squareMillimeters * ratio));
  const height = Math.max(120, squareMillimeters / width);
  return {
    width: roundToMillimeters(width, 10),
    height: roundToMillimeters(height, 10),
  };
}

/** Chooses real side lengths from specification rows and avoids using element thickness as detail size. */
function detailSizeFromRows(rows: ApprovalSpecRow[], area: number, type: DetailType) {
  const lengths = rows
    .map((row) => row.width)
    .filter((value) => value >= 80)
    .sort((a, b) => b - a);
  const unique = lengths.filter((value, index) => index === 0 || Math.abs(value - lengths[index - 1]) > 2);
  if (!unique.length) return { ...fallbackSizeFromArea(area, type), source: 'area-fallback' as const };

  if (area > 0 && unique.length === 1) {
    const otherSide = (area * 1_000_000) / unique[0];
    return {
      width: Math.max(100, Math.round(unique[0])),
      height: Math.max(100, roundToMillimeters(otherSide, 10)),
      source: 'specification' as const,
    };
  }

  if (area > 0 && unique.length > 1) {
    const target = area * 1_000_000;
    let bestPair = [unique[0], unique[1]];
    let bestScore = Number.POSITIVE_INFINITY;
    unique.forEach((first, firstIndex) => {
      unique.slice(firstIndex + 1).forEach((second) => {
        const product = first * second;
        const score = product >= target ? (product - target) / target : (target - product) / target + 0.25;
        if (score < bestScore) {
          bestScore = score;
          bestPair = [first, second];
        }
      });
    });
    if (bestPair[0] * bestPair[1] < target * 0.5) {
      return { ...fallbackSizeFromArea(area, type), source: 'area-fallback' as const };
    }
    return {
      width: Math.max(100, Math.round(bestPair[0])),
      height: Math.max(100, Math.round(bestPair[1])),
      source: 'specification' as const,
    };
  }

  return {
    width: Math.max(100, Math.round(unique[0] ?? 600)),
    height: Math.max(100, Math.round(unique[1] ?? unique[0] ?? 600)),
    source: 'specification' as const,
  };
}

function sourceSideLengths(rows: ApprovalSpecRow[], dimensions: ApprovalDimensionLabel[] = []) {
  const fromDimensions = dimensions.reduce<Record<string, number>>((result, dimension) => {
    if (dimension.value >= 80) result[dimension.side] = Math.max(result[dimension.side] ?? 0, dimension.value);
    return result;
  }, {});
  return rows.reduce<Record<string, number>>((result, row) => {
    if (row.width >= 80) result[row.side.toUpperCase()] = Math.max(result[row.side.toUpperCase()] ?? 0, row.width);
    return result;
  }, fromDimensions);
}

function circleSizeFromArea(area: number) {
  if (area <= 0) return 600;
  return roundToMillimeters(Math.sqrt((area * 1_000_000) / Math.PI) * 2, 10);
}

function detailGeometryFromRows(rows: ApprovalSpecRow[], area: number, type: DetailType, shape: DetailShape, dimensions: ApprovalDimensionLabel[] = []) {
  const lengths = sourceSideLengths(rows, dimensions);
  const targetArea = area > 0 ? area * 1_000_000 : 0;

  if (shape === SHAPE_CIRCLE) {
    const diameter = Math.max(lengths.A ?? 0, lengths.B ?? 0, lengths.C ?? 0, lengths.D ?? 0, circleSizeFromArea(area));
    return { width: Math.round(diameter), height: Math.round(diameter), source: targetArea ? 'specification' as const : 'area-fallback' as const };
  }

  if (shape === SHAPE_ELLIPSE) {
    const known = Object.values(lengths).filter((value) => value >= 80).sort((a, b) => b - a);
    if (known.length >= 2) return { width: Math.round(known[0]), height: Math.round(known[1]), source: 'specification' as const };
    return { ...fallbackSizeFromArea(area, type), source: 'area-fallback' as const };
  }

  if (shape === SHAPE_RECT) {
    const horizontal = Math.max(lengths.A ?? 0, lengths.C ?? 0);
    const vertical = Math.max(lengths.B ?? 0, lengths.D ?? 0);
    if (horizontal && vertical) return { width: Math.round(horizontal), height: Math.round(vertical), source: 'specification' as const };
    if (horizontal && targetArea) return { width: Math.round(horizontal), height: Math.max(100, roundToMillimeters(targetArea / horizontal, 10)), source: 'specification' as const };
    if (vertical && targetArea) return { width: Math.max(100, roundToMillimeters(targetArea / vertical, 10)), height: Math.round(vertical), source: 'specification' as const };
    return detailSizeFromRows(rows, area, type);
  }

  if (shape === SHAPE_L) {
    let top = lengths.A;
    let right = lengths.B;
    let bottom = lengths.C;
    let innerVertical = lengths.D;
    let innerHorizontal = lengths.E;
    let left = lengths.F;

    if (!right && innerVertical && left) right = innerVertical + left;
    if (!top && bottom && innerHorizontal) top = bottom + innerHorizontal;
    if (!bottom && top && innerHorizontal) bottom = top - innerHorizontal;
    if (!innerHorizontal && top && bottom) innerHorizontal = top - bottom;
    if (!innerVertical && right && left) innerVertical = right - left;
    if (!left && right && innerVertical) left = right - innerVertical;

    if (targetArea && innerHorizontal && innerVertical && left && !bottom) {
      bottom = (targetArea - innerHorizontal * left) / (innerVertical + left);
    }
    if (targetArea && bottom && innerHorizontal && innerVertical && !left) {
      left = (targetArea - bottom * innerVertical) / (bottom + innerHorizontal);
    }
    if (targetArea && bottom && innerHorizontal && left && !innerVertical) {
      innerVertical = (targetArea - innerHorizontal * left) / bottom - left;
    }
    if (targetArea && bottom && innerVertical && left && !innerHorizontal) {
      innerHorizontal = (targetArea - bottom * (innerVertical + left)) / left;
    }

    if (!right && innerVertical && left) right = innerVertical + left;
    if (!top && bottom && innerHorizontal) top = bottom + innerHorizontal;

    if (top && right) {
      return {
        width: Math.max(100, Math.round(top)),
        height: Math.max(100, Math.round(right)),
        innerHorizontal: Math.max(1, Math.round(innerHorizontal ?? top * 0.45)),
        innerVertical: Math.max(1, Math.round(innerVertical ?? right * 0.45)),
        source: 'specification' as const,
      };
    }
    return detailSizeFromRows(rows, area, type);
  }

  if (shape === SHAPE_U) {
    const leftOuter = lengths.A;
    const top = lengths.B;
    const rightOuter = lengths.C;
    const rightLeg = lengths.D;
    const rightInner = lengths.E;
    const innerWidth = lengths.F;
    const leftInner = lengths.G;
    const leftLeg = lengths.H;
    const width = top ?? ((leftLeg ?? 0) + (innerWidth ?? 0) + (rightLeg ?? 0));
    const height = Math.max(leftOuter ?? 0, rightOuter ?? 0, leftInner ?? 0, rightInner ?? 0);
    if (width && height) {
      const cutWidth = innerWidth ?? Math.max(1, width - (leftLeg ?? 0) - (rightLeg ?? 0));
      return {
        width: Math.max(100, Math.round(width)),
        height: Math.max(100, Math.round(height)),
        innerCutWidth: Math.max(1, Math.round(cutWidth)),
        innerCutDepth: Math.max(1, Math.round(Math.max(leftInner ?? 0, rightInner ?? 0, height * 0.45))),
        innerCutOffset: Math.max(0, Math.round(leftLeg ?? (width - cutWidth) / 2)),
        source: 'specification' as const,
      };
    }
  }

  return detailSizeFromRows(rows, area, type);
}

function visualSizeFromDrawing(
  drawing: ApprovalDrawingGeometry | undefined,
  dimensions: ApprovalDimensionLabel[],
  rows: ApprovalSpecRow[],
  area: number,
  type: DetailType,
  shape: DetailShape,
) {
  const targetArea = area > 0 ? area * 1_000_000 : 0;
  const drawingAspect = drawing?.width && drawing.height ? drawing.width / drawing.height : 0;
  const drawingAreaFactor = drawing?.width && drawing.height && drawing.area
    ? drawing.area / (drawing.width * drawing.height)
    : 1;
  const pushUnique = (values: number[], value: number) => {
    const rounded = Math.round(value);
    if (!Number.isFinite(rounded) || rounded < 80 || rounded > 8000) return;
    if (!values.some((item) => Math.abs(item - rounded) <= 2)) values.push(rounded);
  };
  const known = dimensions
    .map((dimension) => dimension.value)
    .filter((value) => value >= 80)
    .sort((a, b) => b - a);
  const rowValues = rows.map((row) => row.width).filter((value) => value >= 80);
  const rowCandidate = visualRowSizeCandidate(rows, shape, drawing, area);
  if (rowCandidate) {
    return {
      width: Math.round(rowCandidate.width),
      height: Math.round(rowCandidate.height),
      source: 'specification' as const,
      warnings: [] as string[],
    };
  }
  const unique: number[] = [];
  known.forEach((value) => pushUnique(unique, value));
  rowValues.forEach((value) => pushUnique(unique, value));
  for (let first = 0; first < rowValues.length; first += 1) {
    for (let second = first + 1; second < rowValues.length; second += 1) {
      pushUnique(unique, rowValues[first] + rowValues[second]);
      for (let third = second + 1; third < rowValues.length; third += 1) {
        pushUnique(unique, rowValues[first] + rowValues[second] + rowValues[third]);
      }
    }
  }
  if (targetArea) {
    [...unique].forEach((value) => {
      pushUnique(unique, targetArea / value);
      if (drawingAreaFactor > 0.2 && drawingAreaFactor < 1.1) pushUnique(unique, targetArea / Math.max(1, value * drawingAreaFactor));
    });
  }
  if (unique.length >= 2) {
    if (targetArea && drawingAspect) {
      let best = { width: unique[0], height: unique[1], score: Number.POSITIVE_INFINITY };
      unique.forEach((first) => {
        unique.forEach((second) => {
          if (first === second) return;
          const width = Math.max(first, second);
          const height = Math.min(first, second);
          const visualArea = drawing?.area && drawing.width && drawing.height
            ? drawing.area * (width / drawing.width) * (height / drawing.height)
            : width * height;
          const areaScore = Math.abs(visualArea - targetArea) / targetArea;
          const aspectScore = Math.abs((width / height) - drawingAspect) / Math.max(0.1, drawingAspect) * 0.18;
          const score = areaScore + aspectScore;
          if (score < best.score) best = { width, height, score };
        });
      });
      return {
        width: Math.round(best.width),
        height: Math.round(best.height),
        source: 'specification' as const,
        warnings: best.score > 0.25 ? ['Масштаб схеми підібрано за числовими кандидатами таблиці/площі; перевірте габарити вручну.'] : [] as string[],
      };
    }
    return {
      width: Math.round(unique[0]),
      height: Math.round(unique[1]),
      source: 'specification' as const,
      warnings: [] as string[],
    };
  }
  if (unique.length === 1 && area > 0) {
    return {
      width: Math.round(unique[0]),
      height: Math.max(1, roundToMillimeters((area * 1_000_000) / unique[0], 10)),
      source: 'specification' as const,
      warnings: ['Знайдено тільки один підписаний розмір; другий габарит розраховано з площі виробу.'],
    };
  }
  if (drawing && area > 0 && drawing.width > 0 && drawing.height > 0) {
    const fallback = areaFallbackSizeFromDrawing(drawing, area);
    return {
      width: fallback.width,
      height: fallback.height,
      source: 'area-fallback' as const,
      warnings: ['Не знайдено текстових розмірів біля схеми; контур масштабовано за площею виробу та потребує перевірки.'],
    };
  }
  return {
    ...fallbackSizeFromArea(area, type),
    source: 'area-fallback' as const,
    warnings: ['Не знайдено схеми або підписаних розмірів; розмір визначено приблизно.'],
  };
}

function classifyVisualShape(drawing: ApprovalDrawingGeometry | undefined, rows: ApprovalSpecRow[] = []) {
  if (!drawing?.points.length) return SHAPE_RECT;
  const boundsArea = drawing.width * drawing.height;
  const fillRatio = boundsArea > 0 ? drawing.area / boundsArea : 1;
  const sourceSides = new Set(rows.map((row) => row.side.toUpperCase()));
  if (sourceSides.has('B') && sourceSides.has('E') && !sourceSides.has('F') && !sourceSides.has('G') && !sourceSides.has('H')) return SHAPE_L;
  if (drawing.holes.length || fillRatio < 0.72) return SHAPE_U;
  if (fillRatio < 0.9) return SHAPE_L;
  return SHAPE_RECT;
}

function approvalRowsBySide(rows: ApprovalSpecRow[]) {
  return rows.reduce<Record<string, number>>((result, row) => {
    if (isEdgeRow(row) && !isFoldOrThickening(row) && row.width >= 80 && row.width <= 8000) {
      const side = row.side.toUpperCase();
      result[side] = Math.max(result[side] ?? 0, row.width);
    }
    return result;
  }, {});
}

function exactApprovalContourFromRows(rows: ApprovalSpecRow[], shape: DetailShape, width: number, height: number) {
  const bySide = approvalRowsBySide(rows);
  const w = Math.round(width);
  const h = Math.round(height);
  if (w < 80 || h < 80) return undefined;

  if (shape === SHAPE_RECT) {
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
  }

  if (shape === SHAPE_L && bySide.E && bySide.B) {
    const innerX = Math.min(w - 1, Math.max(1, Math.round(bySide.E)));
    const innerY = Math.min(h - 1, Math.max(1, Math.round(bySide.B)));
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: innerY },
      { x: innerX, y: innerY },
      { x: innerX, y: h },
      { x: 0, y: h },
    ];
  }

  if (shape === SHAPE_L && bySide.E && bySide.F) {
    const innerX = Math.min(w - 1, Math.max(1, Math.round(bySide.E)));
    const innerY = Math.min(h - 1, Math.max(1, Math.round(bySide.F)));
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: innerX, y: h },
      { x: innerX, y: innerY },
      { x: 0, y: innerY },
    ];
  }

  if (shape === SHAPE_U && bySide.C && bySide.D && bySide.E && bySide.F) {
    const rightWidth = Math.round(bySide.C);
    const rightDrop = Math.round(bySide.D);
    const innerWidth = Math.round(bySide.E);
    const leftDrop = Math.round(bySide.F);
    const leftWidth = Math.round(w - innerWidth - rightWidth);
    const innerY = Math.round(h - rightDrop);
    const leftBottomY = Math.round(innerY + leftDrop);
    if (leftWidth > 0 && innerY > 0 && leftBottomY > innerY && leftBottomY <= h && rightWidth > 0 && innerWidth > 0) {
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: w - rightWidth, y: h },
        { x: w - rightWidth, y: innerY },
        { x: leftWidth, y: innerY },
        { x: leftWidth, y: leftBottomY },
        { x: 0, y: leftBottomY },
      ];
    }
  }

  return undefined;
}

function dimensionLabel(side: string, value: number, source = 'drawing image calibration'): ApprovalDimensionLabel | undefined {
  const rounded = Math.round(value);
  if (!/^[A-I]$/u.test(side) || rounded < 80 || rounded > 8000) return undefined;
  return { side, value: rounded, source: `${source}: ${side}=${rounded} мм` };
}

function uniqueDimensionLabels(labels: Array<ApprovalDimensionLabel | undefined>) {
  const result: ApprovalDimensionLabel[] = [];
  const seen = new Set<string>();
  labels.forEach((label) => {
    if (!label) return;
    const key = `${label.side}:${label.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(label);
  });
  return result;
}

function deriveDrawingDimensionsFromContour(
  rows: ApprovalSpecRow[],
  shape: DetailShape,
  width: number,
  height: number,
) {
  const bySide = approvalRowsBySide(rows);
  const w = Math.round(width);
  const h = Math.round(height);
  if (w < 80 || h < 80) return [] as ApprovalDimensionLabel[];

  if (shape === SHAPE_RECT) {
    return uniqueDimensionLabels([
      dimensionLabel('A', w),
      dimensionLabel('C', w),
      dimensionLabel('B', h),
      dimensionLabel('D', h),
    ]);
  }

  if (shape === SHAPE_L && bySide.E && bySide.B) {
    const innerX = Math.round(bySide.E);
    const innerY = Math.round(bySide.B);
    return uniqueDimensionLabels([
      dimensionLabel('A', w),
      dimensionLabel('B', innerY),
      dimensionLabel('C', Math.max(1, w - innerX)),
      dimensionLabel('D', Math.max(1, h - innerY)),
      dimensionLabel('E', innerX),
      dimensionLabel('F', h),
    ]);
  }

  if (shape === SHAPE_L && bySide.E && bySide.F) {
    const innerX = Math.round(bySide.E);
    const leftHeight = Math.round(bySide.F);
    return uniqueDimensionLabels([
      dimensionLabel('A', w),
      dimensionLabel('B', h),
      dimensionLabel('C', Math.max(1, w - innerX)),
      dimensionLabel('D', Math.max(1, h - leftHeight)),
      dimensionLabel('E', innerX),
      dimensionLabel('F', leftHeight),
    ]);
  }

  if (shape === SHAPE_U) {
    const rightWidth = Math.round(bySide.C ?? 0);
    const rightDrop = Math.round(bySide.D ?? 0);
    const innerWidth = Math.round(bySide.E ?? 0);
    const leftInnerDrop = Math.round(bySide.F ?? 0);
    const leftWidth = rightWidth && innerWidth ? Math.max(1, w - innerWidth - rightWidth) : 0;
    const leftHeight = rightDrop && leftInnerDrop ? Math.max(1, h - rightDrop + leftInnerDrop) : 0;
    return uniqueDimensionLabels([
      dimensionLabel('A', w),
      dimensionLabel('B', h),
      dimensionLabel('C', rightWidth),
      dimensionLabel('D', rightDrop),
      dimensionLabel('E', innerWidth),
      dimensionLabel('F', leftInnerDrop),
      dimensionLabel('G', leftWidth),
      dimensionLabel('H', leftHeight),
      dimensionLabel('I', leftInnerDrop),
    ]);
  }

  return [];
}

function visualRowSizeCandidate(
  rows: ApprovalSpecRow[],
  shape: DetailShape,
  drawing: ApprovalDrawingGeometry | undefined,
  area: number,
) {
  if (!rows.length || !drawing?.width || !drawing.height || !drawing.area || area <= 0) return undefined;
  const targetArea = area * 1_000_000;
  const drawingFill = drawing.area / Math.max(1, drawing.width * drawing.height);
  const drawingAspect = drawing.width / drawing.height;
  const values = rows
    .filter((row) => isEdgeRow(row) && !isFoldOrThickening(row))
    .map((row) => row.width)
    .filter((value) => value >= 80 && value <= 8000);
  if (values.length < 2) return undefined;
  const bySide = approvalRowsBySide(rows);
  if (shape === SHAPE_U && bySide.C && bySide.D && bySide.E && bySide.F && !bySide.B) {
    const visualWidth = bySide.C + bySide.D + bySide.E;
    const visualHeight = snapApprovalVisualDimension(targetArea / Math.max(1, visualWidth * drawingFill));
    if (visualWidth >= Math.max(...values) && visualHeight >= 80 && visualHeight <= 8000) {
      return { width: Math.round(visualWidth), height: Math.round(visualHeight) };
    }
  }
  const candidates: Array<{ value: number; terms: number }> = [];
  const push = (value: number, terms = 1) => {
    const rounded = Math.round(value);
    if (!Number.isFinite(rounded) || rounded < 80 || rounded > 8000) return;
    const existing = candidates.find((item) => Math.abs(item.value - rounded) <= 2);
    if (existing) existing.terms = Math.max(existing.terms, terms);
    else candidates.push({ value: rounded, terms });
  };
  values.forEach((value) => push(value));
  for (let first = 0; first < values.length; first += 1) {
    for (let second = first + 1; second < values.length; second += 1) {
      push(values[first] + values[second], 2);
      for (let third = second + 1; third < values.length; third += 1) {
        push(values[first] + values[second] + values[third], 3);
      }
    }
  }

  if (shape === SHAPE_RECT) {
    const unique = [...new Set(values.map((value) => Math.round(value)))].sort((a, b) => b - a);
    if (unique.length >= 2) {
      const [first, second] = unique;
      const firstAspect = first / second;
      const secondAspect = second / first;
      return Math.abs(firstAspect - drawingAspect) <= Math.abs(secondAspect - drawingAspect)
        ? { width: first, height: second }
        : { width: second, height: first };
    }
  }

  const scorePair = (candidate: { width: number; height: number }) => {
    const fill = targetArea / Math.max(1, candidate.width * candidate.height);
    if (fill <= 0.12 || fill > 1.05) return Number.POSITIVE_INFINITY;
    const fillScore = Math.abs(fill - drawingFill);
    const aspectScore = Math.abs(candidate.width / candidate.height - drawingAspect) / Math.max(0.2, drawingAspect);
    return fillScore + aspectScore * 0.02;
  };
  const bestFrom = (entries: typeof candidates) => {
    let best: { width: number; height: number; score: number } | undefined;
    entries.forEach((first) => {
      entries.forEach((second) => {
        if (first.value === second.value) return;
        [
          { width: first.value, height: second.value },
          { width: second.value, height: first.value },
        ].forEach((candidate) => {
          const score = scorePair(candidate);
          if (!Number.isFinite(score)) return;
          if (!best || score < best.score) best = { ...candidate, score };
        });
      });
    });
    return best;
  };

  if (shape === SHAPE_L) {
    const composed = candidates.filter((candidate) => candidate.terms >= 2);
    const best = bestFrom(composed);
    if (best && best.score < 0.22) return best;
  }

  if (shape === SHAPE_U) {
    const composed = candidates.filter((candidate) => candidate.terms >= 2);
    const best = bestFrom(composed.filter((candidate) => candidate.terms >= 3).length ? composed : candidates);
    if (best && best.score < 0.22) return best;
  }

  let best: { width: number; height: number; score: number } | undefined;
  candidates.forEach((first) => {
    candidates.forEach((second) => {
      if (first.value === second.value) return;
      const orientations = [
        { width: first.value, height: second.value },
        { width: second.value, height: first.value },
      ];
      orientations.forEach((candidate) => {
        const score = scorePair(candidate);
        if (!Number.isFinite(score)) return;
        if (!best || score < best.score) best = { ...candidate, score };
      });
    });
  });
  return best;
}

function featuresFromRows(rows: ApprovalSpecRow[], shape: DetailShape) {
  const thickeningSides: string[] = [];
  const foldSides: string[] = [];
  const thickeningSizes: number[] = [];
  const foldSizes: number[] = [];
  const edgeProfiles: EdgeProfileSelection = {};

  rows.forEach((row) => {
    const side = approvalSideToAppSide(row.side, shape);
    const text = `${row.elementType} ${row.profile}`.toLocaleLowerCase('uk-UA');
    if (/підвор|підгин|fold|miter/u.test(text)) {
      foldSides.push(side);
      if (row.height > 0) foldSizes.push(row.height);
      return;
    }
    if (/опуск|потовщ|підклей|thicken/u.test(text)) {
      thickeningSides.push(side);
      if (row.height > 0) thickeningSizes.push(row.height);
      return;
    }
    if (/крайк|кром|фаск|радіус|r2|edge|bullnose|sharknose/u.test(text)) {
      edgeProfiles[side] = inferEdgeProfile(text);
    }
  });

  const thickening: EdgeFeature = {
    enabled: thickeningSides.length > 0,
    size: Math.max(40, Math.round(thickeningSizes[0] ?? 40)),
    sides: [...new Set(thickeningSides)],
  };
  const fold: EdgeFeature = {
    enabled: foldSides.length > 0,
    size: Math.max(100, Math.round(foldSizes[0] ?? 100)),
    sides: [...new Set(foldSides)],
  };
  return { thickening, fold, edgeProfiles };
}

/** Reads textual joint markers when they are available in the document text layer. */
function jointsFromLines(lines: string[], start: number, end: number) {
  const block = lines.slice(start, end).join(' ').toLocaleLowerCase('uk-UA');
  return {
    jointVertical: /стик[^.]{0,40}вертик|вертик[^.]{0,40}стик|vertical[^.]{0,40}joint/iu.test(block),
    jointHorizontal: /стик[^.]{0,40}горизонт|горизонт[^.]{0,40}стик|horizontal[^.]{0,40}joint/iu.test(block),
  };
}

function materialDefaultThickness(material?: MaterialType) {
  const materialIndex = material ? referenceData.materials.indexOf(material) : -1;
  if (materialIndex === 0 || materialIndex === 3 || materialIndex === 4) return 12;
  if (materialIndex === 1 || materialIndex === 2) return 20;
  return 20;
}

/** Infers slab/detail thickness from explicit fields first, then specification edge rows, then material defaults. */
function inferThickness(explicitThickness: number, rows: ApprovalSpecRow[], material?: MaterialType) {
  if (explicitThickness > 0) return explicitThickness;
  const edgeHeights = rows
    .filter((row) => isEdgeRow(row) && !isFoldOrThickening(row))
    .map((row) => row.height)
    .filter((value) => value >= 4 && value <= 60);
  if (edgeHeights.length) {
    const counts = new Map<number, number>();
    edgeHeights.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  }
  return materialDefaultThickness(material);
}

function layoutItems(items: Omit<ApprovalImportItem, 'sourceX' | 'sourceY'>[]): ApprovalImportItem[] {
  const gap = 80;
  const maxRowWidth = 2600;
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  return items.map((item) => {
    if (x > 0 && x + item.width > maxRowWidth) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    const placed = { ...item, sourceX: x, sourceY: y };
    x += item.width + gap;
    rowHeight = Math.max(rowHeight, item.height);
    return placed;
  });
}

function drawingSizeFromDimensionLabels(drawing: ApprovalDrawingGeometry | undefined, dimensions: ApprovalDimensionLabel[]) {
  if (!drawing?.points.length || !dimensions.length || drawing.width <= 0 || drawing.height <= 0) return undefined;
  const values = [...new Set(dimensions.map((dimension) => Math.round(dimension.value)).filter((value) => value >= 80 && value <= 8000))]
    .sort((first, second) => second - first);
  if (!values.length) return undefined;

  const aspect = drawing.width / drawing.height;
  const chooseClosest = (target: number, forbidden?: number) => values
    .filter((value) => value !== forbidden)
    .sort((first, second) => Math.abs(first - target) - Math.abs(second - target))[0];

  if (aspect >= 1) {
    const width = values[0];
    const height = chooseClosest(width / aspect, width);
    if (!height) return undefined;
    return { width, height, source: 'drawing' as const };
  }

  const height = values[0];
  const width = chooseClosest(height * aspect, height);
  if (!width) return undefined;
  return { width, height, source: 'drawing' as const };
}

function drawingSourceImageRegion(drawing: ApprovalDrawingGeometry | undefined) {
  if (!drawing) return undefined;
  return {
    x: drawing.sourceBounds.minX,
    y: drawing.sourceBounds.minY,
    width: drawing.sourceBounds.maxX - drawing.sourceBounds.minX,
    height: drawing.sourceBounds.maxY - drawing.sourceBounds.minY,
  };
}

function drawingRawPreview(drawing: ApprovalDrawingGeometry | undefined) {
  if (!drawing?.sourceImage) return undefined;
  const bounds = drawing.sourceImageBounds ?? drawing.sourceBounds;
  return {
    image: drawing.sourceImage,
    x: 0,
    y: 0,
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY),
  };
}

function drawingForProduct(
  drawings: ApprovalDrawingGeometry[],
  productNumber: number,
  usedIndexes: Set<number>,
) {
  const indexed = drawings
    .map((drawing, index) => ({ drawing, index }))
    .filter((entry) => !usedIndexes.has(entry.index) && entry.drawing.points.length > 0);
  const exact = indexed.find((entry) => entry.drawing.sourceProductNumber === productNumber);
  if (exact) {
    usedIndexes.add(exact.index);
    return exact.drawing;
  }
  return undefined;
}

/** Simplifies traced raster outlines without changing their general geometry. */
function simplifyApprovalPolyline(points: Point[], epsilon: number): Point[] {
  if (points.length <= 3) return points;
  const distanceToSegment = (point: Point, start: Point, end: Point) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    const x = start.x + dx * t;
    const y = start.y + dy * t;
    return Math.hypot(point.x - x, point.y - y);
  };
  let maxDistance = 0;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(points[index], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }
  if (maxDistance <= epsilon) return [points[0], points[points.length - 1]];
  return [
    ...simplifyApprovalPolyline(points.slice(0, splitIndex + 1), epsilon).slice(0, -1),
    ...simplifyApprovalPolyline(points.slice(splitIndex), epsilon),
  ];
}

function polygonArea(points: Point[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    sum += point.x * next.y - next.x * point.y;
  });
  return Math.abs(sum / 2);
}

function signedPolygonArea(points: Point[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    sum += point.x * next.y - next.x * point.y;
  });
  return sum / 2;
}

function orientPolygon(points: Point[], positive: boolean) {
  const area = signedPolygonArea(points);
  if (!area || (positive && area > 0) || (!positive && area < 0)) return points;
  return [...points].reverse();
}

function segmentLength(segment: { start: Point; end: Point }) {
  return Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
}

function buildApprovalSideSegments(points: Point[], shape: DetailShape) {
  if (points.length < 4) return undefined;
  const edges = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const segment = { start: point, end: next };
    return {
      ...segment,
      length: segmentLength(segment),
      midX: (point.x + next.x) / 2,
      midY: (point.y + next.y) / 2,
      horizontal: Math.abs(next.x - point.x) >= Math.abs(next.y - point.y) * 2,
      vertical: Math.abs(next.y - point.y) >= Math.abs(next.x - point.x) * 2,
    };
  }).filter((edge) => edge.length >= 20);
  const horizontal = edges.filter((edge) => edge.horizontal);
  const vertical = edges.filter((edge) => edge.vertical);
  if (!horizontal.length || !vertical.length) return undefined;
  const bounds = points.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x),
    minY: Math.min(result.minY, point.y),
    maxX: Math.max(result.maxX, point.x),
    maxY: Math.max(result.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const pick = (items: typeof edges, score: (item: typeof edges[number]) => number) => (
    [...items].sort((a, b) => score(a) - score(b) || b.length - a.length)[0]
  );
  const top = pick(horizontal, (edge) => edge.midY);
  const bottom = pick(horizontal, (edge) => -edge.midY);
  const left = pick(vertical, (edge) => edge.midX);
  const right = pick(vertical, (edge) => -edge.midX);
  const isSameSegment = (a: typeof edges[number] | undefined, b: typeof edges[number] | undefined) => (
    Boolean(a && b && a.start.x === b.start.x && a.start.y === b.start.y && a.end.x === b.end.x && a.end.y === b.end.y)
  );
  const insideHorizontal = horizontal.filter((edge) => (
    !isSameSegment(edge, top)
    && !isSameSegment(edge, bottom)
    && edge.midY > bounds.minY + 20
    && edge.midY < bounds.maxY - 20
  ));
  const insideVertical = vertical.filter((edge) => (
    !isSameSegment(edge, left)
    && !isSameSegment(edge, right)
    && edge.midX > bounds.minX + 20
    && edge.midX < bounds.maxX - 20
  ));
  const segment = (edge: typeof edges[number] | undefined) => edge ? { start: edge.start, end: edge.end } : undefined;
  const result: Record<string, { start: Point; end: Point }> = {};
  const set = (side: string, edge: typeof edges[number] | undefined) => {
    const value = segment(edge);
    if (value) result[side] = value;
  };

  set('B', top);
  set('C', right);
  set('D', bottom);
  set('A', left);

  if (shape === SHAPE_L) {
    const innerVertical = pick(insideVertical, (edge) => Math.abs(edge.midX - (bounds.minX + bounds.maxX) / 2) - edge.length);
    const innerHorizontal = pick(insideHorizontal, (edge) => Math.abs(edge.midY - (bounds.minY + bounds.maxY) / 2) - edge.length);
    set('A', innerVertical);
    set('E', innerHorizontal);
    set('F', left);
  }

  if (shape === SHAPE_U) {
    const innerVerticals = [...insideVertical].sort((a, b) => a.midX - b.midX);
    const bottomSegments = [...horizontal].sort((a, b) => b.midY - a.midY || a.midX - b.midX);
    const innerBottom = pick(insideHorizontal, (edge) => -edge.length);
    set('A', left);
    set('B', top);
    set('C', right);
    set('H', bottomSegments[0]);
    set('D', bottomSegments[bottomSegments.length - 1]);
    set('G', innerVerticals[0]);
    set('E', innerVerticals[innerVerticals.length - 1]);
    set('F', innerBottom);
  }

  return Object.keys(result).length ? result : undefined;
}

/** Traces the largest closed outline from a product drawing image embedded in the approval PDF. */
function traceApprovalDrawingImage(image: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }): ApprovalDrawingGeometry | undefined {
  const { width, height, data } = image;
  const total = width * height;
  const channels = Math.max(1, Math.round(data.length / total));
  const darkRaw = new Uint8Array(total);
  for (let index = 0; index < total; index += 1) {
    const offset = index * channels;
    const red = data[offset] ?? 255;
    const green = data[offset + 1] ?? red;
    const blue = data[offset + 2] ?? red;
    if (red + green + blue < 420) darkRaw[index] = 1;
  }

  const dark = new Uint8Array(total);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!darkRaw[index]) continue;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
          dark[yy * width + xx] = 1;
        }
      }
    }
  }

  const outside = new Uint8Array(total);
  const queue: number[] = [];
  const pushOutside = (x: number, y: number) => {
    const index = y * width + x;
    if (outside[index] || dark[index]) return;
    outside[index] = 1;
    queue.push(index);
  };
  for (let x = 0; x < width; x += 1) {
    pushOutside(x, 0);
    pushOutside(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    pushOutside(0, y);
    pushOutside(width - 1, y);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) pushOutside(x - 1, y);
    if (x < width - 1) pushOutside(x + 1, y);
    if (y > 0) pushOutside(x, y - 1);
    if (y < height - 1) pushOutside(x, y + 1);
  }

  const labels = new Int32Array(total);
  const components: Array<{ id: number; area: number; minX: number; minY: number; maxX: number; maxY: number }> = [];
  let nextId = 1;
  for (let start = 0; start < total; start += 1) {
    if (dark[start] || outside[start] || labels[start]) continue;
    const id = nextId;
    nextId += 1;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    const stack = [start];
    labels[start] = id;
    while (stack.length) {
      const index = stack.pop() as number;
      const x = index % width;
      const y = Math.floor(index / width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];
      neighbors.forEach((neighbor) => {
        if (neighbor < 0 || labels[neighbor] || dark[neighbor] || outside[neighbor]) return;
        labels[neighbor] = id;
        stack.push(neighbor);
      });
    }
    if (area >= 400) components.push({ id, area, minX, minY, maxX, maxY });
  }

  const largest = components.sort((a, b) => b.area - a.area)[0];
  if (!largest || largest.area < 2_000 || largest.maxX - largest.minX < 20 || largest.maxY - largest.minY < 20) return undefined;

  const traceLoop = (componentId: number) => {
    const edgeMap = new Map<string, Point[]>();
    const key = (x: number, y: number) => `${x},${y}`;
    const addEdge = (start: Point, end: Point) => {
      const edgeKey = key(start.x, start.y);
      edgeMap.set(edgeKey, [...(edgeMap.get(edgeKey) ?? []), end]);
    };
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && labels[y * width + x] === componentId;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!inside(x, y)) continue;
        if (!inside(x, y - 1)) addEdge({ x, y }, { x: x + 1, y });
        if (!inside(x + 1, y)) addEdge({ x: x + 1, y }, { x: x + 1, y: y + 1 });
        if (!inside(x, y + 1)) addEdge({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
        if (!inside(x - 1, y)) addEdge({ x, y: y + 1 }, { x, y });
      }
    }
    const loops: Point[][] = [];
    while (edgeMap.size) {
      const startKey = edgeMap.keys().next().value as string;
      const [startX, startY] = startKey.split(',').map(Number);
      const loop: Point[] = [{ x: startX, y: startY }];
      let currentKey = startKey;
      let guard = 0;
      while (edgeMap.has(currentKey) && guard < width * height * 4) {
        guard += 1;
        const list = edgeMap.get(currentKey) as Point[];
        const next = list.pop() as Point;
        if (!list.length) edgeMap.delete(currentKey);
        loop.push(next);
        currentKey = key(next.x, next.y);
        if (currentKey === startKey) break;
      }
      if (loop.length > 8) loops.push(loop.slice(0, -1));
    }
    return loops.sort((a, b) => b.length - a.length)[0];
  };

  const localLoop = (loop: Point[], bounds: typeof largest) => {
    const reduced = simplifyApprovalPolyline([...loop, loop[0]], 2.5).slice(0, -1);
    return reduced.map((point) => ({
      x: point.x - bounds.minX,
      y: point.y - bounds.minY,
    }));
  };

  const outerLoop = traceLoop(largest.id);
  if (!outerLoop?.length) return undefined;
  const holes = components
    .filter((component) => component.id !== largest.id && component.area >= 300 && component.area < largest.area * 0.55)
    .filter((component) => (
      component.minX > largest.minX
      && component.maxX < largest.maxX
      && component.minY > largest.minY
      && component.maxY < largest.maxY
    ))
    .map((component) => traceLoop(component.id))
    .filter(Boolean)
    .map((loop) => orientPolygon(localLoop(loop as Point[], largest), false));
  const points = orientPolygon(localLoop(outerLoop, largest), true);
  const holeArea = holes.reduce((sum, hole) => sum + polygonArea(hole), 0);
  const tracedWidth = Math.max(1, largest.maxX - largest.minX);
  const tracedHeight = Math.max(1, largest.maxY - largest.minY);

  return {
    points,
    holes,
    width: tracedWidth,
    height: tracedHeight,
    area: Math.max(1, polygonArea(points) - holeArea),
    sourceBounds: {
      minX: largest.minX,
      minY: largest.minY,
      maxX: largest.maxX,
      maxY: largest.maxY,
    },
  };
}

function approvalRasterCropDataUrl(
  image: { width: number; height: number; data: Uint8ClampedArray | Uint8Array },
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
) {
  if (typeof document === 'undefined') return undefined;
  const margin = Math.round(Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.18);
  const crop = {
    minX: Math.max(0, bounds.minX - margin),
    minY: Math.max(0, bounds.minY - margin),
    maxX: Math.min(image.width - 1, bounds.maxX + margin),
    maxY: Math.min(image.height - 1, bounds.maxY + margin),
  };
  const cropWidth = Math.max(1, crop.maxX - crop.minX + 1);
  const cropHeight = Math.max(1, crop.maxY - crop.minY + 1);
  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  const channels = Math.max(1, Math.round(image.data.length / (image.width * image.height)));
  const imageData = context.createImageData(cropWidth, cropHeight);
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const sourceIndex = ((y + crop.minY) * image.width + (x + crop.minX)) * channels;
      const targetIndex = (y * cropWidth + x) * 4;
      const red = image.data[sourceIndex] ?? 255;
      const green = image.data[sourceIndex + 1] ?? red;
      const blue = image.data[sourceIndex + 2] ?? red;
      imageData.data[targetIndex] = red;
      imageData.data[targetIndex + 1] = green;
      imageData.data[targetIndex + 2] = blue;
      imageData.data[targetIndex + 3] = channels >= 4 ? image.data[sourceIndex + 3] ?? 255 : 255;
    }
  }
  context.putImageData(imageData, 0, 0);
  return {
    image: canvas.toDataURL('image/png'),
    bounds: crop,
  };
}

async function approvalRasterFromPdfImageObject(image: unknown): Promise<{ width: number; height: number; data: Uint8ClampedArray | Uint8Array } | undefined> {
  const awaitedImage = image && typeof (image as { then?: unknown }).then === 'function'
    ? await (image as Promise<unknown>)
    : image;
  const direct = awaitedImage as { width?: number; height?: number; data?: Uint8ClampedArray | Uint8Array } | undefined;
  if (direct?.width && direct.height && direct.data) {
    return { width: direct.width, height: direct.height, data: direct.data };
  }

  if (typeof document === 'undefined') return undefined;

  const candidates = [
    awaitedImage,
    (awaitedImage as { bitmap?: unknown } | undefined)?.bitmap,
    (awaitedImage as { image?: unknown } | undefined)?.image,
    (awaitedImage as { canvas?: unknown } | undefined)?.canvas,
  ].filter(Boolean);

  for (const candidateValue of candidates) {
    const candidate = candidateValue && typeof (candidateValue as { then?: unknown }).then === 'function'
      ? await (candidateValue as Promise<unknown>)
      : candidateValue;
    const candidateDirect = candidate as { width?: number; height?: number; data?: Uint8ClampedArray | Uint8Array } | undefined;
    if (candidateDirect?.width && candidateDirect.height && candidateDirect.data) {
      return { width: candidateDirect.width, height: candidateDirect.height, data: candidateDirect.data };
    }
    const source = candidate as CanvasImageSource & {
      width?: number;
      height?: number;
      displayWidth?: number;
      displayHeight?: number;
      codedWidth?: number;
      codedHeight?: number;
    };
    const width = Number(source.width ?? source.displayWidth ?? source.codedWidth);
    const height = Number(source.height ?? source.displayHeight ?? source.codedHeight);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const context = canvas.getContext('2d');
    if (!context) continue;
    try {
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      return {
        width: canvas.width,
        height: canvas.height,
        data: context.getImageData(0, 0, canvas.width, canvas.height).data,
      };
    } catch {
      // Some PDF.js image placeholders are not CanvasImageSource instances in browsers.
    }
  }

  return undefined;
}

/** Scales a traced approval drawing contour while preserving its PDF proportions. */
function scaleApprovalDrawingGeometry(
  drawing: ApprovalDrawingGeometry | undefined,
  width: number,
  height: number,
  area: number,
  shape: DetailShape,
  preferTargetSize = true,
) {
  if (!drawing?.points.length) return undefined;
  const sourcePreviewForScale = (scaleX: number, scaleY: number) => (
    drawing.sourceImage && drawing.sourceImageBounds
      ? {
        image: drawing.sourceImage,
        x: (drawing.sourceImageBounds.minX - drawing.sourceBounds.minX) * scaleX,
        y: (drawing.sourceImageBounds.minY - drawing.sourceBounds.minY) * scaleY,
        width: (drawing.sourceImageBounds.maxX - drawing.sourceImageBounds.minX + 1) * scaleX,
        height: (drawing.sourceImageBounds.maxY - drawing.sourceImageBounds.minY + 1) * scaleY,
      }
      : undefined
  );
  if (preferTargetSize && width >= 80 && height >= 80 && drawing.width > 0 && drawing.height > 0) {
    const scaleX = width / drawing.width;
    const scaleY = height / drawing.height;
    const customPoints = drawing.points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }));
    const customHoles = drawing.holes.map((hole) => hole.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })));
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      customPoints,
      customHoles,
      sideSegments: buildApprovalSideSegments(customPoints, shape),
      sourcePreview: sourcePreviewForScale(scaleX, scaleY),
    };
  }
  const targetArea = area > 0 ? area * 1_000_000 : 0;
  let scale = targetArea > 0 && drawing.area > 0
    ? Math.sqrt(targetArea / drawing.area)
    : 0;
  if (!scale || !Number.isFinite(scale)) {
    const scaleX = width > 0 ? width / drawing.width : 0;
    const scaleY = height > 0 ? height / drawing.height : 0;
    scale = scaleX && scaleY ? Math.min(scaleX, scaleY) : scaleX || scaleY || 1;
  }
  const customPoints = drawing.points.map((point) => ({ x: point.x * scale, y: point.y * scale }));
  const customHoles = drawing.holes.map((hole) => hole.map((point) => ({ x: point.x * scale, y: point.y * scale })));
  return {
    width: Math.max(1, Math.round(drawing.width * scale)),
    height: Math.max(1, Math.round(drawing.height * scale)),
    customPoints,
    customHoles,
    sideSegments: buildApprovalSideSegments(customPoints, shape),
    sourcePreview: sourcePreviewForScale(scale, scale),
  };
}

function geometryArea(points: Point[] | undefined, holes: Point[][] | undefined, width: number, height: number) {
  if (points?.length) {
    return Math.max(0, polygonArea(points) - (holes ?? []).reduce((sum, hole) => sum + polygonArea(hole), 0));
  }
  return Math.max(0, width * height);
}

function validateApprovalItem(input: {
  width: number;
  height: number;
  area: number;
  rows: ApprovalSpecRow[];
  dimensions: ApprovalDimensionLabel[];
  drawingGeometry?: ReturnType<typeof scaleApprovalDrawingGeometry>;
  edgeProfiles: EdgeProfileSelection;
}) {
  const warnings: string[] = [];
  let status: ApprovalImportStatus = 'OK';
  const hasDrawing = Boolean(input.drawingGeometry?.customPoints?.length);
  const hasRows = input.rows.length > 0;
  const hasDimensions = input.dimensions.length > 0;
  if (!hasDrawing && !hasRows && !hasDimensions) {
    warnings.push('Не знайдено креслення, таблиці або текстових розмірів для надійної побудови.');
    status = 'Error';
  }
  if (input.width < 80 && input.height < 80) {
    warnings.push('Підозріло малий габарит: деталь схожа на помилково розпізнаний маленький контур.');
    status = 'Error';
  } else if (input.width < 80 || input.height < 80) {
    warnings.push('Одна зі сторін менша за 80 мм; перевірте, чи це справді вузька деталь, а не допоміжна лінія креслення.');
    status = status === 'Error' ? status : 'Needs review';
  }
  if (!hasDrawing && hasRows && !hasDimensions) {
    warnings.push('Геометрію визначено тільки з таблиці специфікації; перевірте розміри за кресленням.');
    status = status === 'Error' ? status : 'Needs review';
  }
  const declaredArea = input.area > 0 ? input.area * 1_000_000 : 0;
  if (declaredArea) {
    const actualArea = geometryArea(
      input.drawingGeometry?.customPoints,
      input.drawingGeometry?.customHoles,
      input.width,
      input.height,
    );
    const mismatch = Math.abs(actualArea - declaredArea) / declaredArea;
    if (mismatch > 0.35) {
      warnings.push(`Площа геометрії відрізняється від площі в бланку на ${Math.round(mismatch * 100)}%.`);
      status = status === 'Error' ? status : 'Needs review';
    }
  }
  const sideSegments = input.drawingGeometry?.sideSegments;
  Object.keys(input.edgeProfiles).forEach((side) => {
    if (sideSegments && !sideSegments[side]) {
      warnings.push(`Кромка сторони ${side} не має надійно знайденого сегмента на контурі.`);
      status = status === 'Error' ? status : 'Needs review';
    }
  });
  return { warnings, importStatus: status };
}

export function parseApprovalText(text: string, fileName: string, drawings: ApprovalDrawingGeometry[] = []): ApprovalImportPreview {
  const lines = trimInstructionTail(normalizeLines(text));
  const analysisText = lines.join('\n');
  const orderNumber = analysisText.match(/замовлен(?:ня|ню)\s*№\s*([A-ZА-ЯІЇЄҐa-zа-яіїєґ0-9_-]+)/iu)?.[1]
    ?? fileName.match(/Замовлення\s+(.+?)\s+від/iu)?.[1]
    ?? '';
  const customer = lineAfter(lines, /^Контрагент$/iu)
    || fileName.replace(/^.*_\d{2}_\d{2}_\d{4}_/u, '').replace(/\.[^.]+$/u, '').trim();
  const materialLine = lineAfter(lines, /^Матеріал$/iu);
  const decor = lineAfter(lines, /^Декор:?$/iu);
  const material = inferMaterial(materialLine);
  const explicitThickness = parseNumber(lineAfter(lines, /^Товщина/u));

  const products = lines
    .map((line, index) => {
      const match = line.match(/^Виріб\s*№\s*(\d+)\s*(.*)$/iu);
      return match ? {
        index,
        number: Number(match[1]),
        name: cleanProductName(match[2], Number(match[1])),
        area: parseProductArea(match[2]),
      } : undefined;
    })
    .filter(Boolean) as Array<{ index: number; number: number; name: string; area: number }>;
  const specIndexes = lines
    .map((line, index) => {
      const match = line.match(/^Специфікація виробу\s*№\s*(\d+)/iu);
      return match ? { index, number: Number(match[1]) } : undefined;
    })
    .filter(Boolean) as Array<{ index: number; number: number }>;

  const allRows: ApprovalSpecRow[] = [];
  const previewWarnings: string[] = [];
  const debug: string[] = [];
  const usedDrawingIndexes = new Set<number>();
  const items = products.map((product) => {
    const spec = specIndexes.find((item) => item.number === product.number + 1);
    const nextProductIndex = Math.min(...products.filter((item) => item.index > product.index).map((item) => item.index), lines.length);
    const specEndCandidates = spec
      ? [
        ...products.filter((item) => item.index > spec.index).map((item) => item.index),
        ...specIndexes.filter((item) => item.index > spec.index).map((item) => item.index),
        lines.length,
      ]
      : [];
    const rows = spec ? parseSpecRows(lines, spec.index, Math.min(...specEndCandidates)) : [];
    allRows.push(...rows);
    const parsedDimensions = parseDimensionLabels(lines, product.index, spec?.index ?? nextProductIndex);
    const type = inferDetailType(product.name);
    const drawing = drawingForProduct(drawings, product.number, usedDrawingIndexes);
    const missingPdfDrawing = !drawing?.points.length;
    const visualOnly = rows.length === 0;
    const shape = SHAPE_RECT;
    const size = drawingSizeFromDimensionLabels(drawing, parsedDimensions);
    const features = featuresFromRows(rows, shape);
    const joints = jointsFromLines(lines, product.index, spec?.index ?? nextProductIndex);
    const drawingGeometry = size
      ? scaleApprovalDrawingGeometry(drawing, size.width, size.height, product.area, shape, true)
      : undefined;
    const dimensions = parsedDimensions;
    const hasReliableDrawingRegion = Boolean(drawing?.sourcePage && drawing?.sourceBounds);
    const hasFinalContour = Boolean(drawingGeometry?.customPoints?.length);
    const blockedReason = !hasReliableDrawingRegion
      ? 'No product drawing region was matched to this product.'
      : !dimensions.length
      ? 'No drawing dimension labels were extracted for this product.'
      : !hasFinalContour
      ? 'No real contour was extracted from the product drawing.'
      : null;
    const drawingExtractionFailed = Boolean(blockedReason);
    const geometrySource: ApprovalGeometrySource = hasFinalContour ? 'image-contour' : 'none';
    const shapeMode: ApprovalShapeMode = hasFinalContour ? 'customContour' : 'none';
    const dimensionsSource: ApprovalDimensionsSource = dimensions.length
      ? 'drawing-labels'
      : 'none';
    const itemWidth = drawingGeometry?.width ?? 0;
    const itemHeight = drawingGeometry?.height ?? 0;
    const validation = validateApprovalItem({
      width: itemWidth,
      height: itemHeight,
      area: product.area,
      rows,
      dimensions,
      drawingGeometry,
      edgeProfiles: features.edgeProfiles,
    });
    const visualWarnings = visualOnly
      ? [
        'Немає таблиці специфікації, імпортовано геометрію зі схеми, кромки не задані.',
        ...(!drawingGeometry ? ['Не знайдено надійного візуального контуру схеми; фальшива геометрія не буде вважатися надійною.'] : []),
      ]
      : [];
    const itemWarnings = [
      ...(drawingExtractionFailed ? [`Geometry not extracted. ${blockedReason}`] : []),
      ...(missingPdfDrawing ? ['Geometry extraction failed. No fallback shape was created.'] : []),
      ...visualWarnings,
      ...validation.warnings,
    ];
    const importStatus: ApprovalImportStatus = drawingExtractionFailed
      ? 'Error'
      : visualOnly && !drawingGeometry
      ? 'Error'
      : missingPdfDrawing
      ? 'Error'
      : validation.importStatus;
    if (importStatus !== 'OK') previewWarnings.push(`${product.name}: ${itemWarnings.join(' ')}`);
    debug.push(JSON.stringify({
      product: product.number,
      name: product.name,
      dimensions,
      rows: rows.length,
      visualOnly,
      size,
      drawing: drawingGeometry ? {
        width: drawingGeometry.width,
        height: drawingGeometry.height,
        points: drawingGeometry.customPoints.length,
        holes: drawingGeometry.customHoles.length,
      } : undefined,
      warnings: itemWarnings,
    }));
    return {
      id: `approval_${product.number}`,
      sourceProductNumber: product.number,
      name: product.name,
      type,
      shape,
      width: itemWidth,
      height: itemHeight,
      innerHorizontal: undefined,
      innerVertical: undefined,
      innerCutWidth: undefined,
      innerCutDepth: undefined,
      innerCutOffset: undefined,
      ...drawingGeometry,
      sourcePreview: drawingGeometry?.sourcePreview ?? drawingRawPreview(drawing),
      area: product.area || undefined,
      quantity: 1,
      sizeSource: drawingGeometry ? 'drawing' as const : 'none' as const,
      pipelineVersion: APPROVAL_IMPORT_PIPELINE_VERSION,
      geometrySource,
      shapeMode,
      dimensionsSource,
      specSource: rows.length ? 'table' as const : 'none' as const,
      dimensions,
      warnings: itemWarnings,
      importStatus,
      debug: {
        sourceSize: size ?? { width: 0, height: 0, source: 'none' as const },
        drawing: drawing ? {
          width: drawing.width,
          height: drawing.height,
          area: drawing.area,
        } : undefined,
        sourcePage: drawing?.sourcePage,
        sourceImageRegion: drawingSourceImageRegion(drawing),
        mappedSides: drawingGeometry?.sideSegments ? Object.keys(drawingGeometry.sideSegments) : [],
      },
      rows,
      ...joints,
      ...features,
    };
  });
  const thickness = inferThickness(explicitThickness, allRows, material);
  const laidOutItems = layoutItems(items);
  const debugDump: ApprovalImportDebugDump = {
    pipelineVersion: APPROVAL_IMPORT_PIPELINE_VERSION,
    approvalImportBuildId: APPROVAL_IMPORT_BUILD_ID,
    sourceFileName: fileName,
    orderNumber: orderNumber || null,
    customer: customer || null,
    products: laidOutItems.map((item) => ({
      productNumber: item.sourceProductNumber,
      productName: item.name,
      sourcePage: item.debug.sourcePage ?? null,
      sourceImageRegion: item.debug.sourceImageRegion
        ? {
          x: item.debug.sourceImageRegion.x,
          y: item.debug.sourceImageRegion.y,
          width: item.debug.sourceImageRegion.width,
          height: item.debug.sourceImageRegion.height,
        }
        : null,
      detectedDimensions: item.dimensions.map((dimension) => ({
        label: dimension.side,
        valueMm: dimension.value,
        rawText: dimension.source,
      })),
      detectedSpecificationRows: item.rows.map((row) => ({
        side: row.side,
        type: row.elementType,
        height: row.height,
        width: row.width,
        form: row.profile,
      })),
      detectedGeometry: {
        source: item.geometrySource,
        outerContourPointsMm: item.customPoints ?? [],
        holesMm: item.customHoles ?? [],
        jointsMm: [],
        boundingBoxMm: { width: item.width, height: item.height },
      },
      finalDetail: {
        id: item.id,
        name: item.name,
        kind: item.type,
        shapeMode: item.shapeMode,
        widthMm: item.width,
        heightMm: item.height,
        contourPoints: item.customPoints ?? [],
        holes: item.customHoles ?? [],
        joints: [],
      },
      validation: {
        status: item.importStatus,
        warnings: item.warnings,
      },
      dimensionsSource: item.dimensionsSource,
      shapeMode: item.shapeMode,
      contourPointsCount: item.customPoints?.length ?? 0,
      finalImportAllowed: item.importStatus !== 'Error'
        && item.geometrySource !== 'none'
        && item.shapeMode === 'customContour'
        && Boolean(item.customPoints?.length)
        && item.dimensions.length > 0
        && Boolean(item.debug.sourcePage)
        && Boolean(item.debug.sourceImageRegion),
      blockedReason: item.importStatus === 'Error'
        ? item.warnings.find((warning) => warning.includes('Geometry not extracted')) ?? item.warnings[0] ?? 'Import blocked'
        : null,
    })),
  };

  return {
    pipelineVersion: APPROVAL_IMPORT_PIPELINE_VERSION,
    approvalImportBuildId: APPROVAL_IMPORT_BUILD_ID,
    fileName,
    orderNumber,
    customer,
    material,
    thickness,
    decor,
    rawText: analysisText,
    warnings: previewWarnings,
    debug,
    debugDump,
    items: laidOutItems,
  };
}

async function extractPdfText(file: File) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join('\n'));
  }
  return pages.join('\n');
}

function productNumbersFromPageText(pageText: string) {
  const numbers: number[] = [];
  const pattern = /(?:Виріб|Р’РёСЂС–Р±)\s*(?:№|в„–)\s*(\d+)/giu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(pageText))) {
    const number = Number(match[1]);
    if (Number.isFinite(number) && !numbers.includes(number)) numbers.push(number);
  }
  return numbers;
}

/** Reads PDF text and product drawing images; small edge-profile images are intentionally ignored. */
async function extractPdfData(file: File) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];
  const drawings: ApprovalDrawingGeometry[] = [];
  const diagnostics = {
    fileName: file.name,
    pageCount: pdf.numPages,
    imageOpCount: 0,
    largeImageOpCount: 0,
    rasterCount: 0,
    traceCount: 0,
    imageSamples: [] as Array<Record<string, unknown>>,
  };
  const ops = pdfjsLib.OPS as unknown as Record<string, number | undefined>;
  const imageOps = new Set([
    ops.paintImageXObject,
    ops.paintJpegXObject,
    ops.paintInlineImageXObject,
  ].filter((value): value is number => typeof value === 'number'));
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join('\n');
    const pageProductNumbers = productNumbersFromPageText(pageText);
    let pageDrawingIndex = 0;
    pages.push(pageText);
    const operators = await page.getOperatorList();
    for (let index = 0; index < operators.fnArray.length; index += 1) {
      if (!imageOps.has(operators.fnArray[index])) continue;
      diagnostics.imageOpCount += 1;
      const [imageId, imageWidth, imageHeight] = operators.argsArray[index] ?? [];
      const hintedWidth = Number(imageWidth);
      const hintedHeight = Number(imageHeight);
      if (
        Number.isFinite(hintedWidth)
        && Number.isFinite(hintedHeight)
        && hintedWidth > 0
        && hintedHeight > 0
        && (hintedWidth < 700 || hintedHeight < 280)
      ) {
        continue;
      }
      const pageObjects = (page as unknown as { objs?: { get: (id: string, callback?: (value: unknown) => void) => unknown } }).objs;
      const image = typeof imageId === 'string' && pageObjects
        ? await new Promise<unknown>((resolve) => {
          try {
            pageObjects.get(imageId, resolve);
          } catch {
            resolve(undefined);
          }
        })
        : imageId;
      if (diagnostics.imageSamples.length < 6) {
        const sample = image as Record<string, unknown> | undefined;
        const bitmapSample = sample?.bitmap as Record<string, unknown> | undefined;
        diagnostics.imageSamples.push({
          pageNumber,
          op: operators.fnArray[index],
          idType: typeof imageId,
          ctor: image && typeof image === 'object' ? (image as { constructor?: { name?: string } }).constructor?.name : undefined,
          tag: Object.prototype.toString.call(image),
          keys: sample && typeof sample === 'object' ? Object.keys(sample).slice(0, 12) : [],
          width: sample?.width,
          height: sample?.height,
          hasData: Boolean(sample?.data),
          hasBitmap: Boolean(sample?.bitmap),
          hasImage: Boolean(sample?.image),
          hasCanvas: Boolean(sample?.canvas),
          bitmapCtor: bitmapSample && typeof bitmapSample === 'object' ? (bitmapSample as { constructor?: { name?: string } }).constructor?.name : undefined,
          bitmapTag: Object.prototype.toString.call(sample?.bitmap),
          bitmapKeys: bitmapSample && typeof bitmapSample === 'object' ? Object.keys(bitmapSample).slice(0, 8) : [],
          bitmapWidth: bitmapSample?.width,
          bitmapHeight: bitmapSample?.height,
        });
      }
      const raster = await approvalRasterFromPdfImageObject(image);
      if (!raster?.width || !raster.height || !raster.data) continue;
      if (raster.width < 700 || raster.height < 280) continue;
      diagnostics.largeImageOpCount += 1;
      diagnostics.rasterCount += 1;
      const geometry = traceApprovalDrawingImage({ width: raster.width, height: raster.height, data: raster.data });
      if (geometry) {
        diagnostics.traceCount += 1;
        geometry.sourcePage = pageNumber;
        geometry.sourceProductNumber = pageProductNumbers.length === 1
          ? pageProductNumbers[0]
          : pageProductNumbers[pageDrawingIndex];
        pageDrawingIndex += 1;
        const preview = approvalRasterCropDataUrl({ width: raster.width, height: raster.height, data: raster.data }, geometry.sourceBounds);
        if (preview) {
          geometry.sourceImage = preview.image;
          geometry.sourceImageBounds = preview.bounds;
        }
        drawings.push(geometry);
      }
    }
  }
  console.warn('[APPROVAL_IMPORT_V2_PDF_DATA]', {
    ...diagnostics,
    drawingCount: drawings.length,
  });
  return { text: pages.join('\n'), drawings, diagnostics };
}

async function extractDocxText(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) return '';
  return documentXml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function extractXlsxText(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return workbook.SheetNames.map((sheetName) => {
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName], { header: 1, raw: false });
    return rows.map((row) => row.filter(Boolean).join('\n')).join('\n');
  }).join('\n');
}

export async function parseApprovalFile(file: File): Promise<ApprovalImportPreview> {
  const lower = file.name.toLocaleLowerCase();
  if (lower.endsWith('.pdf')) {
    return importApprovalFormPdf(file);
  }
  const text = lower.endsWith('.docx')
      ? await extractDocxText(file)
      : lower.endsWith('.xlsx') || lower.endsWith('.xls')
        ? await extractXlsxText(file)
        : await file.text();
  return parseApprovalText(text, file.name);
}

export async function importApprovalFormPdf(file: File): Promise<ApprovalImportPreview> {
  console.warn('[APPROVAL_IMPORT_V2_REACHED]', {
    fileName: file.name,
    timestamp: new Date().toISOString(),
  });
  const { text, drawings, diagnostics } = await extractPdfData(file);
  const preview = parseApprovalText(text, file.name, drawings);
  if (preview.pipelineVersion !== APPROVAL_IMPORT_PIPELINE_VERSION) {
    throw new Error('OLD_APPROVAL_IMPORT_PIPELINE_USED');
  }
  const extractionDebug = JSON.stringify({ pdfExtraction: { ...diagnostics, drawingCount: drawings.length } });
  return {
    ...preview,
    warnings: drawings.length
      ? preview.warnings
      : [
        `PDF drawing extraction found 0 drawing images (${diagnostics.imageOpCount} image ops, ${diagnostics.rasterCount} raster images). ${JSON.stringify(diagnostics.imageSamples[0] ?? {})}`,
        ...preview.warnings,
      ],
    debug: [extractionDebug, ...preview.debug],
  };
}
