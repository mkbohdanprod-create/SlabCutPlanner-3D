import type { CutAllowances, Detail, DetailPart, EdgeFeature, Point } from '../domain/types';
import { getDimsLabel, buildDetailCounters } from '../lib/project';
import { mm2ToM2 } from '../utils/math';

import { DEFAULT_ALLOWANCES } from '../domain/defaults';

let activeAllowances = DEFAULT_ALLOWANCES;
const SHAPE_LABELS = new Set([
  'Прямокутна',
  'Коло',
  'Еліпс',
  'Г-подібна',
  'П-подібна',
  'Мийка прямокутна',
  'Мийка щілинна',
]);
const L_PART_SHAPE = 'Г-подібна' as DetailPart['shape'];

type PartLayoutMeta = {
  textureGroupLabel?: string;
  textureGroupKind?: DetailPart['textureGroupKind'];
  textureOffsetX?: number;
  textureOffsetY?: number;
  textureGroupAnchor?: boolean;
  textureIrrelevant?: boolean;
  elementSide?: string;
  parentAnchor?: DetailPart['parentAnchor'];
  elementAnchor?: DetailPart['elementAnchor'];
  sideAliases?: Record<string, 'A' | 'B' | 'C' | 'D'>;
  sideSegments?: Record<string, { start: Point; end: Point }>;
  holes?: Point[][];
  nominalPoints?: Point[];
  nominalHoles?: Point[][];
};

let pendingRectMeta: PartLayoutMeta | undefined;

function rectPoints(width: number, height: number): Point[] {
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
}

function offsetPoints(points: Point[], x: number, y: number): Point[] {
  return points.map((point) => ({ x: point.x + x, y: point.y + y }));
}

function scalePoints(points: Point[], width: number, height: number, nextWidth: number, nextHeight: number): Point[] {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  return points.map((point) => ({ x: (point.x / safeWidth) * nextWidth, y: (point.y / safeHeight) * nextHeight }));
}

function pointsBounds(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Returns signed polygon area so offset normals follow the contour direction. */
function signedPolygonArea(points: Point[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function pointDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point) {
  const length = Math.max(0.0001, pointDistance(lineStart, lineEnd));
  return Math.abs((lineEnd.y - lineStart.y) * point.x - (lineEnd.x - lineStart.x) * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / length;
}

/** Removes tiny DXF artifacts so allowance offsets do not create visible teeth at dirty corners. */
function cleanPolygonForOffset(points: Point[], tolerance: number) {
  if (points.length <= 3) return points;
  const minSegment = Math.max(0.4, tolerance);
  let cleaned = points.filter((point, index) => pointDistance(point, points[(index + 1) % points.length]) > minSegment);
  if (cleaned.length < 3) cleaned = points;

  let changed = true;
  while (changed && cleaned.length > 3) {
    changed = false;
    cleaned = cleaned.filter((point, index, items) => {
      const previous = items[(index - 1 + items.length) % items.length];
      const next = items[(index + 1) % items.length];
      const shortCorner = pointDistance(previous, point) <= minSegment || pointDistance(point, next) <= minSegment;
      const almostStraight = perpendicularDistance(point, previous, next) <= Math.max(0.35, minSegment * 0.18);
      const keep = !shortCorner && !almostStraight;
      if (!keep) changed = true;
      return keep;
    });
  }
  return cleaned.length >= 3 ? cleaned : points;
}

/** Finds the intersection point of two infinite lines used by polygon offsets. */
function intersectLines(a1: Point, a2: Point, b1: Point, b2: Point): Point | undefined {
  const dxA = a2.x - a1.x;
  const dyA = a2.y - a1.y;
  const dxB = b2.x - b1.x;
  const dyB = b2.y - b1.y;
  const cross = dxA * dyB - dyA * dxB;
  if (Math.abs(cross) < 0.0001) return undefined;
  const t = ((b1.x - a1.x) * dyB - (b1.y - a1.y) * dxB) / cross;
  return { x: a1.x + dxA * t, y: a1.y + dyA * t };
}

/** Builds an outer allowance contour while keeping the original contour available for display. */
function offsetPolygon(points: Point[], padX: number, padY: number) {
  const safePadX = Math.max(0, padX);
  const safePadY = Math.max(0, padY);
  if (points.length < 3 || (safePadX === 0 && safePadY === 0)) {
    const bounds = pointsBounds(points);
    return {
      points: offsetPoints(points, -bounds.minX, -bounds.minY),
      width: bounds.width,
      height: bounds.height,
      shiftX: -bounds.minX,
      shiftY: -bounds.minY,
    };
  }

  const uniformPad = Math.max(safePadX, safePadY);
  const originalBounds = pointsBounds(points);
  const compactContour = points.length <= 4 || Math.min(originalBounds.width, originalBounds.height) <= uniformPad * 6;
  const cleanedPoints = compactContour
    ? points
    : cleanPolygonForOffset(points, Math.min(6, Math.max(0.8, uniformPad * 0.22)));
  const axisAligned = cleanedPoints.every((point, index) => {
    const next = cleanedPoints[(index + 1) % cleanedPoints.length];
    return Math.abs(point.x - next.x) < 0.001 || Math.abs(point.y - next.y) < 0.001;
  });
  const areaSign = signedPolygonArea(cleanedPoints) >= 0 ? 1 : -1;
  const lines = cleanedPoints.map((start, index) => {
    const end = cleanedPoints[(index + 1) % cleanedPoints.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(0.0001, Math.hypot(dx, dy));
    const normal = areaSign >= 0
      ? { x: dy / length, y: -dx / length }
      : { x: -dy / length, y: dx / length };
    const offset = axisAligned
      ? { x: normal.x * safePadX, y: normal.y * safePadY }
      : { x: normal.x * uniformPad, y: normal.y * uniformPad };
    return {
      start: { x: start.x + offset.x, y: start.y + offset.y },
      end: { x: end.x + offset.x, y: end.y + offset.y },
      offset,
    };
  });

  const rawPoints = cleanedPoints.map((point, index) => {
    const prev = lines[(index - 1 + lines.length) % lines.length];
    const next = lines[index];
    const intersection = intersectLines(prev.start, prev.end, next.start, next.end);
    const fallback = {
      x: point.x + (prev.offset.x + next.offset.x) / 2,
      y: point.y + (prev.offset.y + next.offset.y) / 2,
    };
    if (!intersection) return fallback;
    const miterLimit = compactContour ? Math.max(60, uniformPad * 8) : Math.max(12, uniformPad * 2.2);
    return Math.hypot(intersection.x - point.x, intersection.y - point.y) > miterLimit ? fallback : intersection;
  });
  const bounds = pointsBounds(rawPoints);
  return {
    points: offsetPoints(rawPoints, -bounds.minX, -bounds.minY),
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height),
    shiftX: -bounds.minX,
    shiftY: -bounds.minY,
  };
}

/** Shrinks an internal cutout around its own center; skips impossible offsets for small holes. */
function contractHoleTowardCenter(points: Point[], allowance: number) {
  const offset = Math.max(0, allowance);
  if (offset <= 0 || points.length < 3) return points;
  const bounds = pointsBounds(points);
  const minDimension = Math.min(bounds.width, bounds.height);
  if (offset * 2 >= minDimension) return points;
  const cx = bounds.minX + bounds.width / 2;
  const cy = bounds.minY + bounds.height / 2;
  const scaleX = (bounds.width - offset * 2) / Math.max(bounds.width, 1);
  const scaleY = (bounds.height - offset * 2) / Math.max(bounds.height, 1);
  return points.map((point) => ({
    x: cx + (point.x - cx) * scaleX,
    y: cy + (point.y - cy) * scaleY,
  }));
}

/** Chooses the configured small/large internal cutout allowance by the 100 mm threshold. */
function cutoutAllowanceForHole(points: Point[], isElement: boolean) {
  const bounds = pointsBounds(points);
  const isSmall = Math.min(bounds.width, bounds.height) <= 100;
  if (isElement) return isSmall ? activeAllowances.elementSmallCutout : activeAllowances.elementLargeCutout;
  return isSmall ? activeAllowances.detailSmallCutout : activeAllowances.detailLargeCutout;
}

function circlePoints(diameter: number, segments = 36): Point[] {
  const r = diameter / 2;
  return Array.from({ length: segments }, (_, i) => {
    const a = (Math.PI * 2 * i) / segments;
    return { x: r + Math.cos(a) * r, y: r + Math.sin(a) * r };
  });
}

function ellipsePoints(width: number, height: number, segments = 42): Point[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = (Math.PI * 2 * i) / segments;
    return { x: width / 2 + Math.cos(a) * width / 2, y: height / 2 + Math.sin(a) * height / 2 };
  });
}

function areaFromPolygon(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

function stablePartId(
  detail: Detail,
  isMain: boolean,
  parentLabel: string,
  edgeKind?: DetailPart['edgeKind'],
  edgeSide?: string,
  meta?: PartLayoutMeta,
) {
  const kind = isMain ? 'main' : edgeKind ?? 'part';
  const side = edgeSide ?? 'body';
  const group = meta?.textureGroupLabel ?? parentLabel;
  const offsetX = Math.round(meta?.textureOffsetX ?? 0);
  const offsetY = Math.round(meta?.textureOffsetY ?? 0);
  return ['part', detail.id, kind, side, group, offsetX, offsetY].join(':');
}

function buildPart(
  detail: Detail,
  name: string,
  shape: DetailPart['shape'],
  points: Point[],
  width: number,
  height: number,
  isMain: boolean,
  parentLabel: string,
  edgeKind?: DetailPart['edgeKind'],
  edgeSide?: string,
  meta?: PartLayoutMeta,
): DetailPart {
  const appliedMeta = meta ?? pendingRectMeta;
  pendingRectMeta = undefined;
  const area = areaFromPolygon(points);
  const temp: DetailPart = {
    id: stablePartId(detail, isMain, parentLabel, edgeKind, edgeSide, appliedMeta),
    detailId: detail.id,
    name,
    type: detail.type,
    shape,
    width,
    height,
    rotation: 0,
    area: mm2ToM2(area),
    points,
    holes: appliedMeta?.holes,
    nominalPoints: appliedMeta?.nominalPoints,
    nominalHoles: appliedMeta?.nominalHoles,
    isMain,
    parentLabel,
    dimsLabel: '',
    edgeKind,
    edgeSide,
    textureGroupLabel: appliedMeta?.textureGroupLabel,
    textureGroupKind: appliedMeta?.textureGroupKind,
    textureOffsetX: appliedMeta?.textureOffsetX,
    textureOffsetY: appliedMeta?.textureOffsetY,
    textureGroupAnchor: appliedMeta?.textureGroupAnchor,
    textureIrrelevant: appliedMeta?.textureIrrelevant,
    elementSide: appliedMeta?.elementSide,
    parentAnchor: appliedMeta?.parentAnchor,
    elementAnchor: appliedMeta?.elementAnchor,
    sideAliases: appliedMeta?.sideAliases,
    sideSegments: appliedMeta?.sideSegments,
  };
  temp.dimsLabel = getDimsLabel(temp);
  return temp;
}

function buildRectPart(detail: Detail, name: string, width: number, height: number, isMain: boolean, parentLabel: string, edgeKind?: DetailPart['edgeKind'], edgeSide?: string, meta?: PartLayoutMeta): DetailPart {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  pendingRectMeta = meta;
  return buildPart(detail, name, 'Прямокутна', rectPoints(w, h), w, h, isMain, parentLabel, edgeKind, edgeSide);
}

function genitiveLabel(label: string) {
  const words = label.trim().split(/\s+/);
  if (!words.length) return label;
  const typedForms: Array<[RegExp, string]> = [
    [/^Стільниця\b/i, 'стільниці'],
    [/^Стінова панель\b/i, 'стінової панелі'],
    [/^Мийка\b/i, 'мийки'],
    [/^Фасад\b/i, 'фасаду'],
    [/^Опора\b/i, 'опори'],
  ];
  const typed = typedForms.find(([pattern]) => pattern.test(label));
  if (typed) return label.replace(typed[0], typed[1]);

  const next = words.map((word, index) => {
    const lower = word[0].toLocaleLowerCase('uk-UA') + word.slice(1);
    if (index === 0 && lower.endsWith('ий')) return `${lower.slice(0, -2)}ого`;
    if (index === 0 && lower.endsWith('ій')) return `${lower.slice(0, -2)}ього`;
    if (index === words.length - 1 && /[бвгґджзклмнпрстфхцчшщ]$/i.test(lower)) return `${lower}у`;
    return lower;
  });
  return next.join(' ');
}

function edgePartName(parentLabel: string, edgeKind: DetailPart['edgeKind'], side: string) {
  const prefix = edgeKind === 'fold' ? 'Підворот' : 'Потовщення';
  return `${prefix} ${genitiveLabel(parentLabel)} сторона ${side}`;
}

function splitLabel(parentLabel: string, index: number) {
  return `${parentLabel}.${index}`;
}

function parentLabelForDetail(detail: Detail, counters: Map<string, number>, quantityIndex = 0) {
  const index = counters.get(`${detail.id}:${quantityIndex}`) ?? quantityIndex + 1;
  const customLabel = detail.label?.trim();
  return customLabel && !SHAPE_LABELS.has(customLabel)
    ? detail.quantity > 1 ? `${customLabel} ${index}` : customLabel
    : `${detail.type} ${index}`;
}

function sideSegment(part: DetailPart, side: string) {
  const segmentIndexes: Record<string, Partial<Record<string, number>>> = {
    'Прямокутна': { B: 0, C: 1, D: 2, A: 3 },
    'Г-подібна': { B: 0, C: 1, D: 2, E: 3, F: 4, A: 5 },
    'П-подібна': { B: 0, C: 1, D: 2, E: 3, F: 4, G: 5, H: 6, A: 7 },
  };
  const index = segmentIndexes[part.shape]?.[side];
  if (index === undefined || !part.points[index]) return undefined;
  return { start: part.points[index], end: part.points[(index + 1) % part.points.length] };
}

function segmentLength(segment: { start: Point; end: Point }) {
  return Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
}

function allowanceRectMeta(nominalWidth: number, nominalHeight: number, padX: number, padY: number, meta?: PartLayoutMeta): PartLayoutMeta | undefined {
  if (padX <= 0 && padY <= 0) return meta;
  return { ...(meta ?? {}), nominalPoints: offsetPoints(rectPoints(nominalWidth, nominalHeight), padX, padY) };
}

function nominalSegment(part: DetailPart, side: string) {
  if (!part.nominalPoints?.length) return sideSegment(part, side);
  return sideSegment({ ...part, points: part.nominalPoints }, side);
}

function lShapePoints(ow: number, oh: number, ih: number, iv: number, orientation: 'TL' | 'TR' | 'BL' | 'BR' = 'BR'): Point[] {
  switch (orientation) {
    case 'TL': return [{ x: 0, y: iv }, { x: ih, y: iv }, { x: ih, y: 0 }, { x: ow, y: 0 }, { x: ow, y: oh }, { x: 0, y: oh }];
    case 'TR': return [{ x: 0, y: 0 }, { x: ow - ih, y: 0 }, { x: ow - ih, y: iv }, { x: ow, y: iv }, { x: ow, y: oh }, { x: 0, y: oh }];
    case 'BL': return [{ x: 0, y: 0 }, { x: ow, y: 0 }, { x: ow, y: oh }, { x: ih, y: oh }, { x: ih, y: oh - iv }, { x: 0, y: oh - iv }];
    default: return [{ x: 0, y: 0 }, { x: ow, y: 0 }, { x: ow, y: oh - iv }, { x: ih, y: oh - iv }, { x: ih, y: oh }, { x: 0, y: oh }];
  }
}

function uShapePoints(w: number, h: number, cutW: number, cutD: number, offset: number, side: 'top' | 'bottom' | 'left' | 'right' = 'bottom'): Point[] {
  if (side === 'top') return [{ x: 0, y: cutD }, { x: offset, y: cutD }, { x: offset, y: 0 }, { x: offset + cutW, y: 0 }, { x: offset + cutW, y: cutD }, { x: w, y: cutD }, { x: w, y: h }, { x: 0, y: h }];
  if (side === 'left') return [{ x: cutD, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: cutD, y: h }, { x: cutD, y: offset + cutW }, { x: 0, y: offset + cutW }, { x: 0, y: offset }, { x: cutD, y: offset }];
  if (side === 'right') return [{ x: 0, y: 0 }, { x: w - cutD, y: 0 }, { x: w - cutD, y: offset }, { x: w, y: offset }, { x: w, y: offset + cutW }, { x: w - cutD, y: offset + cutW }, { x: w - cutD, y: h }, { x: 0, y: h }];
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: offset + cutW, y: h }, { x: offset + cutW, y: h - cutD }, { x: offset, y: h - cutD }, { x: offset, y: h }, { x: 0, y: h }];
}

/** Creates a G-shaped actual contour using only the external-contour allowance. */
function lShapeWithAllowances(ow: number, oh: number, ih: number, iv: number, orientation: 'TL' | 'TR' | 'BL' | 'BR' = 'BR') {
  const padX = Math.max(0, activeAllowances.detailLength);
  const padY = Math.max(0, activeAllowances.detailWidth);
  const nominal = lShapePoints(ow, oh, ih, iv, orientation);
  const offset = offsetPolygon(nominal, padX, padY);

  return {
    points: offset.points,
    width: offset.width,
    height: offset.height,
    nominalPoints: offsetPoints(nominal, offset.shiftX, offset.shiftY),
  };
}

/** Creates a U-shaped actual contour using only the external-contour allowance. */
function uShapeWithAllowances(w: number, h: number, cutW: number, cutD: number, offset: number, side: 'top' | 'bottom' | 'left' | 'right' = 'bottom') {
  const padX = Math.max(0, activeAllowances.detailLength);
  const padY = Math.max(0, activeAllowances.detailWidth);
  const nominal = uShapePoints(w, h, cutW, cutD, offset, side);
  const offsetContour = offsetPolygon(nominal, padX, padY);

  return {
    points: offsetContour.points,
    width: offsetContour.width,
    height: offsetContour.height,
    nominalPoints: offsetPoints(nominal, offsetContour.shiftX, offsetContour.shiftY),
  };
}

function sectorBandCircle(diameter: number, band: number, startAngle: number, endAngle: number): Point[] {
  const r = diameter / 2;
  const inner = Math.max(r - band, 1);
  const cx = r; const cy = r;
  const steps = 14;
  const outer = Array.from({ length: steps + 1 }, (_, i) => {
    const a = startAngle + ((endAngle - startAngle) * i) / steps;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
  const innerPts = Array.from({ length: steps + 1 }, (_, i) => {
    const a = endAngle - ((endAngle - startAngle) * i) / steps;
    return { x: cx + Math.cos(a) * inner, y: cy + Math.sin(a) * inner };
  });
  return [...outer, ...innerPts];
}

function sectorBandEllipse(width: number, height: number, band: number, startAngle: number, endAngle: number): Point[] {
  const rx = width / 2; const ry = height / 2;
  const irx = Math.max(rx - band, 1); const iry = Math.max(ry - band, 1);
  const cx = rx; const cy = ry;
  const steps = 16;
  const outer = Array.from({ length: steps + 1 }, (_, i) => {
    const a = startAngle + ((endAngle - startAngle) * i) / steps;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });
  const innerPts = Array.from({ length: steps + 1 }, (_, i) => {
    const a = endAngle - ((endAngle - startAngle) * i) / steps;
    return { x: cx + Math.cos(a) * irx, y: cy + Math.sin(a) * iry };
  });
  return [...outer, ...innerPts];
}

function normalizePoints(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    points: points.map((point) => ({ x: point.x - minX, y: point.y - minY })),
    width: maxX - minX,
    height: maxY - minY,
  };
}

function edgeParts(detail: Detail, feature: EdgeFeature | undefined, basePart: DetailPart, edgeKind: DetailPart['edgeKind']): DetailPart[] {
  if (!feature?.enabled || feature.size <= 0 || feature.sides.length === 0) return [];
  const meta = basePart.textureGroupLabel
    ? splitMeta(basePart.textureGroupLabel, basePart.textureOffsetX ?? 0, basePart.textureOffsetY ?? 0)
    : undefined;
  const isCurved = basePart.points.length > 8;
  const validSides = feature.sides.filter((side, index, sides) => (
    sides.indexOf(side) === index && (isCurved ? ['A', 'B', 'C', 'D'].includes(side) : sideSegment(basePart, side))
  ));
  if (validSides.length === 0) return [];
  if (basePart.points.length > 8) {
    const sideAngles: Record<string, [number, number]> = {
      A: [Math.PI, Math.PI * 1.5],
      B: [Math.PI * 1.5, Math.PI * 2],
      C: [0, Math.PI / 2],
      D: [Math.PI / 2, Math.PI],
    };
    return validSides.filter((s) => ['A', 'B', 'C', 'D'].includes(s)).map((side) => {
      const points = basePart.width === basePart.height
        ? sectorBandCircle(basePart.width, feature.size, sideAngles[side][0], sideAngles[side][1])
        : sectorBandEllipse(basePart.width, basePart.height, feature.size, sideAngles[side][0], sideAngles[side][1]);
      const normalized = normalizePoints(points);
      return buildPart(detail, edgePartName(basePart.parentLabel, edgeKind, side), basePart.shape, normalized.points, normalized.width, normalized.height, false, basePart.parentLabel, edgeKind, side);
    });
  }
  if (detail.shape === 'Кругла' || detail.shape === 'Овальна') {
    const sideAngles: Record<string, [number, number]> = {
      A: [Math.PI, Math.PI * 1.5],
      B: [Math.PI * 1.5, Math.PI * 2],
      C: [0, Math.PI / 2],
      D: [Math.PI / 2, Math.PI],
    };
    return validSides.filter((s) => ['A', 'B', 'C', 'D'].includes(s)).map((side) => {
      const points = detail.shape === 'Кругла'
        ? sectorBandCircle(basePart.width, feature.size, sideAngles[side][0], sideAngles[side][1])
        : sectorBandEllipse(basePart.width, basePart.height, feature.size, sideAngles[side][0], sideAngles[side][1]);
      return buildPart(detail, edgePartName(basePart.parentLabel, edgeKind, side), detail.shape, points, basePart.width, basePart.height, false, basePart.parentLabel, edgeKind, side);
    });
  }
  return validSides.map((side) => {
    const segment = nominalSegment(basePart, side);
    const horizontal = segment ? Math.abs(segment.end.x - segment.start.x) >= Math.abs(segment.end.y - segment.start.y) : ['B', 'D', 'F', 'H'].includes(side);
    const nominalLength = segment ? Math.max(1, segmentLength(segment)) : (horizontal ? basePart.width : basePart.height);
    const nominalEdgeSize = Math.max(1, feature.size);
    const length = Math.max(1, nominalLength + activeAllowances.elementLength * 2);
    const edgeSize = Math.max(1, nominalEdgeSize + activeAllowances.elementWidth * 2);
    const width = horizontal ? length : edgeSize;
    const height = horizontal ? edgeSize : length;
    const nominalWidth = horizontal ? nominalLength : nominalEdgeSize;
    const nominalHeight = horizontal ? nominalEdgeSize : nominalLength;
    const allowanceMeta = allowanceRectMeta(nominalWidth, nominalHeight, activeAllowances.elementLength, activeAllowances.elementWidth, meta);
    return buildRectPart(detail, edgePartName(basePart.parentLabel, edgeKind, side), width, height, false, basePart.parentLabel, edgeKind, side, allowanceMeta);
  });
}

type EdgeSpec = { side: string; length: number; horizontal: boolean };

function edgePartsFromSpecs(detail: Detail, feature: EdgeFeature | undefined, parentLabel: string, edgeKind: DetailPart['edgeKind'], specs: EdgeSpec[], meta?: PartLayoutMeta): DetailPart[] {
  if (!feature?.enabled || feature.size <= 0 || feature.sides.length === 0) return [];
  return specs
    .filter((spec) => feature.sides.includes(spec.side) && spec.length > 0)
    .map((spec) => {
      const nominalLength = Math.max(1, spec.length);
      const nominalEdgeSize = Math.max(1, feature.size);
      const length = Math.max(1, nominalLength + activeAllowances.elementLength * 2);
      const edgeSize = Math.max(1, nominalEdgeSize + activeAllowances.elementWidth * 2);
      const width = spec.horizontal ? length : edgeSize;
      const height = spec.horizontal ? edgeSize : length;
      const nominalWidth = spec.horizontal ? nominalLength : nominalEdgeSize;
      const nominalHeight = spec.horizontal ? nominalEdgeSize : nominalLength;
      const allowanceMeta = allowanceRectMeta(nominalWidth, nominalHeight, activeAllowances.elementLength, activeAllowances.elementWidth, meta);
      return buildRectPart(detail, edgePartName(parentLabel, edgeKind, spec.side), width, height, false, parentLabel, edgeKind, spec.side, allowanceMeta);
    });
}

function pushPartWithEdges(parts: DetailPart[], detail: Detail, main: DetailPart, specs?: EdgeSpec[]) {
  const meta = main.textureGroupLabel
    ? splitMeta(main.textureGroupLabel, main.textureOffsetX ?? 0, main.textureOffsetY ?? 0)
    : undefined;
  const thickening = specs
    ? edgePartsFromSpecs(detail, detail.thickening, main.parentLabel, 'thickening', specs, meta)
    : edgeParts(detail, detail.thickening, main, 'thickening');
  const fold = specs
    ? edgePartsFromSpecs(detail, detail.fold, main.parentLabel, 'fold', specs, meta)
    : edgeParts(detail, detail.fold, main, 'fold');
  parts.push(main, ...thickening, ...fold);
}

function splitMeta(textureGroupLabel: string, textureOffsetX: number, textureOffsetY: number, sideAliases?: Record<string, 'A' | 'B' | 'C' | 'D'>, sideSegments?: Record<string, { start: Point; end: Point }>): PartLayoutMeta {
  return { textureGroupLabel, textureOffsetX, textureOffsetY, sideAliases, sideSegments };
}

function verticalSegment(x: number, y: number, length: number) {
  return { start: { x, y }, end: { x, y: y + length } };
}

function horizontalSegment(x: number, y: number, length: number) {
  return { start: { x, y }, end: { x: x + length, y } };
}

function centeredCircleHole(width: number, height: number, diameter: number) {
  const size = Math.max(8, Math.min(diameter, width - 8, height - 8));
  return offsetPoints(circlePoints(size, 28), (width - size) / 2, (height - size) / 2);
}

function centeredRectHole(width: number, height: number, holeWidth: number, holeHeight: number) {
  const w = Math.max(8, Math.min(holeWidth, width - 8));
  const h = Math.max(8, Math.min(holeHeight, height - 8));
  return offsetPoints(rectPoints(w, h), (width - w) / 2, Math.max(4, (height - h) * 0.28));
}

function buildSlotSinkRectPart(
  detail: Detail,
  name: string,
  nominalWidth: number,
  nominalHeight: number,
  parentLabel: string,
  meta?: PartLayoutMeta,
) {
  const padX = Math.max(0, activeAllowances.detailLength);
  const padY = Math.max(0, activeAllowances.detailWidth);
  const width = Math.max(1, nominalWidth + padX * 2);
  const height = Math.max(1, nominalHeight + padY * 2);
  return buildRectPart(
    detail,
    name,
    width,
    height,
    true,
    parentLabel,
    undefined,
    undefined,
    allowanceRectMeta(nominalWidth, nominalHeight, padX, padY, meta),
  );
}

function buildAllowanceLPart(
  detail: Detail,
  name: string,
  nominalWidth: number,
  nominalHeight: number,
  nominalInnerHorizontal: number,
  nominalInnerVertical: number,
  orientation: 'TL' | 'TR' | 'BL' | 'BR',
  parentLabel: string,
  meta?: PartLayoutMeta,
) {
  const layout = lShapeWithAllowances(nominalWidth, nominalHeight, nominalInnerHorizontal, nominalInnerVertical, orientation);
  return buildPart(detail, name, L_PART_SHAPE, layout.points, layout.width, layout.height, true, parentLabel, undefined, undefined, {
    ...(meta ?? {}),
    nominalPoints: layout.nominalPoints,
  });
}

function buildSinkPolygonPart(
  detail: Detail,
  name: string,
  nominalPoints: Point[],
  nominalWidth: number,
  nominalHeight: number,
  parentLabel: string,
  meta?: PartLayoutMeta,
) {
  const padX = Math.max(0, activeAllowances.detailLength);
  const padY = Math.max(0, activeAllowances.detailWidth);
  const offset = (padX > 0 || padY > 0) ? offsetPolygon(nominalPoints, padX, padY) : undefined;
  return buildPart(
    detail,
    name,
    detail.shape,
    offset?.points ?? nominalPoints,
    offset?.width ?? nominalWidth,
    offset?.height ?? nominalHeight,
    true,
    parentLabel,
    undefined,
    undefined,
    offset
      ? { ...(meta ?? {}), nominalPoints: offsetPoints(nominalPoints, offset.shiftX, offset.shiftY) }
      : meta,
  );
}

function triangleBack(base: number, height: number): Point[] {
  return [{ x: 0, y: 0 }, { x: base, y: 0 }, { x: base / 2, y: height }];
}

function triangleFront(base: number, height: number): Point[] {
  return [{ x: 0, y: height }, { x: base, y: height }, { x: base / 2, y: 0 }];
}

function triangleLeft(width: number, height: number): Point[] {
  return [{ x: 0, y: 0 }, { x: 0, y: height }, { x: width, y: height / 2 }];
}

function triangleRight(width: number, height: number): Point[] {
  return [{ x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height / 2 }];
}

function pushRectSinkParts(parts: DetailPart[], detail: Detail, parentLabel: string) {
  const g = detail.geometry;
  const length = Math.max(1, g.width ?? 500);
  const width = Math.max(1, g.height ?? 400);
  const depth = Math.max(1, g.innerVertical ?? 200);
  const gap = Math.max(0, activeAllowances.interPartSpacing);
  const wallLength = length + 24;
  const bottomShort = width / 2 + 12;
  const bottomLong = length / 2 + 12;
  const glueWidth = 30;
  const gluePocketWidth = 52;
  const gluePocketLength = 200;
  const drainDiameter = 114;
  const groupLabel = `${parentLabel} текстура`;
  const label = (index: number, text: string) => `${parentLabel} ${index}. ${text}`;
  const padX = Math.max(0, activeAllowances.detailLength);
  const padY = Math.max(0, activeAllowances.detailWidth);
  const layoutSize = (nominalWidth: number, nominalHeight: number) => ({
    width: Math.max(1, nominalWidth + padX * 2),
    height: Math.max(1, nominalHeight + padY * 2),
  });
  const polygonLayoutSize = (points: Point[], nominalWidth: number, nominalHeight: number) => {
    if (padX <= 0 && padY <= 0) return { width: nominalWidth, height: nominalHeight };
    const offset = offsetPolygon(points, padX, padY);
    return { width: offset.width, height: offset.height };
  };

  const n1 = { width: wallLength, height: depth };
  const n2 = { width: wallLength, height: depth };
  const n3 = { width: depth, height: width };
  const n4 = { width: depth, height: width };
  const n5 = { width: wallLength, height: bottomShort };
  const n6 = { width: wallLength, height: bottomShort };
  const n7 = { width: bottomLong, height: width + 24 };
  const n8 = { width: bottomLong, height: width + 24 };
  const p1 = layoutSize(n1.width, n1.height);
  const p2 = layoutSize(n2.width, n2.height);
  const p3 = layoutSize(n3.width, n3.height);
  const p4 = layoutSize(n4.width, n4.height);
  const t5 = triangleBack(n5.width, n5.height);
  const t6 = triangleFront(n6.width, n6.height);
  const t7 = triangleLeft(n7.width, n7.height);
  const t8 = triangleRight(n8.width, n8.height);
  const p5 = polygonLayoutSize(t5, n5.width, n5.height);
  const p6 = polygonLayoutSize(t6, n6.width, n6.height);
  const p7 = polygonLayoutSize(t7, n7.width, n7.height);
  const p8 = polygonLayoutSize(t8, n8.width, n8.height);
  const centerWidth = p7.width + gap + p8.width;
  const centerX = p3.width + gap;
  const p1Y = 0;
  const p5Y = p1Y + p1.height + gap;
  const rowY = p5Y + p5.height + gap;
  const rowHeight = Math.max(p3.height, p7.height, p8.height, p4.height);
  const p6Y = rowY + rowHeight + gap;
  const p2Y = p6Y + p6.height + gap;
  const centeredX = (partWidth: number) => centerX + (centerWidth - partWidth) / 2;
  const meta = (x: number, y: number, textureGroupAnchor = false): PartLayoutMeta => ({ textureGroupLabel: groupLabel, textureGroupKind: 'rectSink', textureOffsetX: x, textureOffsetY: y, textureGroupAnchor });

  const part13NominalWidth = width + 24;
  const part13NominalHeight = 200;
  const p9 = layoutSize(length + 48, glueWidth);
  const p10 = layoutSize(length + 48, glueWidth);
  const p11 = layoutSize(width + 24, glueWidth);
  const p12 = layoutSize(width + 24, glueWidth);
  const stripX = centeredX(p1.width) + p1.width + gap;
  const p9Y = p1Y;
  const p10Y = p9Y + p9.height + gap;
  const p11Y = p10Y + p10.height + gap;
  const p12Y = p11Y + p11.height + gap;
  const p13X = centeredX(p2.width) + p2.width + gap;
  const p13Y = p2Y;
  const p14X = Math.max(0, centeredX(p1.width) - drainDiameter - gap);
  const p14Y = Math.max(0, p1Y + (p1.height - drainDiameter) / 2);
  const freeMeta = (x: number, y: number): PartLayoutMeta => ({ ...meta(x, y), textureIrrelevant: true });
  const actualWidth = (value: number) => value + padX * 2;
  const actualHeight = (value: number) => value + padY * 2;
  const part13ActualWidth = part13NominalWidth + padX * 2;
  const part13ActualHeight = part13NominalHeight + padY * 2;

  parts.push(
    buildSlotSinkRectPart(detail, label(1, 'задня стінка мийки'), n1.width, n1.height, label(1, 'задня стінка мийки'), {
      ...meta(centeredX(p1.width), p1Y),
      holes: [centeredRectHole(actualWidth(n1.width), actualHeight(n1.height), 60, 24)],
    }),
    buildSlotSinkRectPart(detail, label(2, 'передня стінка мийки'), n2.width, n2.height, label(2, 'передня стінка мийки'), meta(centeredX(p2.width), p2Y)),
    buildSlotSinkRectPart(detail, label(3, 'ліва бокова стінка'), n3.width, n3.height, label(3, 'ліва бокова стінка'), meta(0, rowY + (rowHeight - p3.height) / 2)),
    buildSlotSinkRectPart(detail, label(4, 'права бокова стінка'), n4.width, n4.height, label(4, 'права бокова стінка'), meta(centerX + centerWidth + gap, rowY + (rowHeight - p4.height) / 2)),
    buildSinkPolygonPart(detail, label(5, 'задній трикутник дна'), t5, n5.width, n5.height, label(5, 'задній трикутник дна'), meta(centeredX(p5.width), p5Y)),
    buildSinkPolygonPart(detail, label(6, 'передній трикутник дна'), t6, n6.width, n6.height, label(6, 'передній трикутник дна'), meta(centeredX(p6.width), p6Y)),
    buildSinkPolygonPart(detail, label(7, 'лівий трикутник дна'), t7, n7.width, n7.height, label(7, 'лівий трикутник дна'), meta(centerX, rowY + (rowHeight - p7.height) / 2, true)),
    buildSinkPolygonPart(detail, label(8, 'правий трикутник дна'), t8, n8.width, n8.height, label(8, 'правий трикутник дна'), meta(centerX + p7.width + gap, rowY + (rowHeight - p8.height) / 2)),
    buildSlotSinkRectPart(detail, label(9, 'підклейка мийки'), length + 48, glueWidth, label(9, 'підклейка мийки'), freeMeta(stripX, p9Y)),
    buildSlotSinkRectPart(detail, label(10, 'підклейка мийки'), length + 48, glueWidth, label(10, 'підклейка мийки'), freeMeta(stripX, p10Y)),
    buildSlotSinkRectPart(detail, label(11, 'підклейка мийки'), width + 24, glueWidth, label(11, 'підклейка мийки'), freeMeta(stripX, p11Y)),
    buildSlotSinkRectPart(detail, label(12, 'підклейка мийки'), width + 24, glueWidth, label(12, 'підклейка мийки'), freeMeta(stripX, p12Y)),
    buildSlotSinkRectPart(detail, label(13, 'підклейка мийки з отвором'), part13NominalWidth, part13NominalHeight, label(13, 'підклейка мийки з отвором'), {
      ...freeMeta(p13X, p13Y),
      holes: [centeredCircleHole(part13ActualWidth, part13ActualHeight, drainDiameter)],
    }),
    buildPart(detail, label(14, 'кругла деталь дна'), 'Кругла', circlePoints(drainDiameter), drainDiameter, drainDiameter, true, label(14, 'кругла деталь дна'), undefined, undefined, meta(p14X, p14Y)),
  );
}

function pushSlotSinkParts(parts: DetailPart[], detail: Detail, parentLabel: string) {
  const g = detail.geometry;
  const length = Math.max(1, g.width ?? 550);
  const width = Math.max(1, g.height ?? 400);
  const depth = Math.max(1, g.innerVertical ?? 100);
  const siphonWidth = 80;
  const siphonExtra = 24;
  const trapWidth = 78;
  const nicheWidth = 48;
  const sideHeight = depth + 45;
  const centerWidth = Math.max(1, width - 72);
  const gap = Math.max(0, activeAllowances.interPartSpacing);

  const padX = Math.max(0, activeAllowances.detailLength);
  const padY = Math.max(0, activeAllowances.detailWidth);
  const actual = (nominalWidth: number, nominalHeight: number) => ({
    width: Math.max(1, nominalWidth + padX * 2),
    height: Math.max(1, nominalHeight + padY * 2),
  });

  const p3 = actual(length + 24, sideHeight);
  const p4 = actual(Math.max(1, length - 2), trapWidth);
  const p5 = actual(length, nicheWidth);
  const p6 = actual(length, centerWidth);
  const p7 = actual(length + 24, sideHeight);
  const p8 = actual(sideHeight, width);
  const p9 = actual(sideHeight, width);

  const centerX = p8.width + gap;
  const p3Y = 0;
  const p4Y = p3Y + p3.height + gap;
  const p5Y = p4Y + p4.height + gap;
  const p6Y = p5Y + p5.height + gap;
  const p7Y = p6Y + p6.height + gap;
  const sideY = p6Y + p6.height - p8.height;
  const groupLabel = `${parentLabel} текстура`;
  const label = (index: number, text: string) => `${parentLabel} ${index}. ${text}`;
  const meta = (x: number, y: number, textureGroupAnchor = false): PartLayoutMeta => ({ textureGroupLabel: groupLabel, textureGroupKind: 'slotSink', textureOffsetX: x, textureOffsetY: y, textureGroupAnchor });

  const free1Size = actual(length, siphonWidth);
  const free2Size = actual(length + siphonExtra, siphonWidth + siphonExtra);
  parts.push(
    buildSlotSinkRectPart(detail, label(1, 'підклейка під сифон'), length, siphonWidth, label(1, 'підклейка під сифон'), {
      textureIrrelevant: true,
      holes: [centeredCircleHole(free1Size.width, free1Size.height, 44)],
    }),
    buildSlotSinkRectPart(detail, label(2, 'підклейка під сифон'), length + siphonExtra, siphonWidth + siphonExtra, label(2, 'підклейка під сифон'), {
      textureIrrelevant: true,
      holes: [centeredCircleHole(free2Size.width, free2Size.height, 44)],
    }),
    buildSlotSinkRectPart(detail, label(3, 'боковина мийки'), length + 24, sideHeight, label(3, 'боковина мийки'), meta(centerX + (p6.width - p3.width) / 2, p3Y)),
    buildSlotSinkRectPart(detail, label(4, 'трап мийки'), Math.max(1, length - 2), trapWidth, label(4, 'трап мийки'), meta(centerX + (p6.width - p4.width) / 2, p4Y)),
    buildSlotSinkRectPart(detail, label(5, 'стінка біля трапа'), length, nicheWidth, label(5, 'стінка біля трапа'), meta(centerX, p5Y)),
    buildSlotSinkRectPart(detail, label(6, 'нахилене дно мийки'), length, centerWidth, label(6, 'нахилене дно мийки'), meta(centerX, p6Y, true)),
    buildSlotSinkRectPart(detail, label(7, 'боковина мийки'), length + 24, sideHeight, label(7, 'боковина мийки'), meta(centerX + (p6.width - p7.width) / 2, p7Y)),
    buildSlotSinkRectPart(detail, label(8, 'ліва боковина мийки'), sideHeight, width, label(8, 'ліва боковина мийки'), meta(0, sideY)),
    buildSlotSinkRectPart(detail, label(9, 'права боковина мийки'), sideHeight, width, label(9, 'права боковина мийки'), meta(centerX + p6.width + gap, p6Y + p6.height - p9.height)),
  );
}

export function explodeDetails(details: Detail[], allowances: CutAllowances = DEFAULT_ALLOWANCES): DetailPart[] {
  activeAllowances = { ...DEFAULT_ALLOWANCES, ...allowances };
  const counters = buildDetailCounters(details);
  const detailsById = new Map(details.map((detail) => [detail.id, detail]));
  const parts: DetailPart[] = [];

  details.forEach((detail) => {
    for (let i = 0; i < detail.quantity; i += 1) {
      const parentLabel = parentLabelForDetail(detail, counters, i);
      const g = detail.geometry;

      if (g.sinkKind === 'slot') {
        pushSlotSinkParts(parts, detail, parentLabel);
        continue;
      }

      if (g.sinkKind === 'rect') {
        pushRectSinkParts(parts, detail, parentLabel);
        continue;
      }

      if (g.customPoints?.length) {
        const normalized = normalizePoints(g.customPoints);
        const minX = Math.min(...g.customPoints.map((point) => point.x));
        const minY = Math.min(...g.customPoints.map((point) => point.y));
        const holes = (g.customHoles ?? []).map((hole) => hole.map((point) => ({ x: point.x - minX, y: point.y - minY })));
        const sideSegments = g.sideSegments
          ? Object.fromEntries(Object.entries(g.sideSegments).map(([side, segment]) => [
            side,
            {
              start: { x: segment.start.x - minX, y: segment.start.y - minY },
              end: { x: segment.end.x - minX, y: segment.end.y - minY },
            },
          ]))
          : undefined;
        const useImportAllowance = activeAllowances.applyToImports;
        const isElementImport = detail.importRole === 'thickening' || detail.importRole === 'fold';
        const outerPadX = useImportAllowance ? (isElementImport ? activeAllowances.elementLength : activeAllowances.detailLength) : 0;
        const outerPadY = useImportAllowance ? (isElementImport ? activeAllowances.elementWidth : activeAllowances.detailWidth) : 0;
        const offsetOuter = offsetPolygon(normalized.points, outerPadX, outerPadY);
        const actualPoints = useImportAllowance ? offsetOuter.points : normalized.points;
        const actualHoles = useImportAllowance
          ? holes.map((hole) => {
            const shiftedHole = offsetPoints(hole, offsetOuter.shiftX, offsetOuter.shiftY);
            return contractHoleTowardCenter(shiftedHole, cutoutAllowanceForHole(hole, isElementImport));
          })
          : holes;
        const nominalPoints = useImportAllowance
          ? offsetPoints(normalized.points, offsetOuter.shiftX, offsetOuter.shiftY)
          : undefined;
        const nominalHoles = useImportAllowance
          ? holes.map((hole) => offsetPoints(hole, offsetOuter.shiftX, offsetOuter.shiftY))
          : undefined;
        const nextWidth = useImportAllowance ? offsetOuter.width : normalized.width;
        const nextHeight = useImportAllowance ? offsetOuter.height : normalized.height;
        const actualSideSegments = sideSegments
          ? Object.fromEntries(Object.entries(sideSegments).map(([side, segment]) => [
            side,
            {
              start: useImportAllowance ? { x: segment.start.x + offsetOuter.shiftX, y: segment.start.y + offsetOuter.shiftY } : segment.start,
              end: useImportAllowance ? { x: segment.end.x + offsetOuter.shiftX, y: segment.end.y + offsetOuter.shiftY } : segment.end,
            },
          ]))
          : undefined;
        const importedParent = detail.parentDetailId ? detailsById.get(detail.parentDetailId) : undefined;
        const importedParentLabel = importedParent ? parentLabelForDetail(importedParent, counters) : parentLabel;
        const importGroupLabel = detail.importGroupId?.startsWith('DXF блок ')
          ? `import:${detail.importGroupId}`
          : detail.parentDetailId
          ? `import:${importedParent?.importGroupId ?? detail.parentDetailId}`
          : detail.importGroupId ? `import:${detail.importGroupId}` : `import:${detail.id}`;
        const importMeta: PartLayoutMeta = {
          holes: actualHoles,
          nominalPoints,
          nominalHoles,
          textureGroupLabel: importGroupLabel,
          textureOffsetX: detail.importOffsetX,
          textureOffsetY: detail.importOffsetY,
          elementSide: detail.elementSide,
          parentAnchor: detail.parentAnchor,
          elementAnchor: detail.elementAnchor,
          sideSegments: actualSideSegments,
        };
        if (isElementImport) {
          const edgeKind = detail.importRole === 'fold' ? 'fold' : 'thickening';
          const element = buildPart(
            detail,
            parentLabel,
            detail.shape,
            actualPoints,
            nextWidth,
            nextHeight,
            false,
            importedParentLabel,
            edgeKind,
            detail.parentDetailSide,
            importMeta,
          );
          parts.push(element);
        } else {
          const main = buildPart(detail, parentLabel, detail.shape, actualPoints, nextWidth, nextHeight, true, parentLabel, undefined, undefined, importMeta);
          pushPartWithEdges(parts, detail, main);
        }
        continue;
      }

      if (detail.shape === 'Прямокутна') {
        const nominalW = g.width ?? 600;
        const nominalH = g.height ?? 600;
        const padX = Math.max(0, activeAllowances.detailLength);
        const padY = Math.max(0, activeAllowances.detailWidth);
        const main = buildRectPart(detail, parentLabel, nominalW + padX * 2, nominalH + padY * 2, true, parentLabel, undefined, undefined, allowanceRectMeta(nominalW, nominalH, padX, padY));
        pushPartWithEdges(parts, detail, main);
        continue;
      }
      if (detail.shape === 'Кругла') {
        const nominalD = g.diameter ?? 600;
        const inset = Math.max(activeAllowances.detailLength, activeAllowances.detailWidth);
        const d = nominalD + inset * 2;
        const main = buildPart(detail, parentLabel, 'Кругла', circlePoints(d), d, d, true, parentLabel, undefined, undefined, inset > 0 ? { nominalPoints: offsetPoints(circlePoints(nominalD), inset, inset) } : undefined);
        pushPartWithEdges(parts, detail, main);
        continue;
      }
      if (detail.shape === 'Овальна') {
        const nominalW = g.ellipseWidth ?? 1000;
        const nominalH = g.ellipseHeight ?? 700;
        const padX = Math.max(0, activeAllowances.detailLength);
        const padY = Math.max(0, activeAllowances.detailWidth);
        const w = nominalW + padX * 2;
        const h = nominalH + padY * 2;
        const main = buildPart(detail, parentLabel, 'Овальна', ellipsePoints(w, h), w, h, true, parentLabel, undefined, undefined, (padX > 0 || padY > 0) ? { nominalPoints: offsetPoints(ellipsePoints(nominalW, nominalH), padX, padY) } : undefined);
        pushPartWithEdges(parts, detail, main);
        continue;
      }
      if (detail.shape === 'Г-подібна') {
        const nominalOW = g.outerWidth ?? 1800;
        const nominalOH = g.outerHeight ?? 1200;
        const nominalIH = g.innerHorizontal ?? 900;
        const nominalIV = g.innerVertical ?? 500;
        const ih = Math.min(g.innerHorizontal ?? 900, nominalOW - 20);
        const iv = Math.min(g.innerVertical ?? 500, nominalOH - 20);
        if (g.wholeDetail) {
          const layout = lShapeWithAllowances(nominalOW, nominalOH, nominalIH, nominalIV, g.cornerOrientation);
          const main = buildPart(detail, parentLabel, 'Г-подібна', layout.points, layout.width, layout.height, true, parentLabel, undefined, undefined, { nominalPoints: layout.nominalPoints });
          pushPartWithEdges(parts, detail, main);
        } else {
          const firstLabel = splitLabel(parentLabel, 1);
          const secondLabel = splitLabel(parentLabel, 2);
          if (g.jointDirection === 'vertical') {
            const first = buildSlotSinkRectPart(detail, firstLabel, ih, nominalOH, firstLabel);
            Object.assign(first, splitMeta(parentLabel, 0, 0, { E: 'C', F: 'D' }, {
              E: verticalSegment(first.width, Math.max(0, first.height - iv), iv),
              F: horizontalSegment(0, first.height, Math.min(first.width, ih)),
            }));
            const second = buildSlotSinkRectPart(detail, secondLabel, Math.max(nominalOW - ih, 1), Math.max(nominalOH - iv, 1), secondLabel, splitMeta(parentLabel, first.width, 0));
            pushPartWithEdges(parts, detail, first, [
              { side: 'A', length: nominalOH, horizontal: false },
              { side: 'B', length: ih, horizontal: true },
              { side: 'E', length: iv, horizontal: false },
              { side: 'F', length: ih, horizontal: true },
            ]);
            pushPartWithEdges(parts, detail, second, [
              { side: 'B', length: Math.max(nominalOW - ih, 1), horizontal: true },
              { side: 'C', length: Math.max(nominalOH - iv, 1), horizontal: false },
              { side: 'D', length: Math.max(nominalOW - ih, 1), horizontal: true },
            ]);
          } else {
            const firstHeight = Math.max(nominalOH - iv, 1);
            const nominalFirstHeight = Math.max(nominalOH - iv, 1);
            const first = buildSlotSinkRectPart(detail, firstLabel, nominalOW, firstHeight, firstLabel);
            Object.assign(first, splitMeta(parentLabel, 0, 0, undefined, {
              D: horizontalSegment(ih, first.height, Math.max(nominalOW - ih, 1)),
            }));
            const second = buildSlotSinkRectPart(detail, secondLabel, ih, iv, secondLabel);
            Object.assign(second, splitMeta(parentLabel, 0, first.height, { E: 'C', F: 'D' }, {
              E: verticalSegment(second.width, 0, Math.min(second.height, iv)),
              F: horizontalSegment(0, second.height, Math.min(second.width, ih)),
            }));
            pushPartWithEdges(parts, detail, first, [
              { side: 'A', length: nominalFirstHeight, horizontal: false },
              { side: 'B', length: nominalOW, horizontal: true },
              { side: 'C', length: nominalFirstHeight, horizontal: false },
              { side: 'D', length: Math.max(nominalOW - ih, 1), horizontal: true },
            ]);
            pushPartWithEdges(parts, detail, second, [
              { side: 'A', length: iv, horizontal: false },
              { side: 'E', length: iv, horizontal: false },
              { side: 'F', length: ih, horizontal: true },
            ]);
          }
        }
        continue;
      }
      if (detail.shape === 'П-подібна') {
        const nominalW = g.width ?? 1800;
        const nominalH = g.height ?? 700;
        const cutW = g.innerCutWidth ?? 600;
        const cutD = g.innerCutDepth ?? 300;
        const offset = g.innerCutOffset ?? 200;
        const actualSplitWidth = (value: number) => Math.max(1, value + Math.max(0, activeAllowances.detailLength) * 2);
        const actualSplitHeight = (value: number) => Math.max(1, value + Math.max(0, activeAllowances.detailWidth) * 2);
        const side = g.innerCutSide ?? 'bottom';
        if (g.wholeDetail) {
          const layout = uShapeWithAllowances(nominalW, nominalH, cutW, cutD, offset, side);
          const main = buildPart(detail, parentLabel, 'П-подібна', layout.points, layout.width, layout.height, true, parentLabel, undefined, undefined, { nominalPoints: layout.nominalPoints });
          pushPartWithEdges(parts, detail, main);
        } else if (side === 'bottom' || side === 'top') {
          const firstLabel = splitLabel(parentLabel, 1);
          const secondLabel = splitLabel(parentLabel, 2);
          const thirdLabel = splitLabel(parentLabel, 3);
          const rightWidth = Math.max(nominalW - offset - cutW, 1);
          const topHeight = Math.max(nominalH - cutD, 1);
          const nominalRightWidth = rightWidth;
          const nominalTopHeight = topHeight;
          const omega = g.jointOmegaDirection;
          const lambda = g.jointLambdaDirection;
          const leftLegSpecs: EdgeSpec[] = [
            { side: 'A', length: nominalH, horizontal: false },
            { side: 'B', length: offset, horizontal: true },
            { side: 'G', length: cutD, horizontal: false },
            { side: 'H', length: offset, horizontal: true },
          ];
          const bridgeSpecs: EdgeSpec[] = [
            { side: 'B', length: cutW, horizontal: true },
            { side: 'F', length: cutW, horizontal: true },
          ];
          const rightLegSpecs: EdgeSpec[] = [
            { side: 'B', length: nominalRightWidth, horizontal: true },
            { side: 'C', length: nominalH, horizontal: false },
            { side: 'D', length: nominalRightWidth, horizontal: true },
            { side: 'E', length: cutD, horizontal: false },
          ];
          const topSpecs: EdgeSpec[] = [
            { side: 'A', length: nominalTopHeight, horizontal: false },
            { side: 'B', length: nominalW, horizontal: true },
            { side: 'C', length: nominalTopHeight, horizontal: false },
            { side: 'F', length: cutW, horizontal: true },
          ];
          const leftFootSpecs: EdgeSpec[] = [
            { side: 'A', length: cutD, horizontal: false },
            { side: 'G', length: cutD, horizontal: false },
            { side: 'H', length: offset, horizontal: true },
          ];
          const rightFootSpecs: EdgeSpec[] = [
            { side: 'C', length: cutD, horizontal: false },
            { side: 'D', length: nominalRightWidth, horizontal: true },
            { side: 'E', length: cutD, horizontal: false },
          ];
          const leftWidth = actualSplitWidth(offset);
          const middleWidth = actualSplitWidth(cutW);
          const rightX = leftWidth + middleWidth;
          const topY = actualSplitHeight(topHeight);
          const mark = (part: DetailPart, x: number, y: number, sideAliases?: Record<string, 'A' | 'B' | 'C' | 'D'>) => {
            const sideSegments: Record<string, { start: Point; end: Point }> = {};
            if (sideAliases?.E) sideSegments.E = verticalSegment(Math.max(0, rightX - x), Math.max(0, part.height - cutD), Math.min(cutD, part.height));
            if (sideAliases?.F) sideSegments.F = horizontalSegment(Math.max(0, leftWidth - x), part.height, Math.min(cutW, part.width));
            if (sideAliases?.G) sideSegments.G = verticalSegment(Math.max(0, leftWidth - x), Math.max(0, part.height - cutD), Math.min(cutD, part.height));
            if (sideAliases?.H) sideSegments.H = horizontalSegment(0, part.height, Math.min(leftWidth, part.width));
            return Object.assign(part, splitMeta(parentLabel, x, y, sideAliases, Object.keys(sideSegments).length ? sideSegments : undefined));
          };

          if (omega === 'vertical' && lambda === 'vertical') {
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, firstLabel, offset, nominalH, firstLabel), 0, 0, { G: 'C', H: 'D' }), leftLegSpecs);
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, secondLabel, cutW, topHeight, secondLabel), leftWidth, 0, { F: 'D' }), bridgeSpecs);
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, thirdLabel, rightWidth, nominalH, thirdLabel), rightX, 0, { E: 'A' }), rightLegSpecs);
          } else if (omega === 'horizontal' && lambda === 'horizontal') {
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, firstLabel, nominalW, topHeight, firstLabel), 0, 0, { F: 'D' }), topSpecs);
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, secondLabel, offset, cutD, secondLabel), 0, topY, { G: 'C', H: 'D' }), leftFootSpecs);
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, thirdLabel, rightWidth, cutD, thirdLabel), rightX, topY, { E: 'A' }), rightFootSpecs);
          } else if (omega === 'vertical' && lambda === 'horizontal') {
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, firstLabel, offset, nominalH, firstLabel), 0, 0, { G: 'C', H: 'D' }), leftLegSpecs);
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, secondLabel, Math.max(cutW + rightWidth, 1), topHeight, secondLabel), leftWidth, 0, { F: 'D' }), [
              { side: 'B', length: Math.max(cutW + nominalRightWidth, 1), horizontal: true },
              { side: 'C', length: nominalTopHeight, horizontal: false },
              { side: 'F', length: cutW, horizontal: true },
            ]);
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, thirdLabel, rightWidth, cutD, thirdLabel), rightX, topY, { E: 'A' }), rightFootSpecs);
          } else if (omega === 'horizontal' && lambda === 'vertical') {
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, firstLabel, offset, cutD, firstLabel), 0, topY, { G: 'C', H: 'D' }), leftFootSpecs);
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, secondLabel, Math.max(offset + cutW, 1), topHeight, secondLabel), 0, 0, { F: 'D' }), [
              { side: 'A', length: nominalTopHeight, horizontal: false },
              { side: 'B', length: Math.max(offset + cutW, 1), horizontal: true },
              { side: 'F', length: cutW, horizontal: true },
            ]);
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, thirdLabel, rightWidth, nominalH, thirdLabel), rightX, 0, { E: 'A' }), rightLegSpecs);
          } else if (omega === 'vertical') {
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, firstLabel, offset, nominalH, firstLabel), 0, 0, { G: 'C', H: 'D' }), leftLegSpecs);
            const second = mark(buildAllowanceLPart(detail, secondLabel, Math.max(nominalW - offset, 1), nominalH, cutW, cutD, 'BL', secondLabel), leftWidth, 0);
            pushPartWithEdges(parts, detail, second, [
              { side: 'B', length: Math.max(cutW + nominalRightWidth, 1), horizontal: true },
              { side: 'C', length: nominalH, horizontal: false },
              { side: 'D', length: nominalRightWidth, horizontal: true },
              { side: 'E', length: cutD, horizontal: false },
              { side: 'F', length: cutW, horizontal: true },
            ]);
          } else if (lambda === 'vertical') {
            const first = mark(buildAllowanceLPart(detail, firstLabel, Math.max(offset + cutW, 1), nominalH, offset, cutD, 'BR', firstLabel), 0, 0);
            pushPartWithEdges(parts, detail, first, [
              { side: 'A', length: nominalH, horizontal: false },
              { side: 'B', length: Math.max(offset + cutW, 1), horizontal: true },
              { side: 'F', length: cutW, horizontal: true },
              { side: 'G', length: cutD, horizontal: false },
              { side: 'H', length: offset, horizontal: true },
            ]);
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, secondLabel, rightWidth, nominalH, secondLabel), rightX, 0, { E: 'A' }), rightLegSpecs);
          } else if (omega === 'horizontal') {
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, firstLabel, offset, cutD, firstLabel), 0, topY, { G: 'C', H: 'D' }), leftFootSpecs);
            const second = mark(buildAllowanceLPart(detail, secondLabel, nominalW, nominalH, Math.max(offset + cutW, 1), cutD, 'BL', secondLabel), 0, 0);
            pushPartWithEdges(parts, detail, second, [
              { side: 'A', length: nominalTopHeight, horizontal: false },
              { side: 'B', length: nominalW, horizontal: true },
              { side: 'C', length: nominalH, horizontal: false },
              { side: 'D', length: nominalRightWidth, horizontal: true },
              { side: 'E', length: cutD, horizontal: false },
              { side: 'F', length: cutW, horizontal: true },
            ]);
          } else if (lambda === 'horizontal') {
            const first = mark(buildAllowanceLPart(detail, firstLabel, nominalW, nominalH, offset, cutD, 'BR', firstLabel), 0, 0);
            pushPartWithEdges(parts, detail, first, [
              { side: 'A', length: nominalH, horizontal: false },
              { side: 'B', length: nominalW, horizontal: true },
              { side: 'C', length: nominalTopHeight, horizontal: false },
              { side: 'F', length: cutW, horizontal: true },
              { side: 'G', length: cutD, horizontal: false },
              { side: 'H', length: offset, horizontal: true },
            ]);
            pushPartWithEdges(parts, detail, mark(buildSlotSinkRectPart(detail, secondLabel, rightWidth, cutD, secondLabel), rightX, topY, { E: 'A' }), rightFootSpecs);
          }
        } else {
          const firstLabel = splitLabel(parentLabel, 1);
          const secondLabel = splitLabel(parentLabel, 2);
          const thirdLabel = splitLabel(parentLabel, 3);
          const topHeight = Math.max(nominalH - cutD, 1);
          const rightWidth = Math.max(nominalW - offset - cutW, 1);
          const first = buildSlotSinkRectPart(detail, firstLabel, offset, nominalH, firstLabel, splitMeta(parentLabel, 0, 0));
          const second = buildSlotSinkRectPart(detail, secondLabel, cutW, topHeight, secondLabel, splitMeta(parentLabel, first.width, 0));
          const third = buildSlotSinkRectPart(detail, thirdLabel, rightWidth, nominalH, thirdLabel, splitMeta(parentLabel, first.width + second.width, 0));
          pushPartWithEdges(parts, detail, first);
          pushPartWithEdges(parts, detail, second);
          pushPartWithEdges(parts, detail, third);
        }
      }
    }
  });

  return parts;
}
