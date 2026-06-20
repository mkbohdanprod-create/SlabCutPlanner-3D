import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as XLSX from 'xlsx';
import { referenceData } from '../domain/defaults';
// verbatimModuleSyntax: true (GitHub tsconfig) — типи МАЮТЬ імпортуватись через `import type`,
// інакше Vite/HMR падає білим екраном (SyntaxError), хоч tsc у старій конфізі мовчав.
import type { DetailShape, DetailType, EdgeFeature, EdgeProfileSelection, EdgeProfileType, MaterialType, Point } from '../domain/types';

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
export const APPROVAL_IMPORT_BUILD_ID = 'approval-v2-20260617-reviewable-drawing-geometry' as const;

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
  confidence?: number;
  sourceBox?: { x: number; y: number; width: number; height: number };
};

export type ApprovalImportStatus = 'OK' | 'Needs review' | 'Error';
export type ApprovalGeometrySource = 'pdf-vector' | 'image-contour' | 'spec-generated' | 'none';
export type ApprovalShapeMode = 'customContour' | 'rectangle' | 'none';
export type ApprovalDimensionsSource =
  | 'drawing-labels'
  | 'drawing-ocr'
  | 'drawing-labels+drawing-ocr'
  | 'drawing-labels+spec-table'
  | 'drawing-ocr+spec-table'
  | 'drawing-labels+drawing-ocr+spec-table'
  | 'spec-table'
  | 'none';

export type ApprovalImportJoint = {
  id: string;
  type: 'vertical' | 'horizontal' | 'diagonal45' | 'pointToPoint';
  start: Point;
  end: Point;
  source: 'detected' | 'manual';
};

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
  joints?: ApprovalImportJoint[];
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
    sourceSize: { width: number; height: number; source: 'drawing' | 'specification' | 'area-fallback' | 'none' };
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
    detectedDimensions: Array<{
      label: string;
      valueMm: number;
      rawText: string;
      confidence?: number;
      sourceBox?: { x: number; y: number; width: number; height: number };
    }>;
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
  jointLines?: ApprovalImportJoint[];
  width: number;
  height: number;
  area: number;
  sourcePage?: number;
  sourceProductNumber?: number;
  sourcePageTopRatio?: number;
  sourceBounds: { minX: number; minY: number; maxX: number; maxY: number };
  sourceImage?: string;
  sourceImageBounds?: { minX: number; minY: number; maxX: number; maxY: number };
  sourceDimensions?: ApprovalDimensionLabel[];
  sourceDimensionsOcrStatus?: 'skipped-text-layer' | 'ok' | 'no-match' | 'error';
  sourceDimensionsOcrText?: string;
  sourceDimensionsOcrError?: string;
};

type ApprovalProductAnchor = {
  number: number;
  pageNumber: number;
  topRatio: number;
  globalTop: number;
};

type ApprovalPositionedTextItem = {
  text: string;
  pageNumber: number;
  rasterX: number;
  rasterY: number;
  rasterWidth: number;
  rasterHeight: number;
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
    .replace(/\u00a0/g, '')
    .replace(/\s+/g, '')
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

function approvalSideToAppSide(side: string, _shape: DetailShape) {
  const normalized = side.toUpperCase();
  return normalized;
}

function approvalSpecRowText(row: ApprovalSpecRow) {
  return `${row.elementType} ${row.profile}`.toLocaleLowerCase('uk-UA');
}

function isApprovalFoldRow(row: ApprovalSpecRow) {
  return /підвор|підгин|fold|miter/u.test(approvalSpecRowText(row));
}

function isApprovalThickeningRow(row: ApprovalSpecRow) {
  return /опуск|потовщ|підклей|thicken|drop/u.test(approvalSpecRowText(row));
}

function isApprovalLegRow(row: ApprovalSpecRow) {
  return /нога|опор|leg|support/u.test(approvalSpecRowText(row));
}

function isApprovalEdgeRow(row: ApprovalSpecRow) {
  return /крайк|кром|фаск|радіус|r2|edge|bullnose|sharknose/u.test(approvalSpecRowText(row));
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
  return isApprovalFoldRow(row) || isApprovalThickeningRow(row);
}

function isEdgeRow(row: ApprovalSpecRow) {
  return isApprovalEdgeRow(row);
}

function isWallPanelRow(row: ApprovalSpecRow) {
  return /стінова\s+панель|РЎС‚С–РЅРѕРІР°\s+РїР°РЅРµР»СЊ|wall\s*panel/iu.test(`${row.elementType} ${row.profile}`);
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
    .replace('\u041d', 'H')
    .replace('\u0406', 'I')
    .replace('\u0420\u0452', 'A')
    .replace('\u0420\u2019', 'B')
    .replace('\u0420\u040E', 'C')
    .replace('\u0420\u2022', 'E')
    .replace('\u0420\u2020', 'I');
}

const APPROVAL_DIMENSION_LABEL_PATTERN_SOURCE = String.raw`(?:^|[^\p{L}\d])(A|B|C|D|E|F|G|H|I|\u0410|\u0412|\u0421|\u0415|\u041d|\u0406|\u0420\u0452|\u0420\u2019|\u0420\u040E|\u0420\u2022|\u0420\u2020)\s*=?\s*([0-9][0-9\s\u00a0]{1,8}(?:[,.]\d+)?)\s*(?:мм|\u0420\u0458\u0420\u0458|mm)?(?:$|[^\p{L}\d])`;

function parseDimensionLabelSampleEntries(
  samples: Array<{
    text: string;
    sourcePrefix?: string;
    confidence?: number;
    sourceBox?: { x: number; y: number; width: number; height: number };
  }>,
): ApprovalDimensionLabel[] {
  const dimensions: ApprovalDimensionLabel[] = [];
  const seen = new Set<string>();
  const labelPattern = new RegExp(APPROVAL_DIMENSION_LABEL_PATTERN_SOURCE, 'giu');
  samples.forEach((sample) => {
    const line = sample.text;
    let match: RegExpExecArray | null;
    labelPattern.lastIndex = 0;
    while ((match = labelPattern.exec(line))) {
      const side = normalizeSourceSide(match[1]);
      const value = parseNumber(match[2]);
      if (!/^[A-I]$/u.test(side) || value < 80) continue;
      const raw = (match[0] || line).trim();
      const key = `${side}:${value}:${raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dimensions.push({
        side,
        value,
        source: sample.sourcePrefix ? `${sample.sourcePrefix}: ${raw}` : line,
        confidence: sample.confidence,
        sourceBox: sample.sourceBox,
      });
    }
  });
  return dimensions;
}

function parseDimensionLabelSamples(samples: string[], sourcePrefix = ''): ApprovalDimensionLabel[] {
  return parseDimensionLabelSampleEntries(samples.map((text) => ({ text, sourcePrefix })));
}

function parseDimensionLabels(lines: string[], start: number, end: number): ApprovalDimensionLabel[] {
  return parseDimensionLabelSamples(lines.slice(start, end));
}

function uniqueDimensionLabelsBySide(labels: Array<ApprovalDimensionLabel | undefined>) {
  const result: ApprovalDimensionLabel[] = [];
  const seen = new Set<string>();
  labels.forEach((label) => {
    if (!label) return;
    const side = normalizeSourceSide(label.side);
    if (!/^[A-I]$/u.test(side) || seen.has(side)) return;
    seen.add(side);
    result.push({ ...label, side });
  });
  return result;
}

function positionedTextItemsForRaster(
  items: Array<{ str?: string; transform?: unknown; width?: number; height?: number }>,
  pageNumber: number,
  viewport: { width: number; height: number },
  raster: { width: number; height: number },
): ApprovalPositionedTextItem[] {
  return items
    .map((item) => {
      const text = normalizeText(item.str ?? '');
      const transform = Array.isArray(item.transform) ? item.transform : [];
      const x = Number(transform[4]);
      const y = Number(transform[5]);
      if (!text || !Number.isFinite(x) || !Number.isFinite(y) || viewport.width <= 0 || viewport.height <= 0) return undefined;
      const itemWidth = Number(item.width) || Math.max(1, text.length * 4);
      const itemHeight = Number(item.height) || Math.abs(Number(transform[3])) || 8;
      const top = viewport.height - y;
      return {
        text,
        pageNumber,
        rasterX: (x / viewport.width) * raster.width,
        rasterY: (top / viewport.height) * raster.height,
        rasterWidth: Math.max(1, (itemWidth / viewport.width) * raster.width),
        rasterHeight: Math.max(1, (itemHeight / viewport.height) * raster.height),
      };
    })
    .filter(Boolean) as ApprovalPositionedTextItem[];
}

function extractDimensionsNearDrawingText(
  items: ApprovalPositionedTextItem[],
  drawing: ApprovalDrawingGeometry,
): ApprovalDimensionLabel[] {
  if (!items.length) return [];
  const width = drawing.sourceBounds.maxX - drawing.sourceBounds.minX;
  const height = drawing.sourceBounds.maxY - drawing.sourceBounds.minY;
  const margin = Math.max(80, Math.min(420, Math.max(width, height) * 0.28));
  const nearby = items
    .filter((item) => (
      item.rasterX + item.rasterWidth >= drawing.sourceBounds.minX - margin
      && item.rasterX <= drawing.sourceBounds.maxX + margin
      && item.rasterY + item.rasterHeight >= drawing.sourceBounds.minY - margin
      && item.rasterY <= drawing.sourceBounds.maxY + margin
    ))
    .sort((first, second) => (
      (first.rasterY + first.rasterHeight / 2) - (second.rasterY + second.rasterHeight / 2)
      || first.rasterX - second.rasterX
    ));
  if (!nearby.length) return [];

  const rowTolerance = Math.max(10, Math.min(28, Math.max(...nearby.map((item) => item.rasterHeight)) * 1.6));
  const rows: ApprovalPositionedTextItem[][] = [];
  nearby.forEach((item) => {
    const centerY = item.rasterY + item.rasterHeight / 2;
    const row = rows.find((entry) => {
      const rowCenter = entry.reduce((sum, rowItem) => sum + rowItem.rasterY + rowItem.rasterHeight / 2, 0) / entry.length;
      return Math.abs(rowCenter - centerY) <= rowTolerance;
    });
    if (row) row.push(item);
    else rows.push([item]);
  });

  const samples: string[] = [];
  rows.forEach((row) => {
    const texts = row.sort((first, second) => first.rasterX - second.rasterX).map((item) => item.text).filter(Boolean);
    if (!texts.length) return;
    samples.push(texts.join(' '), texts.join(''));
    for (let start = 0; start < texts.length; start += 1) {
      for (let end = start + 1; end <= Math.min(texts.length, start + 5); end += 1) {
        const window = texts.slice(start, end);
        samples.push(window.join(' '), window.join(''));
      }
    }
  });

  return uniqueDimensionLabelsBySide(parseDimensionLabelSamples(samples, 'pdf drawing text'));
}

const APPROVAL_OCR_LANG_PATH = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int';
const APPROVAL_OCR_SCALE = 2;

type ApprovalOcrWorker = {
  setParameters: (params: Record<string, unknown>) => Promise<unknown>;
  recognize: (image: string, options?: Record<string, unknown>, output?: Record<string, boolean>) => Promise<{ data?: unknown }>;
  terminate: () => Promise<unknown>;
};

let approvalOcrWorkerPromise: Promise<ApprovalOcrWorker> | undefined;

async function approvalOcrWorker() {
  if (!approvalOcrWorkerPromise) {
    approvalOcrWorkerPromise = (async () => {
      console.warn('[APPROVAL_DEBUG] Starting OCR Worker initialization...');
      const tesseract = await import('tesseract.js');
      console.warn('[APPROVAL_DEBUG] tesseract.js imported');
      const worker = await tesseract.createWorker('eng', tesseract.OEM.LSTM_ONLY, {
        langPath: APPROVAL_OCR_LANG_PATH,
        cacheMethod: 'write',
        logger: () => {},
      }) as ApprovalOcrWorker;
      await worker.setParameters({
        tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789=.,- ',
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      console.warn('[APPROVAL_DEBUG] OCR Worker ready');
      return worker;
    })().catch((error) => {
      console.error('[APPROVAL_DEBUG] OCR Worker failed', error);
      approvalOcrWorkerPromise = undefined;
      throw error;
    });
  }
  return approvalOcrWorkerPromise;
}

function hasHorizontalAndVerticalDimensionLabels(dimensions: ApprovalDimensionLabel[]) {
  const orientations = new Set(dimensions.map((dimension) => sourceSideOrientation(dimension.side)).filter(Boolean));
  return orientations.has('horizontal') && orientations.has('vertical');
}

function shouldRunDrawingDimensionOcr(dimensions: ApprovalDimensionLabel[]) {
  return dimensions.length < 2 || !hasHorizontalAndVerticalDimensionLabels(dimensions);
}

function ocrLineEntriesFromPageData(
  data: unknown,
  cropBounds: { minX: number; minY: number; maxX: number; maxY: number },
): Array<{
  text: string;
  sourcePrefix: string;
  confidence?: number;
  sourceBox?: { x: number; y: number; width: number; height: number };
}> {
  const entries: Array<{
    text: string;
    sourcePrefix: string;
    confidence?: number;
    sourceBox?: { x: number; y: number; width: number; height: number };
  }> = [];
  const page = data as {
    text?: string;
    blocks?: Array<{
      paragraphs?: Array<{
        lines?: Array<{
          text?: string;
          confidence?: number;
          bbox?: { x0: number; y0: number; x1: number; y1: number };
          words?: Array<{
            text?: string;
            confidence?: number;
            bbox?: { x0: number; y0: number; x1: number; y1: number };
          }>;
        }>;
      }>;
    }> | null;
  };

  const sourceBoxFromBbox = (bbox?: { x0: number; y0: number; x1: number; y1: number }) => {
    if (!bbox) return undefined;
    return {
      x: cropBounds.minX + bbox.x0 / APPROVAL_OCR_SCALE,
      y: cropBounds.minY + bbox.y0 / APPROVAL_OCR_SCALE,
      width: Math.max(1, (bbox.x1 - bbox.x0) / APPROVAL_OCR_SCALE),
      height: Math.max(1, (bbox.y1 - bbox.y0) / APPROVAL_OCR_SCALE),
    };
  };
  const unionBox = (boxes: Array<{ x0: number; y0: number; x1: number; y1: number } | undefined>) => {
    const valid = boxes.filter(Boolean) as Array<{ x0: number; y0: number; x1: number; y1: number }>;
    if (!valid.length) return undefined;
    return {
      x0: Math.min(...valid.map((box) => box.x0)),
      y0: Math.min(...valid.map((box) => box.y0)),
      x1: Math.max(...valid.map((box) => box.x1)),
      y1: Math.max(...valid.map((box) => box.y1)),
    };
  };
  const pushEntry = (
    text: string,
    confidence?: number,
    bbox?: { x0: number; y0: number; x1: number; y1: number },
  ) => {
    const normalized = normalizeText(text);
    if (!normalized) return;
    entries.push({
      text: normalized,
      sourcePrefix: 'drawing-ocr',
      confidence,
      sourceBox: sourceBoxFromBbox(bbox),
    });
  };

  if (page.text) {
    page.text.split(/\n+/).forEach((line) => pushEntry(line));
  }
  page.blocks?.forEach((block) => {
    block.paragraphs?.forEach((paragraph) => {
      paragraph.lines?.forEach((line) => {
        pushEntry(line.text ?? '', line.confidence, line.bbox);
        const words = (line.words ?? []).filter((word) => normalizeText(word.text ?? ''));
        if (!words.length) return;
        const texts = words.map((word) => normalizeText(word.text ?? ''));
        pushEntry(texts.join(' '), line.confidence, unionBox(words.map((word) => word.bbox)));
        pushEntry(texts.join(''), line.confidence, unionBox(words.map((word) => word.bbox)));
        for (let start = 0; start < texts.length; start += 1) {
          for (let end = start + 1; end <= Math.min(texts.length, start + 5); end += 1) {
            const slice = words.slice(start, end);
            const window = slice.map((word) => normalizeText(word.text ?? ''));
            pushEntry(window.join(' '), line.confidence, unionBox(slice.map((word) => word.bbox)));
            pushEntry(window.join(''), line.confidence, unionBox(slice.map((word) => word.bbox)));
          }
        }
      });
    });
  });

  return entries;
}

async function extractDimensionsNearDrawingOcr(
  image: { width: number; height: number; data: Uint8ClampedArray | Uint8Array },
  drawing: ApprovalDrawingGeometry,
  existingDimensions: ApprovalDimensionLabel[],
): Promise<{
  dimensions: ApprovalDimensionLabel[];
  status: ApprovalDrawingGeometry['sourceDimensionsOcrStatus'];
  text?: string;
  error?: string;
}> {
  if (!shouldRunDrawingDimensionOcr(existingDimensions)) {
    return { dimensions: [], status: 'skipped-text-layer' };
  }
  const crop = approvalRasterCropDataUrl(image, drawing.sourceBounds, {
    marginRatio: 0.36,
    preprocessForOcr: true,
    scale: APPROVAL_OCR_SCALE,
  });
  if (!crop) {
    return { dimensions: [], status: 'error', error: 'Drawing OCR crop could not be created.' };
  }

  try {
    console.warn(`[APPROVAL_DEBUG] Running OCR for crop ${crop.bounds.width}x${crop.bounds.height}`);
    const worker = await approvalOcrWorker();
    console.warn(`[APPROVAL_DEBUG] Worker retrieved, recognizing...`);
    const result = await worker.recognize(crop.image, {}, { text: true, blocks: true });
    console.warn(`[APPROVAL_DEBUG] OCR finished for crop`);
    const data = result?.data;
    const entries = ocrLineEntriesFromPageData(data, crop.bounds);
    const dimensions = uniqueDimensionLabelsBySide(parseDimensionLabelSampleEntries(entries));
    const text = (data as { text?: unknown } | undefined)?.text;
    return {
      dimensions,
      status: dimensions.length ? 'ok' : 'no-match',
      text: typeof text === 'string' ? text : undefined,
    };
  } catch (error) {
    return {
      dimensions: [],
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

function fallbackSizeFromArea(area: number, type: DetailType) {
  return { width: 0, height: 0 };
}

/** Chooses real side lengths from specification rows. If no lengths, returns 0. */
function detailSizeFromRows(rows: ApprovalSpecRow[], area: number, type: DetailType) {
  const lengths = rows
    .map((row) => row.width)
    .filter((value) => value >= 80)
    .sort((a, b) => b - a);
  const unique = lengths.filter((value, index) => index === 0 || Math.abs(value - lengths[index - 1]) > 2);
  
  if (unique.length >= 2) {
    return {
      width: Math.max(100, Math.round(unique[0])),
      height: Math.max(100, Math.round(unique[1])),
      source: 'specification' as const,
    };
  }

  if (unique.length === 1) {
    return {
      width: Math.max(100, Math.round(unique[0])),
      height: 0,
      source: 'specification' as const,
    };
  }

  return { width: 0, height: 0, source: 'none' as const };
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

  if (shape === SHAPE_CIRCLE) {
    const diameter = Math.max(lengths.A ?? 0, lengths.B ?? 0, lengths.C ?? 0, lengths.D ?? 0);
    return { width: Math.round(diameter), height: Math.round(diameter), source: diameter > 0 ? 'specification' as const : 'none' as const };
  }

  if (shape === SHAPE_ELLIPSE) {
    const known = Object.values(lengths).filter((value) => value >= 80).sort((a, b) => b - a);
    if (known.length >= 2) return { width: Math.round(known[0]), height: Math.round(known[1]), source: 'specification' as const };
    return { width: 0, height: 0, source: 'none' as const };
  }

  if (shape === SHAPE_RECT) {
    const horizontal = Math.max(lengths.A ?? 0, lengths.C ?? 0);
    const vertical = Math.max(lengths.B ?? 0, lengths.D ?? 0);
    if (horizontal && vertical) return { width: Math.round(horizontal), height: Math.round(vertical), source: 'specification' as const };
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
  const known = dimensions
    .map((dimension) => dimension.value)
    .filter((value) => value >= 80)
    .sort((a, b) => b - a);
  const unique = known.filter((value, index) => index === 0 || Math.abs(value - known[index - 1]) > 2);

  if (unique.length >= 2) {
    return {
      width: Math.round(unique[0]),
      height: Math.round(unique[1]),
      source: 'specification' as const,
      warnings: [] as string[],
    };
  }
  if (unique.length === 1) {
    return {
      width: Math.round(unique[0]),
      height: 0,
      source: 'specification' as const,
      warnings: ['Знайдено тільки один підписаний розмір; другий габарит невідомий.'],
    };
  }
  
  return {
    width: 0,
    height: 0,
    source: 'none' as const,
    warnings: ['Не знайдено схеми або підписаних розмірів; заповніть габарити вручну.'],
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
  const thickeningSideSizes: Record<string, number> = {};
  const thickeningSideLengths: Record<string, number> = {};
  const foldSideSizes: Record<string, number> = {};
  const foldSideLengths: Record<string, number> = {};
  const edgeProfiles: EdgeProfileSelection = {};

  rows.forEach((row) => {
    const side = approvalSideToAppSide(row.side, shape);
    const text = approvalSpecRowText(row);
    if (isApprovalFoldRow(row)) {
      foldSides.push(side);
      if (row.height > 0) {
        foldSizes.push(row.height);
        foldSideSizes[side] = Math.round(row.height);
      }
      if (row.width > 0) foldSideLengths[side] = Math.round(row.width);
      return;
    }
    if (isApprovalThickeningRow(row)) {
      thickeningSides.push(side);
      if (row.height > 0) {
        thickeningSizes.push(row.height);
        thickeningSideSizes[side] = Math.round(row.height);
      }
      if (row.width > 0) thickeningSideLengths[side] = Math.round(row.width);
      return;
    }
    if (isApprovalEdgeRow(row)) {
      edgeProfiles[side] = inferEdgeProfile(text);
    }
  });

  const thickening: EdgeFeature = {
    enabled: thickeningSides.length > 0,
    size: Math.max(1, Math.round(thickeningSizes[0] ?? 40)),
    sides: [...new Set(thickeningSides)],
    sideSizes: thickeningSideSizes,
    sideLengths: thickeningSideLengths,
  };
  const fold: EdgeFeature = {
    enabled: foldSides.length > 0,
    size: Math.max(1, Math.round(foldSizes[0] ?? 100)),
    sides: [...new Set(foldSides)],
    sideSizes: foldSideSizes,
    sideLengths: foldSideLengths,
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

function isPointInsideApprovalPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const crosses = (current.y > point.y) !== (previous.y > point.y);
    if (crosses) {
      const x = ((previous.x - current.x) * (point.y - current.y)) / Math.max(0.0001, previous.y - current.y) + current.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

function clipApprovalJointToPolygon(joint: ApprovalImportJoint, polygon: Point[]): ApprovalImportJoint | undefined {
  if (polygon.length < 3) return undefined;
  const dx = joint.end.x - joint.start.x;
  const dy = joint.end.y - joint.start.y;
  const length = Math.hypot(dx, dy);
  if (length < 2) return undefined;
  const values = [0, 1];
  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
  polygon.forEach((edgeStart, index) => {
    const edgeEnd = polygon[(index + 1) % polygon.length];
    const ex = edgeEnd.x - edgeStart.x;
    const ey = edgeEnd.y - edgeStart.y;
    const denominator = cross(dx, dy, ex, ey);
    if (Math.abs(denominator) < 0.001) return;
    const sx = edgeStart.x - joint.start.x;
    const sy = edgeStart.y - joint.start.y;
    const t = cross(sx, sy, ex, ey) / denominator;
    const u = cross(sx, sy, dx, dy) / denominator;
    if (t >= -0.001 && t <= 1.001 && u >= -0.001 && u <= 1.001) values.push(Math.max(0, Math.min(1, t)));
  });
  const sorted = [...new Set(values.map((value) => Math.round(value * 10000) / 10000))].sort((a, b) => a - b);
  let best: { startT: number; endT: number; length: number } | undefined;
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const startT = sorted[index];
    const endT = sorted[index + 1];
    if (endT - startT < 0.001) continue;
    const midT = (startT + endT) / 2;
    const mid = { x: joint.start.x + dx * midT, y: joint.start.y + dy * midT };
    if (!isPointInsideApprovalPolygon(mid, polygon)) continue;
    const segmentLength = (endT - startT) * length;
    if (!best || segmentLength > best.length) best = { startT, endT, length: segmentLength };
  }
  if (!best || best.length < 12) return undefined;
  return {
    ...joint,
    start: { x: joint.start.x + dx * best.startT, y: joint.start.y + dy * best.startT },
    end: { x: joint.start.x + dx * best.endT, y: joint.start.y + dy * best.endT },
  };
}

function approvalDetectedJoints(
  productNumber: number,
  joints: ReturnType<typeof jointsFromLines>,
  drawingGeometry: ReturnType<typeof scaleApprovalDrawingGeometry> | undefined,
): ApprovalImportJoint[] {
  if (!drawingGeometry?.customPoints?.length) return [];
  const result: ApprovalImportJoint[] = (drawingGeometry.jointLines ?? []).map((joint, index) => ({
    ...joint,
    id: joint.id || `approval_${productNumber}_joint_detected_${index + 1}`,
    source: 'detected',
  }));
  if (joints.jointVertical) {
    const x = drawingGeometry.width / 2;
    result.push({
      id: `approval_${productNumber}_joint_vertical`,
      type: 'vertical',
      start: { x, y: 0 },
      end: { x, y: drawingGeometry.height },
      source: 'detected',
    });
  }
  if (joints.jointHorizontal) {
    const y = drawingGeometry.height / 2;
    result.push({
      id: `approval_${productNumber}_joint_horizontal`,
      type: 'horizontal',
      start: { x: 0, y },
      end: { x: drawingGeometry.width, y },
      source: 'detected',
    });
  }
  const clipped = result
    .map((joint) => clipApprovalJointToPolygon(joint, drawingGeometry.customPoints))
    .filter(Boolean) as ApprovalImportJoint[];
  const seen = new Set<string>();
  return clipped.filter((joint) => {
    const key = [
      joint.type,
      Math.round(joint.start.x / 5),
      Math.round(joint.start.y / 5),
      Math.round(joint.end.x / 5),
      Math.round(joint.end.y / 5),
    ].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function emptyApprovalFeature(size: number): EdgeFeature {
  return { enabled: false, size, sides: [] };
}

function productNameLooksLeg(value: string) {
  return /нога|опор|leg|support/u.test(value.toLocaleLowerCase('uk-UA'));
}

function rectangleApprovalPoints(width: number, height: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

function generatedLegItemFromRow(
  parentProduct: { number: number; name: string },
  row: ApprovalSpecRow,
  index: number,
): Omit<ApprovalImportItem, 'sourceX' | 'sourceY'> | undefined {
  const width = Math.round(row.width);
  const height = Math.round(row.height);
  if (width < 80 || height < 80) return undefined;
  const side = normalizeSourceSide(row.side);
  const points = rectangleApprovalPoints(width, height);
  const dimensions = uniqueDimensionLabels([
    dimensionLabel('A', width, `specification leg ${side}`),
    dimensionLabel('C', width, `specification leg ${side}`),
    dimensionLabel('B', height, `specification leg ${side}`),
    dimensionLabel('D', height, `specification leg ${side}`),
  ]);
  return {
    id: `approval_${parentProduct.number}_leg_${side || index + 1}`,
    sourceProductNumber: parentProduct.number * 1000 + index + 1,
    name: `Нога по стороні ${side || '?'} (${parentProduct.name})`,
    type: TYPE_COUNTERTOP,
    shape: SHAPE_RECT,
    width,
    height,
    innerHorizontal: undefined,
    innerVertical: undefined,
    innerCutWidth: undefined,
    innerCutDepth: undefined,
    innerCutOffset: undefined,
    customPoints: points,
    customHoles: [],
    sideSegments: buildApprovalSideSegments(points, SHAPE_RECT),
    sourcePreview: undefined,
    area: (width * height) / 1_000_000,
    quantity: 1,
    jointVertical: undefined,
    jointHorizontal: undefined,
    sizeSource: 'none',
    pipelineVersion: APPROVAL_IMPORT_PIPELINE_VERSION,
    geometrySource: 'spec-generated',
    shapeMode: 'customContour',
    dimensionsSource: 'spec-table',
    specSource: 'table',
    thickening: emptyApprovalFeature(40),
    fold: emptyApprovalFeature(100),
    edgeProfiles: {},
    dimensions,
    warnings: ['Ногу створено з рядка специфікації, бо окремого креслення виробу не знайдено.'],
    importStatus: 'OK',
    debug: {
      sourceSize: { width, height, source: 'none' },
      drawing: undefined,
      sourcePage: undefined,
      sourceImageRegion: undefined,
      mappedSides: ['A', 'B', 'C', 'D'],
    },
    rows: [row],
  };
}

function sourceSideOrientation(side: string) {
  const normalized = normalizeSourceSide(side);
  if (/^[ACEGI]$/u.test(normalized)) return 'horizontal' as const;
  if (/^[BDFH]$/u.test(normalized)) return 'vertical' as const;
  return undefined;
}

function supplementDimensionsFromSpecRows(
  drawingDimensions: ApprovalDimensionLabel[],
  rows: ApprovalSpecRow[],
) {
  const dimensions = [...drawingDimensions];
  const hasDrawingDimensions = drawingDimensions.some((dimension) => !dimension.source.startsWith('specification'));
  const existingSides = new Set(dimensions.map((dimension) => normalizeSourceSide(dimension.side)));
  const addDimension = (side: string, value: number, source: string) => {
    if (!/^[A-I]$/u.test(side) || existingSides.has(side)) return;
    const rounded = Math.round(value);
    if (!Number.isFinite(rounded) || rounded < 80 || rounded > 8000) return;
    dimensions.push({ side, value: rounded, source });
    existingSides.add(side);
  };
  rows.forEach((row) => {
    if (isWallPanelRow(row)) return;
    if (isApprovalLegRow(row)) return;
    if (!isEdgeRow(row) && !isFoldOrThickening(row)) return;
    const side = normalizeSourceSide(row.side);
    const value = Math.round(row.width);
    addDimension(side, value, `specification fallback: ${side}=${value} мм`);
  });
  if (hasDrawingDimensions) return dimensions;
  const bySide = dimensions.reduce<Record<string, number>>((result, dimension) => {
    result[dimension.side] = Math.max(result[dimension.side] ?? 0, dimension.value);
    return result;
  }, {});
  const derivedSource = (side: string, value: number) => `specification derived fallback: ${side}=${Math.round(value)} мм`;
  if (bySide.C && bySide.D && bySide.E && bySide.F) {
    addDimension('A', bySide.E + bySide.C + bySide.D, derivedSource('A', bySide.E + bySide.C + bySide.D));
    addDimension('B', bySide.D + bySide.F, derivedSource('B', bySide.D + bySide.F));
    addDimension('G', bySide.D, derivedSource('G', bySide.D));
    addDimension('H', bySide.C, derivedSource('H', bySide.C));
    addDimension('I', bySide.F, derivedSource('I', bySide.F));
  } else if (bySide.B && bySide.C && bySide.D && bySide.E) {
    addDimension('A', bySide.C + bySide.E, derivedSource('A', bySide.C + bySide.E));
    addDimension('F', bySide.D + bySide.B, derivedSource('F', bySide.D + bySide.B));
  } else if (bySide.D && bySide.E && bySide.F) {
    const inferredC = Math.max(bySide.D, bySide.F);
    addDimension('C', inferredC, derivedSource('C', inferredC));
    addDimension('A', bySide.E + inferredC, derivedSource('A', bySide.E + inferredC));
    addDimension('B', bySide.D + bySide.F, derivedSource('B', bySide.D + bySide.F));
  }
  return dimensions;
}

function dimensionsSourceFor(drawingDimensions: ApprovalDimensionLabel[], dimensions: ApprovalDimensionLabel[]): ApprovalDimensionsSource {
  const specCount = dimensions.filter((dimension) => dimension.source.startsWith('specification')).length;
  const hasOcr = dimensions.some((dimension) => dimension.source.startsWith('drawing-ocr'))
    || drawingDimensions.some((dimension) => dimension.source.startsWith('drawing-ocr'));
  const hasDrawingText = dimensions.some((dimension) => (
    !dimension.source.startsWith('specification')
    && !dimension.source.startsWith('drawing-ocr')
  )) || drawingDimensions.some((dimension) => (
    !dimension.source.startsWith('specification')
    && !dimension.source.startsWith('drawing-ocr')
  ));
  if (hasDrawingText && hasOcr && specCount) return 'drawing-labels+drawing-ocr+spec-table';
  if (hasDrawingText && hasOcr) return 'drawing-labels+drawing-ocr';
  if (hasOcr && specCount) return 'drawing-ocr+spec-table';
  if (hasOcr) return 'drawing-ocr';
  if (hasDrawingText && specCount) return 'drawing-labels+spec-table';
  if (hasDrawingText) return 'drawing-labels';
  if (specCount) return 'spec-table';
  return 'none';
}

function completeOppositeDimensionsFromLabels(
  dimensions: ApprovalDimensionLabel[],
  shape: DetailShape,
) {
  if (![SHAPE_RECT, SHAPE_CIRCLE, SHAPE_ELLIPSE].includes(shape)) return dimensions;
  const bySide = dimensions.reduce<Record<string, ApprovalDimensionLabel | undefined>>((result, dimension) => {
    result[normalizeSourceSide(dimension.side)] = dimension;
    return result;
  }, {});
  const result = [...dimensions];
  const addOpposite = (target: string, source: string) => {
    if (bySide[target] || !bySide[source]) return;
    const sourceDimension = bySide[source];
    if (!sourceDimension || sourceDimension.source.startsWith('specification') || sourceDimension.source.startsWith('drawing contour side')) return;
    const dimension = dimensionLabel(target, sourceDimension.value, `opposite side from ${source}`);
    if (!dimension) return;
    result.push(dimension);
    bySide[target] = dimension;
  };
  addOpposite('C', 'A');
  addOpposite('A', 'C');
  addOpposite('B', 'D');
  addOpposite('D', 'B');
  if (shape === SHAPE_CIRCLE) {
    const diameter = bySide.A?.value ?? bySide.B?.value ?? bySide.C?.value ?? bySide.D?.value;
    if (diameter) {
      ['A', 'B', 'C', 'D'].forEach((side) => {
        if (!bySide[side]) {
          const dimension = dimensionLabel(side, diameter, 'circle diameter from drawing label');
          if (dimension) {
            result.push(dimension);
            bySide[side] = dimension;
          }
        }
      });
    }
  }
  return uniqueDimensionLabelsBySide(result);
}

function supplementDimensionsFromGeometry(
  dimensions: ApprovalDimensionLabel[],
  drawingGeometry: ReturnType<typeof scaleApprovalDrawingGeometry> | undefined,
  shape: DetailShape,
  options: { allowContourDimensions?: boolean } = {},
) {
  if (!options.allowContourDimensions) return dimensions;
  if (!drawingGeometry) return dimensions;
  const existingSides = new Set(dimensions.map((dimension) => normalizeSourceSide(dimension.side)));
  const result = [...dimensions];
  const addDimension = (side: string, value: number, source: string) => {
    const normalizedSide = normalizeSourceSide(side);
    const rounded = Math.round(value);
    if (!/^[A-I]$/u.test(normalizedSide) || existingSides.has(normalizedSide)) return;
    if (!Number.isFinite(rounded) || rounded < 80 || rounded > 8000) return;
    result.push({ side: normalizedSide, value: rounded, source });
    existingSides.add(normalizedSide);
  };
  if (shape === SHAPE_CIRCLE || shape === SHAPE_ELLIPSE) {
    addDimension('A', drawingGeometry.width, 'drawing contour side: A');
    addDimension('B', drawingGeometry.height, 'drawing contour side: B');
    addDimension('C', drawingGeometry.width, 'drawing contour side: C');
    addDimension('D', drawingGeometry.height, 'drawing contour side: D');
    return result;
  }
  Object.entries(drawingGeometry.sideSegments ?? {}).forEach(([side, segment]) => {
    addDimension(side, segmentLength(segment), `drawing contour side: ${side}`);
  });
  return result.sort((first, second) => first.side.localeCompare(second.side));
}

function dimensionsHaveHorizontalAndVertical(dimensions: ApprovalDimensionLabel[]) {
  return dimensions.some((dimension) => sourceSideOrientation(dimension.side) === 'horizontal')
    && dimensions.some((dimension) => sourceSideOrientation(dimension.side) === 'vertical');
}

function drawingSizeFromDimensionLabels(drawing: ApprovalDrawingGeometry | undefined, dimensions: ApprovalDimensionLabel[]) {
  if (!drawing?.points.length || !dimensions.length || drawing.width <= 0 || drawing.height <= 0) return undefined;
  const values = [...new Set(dimensions.map((dimension) => Math.round(dimension.value)).filter((value) => value >= 80 && value <= 8000))]
    .sort((first, second) => second - first);
  if (!values.length) return undefined;

  const aspect = drawing.width / drawing.height;
  const horizontalValues = dimensions
    .filter((dimension) => sourceSideOrientation(dimension.side) === 'horizontal')
    .map((dimension) => Math.round(dimension.value))
    .filter((value) => value >= 80 && value <= 8000);
  const verticalValues = dimensions
    .filter((dimension) => sourceSideOrientation(dimension.side) === 'vertical')
    .map((dimension) => Math.round(dimension.value))
    .filter((value) => value >= 80 && value <= 8000);
  const horizontal = horizontalValues.length ? Math.max(...horizontalValues) : undefined;
  const vertical = verticalValues.length ? Math.max(...verticalValues) : undefined;
  if (horizontal && vertical) return { width: horizontal, height: vertical, source: 'drawing' as const };
  if (horizontal) return { width: horizontal, height: Math.max(1, Math.round(horizontal / aspect)), source: 'drawing' as const };
  if (vertical) return { width: Math.max(1, Math.round(vertical * aspect)), height: vertical, source: 'drawing' as const };

  const chooseClosest = (target: number, forbidden?: number) => values
    .filter((value) => value !== forbidden)
    .sort((first, second) => Math.abs(first - target) - Math.abs(second - target))[0];

  if (aspect >= 1) {
    const width = values[0];
    const height = chooseClosest(width / aspect, width) ?? Math.max(1, Math.round(width / aspect));
    return { width, height, source: 'drawing' as const };
  }

  const height = values[0];
  const width = chooseClosest(height * aspect, height) ?? Math.max(1, Math.round(height * aspect));
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
  const unnumbered = indexed.filter((entry) => !entry.drawing.sourceProductNumber);
  const nextAvailable = unnumbered.find((entry) => entry.drawing.sourcePage && entry.drawing.sourceBounds);
  if (nextAvailable) {
    usedIndexes.add(nextAvailable.index);
    return nextAvailable.drawing;
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

const APPROVAL_SIDE_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function removeCollinearApprovalPoints(points: Point[], tolerance = 0.75) {
  if (points.length <= 3) return points;
  return points.filter((point, index, list) => {
    const previous = list[(index + list.length - 1) % list.length];
    const next = list[(index + 1) % list.length];
    const duplicate = Math.hypot(point.x - previous.x, point.y - previous.y) <= tolerance;
    const cross = (point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x);
    return !duplicate && Math.abs(cross) > tolerance;
  });
}

function rotateApprovalPointsToTopLeft(points: Point[]) {
  if (points.length < 2) return points;
  const topY = Math.min(...points.map((point) => point.y));
  const topTolerance = Math.max(3, (Math.max(...points.map((point) => point.y)) - topY) * 0.02);
  const topIndexes = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => Math.abs(point.y - topY) <= topTolerance)
    .sort((first, second) => first.point.x - second.point.x);
  const startIndex = (topIndexes[0] ?? points
    .map((point, index) => ({ point, index }))
    .sort((first, second) => first.point.y - second.point.y || first.point.x - second.point.x)[0]).index;
  const rotated = [...points.slice(startIndex), ...points.slice(0, startIndex)];
  const next = rotated[1];
  const previous = rotated[rotated.length - 1];
  const nextScore = (next.x - rotated[0].x) - Math.abs(next.y - rotated[0].y) * 0.25;
  const previousScore = (previous.x - rotated[0].x) - Math.abs(previous.y - rotated[0].y) * 0.25;
  return nextScore >= previousScore ? rotated : [rotated[0], ...rotated.slice(1).reverse()];
}

function sequentialApprovalSideSegments(points: Point[]) {
  const cleaned = rotateApprovalPointsToTopLeft(removeCollinearApprovalPoints(points));
  if (cleaned.length < 4) return undefined;
  const bounds = cleaned.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x),
    minY: Math.min(result.minY, point.y),
    maxX: Math.max(result.maxX, point.x),
    maxY: Math.max(result.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const minSide = Math.max(18, Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.04);
  const result: Record<string, { start: Point; end: Point }> = {};
  cleaned.forEach((point, index) => {
    const next = cleaned[(index + 1) % cleaned.length];
    const length = Math.hypot(next.x - point.x, next.y - point.y);
    if (length < minSide) return;
    const label = APPROVAL_SIDE_LABELS[Object.keys(result).length];
    if (!label) return;
    result[label] = { start: point, end: next };
  });
  return Object.keys(result).length ? result : undefined;
}

function buildApprovalSideSegments(points: Point[], shape: DetailShape) {
  if (points.length < 4) return undefined;
  const bounds = points.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x),
    minY: Math.min(result.minY, point.y),
    maxX: Math.max(result.maxX, point.x),
    maxY: Math.max(result.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  if (shape === SHAPE_CIRCLE || shape === SHAPE_ELLIPSE) {
    return {
      A: { start: { x: bounds.minX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.minY } },
      B: { start: { x: bounds.maxX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.maxY } },
      C: { start: { x: bounds.maxX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.maxY } },
      D: { start: { x: bounds.minX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.minY } },
    };
  }
  if (shape === SHAPE_RECT) {
    return {
      A: { start: { x: bounds.minX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.minY } },
      B: { start: { x: bounds.maxX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.maxY } },
      C: { start: { x: bounds.maxX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.maxY } },
      D: { start: { x: bounds.minX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.minY } },
    };
  }
  const sequential = sequentialApprovalSideSegments(points);
  if (sequential) return sequential;
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

function darkNeighborCount(mask: Uint8Array, width: number, height: number, x: number, y: number, radius: number) {
  let count = 0;
  for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy += 1) {
    for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx += 1) {
      count += mask[yy * width + xx] ? 1 : 0;
    }
  }
  return count;
}

function removeSmallDarkArtifacts(mask: Uint8Array, width: number, height: number) {
  const total = width * height;
  const labels = new Uint8Array(total);
  const result = new Uint8Array(total);
  for (let start = 0; start < total; start += 1) {
    if (!mask[start] || labels[start]) continue;
    const stack = [start];
    const pixels: number[] = [];
    labels[start] = 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    while (stack.length) {
      const index = stack.pop() as number;
      const x = index % width;
      const y = Math.floor(index / width);
      pixels.push(index);
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
        if (neighbor < 0 || labels[neighbor] || !mask[neighbor]) return;
        labels[neighbor] = 1;
        stack.push(neighbor);
      });
    }
    const spanX = maxX - minX + 1;
    const spanY = maxY - minY + 1;
    const likelyContour = pixels.length >= 70 || Math.max(spanX, spanY) >= 34 || (spanX >= 14 && spanY >= 14);
    if (!likelyContour) continue;
    pixels.forEach((index) => {
      result[index] = 1;
    });
  }
  return result;
}

function approvalStructuralDarkMask(raw: Uint8Array, width: number, height: number) {
  const total = width * height;
  const structural = new Uint8Array(total);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!raw[index]) continue;
      const count3 = darkNeighborCount(raw, width, height, x, y, 1);
      const count5 = darkNeighborCount(raw, width, height, x, y, 2);
      if (count3 >= 5 || count5 >= 11) structural[index] = 1;
    }
  }
  return removeSmallDarkArtifacts(structural, width, height);
}

function detectApprovalRasterJointLines(
  mask: Uint8Array,
  width: number,
  height: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): ApprovalImportJoint[] {
  const localWidth = Math.max(1, bounds.maxX - bounds.minX + 1);
  const localHeight = Math.max(1, bounds.maxY - bounds.minY + 1);
  const darkAt = (x: number, y: number) => {
    const globalX = bounds.minX + x;
    const globalY = bounds.minY + y;
    return globalX >= 0 && globalX < width && globalY >= 0 && globalY < height && mask[globalY * width + globalX] === 1;
  };
  const minVerticalSpan = Math.max(60, localHeight * 0.32);
  const minHorizontalSpan = Math.max(60, localWidth * 0.32);
  const candidates: ApprovalImportJoint[] = [];

  const verticalColumns: Array<{ x: number; minY: number; maxY: number; count: number }> = [];
  for (let x = 1; x < localWidth - 1; x += 1) {
    let count = 0;
    let minY = localHeight;
    let maxY = 0;
    for (let y = 1; y < localHeight - 1; y += 1) {
      if (!darkAt(x, y)) continue;
      count += 1;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const span = maxY - minY;
    if (span >= minVerticalSpan && count >= span * 0.08 && count <= span * 0.72) {
      verticalColumns.push({ x, minY, maxY, count });
    }
  }
  const horizontalRows: Array<{ y: number; minX: number; maxX: number; count: number }> = [];
  for (let y = 1; y < localHeight - 1; y += 1) {
    let count = 0;
    let minX = localWidth;
    let maxX = 0;
    for (let x = 1; x < localWidth - 1; x += 1) {
      if (!darkAt(x, y)) continue;
      count += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    const span = maxX - minX;
    if (span >= minHorizontalSpan && count >= span * 0.08 && count <= span * 0.72) {
      horizontalRows.push({ y, minX, maxX, count });
    }
  }
  const addGroupedVertical = () => {
    let group: typeof verticalColumns = [];
    const flush = () => {
      if (!group.length) return;
      const x = Math.round(group.reduce((sum, entry) => sum + entry.x * entry.count, 0) / Math.max(1, group.reduce((sum, entry) => sum + entry.count, 0)));
      const minY = Math.min(...group.map((entry) => entry.minY));
      const maxY = Math.max(...group.map((entry) => entry.maxY));
      if (maxY - minY >= minVerticalSpan) {
        candidates.push({
          id: `detected_joint_vertical_${candidates.length + 1}`,
          type: 'vertical',
          start: { x, y: minY },
          end: { x, y: maxY },
          source: 'detected',
        });
      }
      group = [];
    };
    verticalColumns.forEach((entry) => {
      if (group.length && entry.x - group[group.length - 1].x > 4) flush();
      group.push(entry);
    });
    flush();
  };
  const addGroupedHorizontal = () => {
    let group: typeof horizontalRows = [];
    const flush = () => {
      if (!group.length) return;
      const y = Math.round(group.reduce((sum, entry) => sum + entry.y * entry.count, 0) / Math.max(1, group.reduce((sum, entry) => sum + entry.count, 0)));
      const minX = Math.min(...group.map((entry) => entry.minX));
      const maxX = Math.max(...group.map((entry) => entry.maxX));
      if (maxX - minX >= minHorizontalSpan) {
        candidates.push({
          id: `detected_joint_horizontal_${candidates.length + 1}`,
          type: 'horizontal',
          start: { x: minX, y },
          end: { x: maxX, y },
          source: 'detected',
        });
      }
      group = [];
    };
    horizontalRows.forEach((entry) => {
      if (group.length && entry.y - group[group.length - 1].y > 4) flush();
      group.push(entry);
    });
    flush();
  };
  addGroupedVertical();
  addGroupedHorizontal();

  type DiagonalBin = { count: number; minX: number; maxX: number; minY: number; maxY: number };
  const addDiagonalCandidates = (kind: 'falling' | 'rising') => {
    const bins = new Map<number, DiagonalBin>();
    for (let y = 1; y < localHeight - 1; y += 1) {
      for (let x = 1; x < localWidth - 1; x += 1) {
        if (!darkAt(x, y)) continue;
        const key = Math.round((kind === 'falling' ? y - x : y + x) / 4);
        const current = bins.get(key) ?? { count: 0, minX: localWidth, maxX: 0, minY: localHeight, maxY: 0 };
        current.count += 1;
        current.minX = Math.min(current.minX, x);
        current.maxX = Math.max(current.maxX, x);
        current.minY = Math.min(current.minY, y);
        current.maxY = Math.max(current.maxY, y);
        bins.set(key, current);
      }
    }
    [...bins.values()]
      .map((entry) => ({
        ...entry,
        length: Math.hypot(entry.maxX - entry.minX, entry.maxY - entry.minY),
      }))
      .filter((entry) => (
        entry.length >= Math.max(80, Math.min(localWidth, localHeight) * 0.32)
        && Math.abs((entry.maxX - entry.minX) - (entry.maxY - entry.minY)) <= entry.length * 0.32
        && entry.count >= entry.length * 0.06
        && entry.count <= entry.length * 1.2
      ))
      .sort((a, b) => b.length - a.length)
      .slice(0, 1)
      .forEach((entry) => {
        candidates.push({
          id: `detected_joint_diagonal_${candidates.length + 1}`,
          type: 'diagonal45',
          start: kind === 'falling' ? { x: entry.minX, y: entry.minY } : { x: entry.minX, y: entry.maxY },
          end: kind === 'falling' ? { x: entry.maxX, y: entry.maxY } : { x: entry.maxX, y: entry.minY },
          source: 'detected',
        });
      });
  };
  addDiagonalCandidates('falling');
  addDiagonalCandidates('rising');

  return candidates
    .filter((joint) => Math.hypot(joint.end.x - joint.start.x, joint.end.y - joint.start.y) >= 40)
    .slice(0, 4);
}

/** Traces closed product outlines from a drawing page image embedded in the approval PDF. */
function traceApprovalDrawingImage(image: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }): ApprovalDrawingGeometry[] {
  const { width, height, data } = image;
  const total = width * height;
  const channels = Math.max(1, Math.round(data.length / total));
  const allDark = new Uint8Array(total);
  for (let index = 0; index < total; index += 1) {
    const offset = index * channels;
    const red = data[offset] ?? 255;
    const green = data[offset + 1] ?? red;
    const blue = data[offset + 2] ?? red;
    if (red + green + blue < 420) allDark[index] = 1;
  }
  const darkRaw = approvalStructuralDarkMask(allDark, width, height);

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

  const candidates = components
    .filter((component) => component.area >= 2_000)
    .filter((component) => component.maxX - component.minX >= 40 && component.maxY - component.minY >= 20)
    .sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  if (!candidates.length) return [];

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

  const localLoop = (loop: Point[], bounds: typeof candidates[number]) => {
    const reduced = simplifyApprovalPolyline([...loop, loop[0]], 2.5).slice(0, -1);
    return reduced.map((point) => ({
      x: point.x - bounds.minX,
      y: point.y - bounds.minY,
    }));
  };

  return candidates.flatMap((candidate) => {
    const outerLoop = traceLoop(candidate.id);
    if (!outerLoop?.length) return [];
    const holes = components
      .filter((component) => component.id !== candidate.id && component.area >= 300 && component.area < candidate.area * 0.55)
      .filter((component) => (
        component.minX > candidate.minX
        && component.maxX < candidate.maxX
        && component.minY > candidate.minY
        && component.maxY < candidate.maxY
      ))
      .map((component) => traceLoop(component.id))
      .filter(Boolean)
      .map((loop) => orientPolygon(localLoop(loop as Point[], candidate), false));
    const points = orientPolygon(localLoop(outerLoop, candidate), true);
    const holeArea = holes.reduce((sum, hole) => sum + polygonArea(hole), 0);
    const tracedWidth = Math.max(1, candidate.maxX - candidate.minX);
    const tracedHeight = Math.max(1, candidate.maxY - candidate.minY);
    return [{
      points,
      holes,
      jointLines: detectApprovalRasterJointLines(darkRaw, width, height, candidate),
      width: tracedWidth,
      height: tracedHeight,
      area: Math.max(1, polygonArea(points) - holeArea),
      sourceBounds: {
        minX: candidate.minX,
        minY: candidate.minY,
        maxX: candidate.maxX,
        maxY: candidate.maxY,
      },
    }];
  });
}

function approvalRasterCropDataUrl(
  image: { width: number; height: number; data: Uint8ClampedArray | Uint8Array },
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  options: { marginRatio?: number; preprocessForOcr?: boolean; scale?: number } = {},
) {
  if (typeof document === 'undefined') return undefined;
  const margin = Math.round(Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * (options.marginRatio ?? 0.18));
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
      if (options.preprocessForOcr) {
        const gray = red * 0.299 + green * 0.587 + blue * 0.114;
        const value = gray < 218 ? 0 : 255;
        imageData.data[targetIndex] = value;
        imageData.data[targetIndex + 1] = value;
        imageData.data[targetIndex + 2] = value;
      } else {
        imageData.data[targetIndex] = red;
        imageData.data[targetIndex + 1] = green;
        imageData.data[targetIndex + 2] = blue;
      }
      imageData.data[targetIndex + 3] = channels >= 4 ? image.data[sourceIndex + 3] ?? 255 : 255;
    }
  }
  context.putImageData(imageData, 0, 0);
  const scale = Math.max(1, Math.min(4, Math.round(options.scale ?? 1)));
  if (scale > 1) {
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = cropWidth * scale;
    scaledCanvas.height = cropHeight * scale;
    const scaledContext = scaledCanvas.getContext('2d');
    if (!scaledContext) return undefined;
    scaledContext.imageSmoothingEnabled = false;
    scaledContext.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
    return {
      image: scaledCanvas.toDataURL('image/png'),
      bounds: crop,
    };
  }
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

function normalizeApprovalGeometryToSize(points: Point[], holes: Point[][], width: number, height: number, jointLines: ApprovalImportJoint[] = []) {
  if (!points.length) return { customPoints: points, customHoles: holes, customJoints: jointLines };
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const scaleX = width / Math.max(1, maxX - minX);
  const scaleY = height / Math.max(1, maxY - minY);
  const normalize = (point: Point) => ({
    x: (point.x - minX) * scaleX,
    y: (point.y - minY) * scaleY,
  });
  return {
    customPoints: points.map(normalize),
    customHoles: holes.map((hole) => hole.map(normalize)),
    customJoints: jointLines.map((joint) => ({
      ...joint,
      start: normalize(joint.start),
      end: normalize(joint.end),
    })),
  };
}

function snapApprovalGeometryToDimensions(points: Point[], holes: Point[][], width: number, height: number, dimensions: ApprovalDimensionLabel[] = []) {
  const xTargets = new Set([0, width]);
  const yTargets = new Set([0, height]);
  dimensions.forEach((dimension) => {
    const value = Math.round(dimension.value);
    if (value > 0 && value < width) {
      xTargets.add(value);
      xTargets.add(width - value);
    }
    if (value > 0 && value < height) {
      yTargets.add(value);
      yTargets.add(height - value);
    }
  });
  const snapValue = (value: number, targets: Set<number>) => {
    const target = [...targets].sort((first, second) => Math.abs(first - value) - Math.abs(second - value))[0];
    return target !== undefined && Math.abs(target - value) <= 24 ? target : value;
  };
  const snapPoint = (point: Point) => ({
    x: snapValue(point.x, xTargets),
    y: snapValue(point.y, yTargets),
  });
  const removeCollinear = (items: Point[]) => {
    if (items.length <= 3) return items;
    return items.filter((point, index, list) => {
      const previous = list[(index + list.length - 1) % list.length];
      const next = list[(index + 1) % list.length];
      const duplicate = Math.hypot(point.x - previous.x, point.y - previous.y) <= 0.5;
      const cross = (point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x);
      return !duplicate && Math.abs(cross) > 0.5;
    });
  };
  return {
    customPoints: removeCollinear(points.map(snapPoint)),
    customHoles: holes.map((hole) => removeCollinear(hole.map(snapPoint))),
  };
}

function straightenApprovalOrthogonalContour(points: Point[]) {
  if (points.length < 4 || points.length > 16) return points;
  const edges = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.hypot(dx, dy);
    const vertical = length > 12 && Math.abs(dx) <= Math.max(10, Math.abs(dy) * 0.12);
    const horizontal = length > 12 && Math.abs(dy) <= Math.max(10, Math.abs(dx) * 0.12);
    return { start: point, end: next, length, vertical, horizontal };
  });
  const longEdges = edges.filter((edge) => edge.length > 24);
  if (!longEdges.length) return points;
  const axisRatio = longEdges.filter((edge) => edge.vertical || edge.horizontal).length / longEdges.length;
  if (axisRatio < 0.75) return points;
  const cluster = (values: number[], tolerance: number) => {
    const clusters: number[][] = [];
    [...values].sort((a, b) => a - b).forEach((value) => {
      const last = clusters[clusters.length - 1];
      const center = last ? last.reduce((sum, item) => sum + item, 0) / last.length : 0;
      if (!last || Math.abs(value - center) > tolerance) clusters.push([value]);
      else last.push(value);
    });
    return clusters.map((items) => items.reduce((sum, item) => sum + item, 0) / items.length);
  };
  const tolerance = 24;
  const xTargets = cluster(edges.filter((edge) => edge.vertical).flatMap((edge) => [edge.start.x, edge.end.x]), tolerance);
  const yTargets = cluster(edges.filter((edge) => edge.horizontal).flatMap((edge) => [edge.start.y, edge.end.y]), tolerance);
  const snap = (value: number, targets: number[]) => {
    const target = [...targets].sort((first, second) => Math.abs(first - value) - Math.abs(second - value))[0];
    return target !== undefined && Math.abs(target - value) <= tolerance ? target : value;
  };
  return points.map((point) => ({
    x: snap(point.x, xTargets),
    y: snap(point.y, yTargets),
  }));
}

function pointDistanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function removeApprovalTextArtifactsFromContour(points: Point[], width: number, height: number, shape: DetailShape) {
  if (shape === SHAPE_CIRCLE || shape === SHAPE_ELLIPSE || points.length <= 4) return points;
  const smallEdge = Math.max(18, Math.min(90, Math.min(width, height) * 0.16));
  let current = points;
  for (let pass = 0; pass < 6; pass += 1) {
    let changed = false;
    const next = current.filter((point, index, list) => {
      if (list.length <= 4) return true;
      const previous = list[(index + list.length - 1) % list.length];
      const following = list[(index + 1) % list.length];
      const previousLength = Math.hypot(point.x - previous.x, point.y - previous.y);
      const nextLength = Math.hypot(point.x - following.x, point.y - following.y);
      const bridgeLength = Math.hypot(following.x - previous.x, following.y - previous.y);
      const deviation = pointDistanceToSegment(point, previous, following);
      const tinyDent = previousLength <= smallEdge
        && nextLength <= smallEdge
        && bridgeLength <= smallEdge * 1.9
        && deviation <= smallEdge * 0.85;
      if (tinyDent) changed = true;
      return !tinyDent;
    });
    current = next;
    if (!changed) break;
  }
  return current;
}

function approvalDrawingLooksRound(drawing: ApprovalDrawingGeometry | undefined) {
  if (!drawing?.points.length || drawing.points.length < 8) return false;
  const boxArea = Math.max(1, drawing.width * drawing.height);
  const fillRatio = polygonArea(drawing.points) / boxArea;
  const axisAlignedEdges = drawing.points.filter((point, index) => {
    const next = drawing.points[(index + 1) % drawing.points.length];
    return Math.abs(point.x - next.x) <= 1 || Math.abs(point.y - next.y) <= 1;
  }).length;
  return fillRatio > 0.58 && fillRatio < 0.9 && axisAlignedEdges <= drawing.points.length * 0.35;
}

function inferApprovalDrawingShape(
  drawing: ApprovalDrawingGeometry | undefined,
  dimensions: ApprovalDimensionLabel[],
  rows: ApprovalSpecRow[],
): DetailShape {
  if (approvalDrawingLooksRound(drawing)) {
    const aspect = drawing ? Math.max(drawing.width, drawing.height) / Math.max(1, Math.min(drawing.width, drawing.height)) : 1;
    return aspect < 1.12 ? SHAPE_CIRCLE : SHAPE_ELLIPSE;
  }
  const sides = new Set([
    ...dimensions.map((dimension) => dimension.side),
    ...rows.map((row) => row.side),
  ].map((side) => side.toUpperCase()));
  if (['G', 'H', 'I'].some((side) => sides.has(side))) return SHAPE_U;
  if (['E', 'F'].some((side) => sides.has(side))) return SHAPE_L;
  return SHAPE_RECT;
}

/** Scales a traced approval drawing contour while preserving its PDF proportions. */
function scaleApprovalDrawingGeometry(
  drawing: ApprovalDrawingGeometry | undefined,
  width: number,
  height: number,
  area: number,
  shape: DetailShape,
  preferTargetSize = true,
  dimensions: ApprovalDimensionLabel[] = [],
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
    const scaledPoints = drawing.points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }));
    const scaledHoles = drawing.holes.map((hole) => hole.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })));
    const scaledJoints = (drawing.jointLines ?? []).map((joint) => ({
      ...joint,
      start: { x: joint.start.x * scaleX, y: joint.start.y * scaleY },
      end: { x: joint.end.x * scaleX, y: joint.end.y * scaleY },
    }));
    const targetWidth = Math.max(1, Math.round(width));
    const targetHeight = Math.max(1, Math.round(height));
    const normalized = normalizeApprovalGeometryToSize(scaledPoints, scaledHoles, targetWidth, targetHeight, scaledJoints);
    const cleanedPoints = straightenApprovalOrthogonalContour(removeApprovalTextArtifactsFromContour(normalized.customPoints, targetWidth, targetHeight, shape));
    return {
      width: targetWidth,
      height: targetHeight,
      customPoints: cleanedPoints,
      customHoles: normalized.customHoles,
      jointLines: normalized.customJoints,
      sideSegments: buildApprovalSideSegments(cleanedPoints, shape),
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
  const scaledPoints = drawing.points.map((point) => ({ x: point.x * scale, y: point.y * scale }));
  const scaledHoles = drawing.holes.map((hole) => hole.map((point) => ({ x: point.x * scale, y: point.y * scale })));
  const scaledJoints = (drawing.jointLines ?? []).map((joint) => ({
    ...joint,
    start: { x: joint.start.x * scale, y: joint.start.y * scale },
    end: { x: joint.end.x * scale, y: joint.end.y * scale },
  }));
  const targetWidth = Math.max(1, Math.round(drawing.width * scale));
  const targetHeight = Math.max(1, Math.round(drawing.height * scale));
  const normalized = normalizeApprovalGeometryToSize(scaledPoints, scaledHoles, targetWidth, targetHeight, scaledJoints);
  const cleanedPoints = straightenApprovalOrthogonalContour(removeApprovalTextArtifactsFromContour(normalized.customPoints, targetWidth, targetHeight, shape));
  return {
    width: targetWidth,
    height: targetHeight,
    customPoints: cleanedPoints,
    customHoles: normalized.customHoles,
    jointLines: normalized.customJoints,
    sideSegments: buildApprovalSideSegments(cleanedPoints, shape),
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
      const multiplicity = declaredArea / Math.max(1, actualArea);
      const roundedMultiplicity = Math.round(multiplicity);
      const looksLikeRepeatedPartArea = roundedMultiplicity >= 2
        && roundedMultiplicity <= 8
        && Math.abs(multiplicity - roundedMultiplicity) <= 0.08;
      if (!looksLikeRepeatedPartArea) {
        warnings.push(`Площа геометрії відрізняється від площі в бланку на ${Math.round(mismatch * 100)}%.`);
        status = status === 'Error' ? status : 'Needs review';
      }
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
  lines.forEach((line, index) => {
    const number = linkedWallPanelProductNumber(line);
    if (!number || products.some((product) => product.number === number)) return;
    const side = normalizeSourceSide(line.match(/стороні\s+([A-IАВСЕІ])/iu)?.[1]
      ?? line.match(/СЃС‚РѕСЂРѕРЅС–\s+([A-IРђР’РЎР•Р†])/iu)?.[1]
      ?? '');
    products.push({
      index,
      number,
      name: `Стінова панель по стороні ${side || '?'}`,
      area: 0,
    });
  });
  products.sort((first, second) => first.index - second.index);
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
  const items = products.flatMap((product) => {
    const spec = specIndexes.find((item) => item.number === product.number + 1);
    const nextProductIndex = Math.min(...products.filter((item) => item.index > product.index).map((item) => item.index), lines.length);
    const nextProduct = products.find((item) => item.index === nextProductIndex);
    const specEndCandidates = spec
      ? [
        ...products.filter((item) => item.index > spec.index).map((item) => item.index),
        ...specIndexes.filter((item) => item.index > spec.index).map((item) => item.index),
        lines.length,
      ]
      : [];
    const rows = spec ? parseSpecRows(lines, spec.index, Math.min(...specEndCandidates)) : [];
    allRows.push(...rows);
    const linkedPanelSpecNumber = product.number >= 100 ? Math.floor(product.number / 100) : 0;
    const linkedPanelSide = product.number >= 100 ? String.fromCharCode((product.number % 100) + 64) : '';
    const linkedPanelSpec = linkedPanelSpecNumber
      ? specIndexes.find((item) => item.number === linkedPanelSpecNumber)
      : undefined;
    const linkedPanelRows = linkedPanelSpec
      ? parseSpecRows(lines, linkedPanelSpec.index, Math.min(
        ...[
          ...products.filter((item) => item.index > linkedPanelSpec.index).map((item) => item.index),
          ...specIndexes.filter((item) => item.index > linkedPanelSpec.index).map((item) => item.index),
          lines.length,
        ],
      ))
      : [];
    const linkedPanelRow = linkedPanelRows.find((row) => row.side === linkedPanelSide && isWallPanelRow(row));
    const linkedPanelDimensions = linkedPanelRow
      ? uniqueDimensionLabels([
        dimensionLabel('A', linkedPanelRow.width, `specification linked wall panel ${linkedPanelSide}`),
        dimensionLabel('C', linkedPanelRow.width, `specification linked wall panel ${linkedPanelSide}`),
        dimensionLabel('B', linkedPanelRow.height, `specification linked wall panel ${linkedPanelSide}`),
        dimensionLabel('D', linkedPanelRow.height, `specification linked wall panel ${linkedPanelSide}`),
      ])
      : [];
    const type = inferDetailType(product.name);
    const drawing = drawingForProduct(drawings, product.number, usedDrawingIndexes);
    const drawingTextDimensions = drawing?.sourceDimensions ?? [];
    const parsedDimensions = uniqueDimensionLabelsBySide([
      ...drawingTextDimensions,
      ...parseDimensionLabels(lines, product.index, spec?.index ?? nextProductIndex),
      ...linkedPanelDimensions,
    ]);
    const missingPdfDrawing = !drawing?.points.length;
    const visualOnly = rows.length === 0;
    let dimensions = supplementDimensionsFromSpecRows(parsedDimensions, rows);
    const shape = inferApprovalDrawingShape(drawing, dimensions, rows);
    dimensions = completeOppositeDimensionsFromLabels(dimensions, shape);
    const labelSize = drawingSizeFromDimensionLabels(drawing, dimensions);
    const labelSizeReliable = parsedDimensions.length > 0 || dimensionsHaveHorizontalAndVertical(dimensions);
    const reviewSize = !labelSizeReliable && drawing?.points.length
      ? visualSizeFromDrawing(drawing, dimensions, rows, product.area, type, shape)
      : undefined;
    const size = labelSizeReliable ? labelSize : reviewSize;
    const needsDimensionReview = Boolean(reviewSize && !labelSizeReliable);
    const features = featuresFromRows(rows, shape);
    const joints = jointsFromLines(lines, product.index, spec?.index ?? nextProductIndex);
    const drawingGeometry = size
      ? scaleApprovalDrawingGeometry(drawing, size.width, size.height, product.area, shape, true, dimensions)
      : undefined;
    const detectedJoints = approvalDetectedJoints(product.number, joints, drawingGeometry);
    dimensions = supplementDimensionsFromGeometry(dimensions, drawingGeometry, shape, { allowContourDimensions: false });
    const hasReliableDrawingRegion = Boolean(drawing?.sourcePage && drawing?.sourceBounds);
    const hasFinalContour = Boolean(drawingGeometry?.customPoints?.length);
    const blockedReason = !hasReliableDrawingRegion
      ? 'No product drawing region was matched to this product.'
      : !hasFinalContour
      ? 'No real contour was extracted from the product drawing.'
      : null;
    const drawingExtractionFailed = Boolean(blockedReason);
    const geometrySource: ApprovalGeometrySource = hasFinalContour ? 'image-contour' : 'none';
    const shapeMode: ApprovalShapeMode = hasFinalContour ? 'customContour' : 'none';
    const dimensionsSource = dimensionsSourceFor(parsedDimensions, dimensions);
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
      ...(needsDimensionReview ? [
        'Потрібно уточнити розміри: контур знайдено, але частину текстових розмірів біля креслення не вдалося надійно прочитати.',
        ...(reviewSize?.warnings ?? []),
      ] : []),
      ...visualWarnings,
      ...validation.warnings,
    ];
    const importStatus: ApprovalImportStatus = drawingExtractionFailed
      ? 'Error'
      : visualOnly && !drawingGeometry
      ? 'Error'
      : missingPdfDrawing
      ? 'Error'
      : needsDimensionReview
      ? 'Needs review'
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
    const mainItem: Omit<ApprovalImportItem, 'sourceX' | 'sourceY'> = {
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
      joints: detectedJoints,
      ...joints,
      ...features,
    };
    const hasExplicitLegProduct = Boolean(nextProduct && productNameLooksLeg(nextProduct.name));
    const generatedLegItems = hasExplicitLegProduct
      ? []
      : rows
        .filter(isApprovalLegRow)
        .map((row, rowIndex) => generatedLegItemFromRow(product, row, rowIndex))
        .filter(Boolean) as Array<Omit<ApprovalImportItem, 'sourceX' | 'sourceY'>>;
    return [mainItem, ...generatedLegItems];
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
        confidence: dimension.confidence,
        sourceBox: dimension.sourceBox,
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
        jointsMm: item.joints?.map((joint) => [joint.start, joint.end]) ?? [],
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
        joints: item.joints?.map((joint) => [joint.start, joint.end]) ?? [],
      },
      validation: {
        status: item.importStatus,
        warnings: item.warnings,
      },
      dimensionsSource: item.dimensionsSource,
      shapeMode: item.shapeMode,
      contourPointsCount: item.customPoints?.length ?? 0,
      finalImportAllowed: item.geometrySource === 'spec-generated'
        ? item.importStatus !== 'Error'
          && item.shapeMode === 'customContour'
          && Boolean(item.customPoints?.length)
        : item.importStatus !== 'Error'
        && item.geometrySource !== 'none'
        && item.shapeMode === 'customContour'
        && Boolean(item.customPoints?.length)
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

function generatedLinkedWallPanelNumber(parentNumber: number, side: string) {
  const normalizedSide = normalizeSourceSide(side);
  const sideIndex = Math.max(1, normalizedSide.charCodeAt(0) - 64);
  return parentNumber * 100 + sideIndex;
}

function linkedWallPanelProductNumber(text: string) {
  const normalized = normalizeText(text);
  const match = normalized.match(/Виріб\s+"?Стінова\s+панель"?\s+по\s+стороні\s+([A-IАВСЕІ])[^№#]*(?:№|#)\s*(\d+)/iu)
    ?? normalized.match(/Р’РёСЂС–Р±\s+"?РЎС‚С–РЅРѕРІР°\s+РїР°РЅРµР»СЊ"?\s+РїРѕ\s+СЃС‚РѕСЂРѕРЅС–\s+([A-IРђР’РЎР•Р†])[^в„–#]*(?:в„–|#)\s*(\d+)/iu);
  if (!match) return undefined;
  return generatedLinkedWallPanelNumber(Number(match[2]), match[1]);
}

function productAnchorsFromTextItems(
  items: Array<{ str?: string; transform?: unknown }>,
  pageNumber: number,
  pageHeight: number,
) {
  const anchors: ApprovalProductAnchor[] = [];
  items.forEach((item) => {
    const text = normalizeText(item.str ?? '');
    if (!text) return;
    const transform = Array.isArray(item.transform) ? item.transform : [];
    const y = Number(transform[5]);
    if (!Number.isFinite(y)) return;
    const topRatio = Math.max(0, Math.min(1, (pageHeight - y) / Math.max(1, pageHeight)));
    const numberedMatch = text.match(/Виріб\s*№\s*(\d+)/iu)
      ?? text.match(/Р’РёСЂС–Р±\s*(?:в„–|№)\s*(\d+)/iu);
    const number = numberedMatch ? Number(numberedMatch[1]) : linkedWallPanelProductNumber(text);
    if (!Number.isFinite(number) || !number) return;
    anchors.push({
      number,
      pageNumber,
      topRatio,
      globalTop: pageNumber + topRatio,
    });
  });
  return anchors;
}

function assignDrawingsToPreviousProductAnchors(drawings: ApprovalDrawingGeometry[], anchors: ApprovalProductAnchor[]) {
  const orderedAnchors = [...anchors].sort((first, second) => first.globalTop - second.globalTop);
  const orderedAnchorNumbers = orderedAnchors
    .map((anchor) => anchor.number)
    .filter((number, index, list) => list.indexOf(number) === index);
  drawings.forEach((drawing) => {
    const orderedNumber = orderedAnchorNumbers[drawings.indexOf(drawing)];
    if (orderedNumber) {
      drawing.sourceProductNumber = orderedNumber;
      return;
    }
    if (!drawing.sourcePage) return;
    const globalTop = drawing.sourcePage + (drawing.sourcePageTopRatio ?? 0);
    const previousAnchor = [...orderedAnchors]
      .filter((anchor) => anchor.globalTop <= globalTop + 0.015)
      .sort((first, second) => second.globalTop - first.globalTop)[0];
    if (previousAnchor) drawing.sourceProductNumber = previousAnchor.number;
  });
}

/** Reads PDF text and product drawing images; small edge-profile images are intentionally ignored. */
async function extractPdfData(file: File) {
  console.warn('[APPROVAL_DEBUG] Reading file arrayBuffer');
  const data = new Uint8Array(await file.arrayBuffer());
  console.warn('[APPROVAL_DEBUG] getDocument');
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  console.warn(`[APPROVAL_DEBUG] PDF loaded, ${pdf.numPages} pages`);
  const pages: string[] = [];
  const drawings: ApprovalDrawingGeometry[] = [];
  const productAnchors: ApprovalProductAnchor[] = [];
  const diagnostics = {
    fileName: file.name,
    pageCount: pdf.numPages,
    imageOpCount: 0,
    largeImageOpCount: 0,
    rasterCount: 0,
    traceCount: 0,
    imageSamples: [] as Array<Record<string, unknown>>,
    drawingAssignments: [] as Array<Record<string, unknown>>,
    ocrSamples: [] as Array<Record<string, unknown>>,
  };
  const ops = pdfjsLib.OPS as unknown as Record<string, number | undefined>;
  const imageOps = new Set([
    ops.paintImageXObject,
    ops.paintJpegXObject,
    ops.paintInlineImageXObject,
  ].filter((value): value is number => typeof value === 'number'));
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    console.warn(`[APPROVAL_DEBUG] Reading page ${pageNumber}`);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join('\n');
    const pageProductNumbers = productNumbersFromPageText(pageText);
    productAnchors.push(...productAnchorsFromTextItems(
      content.items as Array<{ str?: string; transform?: unknown }>,
      pageNumber,
      viewport.height,
    ));
    pages.push(pageText);
    console.warn(`[APPROVAL_DEBUG] Getting operator list for page ${pageNumber}`);
    const operators = await page.getOperatorList();
    console.warn(`[APPROVAL_DEBUG] Found ${operators.fnArray.length} operators`);
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
      console.warn(`[APPROVAL_DEBUG] Rendering raster for image op at index ${index}`);
      const raster = await approvalRasterFromPdfImageObject(image);
      if (!raster?.width || !raster.height || !raster.data) continue;
      if (raster.width < 700 || raster.height < 280) continue;
      const positionedTextItems = positionedTextItemsForRaster(
        content.items as Array<{ str?: string; transform?: unknown; width?: number; height?: number }>,
        pageNumber,
        { width: viewport.width, height: viewport.height },
        { width: raster.width, height: raster.height },
      );
      diagnostics.largeImageOpCount += 1;
      diagnostics.rasterCount += 1;
      console.warn(`[APPROVAL_DEBUG] Tracing geometry for ${raster.width}x${raster.height} raster`);
      const geometries = traceApprovalDrawingImage({ width: raster.width, height: raster.height, data: raster.data });
      console.warn(`[APPROVAL_DEBUG] Found ${geometries.length} geometries`);
      for (const geometry of geometries) {
        diagnostics.traceCount += 1;
        geometry.sourcePage = pageNumber;
        geometry.sourceProductNumber = pageProductNumbers.length === 1
          ? pageProductNumbers[0]
          : undefined;
        geometry.sourcePageTopRatio = geometry.sourceBounds.minY / Math.max(1, raster.height);
        const preview = approvalRasterCropDataUrl({ width: raster.width, height: raster.height, data: raster.data }, geometry.sourceBounds);
        if (preview) {
          geometry.sourceImage = preview.image;
          geometry.sourceImageBounds = preview.bounds;
        }
        const textDimensions = extractDimensionsNearDrawingText(positionedTextItems, geometry);
        const ocrResult = await extractDimensionsNearDrawingOcr(
          { width: raster.width, height: raster.height, data: raster.data },
          geometry,
          textDimensions,
        );
        geometry.sourceDimensions = uniqueDimensionLabelsBySide([
          ...textDimensions,
          ...ocrResult.dimensions,
        ]);
        geometry.sourceDimensionsOcrStatus = ocrResult.status;
        geometry.sourceDimensionsOcrText = ocrResult.text;
        geometry.sourceDimensionsOcrError = ocrResult.error;
        if (diagnostics.ocrSamples.length < 24) {
          diagnostics.ocrSamples.push({
            pageNumber,
            status: ocrResult.status,
            dimensions: ocrResult.dimensions.map((dimension) => ({
              side: dimension.side,
              value: dimension.value,
              source: dimension.source,
              confidence: dimension.confidence,
              sourceBox: dimension.sourceBox,
            })),
            text: ocrResult.text?.slice(0, 500),
            error: ocrResult.error,
          });
        }
        drawings.push(geometry);
      }
    }
  }
  assignDrawingsToPreviousProductAnchors(drawings, productAnchors);
  diagnostics.drawingAssignments = drawings.map((drawing) => ({
    productNumber: drawing.sourceProductNumber,
    page: drawing.sourcePage,
    topRatio: drawing.sourcePageTopRatio,
    x: drawing.sourceBounds.minX,
    y: drawing.sourceBounds.minY,
    width: drawing.sourceBounds.maxX - drawing.sourceBounds.minX,
    height: drawing.sourceBounds.maxY - drawing.sourceBounds.minY,
    sourceDimensions: drawing.sourceDimensions,
    sourceDimensionsOcrStatus: drawing.sourceDimensionsOcrStatus,
    sourceDimensionsOcrError: drawing.sourceDimensionsOcrError,
  }));
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
