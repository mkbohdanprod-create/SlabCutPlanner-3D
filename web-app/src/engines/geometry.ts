import type { CornerProcessing, CutAllowances, Detail, DetailPart, EdgeFeature, Point, DetailShape, SurfaceCutout } from '../domain/types';
import { getDimsLabel, buildDetailCounters } from '../lib/project';
import { mm2ToM2 } from '../utils/math';
import { pointsBounds } from './geometryUtils';

import { DEFAULT_ALLOWANCES } from '../domain/defaults';
import { SIDE_SEGMENT_INDEXES } from '../domain/constants';
import { jointAnchorPoints, reflexJointShift, snapJointPosition } from '../domain/joints';

function createGeometryEngine(activeAllowances: CutAllowances) {
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

/**
 * Імена вершин і сторін Г-подібного контуру.
 * Спільні для цілої деталі й для сегмента, що лишився після розрізу стиками, —
 * саме тому вони винесені в константи, а не продубльовані на кожному виклику.
 */
const L_CORNER_IDS = ['start', 'A', 'B', 'C', 'D', 'E'];
const L_SIDE_IDS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Те саме для П-подібного контуру. */
const U_CORNER_IDS = ['start', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
const U_SIDE_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

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
  /**
   * Кути й вирізи ОРИГІНАЛЬНОЇ форми, приписані саме цьому сегменту після розрізу стиками.
   * Були оголошені лише неявно через `as any` — через це побудова Г-подібного сегмента
   * про них просто не знала.
   */
  mappedCorners?: Record<string, CornerProcessing>;
  mappedCutouts?: Record<string, SurfaceCutout>;
  /**
   * Парт — це СЕГМЕНТ деталі, розрізаної стиками, а не деталь цілком.
   * Такому парту належить лише те, що йому явно приписано (`mappedCorners` / `mappedCutouts`).
   * Без цієї позначки сегмент, якому нічого не дісталось, підхоплював кути й вирізи
   * ВСІЄЇ деталі й малював їх у своїх локальних координатах.
   */
  isSplitSegment?: boolean;
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

function buildComplexRectPoints(
  width: number,
  height: number,
  corners: Record<string, import('../domain/types').CornerProcessing> | undefined,
): { points: Point[], sideSegments: Record<string, { start: Point; end: Point }> } {
  if (!corners) return { points: rectPoints(width, height), sideSegments: {} };
  
  const w = width;
  const h = height;
  const points: Point[] = [];
  const sideSegments: Record<string, { start: Point; end: Point }> = {};

  const cornerDA = corners['DA'];
  const cornerAB = corners['AB'];
  const cornerBC = corners['BC'];
  const cornerCD = corners['CD'];

  let rDA = cornerDA?.type === 'radius' ? (cornerDA.radius || 0) : 0;
  let rAB = cornerAB?.type === 'radius' ? (cornerAB.radius || 0) : 0;
  let rBC = cornerBC?.type === 'radius' ? (cornerBC.radius || 0) : 0;
  let rCD = cornerCD?.type === 'radius' ? (cornerCD.radius || 0) : 0;

  // --- МАТЕМАТИКА ОБМЕЖЕНЬ РАДІУСІВ ---
  // Радіус, заданий для цілої складної форми, після розрізу на стики потрапляє
  // на сегмент, який може бути значно меншим. Без обмеження дуга «з'їдає» сегмент
  // або контур самоперетинається — на сляб іде хибна геометрія і хибна площа.
  //
  // Правила:
  //  1) Кожен радіус не більший за коротшу зі сторін, які він скруглює.
  //  2) Два радіуси на ОДНІЙ стороні не можуть перекриватись: їхня сума ≤ довжина сторони.
  //     Сторони: A(верх, w) = DA+AB · B(права, h) = AB+BC · C(низ, w) = BC+CD · D(ліва, h) = CD+DA.
  //     Якщо сума перевищена — обидва зменшуються пропорційно (щоб не втратити співвідношення).
  {
    const cap = (r: number) => Math.max(0, Math.min(r, w, h));
    rDA = cap(rDA); rAB = cap(rAB); rBC = cap(rBC); rCD = cap(rCD);

    const fitPair = (a: number, b: number, side: number): [number, number] => {
      const sum = a + b;
      if (sum <= side || sum <= 0) return [a, b];
      const k = side / sum;
      return [a * k, b * k];
    };

    [rDA, rAB] = fitPair(rDA, rAB, w); // сторона A (верх)
    [rAB, rBC] = fitPair(rAB, rBC, h); // сторона B (права)
    [rBC, rCD] = fitPair(rBC, rCD, w); // сторона C (низ)
    [rCD, rDA] = fitPair(rCD, rDA, h); // сторона D (ліва)
  }

  const addArc = (cx: number, cy: number, r: number, startA: number, endA: number) => {
    const segments = 12; // points per 90 degrees
    for (let i = 0; i <= segments; i++) {
      const a = startA + (endA - startA) * (i / segments);
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  };

  // Start DA to AB
  points.push({ x: rDA, y: 0 });
  const startA = { x: rDA, y: 0 };
  let endA: Point;

  if (cornerAB?.type === 'chamfer') {
    endA = { x: w - (cornerAB.sizeB || 0), y: 0 };
    points.push(endA);
    points.push({ x: w, y: (cornerAB.sizeC || 0) });
  } else if (cornerAB?.type === 'l-cut') {
    endA = { x: w - (cornerAB.sizeB || 0), y: 0 };
    points.push(endA);
    points.push({ x: w - (cornerAB.sizeB || 0), y: (cornerAB.sizeC || 0) });
    points.push({ x: w, y: (cornerAB.sizeC || 0) });
  } else if (rAB > 0) {
    endA = { x: w - rAB, y: 0 };
    points.push(endA);
    addArc(w - rAB, rAB, rAB, -Math.PI / 2, 0);
  } else {
    endA = { x: w, y: 0 };
    points.push(endA);
  }
  sideSegments['A'] = { start: startA, end: endA };

  // AB to BC
  const startB = points[points.length - 1];
  let endB: Point;
  if (cornerBC?.type === 'chamfer') {
    endB = { x: w, y: h - (cornerBC.sizeB || 0) };
    points.push(endB);
    points.push({ x: w - (cornerBC.sizeC || 0), y: h });
  } else if (cornerBC?.type === 'l-cut') {
    endB = { x: w, y: h - (cornerBC.sizeB || 0) };
    points.push(endB);
    points.push({ x: w - (cornerBC.sizeC || 0), y: h - (cornerBC.sizeB || 0) });
    points.push({ x: w - (cornerBC.sizeC || 0), y: h });
  } else if (rBC > 0) {
    endB = { x: w, y: h - rBC };
    points.push(endB);
    addArc(w - rBC, h - rBC, rBC, 0, Math.PI / 2);
  } else {
    endB = { x: w, y: h };
    points.push(endB);
  }
  sideSegments['B'] = { start: startB, end: endB };

  // BC to CD
  const startC = points[points.length - 1];
  let endC: Point;
  if (cornerCD?.type === 'chamfer') {
    endC = { x: (cornerCD.sizeB || 0), y: h };
    points.push(endC);
    points.push({ x: 0, y: h - (cornerCD.sizeC || 0) });
  } else if (cornerCD?.type === 'l-cut') {
    endC = { x: (cornerCD.sizeB || 0), y: h };
    points.push(endC);
    points.push({ x: (cornerCD.sizeB || 0), y: h - (cornerCD.sizeC || 0) });
    points.push({ x: 0, y: h - (cornerCD.sizeC || 0) });
  } else if (rCD > 0 && cornerCD?.reflex) {
    // УВІГНУТИЙ кут (внутрішній кут вирізу складної форми).
    // Матеріал ДОДАЄТЬСЯ: під нижнім лівим кутом з'являється округлий виступ.
    // Дуга дотична до нижнього ребра (y = h) у точці (r, h)
    // і до лівого ребра (x = 0) у точці (0, h + r); центр — (r, h + r).
    // Йдемо по нижньому ребру вліво до (r, h), далі дугою до (0, h + r).
    endC = { x: rCD, y: h };
    points.push(endC);
    addArc(rCD, h + rCD, rCD, -Math.PI / 2, -Math.PI);
  } else if (rCD > 0) {
    endC = { x: rCD, y: h };
    points.push(endC);
    addArc(rCD, h - rCD, rCD, Math.PI / 2, Math.PI);
  } else {
    endC = { x: 0, y: h };
    points.push(endC);
  }
  sideSegments['C'] = { start: startC, end: endC };

  // CD to DA
  const startD = points[points.length - 1];
  let endD: Point;
  if (cornerDA?.type === 'chamfer') {
    endD = { x: 0, y: (cornerDA.sizeB || 0) };
    points.push(endD);
    points.push({ x: (cornerDA.sizeC || 0), y: 0 });
  } else if (cornerDA?.type === 'l-cut') {
    endD = { x: 0, y: (cornerDA.sizeB || 0) };
    points.push(endD);
    points.push({ x: (cornerDA.sizeC || 0), y: (cornerDA.sizeB || 0) });
    points.push({ x: (cornerDA.sizeC || 0), y: 0 });
  } else if (rDA > 0) {
    endD = { x: 0, y: rDA };
    points.push(endD);
    addArc(rDA, rDA, rDA, Math.PI, Math.PI * 1.5);
  } else {
    endD = { x: 0, y: 0 };
    points.push(endD);
  }
  sideSegments['D'] = { start: startD, end: endD };

  return { points, sideSegments };
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
    parentDetailId: detail.parentDetailId,
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

/* ────────────────────────────────────────────────────────────────────────────
   РІЗ ГОТОВОГО КОНТУРУ

   Стик — це не нескінченна пряма, а ХОРДА: вона починається на контурі (біля
   увігнутого кута) і йде в заданому напрямку до першого перетину з контуром.
   Розріз кільця такою хордою дає рівно два замкнені кільця.

   Це замінює набір гілок «під кожну комбінацію напрямків стиків свої форми
   шматків»: форма шматка виходить сама, разом з усіма радіусами й фасками,
   бо ріжемо вже оброблений контур.
   ──────────────────────────────────────────────────────────────────────────── */

/** Точка на контурі: номер ребра плюс положення вздовж нього (0…1). */
type ContourHit = { edgeIndex: number; t: number; point: Point };

const CHORD_EPS = 1e-6;

/**
 * Пускає промінь із точки `from` у напрямку `dir` і повертає перший перетин
 * з контуром. Перетини впритул до старту ігноруються — інакше промінь
 * «зачепився» б за те саме ребро, з якого вийшов.
 */
function castRayToContour(ring: Point[], from: Point, dir: { x: number; y: number }): ContourHit | undefined {
  let best: ContourHit | undefined;
  let bestDist = Infinity;

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;

    // from + s·dir = a + t·e   →   Крамер по [dir, −e]
    const det = ex * dir.y - dir.x * ey;
    if (Math.abs(det) < CHORD_EPS) continue; // промінь паралельний ребру

    const wx = a.x - from.x;
    const wy = a.y - from.y;
    const s = (ex * wy - ey * wx) / det;
    const t = (dir.x * wy - dir.y * wx) / det;

    if (t < -CHORD_EPS || t > 1 + CHORD_EPS) continue; // повз ребро
    if (s <= CHORD_EPS) continue; // позаду або в самій точці старту

    if (s < bestDist) {
      bestDist = s;
      const tc = Math.min(1, Math.max(0, t));
      best = { edgeIndex: i, t: tc, point: { x: a.x + ex * tc, y: a.y + ey * tc } };
    }
  }

  return best;
}

/** Знаходить на контурі точку, найближчу до заданої (щоб почати хорду саме з неї). */
function findContourHit(ring: Point[], target: Point): ContourHit | undefined {
  let best: ContourHit | undefined;
  let bestDist = Infinity;

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const lenSq = ex * ex + ey * ey;
    if (lenSq < CHORD_EPS) continue;

    let t = ((target.x - a.x) * ex + (target.y - a.y) * ey) / lenSq;
    t = Math.min(1, Math.max(0, t));
    const px = a.x + ex * t;
    const py = a.y + ey * t;
    const dist = Math.hypot(target.x - px, target.y - py);

    if (dist < bestDist) {
      bestDist = dist;
      best = { edgeIndex: i, t, point: { x: px, y: py } };
    }
  }

  return best;
}

/**
 * Ділить кільце контуру хордою між двома точками на ньому.
 * Повертає два замкнені кільця; спільна хорда входить в обидва.
 */
function splitRingByChord(ring: Point[], from: ContourHit, to: ContourHit): [Point[], Point[]] | undefined {
  if (ring.length < 3) return undefined;

  // Вставляємо обидві точки хорди в кільце як справжні вершини — далі розріз
  // зводиться до того, щоб пройти кільце від однієї з них до другої і назад.
  const pts: Point[] = [];
  let idxFrom = -1;
  let idxTo = -1;

  for (let i = 0; i < ring.length; i++) {
    pts.push({ ...ring[i] });

    const hits: Array<{ t: number; isFrom: boolean; point: Point }> = [];
    if (from.edgeIndex === i) hits.push({ t: from.t, isFrom: true, point: from.point });
    if (to.edgeIndex === i) hits.push({ t: to.t, isFrom: false, point: to.point });
    hits.sort((a, b) => a.t - b.t);

    for (const hit of hits) {
      if (hit.isFrom) idxFrom = pts.length;
      else idxTo = pts.length;
      // Точка вставлена всередину ребра — далі йде та сама сторона оригіналу.
      pts.push({ x: hit.point.x, y: hit.point.y, sideId: ring[i].sideId });
    }
  }

  if (idxFrom < 0 || idxTo < 0 || idxFrom === idxTo) return undefined;

  const walk = (start: number, end: number): Point[] => {
    const out: Point[] = [];
    for (let i = start; ; i = (i + 1) % pts.length) {
      out.push({ ...pts[i] });
      if (i === end) break;
      if (out.length > pts.length) break; // страховка від зациклення
    }
    // Останню точку замикає ребро самої хорди — це різ, а не сторона виробу.
    // Кромку на нього ставити не можна, тому ім'я сторони знімаємо.
    if (out.length) out[out.length - 1] = { ...out[out.length - 1], sideId: undefined };
    return out;
  };

  const first = dedupeRing(walk(idxFrom, idxTo));
  const second = dedupeRing(walk(idxTo, idxFrom));
  if (first.length < 3 || second.length < 3) return undefined;
  return [first, second];
}

/** Прибирає точки, що збіглися — вставка хорди могла продублювати вершину. */
function dedupeRing(ring: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of ring) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.x - p.x) < 0.01 && Math.abs(prev.y - p.y) < 0.01) {
      // Точки збіглися — далі йде ребро, що починається з ОСТАННЬОЇ з них.
      prev.sideId = p.sideId;
      continue;
    }
    out.push({ ...p });
  }
  while (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01) {
      first.sideId = last.sideId;
      out.pop();
    } else break;
  }
  return out;
}

/**
 * Збирає відрізки сторін шматка з імен, які пережили розріз.
 * Сусідні ребра з однаковим іменем зливаються в один відрізок — сторона могла
 * бути розбита проміжними точками дуги або фаски.
 */
function ringSideSegments(ring: Point[]): Record<string, { start: Point; end: Point }> {
  const segments: Record<string, { start: Point; end: Point }> = {};
  for (let i = 0; i < ring.length; i++) {
    const side = ring[i].sideId;
    if (!side) continue;
    const start = ring[i];
    const end = ring[(i + 1) % ring.length];
    const existing = segments[side];
    if (!existing) segments[side] = { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
    else existing.end = { x: end.x, y: end.y };
  }
  return segments;
}

/** Площа полігона зі знаком — потрібна, щоб відсіювати вироджені шматки. */
function signedRingArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Чи лежить точка всередині полігона (промінь управо). */
function isPointInRing(ring: Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Стик: точка початку різу та напрямок, у якому він іде. */
type JointCut = { start: Point; dir: { x: number; y: number } };

/**
 * Ріже контур хордами стиків.
 *
 * Початок різу може лежати або НА контурі (стик зсунутий углиб вирізу — тоді він
 * потрапляє в дотичну точку дуги), або ВСЕРЕДИНІ матеріалу (стик зсунутий від
 * вирізу). У другому випадку хорда має йти в обидва боки, інакше різ не замкнеться.
 */
function splitContourByJoints(contour: Point[], cuts: JointCut[]): Point[][] {
  let rings: Point[][] = [contour];

  for (const cut of cuts) {
    const next: Point[][] = [];
    let applied = false;

    for (const ring of rings) {
      if (applied) { next.push(ring); continue; }

      const nearest = findContourHit(ring, cut.start);
      if (!nearest) { next.push(ring); continue; }

      const startsOnContour = Math.hypot(nearest.point.x - cut.start.x, nearest.point.y - cut.start.y) < 1;
      const forward = castRayToContour(ring, cut.start, cut.dir);
      const backward = startsOnContour
        ? nearest
        : castRayToContour(ring, cut.start, { x: -cut.dir.x, y: -cut.dir.y });

      if (!forward || !backward) { next.push(ring); continue; }

      const split = splitRingByChord(ring, backward, forward);
      if (!split) { next.push(ring); continue; }

      next.push(split[0], split[1]);
      applied = true;
    }

    rings = next;
  }

  return rings.filter((ring) => Math.abs(signedRingArea(ring)) > 1);
}

function buildComplexPolygonPoints(
  basePoints: Point[],
  corners: Record<string, import('../domain/types').CornerProcessing> | undefined,
  cornerIds: string[],
  sideIds: string[]
): { points: Point[], sideSegments: Record<string, { start: Point; end: Point }> } {
  if (!corners || Object.keys(corners).length === 0) {
    // Навіть без обробки кутів контур має нести імена сторін — інакше шматки
    // після розрізу стиками лишаться без кромок.
    const tagged: Point[] = basePoints.map((p, i) => ({ ...p, sideId: sideIds[i] }));
    const sideSegments: Record<string, { start: Point; end: Point }> = {};
    for (let i = 0; i < tagged.length; i++) {
      sideSegments[sideIds[i]] = { start: tagged[i], end: tagged[(i + 1) % tagged.length] };
    }
    return { points: tagged, sideSegments };
  }

  const points: Point[] = [];
  const sideSegments: Record<string, { start: Point; end: Point }> = {};
  const len = basePoints.length;
  
  const cornerStarts: Point[] = [];
  const cornerEnds: Point[] = [];

  for (let i = 0; i < len; i++) {
    const p = basePoints[i];
    const pPrev = basePoints[(i - 1 + len) % len];
    const pNext = basePoints[(i + 1) % len];

    const cornerId = cornerIds[i];
    const corner = corners[cornerId];

    const px = p.x;
    const py = p.y;
    const pxPrev = pPrev.x;
    const pyPrev = pPrev.y;
    const pxNext = pNext.x;
    const pyNext = pNext.y;

    const lenPrev = Math.hypot(pxPrev - px, pyPrev - py);
    const lenNext = Math.hypot(pxNext - px, pyNext - py);

    const dirPrev = { x: (pxPrev - px) / (lenPrev || 1), y: (pyPrev - py) / (lenPrev || 1) };
    const dirNext = { x: (pxNext - px) / (lenNext || 1), y: (pyNext - py) / (lenNext || 1) };

    if (corner?.type === 'radius' && (corner.radius || 0) > 0) {
      const r = corner.radius || 0;
      const S = { x: px + dirPrev.x * r, y: py + dirPrev.y * r };
      const E = { x: px + dirNext.x * r, y: py + dirNext.y * r };
      const C = { x: px + dirPrev.x * r + dirNext.x * r, y: py + dirPrev.y * r + dirNext.y * r };

      cornerEnds.push(S);
      points.push(S);
      
      let startAngle = Math.atan2((S.y - C.y), (S.x - C.x));
      let endAngle = Math.atan2((E.y - C.y), (E.x - C.x));
      const cross = (S.x - C.x) * (E.y - C.y) - (S.y - C.y) * (E.x - C.x);
      const clockwise = cross < 0;

      if (clockwise && endAngle > startAngle) endAngle -= Math.PI * 2;
      if (!clockwise && endAngle < startAngle) endAngle += Math.PI * 2;

      const segments = 12;
      for (let j = 1; j < segments; j++) {
        const a = startAngle + (endAngle - startAngle) * (j / segments);
        points.push({ x: C.x + Math.cos(a) * r, y: C.y + Math.sin(a) * r });
      }
      points.push(E);
      cornerStarts.push(E);
    } else if (corner?.type === 'chamfer') {
      const sizeB = corner.sizeB || 0;
      const sizeC = corner.sizeC || 0;
      const S = { x: px + dirPrev.x * sizeB, y: py + dirPrev.y * sizeB };
      const E = { x: px + dirNext.x * sizeC, y: py + dirNext.y * sizeC };
      cornerEnds.push(S);
      points.push(S);
      points.push(E);
      cornerStarts.push(E);
    } else if (corner?.type === 'l-cut') {
      const sizeB = corner.sizeB || 0;
      const sizeC = corner.sizeC || 0;
      const S = { x: px + dirPrev.x * sizeB, y: py + dirPrev.y * sizeB };
      const M = { x: px + dirPrev.x * sizeB + dirNext.x * sizeC, y: py + dirPrev.y * sizeB + dirNext.y * sizeC };
      const E = { x: px + dirNext.x * sizeC, y: py + dirNext.y * sizeC };
      cornerEnds.push(S);
      points.push(S);
      points.push(M);
      points.push(E);
      cornerStarts.push(E);
    } else {
      // Одна й та сама точка в усіх трьох масивах — щоб позначення сторони
      // нижче лягло і на контур, а не лише на службові масиви.
      const vertex: Point = { x: px, y: py };
      cornerEnds.push(vertex);
      points.push(vertex);
      cornerStarts.push(vertex);
    }
  }

  // Кожна точка, з якої починається сторона, отримує її ім'я. Це те, за чим
  // шматки після розрізу стиками впізнають свої кромки.
  for (let i = 0; i < len; i++) {
    if (cornerStarts[i] && sideIds[i]) cornerStarts[i].sideId = sideIds[i];
  }

  for (let i = 0; i < len; i++) {
    sideSegments[sideIds[i]] = {
      start: cornerStarts[i],
      end: cornerEnds[(i + 1) % len]
    };
  }

  return { points, sideSegments };
}

/**
 * Перетворює вирізи, приписані парту, на отвори в його координатах.
 *
 * Спільна для прямокутного і Г-подібного контуру — раніше цей код жив лише всередині
 * `buildRectPart`, тому на Г-подібному сегменті вирізи просто не малювалися.
 *
 * `contourPoints` потрібні тільки для прив'язки до кута (`bindCorner`). Наразі імена кутів
 * на точках контуру не проставляються, тож прив'язка не спрацьовує і координати
 * трактуються як абсолютні — так само, як їх зберігає редактор.
 */
function buildHolesFromCutouts(
  cutouts: Record<string, SurfaceCutout> | undefined,
  contourPoints: Point[],
  width: number,
  height: number,
  shiftX = 0,
  shiftY = 0,
): Point[][] {
  const holes: Point[][] = [];
  if (!cutouts || Object.keys(cutouts).length === 0) return holes;

  Object.values(cutouts).forEach((c) => {
    let cx = c.x;
    let cy = c.y;

    if (c.bindCorner) {
      const bindPt = contourPoints.find((p) => p.id === c.bindCorner);
      if (bindPt) {
        const dirX = bindPt.x <= width / 2 ? 1 : -1;
        const dirY = bindPt.y <= height / 2 ? 1 : -1;
        cx = bindPt.x + dirX * c.x;
        cy = bindPt.y + dirY * c.y;
      }
    }

    cx += shiftX;
    cy += shiftY;

    if (c.shape === 'rect') {
      const cw = c.width || 0;
      const ch = c.height || 0;
      holes.push(offsetPoints(rectPoints(cw, ch), cx - cw / 2, cy - ch / 2));
    } else if (c.shape === 'circle') {
      const cr = c.radius || 0;
      holes.push(offsetPoints(circlePoints(cr * 2, 28), cx - cr, cy - cr));
    }
  });

  return holes;
}

function buildRectPart(detail: Detail, name: string, width: number, height: number, isMain: boolean, parentLabel: string, edgeKind?: DetailPart['edgeKind'], edgeSide?: string, meta?: PartLayoutMeta): DetailPart {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  pendingRectMeta = meta;

  // Сегмент розрізаної деталі володіє ЛИШЕ тим, що йому приписали. Раніше сегмент,
  // якому не дістався жоден виріз, підхоплював вирізи всієї деталі — саме тому отвір
  // з лівого верхнього кута виробу дублювався в лівому верхньому куті сусіднього сегмента.
  const ownsWholeDetail = isMain && !meta?.isSplitSegment;
  const corners = meta?.mappedCorners ?? (ownsWholeDetail ? detail.geometry?.corners : undefined);
  const cutouts = meta?.mappedCutouts ?? (ownsWholeDetail ? detail.geometry?.cutouts : undefined);

  if ((corners && Object.keys(corners).length > 0) || (cutouts && Object.keys(cutouts).length > 0)) {
    const { points, sideSegments } = buildComplexRectPoints(w, h, corners);
    // Apply allowances to complex points
    const padX = Math.max(0, activeAllowances.detailLength);
    const padY = Math.max(0, activeAllowances.detailWidth);
    
    // For main detail, we apply offset polygon if pad > 0
    let finalPoints = points;
    let nominalPoints = points;
    let actualW = w;
    let actualH = h;
    // Припуск зсуває контур; отвори мусять поїхати разом із ним, інакше виріз
    // лишиться в номінальних координатах і «попливе» відносно деталі.
    let shiftX = 0;
    let shiftY = 0;

    if (isMain && (padX > 0 || padY > 0)) {
      const offset = offsetPolygon(points, padX, padY);
      finalPoints = offset.points;
      actualW = offset.width;
      actualH = offset.height;
      nominalPoints = offsetPoints(points, offset.shiftX, offset.shiftY);
      shiftX = offset.shiftX;
      shiftY = offset.shiftY;

      // Shift side segments to match offset polygon's coordinate space
      for (const side in sideSegments) {
        sideSegments[side].start = { x: sideSegments[side].start.x + offset.shiftX, y: sideSegments[side].start.y + offset.shiftY };
        sideSegments[side].end = { x: sideSegments[side].end.x + offset.shiftX, y: sideSegments[side].end.y + offset.shiftY };
      }
    }
    
    const holes = isMain ? buildHolesFromCutouts(cutouts, points, w, h, shiftX, shiftY) : [];

    pendingRectMeta = {
      ...(meta || {}),
      nominalPoints,
      sideSegments,
      holes,
    };
    
    return buildPart(detail, name, 'Прямокутна', finalPoints, actualW, actualH, isMain, parentLabel, edgeKind, edgeSide);
  }

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
  if (part.sideSegments?.[side]) return part.sideSegments[side];
  if ((part.shape as any) === 'Довільний елемент' && !part.sideSegments) {
    console.warn(`Довільний елемент part missing sideSegments. Falling back to bounding box. ID: ${part.id}`);
  }
  const index = SIDE_SEGMENT_INDEXES[part.shape]?.[side];
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

function uShapePoints(w: number, h: number, cutW: number, cutD: number, offset: number, side: 'top' | 'bottom' | 'left' | 'right' = 'bottom', leftH?: number, rightH?: number): Point[] {
  const lH = leftH ?? h;
  const rH = rightH ?? h;
  const maxH = Math.max(lH, rH);
  const topBarHeight = Math.max(0, maxH - cutD);

  if (side === 'top' || side === 'bottom') {
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: rH },
      { x: offset + cutW, y: rH },
      { x: offset + cutW, y: topBarHeight },
      { x: offset, y: topBarHeight },
      { x: offset, y: lH },
      { x: 0, y: lH }
    ];
  }
  
  if (side === 'left' || side === 'right') {
    return [
      { x: 0, y: 0 },
      { x: lH, y: 0 },
      { x: lH, y: offset },
      { x: topBarHeight, y: offset },
      { x: topBarHeight, y: offset + cutW },
      { x: rH, y: offset + cutW },
      { x: rH, y: w },
      { x: 0, y: w }
    ];
  }
  return [];
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
    // Зсув припуску — потрібен, щоб отвори переїхали разом із контуром.
    shiftX: offset.shiftX,
    shiftY: offset.shiftY,
  };
}

/** Creates a U-shaped actual contour using only the external-contour allowance. */
function uShapeWithAllowances(w: number, h: number, cutW: number, cutD: number, offset: number, side: 'top' | 'bottom' | 'left' | 'right' = 'bottom', leftH?: number, rightH?: number) {
  const padX = Math.max(0, activeAllowances.detailLength);
  const padY = Math.max(0, activeAllowances.detailWidth);
  const nominal = uShapePoints(w, h, cutW, cutD, offset, side, leftH, rightH);
  const offsetContour = offsetPolygon(nominal, padX, padY);

  return {
    points: offsetContour.points,
    width: offsetContour.width,
    height: offsetContour.height,
    nominalPoints: offsetPoints(nominal, offsetContour.shiftX, offsetContour.shiftY),
    // Зсув припуску — щоб отвори переїхали разом із контуром (як у Г-формі).
    shiftX: offsetContour.shiftX,
    shiftY: offsetContour.shiftY,
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
  const CURVED_SHAPES = new Set<DetailShape>(['Кругла', 'Овальна']);
  const isCurved = CURVED_SHAPES.has(basePart.shape);
  const validSides = feature.sides.filter((side, index, sides) => (
    sides.indexOf(side) === index && (isCurved
      ? ['A', 'B', 'C', 'D'].includes(side)
      : (sideSegment(basePart, side) || ((basePart.shape as any) === 'Довільний елемент' && basePart.sideSegments !== undefined)))
  ));
  if (validSides.length === 0) return [];
  if (isCurved) {
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
    const horizontal = segment
      ? Math.abs(segment.end.x - segment.start.x) >= Math.abs(segment.end.y - segment.start.y)
      : ['A', 'C', 'E', 'G', 'I'].includes(side);
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
  return { textureGroupLabel, textureOffsetX, textureOffsetY, sideAliases, sideSegments, isSplitSegment: true };
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

  // Радіуси, фаски та Г-зарізи, приписані цьому сегменту, накладаються на контур так само,
  // як і для цілої Г-подібної деталі (гілка `wholeDetail`). Раніше цей крок був пропущений:
  // сегмент будувався по «голому» контуру, і обробка кутів мовчки зникала з розкрою.
  const complexLayout = buildComplexPolygonPoints(layout.points, meta?.mappedCorners, L_CORNER_IDS, L_SIDE_IDS);

  // Вирізи, приписані цьому сегменту, теж треба прорізати — раніше Г-подібний сегмент
  // отворів не мав узагалі, тому виріз, що потрапив на нього, зникав із розкрою.
  const holes = buildHolesFromCutouts(meta?.mappedCutouts, complexLayout.points, layout.width, layout.height, layout.shiftX, layout.shiftY);

  const part = buildPart(detail, name, L_PART_SHAPE, complexLayout.points, layout.width, layout.height, true, parentLabel, undefined, undefined, {
    ...(meta ?? {}),
    nominalPoints: layout.nominalPoints,
    holes: holes.length ? holes : undefined,
  });
  if (meta?.mappedCorners) part.sideSegments = complexLayout.sideSegments;
  return part;
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
  // unused = 52;
  // unused = 200;
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


/**
 * Опорні точки ОРИГІНАЛЬНОЇ (нерозрізаної) форми з іменами, під якими їх знає редактор,
 * плюс перелік увігнутих (270°) кутів цієї форми.
 *
 * Це єдине джерело правди про те, де фізично стоять кути виробу до розрізу стиками.
 * Далі його використовують і прямокутні сегменти, і сегменти складного контуру.
 */
function originalCornerPoints(detail: Detail): { points: Record<string, Point>; reflexIds: string[] } | undefined {
  const g = detail.geometry;
  if (!g) return undefined;

  if (detail.shape === 'П-подібна') {
    const width = g.width || 1200;
    const height = g.height || 600;
    const leftH = g.leftLegHeight ?? height;
    const rightH = g.rightLegHeight ?? height;
    const cutW = g.innerCutWidth || 600;
    const cutD = g.innerCutDepth || 300;
    const cutOff = g.innerCutOffset || 300;
    const topBarHeight = Math.max(0, height - cutD);
    return {
      points: {
        start: { x: 0, y: 0 }, A: { x: width, y: 0 }, B: { x: width, y: rightH }, C: { x: cutOff + cutW, y: rightH },
        D: { x: cutOff + cutW, y: topBarHeight }, E: { x: cutOff, y: topBarHeight }, F: { x: cutOff, y: leftH }, G: { x: 0, y: leftH }
      },
      reflexIds: ['D', 'E'],
    };
  }

  if (detail.shape === 'Г-подібна') {
    const width = g.outerWidth || 1200;
    const height = g.outerHeight || 1200;
    const iw = g.innerHorizontal || 600;
    const ih = g.innerVertical || 600;
    return {
      points: {
        start: { x: 0, y: 0 }, A: { x: width, y: 0 }, B: { x: width, y: height - ih }, C: { x: iw, y: height - ih },
        D: { x: iw, y: height }, E: { x: 0, y: height }
      },
      reflexIds: ['C'],
    };
  }

  return undefined;
}

/**
 * Зіставляє кути, задані на ЦІЛОМУ виробі, з вершинами сегмента після розрізу стиками.
 *
 * `polygon` — вершини сегмента в координатах ОРИГІНАЛЬНОЇ форми.
 * `cornerIds` — імена, під якими побудова контуру чекає ці вершини (той самий порядок).
 *
 * Раніше зіставлення робилось лише з чотирма рогами описуючого прямокутника, тому на
 * Г-подібному сегменті кути, що лежать на внутрішньому вирізі, мовчки губилися.
 */
function mapCornersToPolygon(
  detail: Detail,
  polygon: Point[],
  cornerIds: string[],
): Record<string, import('../domain/types').CornerProcessing> | undefined {
  const corners = detail.geometry?.corners;
  if (!corners) return undefined;
  const origin = originalCornerPoints(detail);
  if (!origin) return undefined;

  const mapped: Record<string, import('../domain/types').CornerProcessing> = {};

  polygon.forEach((vertex, index) => {
    const targetId = cornerIds[index];
    if (!targetId) return;
    for (const [id, pt] of Object.entries(origin.points)) {
      if (Math.abs(pt.x - vertex.x) >= 0.1 || Math.abs(pt.y - vertex.y) >= 0.1) continue;
      const corner = corners[id];
      if (!corner) return;
      // Увігнутий кут позначаємо явно: прямокутна побудова контуру не бачить сусідніх
      // сторін і без підказки зрізала б ріг замість того, щоб додати матеріал.
      mapped[targetId] = origin.reflexIds.includes(id) ? { ...corner, reflex: true } : corner;
      return;
    }
  });

  // [CORNER-DEBUG] тимчасово: побачити, який кут якій вершині сегмента дістається
  if (Object.keys(corners).length) {
    console.log('[CORNER-DEBUG] сегмент', polygon.map((p) => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' '),
      '\n  задані кути:', Object.entries(corners).map(([k, v]) => `${k}:${v?.type ?? '?'}`),
      '\n  опорні точки:', Object.entries(origin.points).map(([k, p]) => `${k}(${Math.round(p.x)},${Math.round(p.y)})`),
      '\n  ПРИПИСАНО:', Object.keys(mapped));
  }

  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

/** Окремий випадок `mapCornersToPolygon` для прямокутного сегмента. */
function mapCornersToRect(detail: Detail, rectX: number, rectY: number, rectW: number, rectH: number): Record<string, import('../domain/types').CornerProcessing> | undefined {
  return mapCornersToPolygon(
    detail,
    [
      { x: rectX, y: rectY },
      { x: rectX + rectW, y: rectY },
      { x: rectX + rectW, y: rectY + rectH },
      { x: rectX, y: rectY + rectH },
    ],
    ['DA', 'AB', 'BC', 'CD'],
  );
}

function mapCutoutsToRect(detail: Detail, rectX: number, rectY: number, rectW: number, rectH: number): Record<string, import('../domain/types').SurfaceCutout> | undefined {
  if (!detail.geometry?.cutouts) return undefined;
  const mapped: Record<string, import('../domain/types').SurfaceCutout> = {};
  for (const [id, cutout] of Object.entries(detail.geometry.cutouts)) {
    if (cutout.x >= rectX && cutout.x <= rectX + rectW && cutout.y >= rectY && cutout.y <= rectY + rectH) {
      mapped[id] = { ...cutout, x: cutout.x - rectX, y: cutout.y - rectY };
    }
  }
  // [CUTOUT-DEBUG] тимчасово: чому виріз опиняється не там
  if (Object.keys(detail.geometry.cutouts).length) {
    const all = Object.entries(detail.geometry.cutouts)
      .map(([k, c]: any) => `${k}(${Math.round(c.x)},${Math.round(c.y)} ${c.shape ?? '?'} bind:${c.bindCorner ?? '—'})`);
    console.log('[CUTOUT-DEBUG] сегмент x=', Math.round(rectX), 'y=', Math.round(rectY),
      'w=', Math.round(rectW), 'h=', Math.round(rectH),
      '\n  усі вирізи:', all,
      '\n  ПРИПИСАНО:', Object.keys(mapped));
  }
  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

/**
 * Точка ВСЕРЕДИНІ контуру на лінії різу — з неї хорда піде в обидва боки.
 * Довільний стик не спирається на кут, тому початок різу треба знайти самим.
 */
function interiorPointOnLine(ring: Point[], axis: 'vertical' | 'horizontal', position: number): Point | undefined {
  const crossings: number[] = [];

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ca = axis === 'vertical' ? a.x : a.y;
    const cb = axis === 'vertical' ? b.x : b.y;
    if ((ca < position && cb >= position) || (cb < position && ca >= position)) {
      const t = (position - ca) / (cb - ca);
      crossings.push(axis === 'vertical' ? a.y + (b.y - a.y) * t : a.x + (b.x - a.x) * t);
    }
  }

  if (crossings.length < 2) return undefined;
  crossings.sort((p, q) => p - q);
  const mid = (crossings[0] + crossings[1]) / 2;
  return axis === 'vertical' ? { x: position, y: mid } : { x: mid, y: position };
}

/** Текст попереджень про зміщені стики — рушій складає їх під час розкрою. */
const jointNotices: string[] = [];

/**
 * Відсуває стик із дуги скруглення до її межі.
 *
 * Різати по дузі не можна: у точці дотику деталь має нульову товщину, і вістря
 * лопне при різі. Тому лінія зсувається до найближчого краю дуги — і ми про це
 * повідомляємо, щоб менеджер розумів, чому розмір не той, який він задав.
 */
function snapJointOffArcs(
  detail: Detail,
  axis: 'vertical' | 'horizontal',
  position: number,
): number {
  // Та сама функція, що показує попередження в панелі стиків — щоб зсув,
  // який побачив користувач, і зсув, який зробив рушій, ніколи не розійшлись.
  const result = snapJointPosition(
    jointAnchorPoints(detail.shape, detail.geometry),
    detail.geometry?.corners,
    axis,
    position,
  );

  if (Math.abs(result - position) > 0.01) {
    const notice =
      `Стик посунуто з ${Math.round(position)} мм на ${Math.round(result)} мм: ` +
      `на заданій відстані він потрапляв на радіус, і деталь звузилась би в нуль.`;
    if (!jointNotices.includes(notice)) jointNotices.push(notice);
    console.warn('[СТИК]', notice);
  }

  return result;
}

/**
 * Готовий контур деталі — з радіусами, фасками й Г-зарізами, з іменами сторін.
 * Це те, що ріжуть стики: форма шматка після різу виходить сама.
 */
function contourForDetail(detail: Detail): Point[] | undefined {
  const g = detail.geometry;
  if (!g) return undefined;
  const corners = g.corners;

  if (detail.shape === 'П-подібна') {
    const base = uShapePoints(
      g.width ?? 1200, g.height ?? 600,
      g.innerCutWidth ?? 600, g.innerCutDepth ?? 300, g.innerCutOffset ?? 200,
      g.innerCutSide ?? 'bottom', g.leftLegHeight, g.rightLegHeight,
    );
    return buildComplexPolygonPoints(base, corners, U_CORNER_IDS, U_SIDE_IDS).points;
  }

  if (detail.shape === 'Г-подібна') {
    const base = lShapePoints(
      g.outerWidth ?? 1200, g.outerHeight ?? 1200,
      g.innerHorizontal ?? 900, g.innerVertical ?? 500,
      g.cornerOrientation,
    );
    return buildComplexPolygonPoints(base, corners, L_CORNER_IDS, L_SIDE_IDS).points;
  }

  if (detail.shape === 'Прямокутна') {
    const base = rectPoints(g.width ?? 600, g.height ?? 600);
    return buildComplexPolygonPoints(base, corners, ['DA', 'AB', 'BC', 'CD'], ['A', 'B', 'C', 'D']).points;
  }

  return undefined;
}

/** Перетворює довільні стики деталі на різи контуру. */
function manualJointCuts(detail: Detail, ring: Point[]): JointCut[] {
  const joints = detail.geometry?.manualJoints;
  if (!joints?.length) return [];

  // Опорні точки беремо спільною функцією: вона знає і прямокутник теж,
  // а саме на прямокутних деталях довільні стики й потрібні найчастіше.
  const anchors = jointAnchorPoints(detail.shape, detail.geometry);
  const cuts: JointCut[] = [];

  for (const joint of joints) {
    const anchor = joint.anchorCorner ? anchors?.[joint.anchorCorner] : undefined;
    const base = anchor ? (joint.axis === 'vertical' ? anchor.x : anchor.y) : 0;
    const position = snapJointOffArcs(detail, joint.axis, base + joint.offset);
    const start = interiorPointOnLine(ring, joint.axis, position);
    if (!start) continue; // лінія не перетинає деталь — стик ігноруємо
    cuts.push({ start, dir: joint.axis === 'vertical' ? { x: 0, y: -1 } : { x: -1, y: 0 } });
  }

  return cuts;
}

/** Вирізи, чий центр потрапив у цей шматок, переведені в його локальні координати. */
function holesForRing(detail: Detail, ring: Point[], minX: number, minY: number, width: number, height: number): Point[][] | undefined {
  const cutouts = detail.geometry?.cutouts;
  if (!cutouts || Object.keys(cutouts).length === 0) return undefined;

  const mine: Record<string, SurfaceCutout> = {};
  for (const [id, cutout] of Object.entries(cutouts)) {
    if (!isPointInRing(ring, { x: cutout.x, y: cutout.y })) continue;
    mine[id] = { ...cutout, x: cutout.x - minX, y: cutout.y - minY };
  }

  const localRing = ring.map((p) => ({ ...p, x: p.x - minX, y: p.y - minY }));
  const holes = buildHolesFromCutouts(mine, localRing, width, height);
  return holes.length ? holes : undefined;
}

/**
 * Перетворює шматки, отримані різом контуру, на парти розкрою.
 *
 * Порядок стабільний — зліва направо, згори вниз. Інакше нумерація Виріб.1/2/3
 * стрибала б між перерахунками, і менеджер щоразу бачив би інші номери.
 */
function pushRingParts(parts: DetailPart[], detail: Detail, rings: Point[][], parentLabel: string) {
  const padX = Math.max(0, activeAllowances.detailLength);
  const padY = Math.max(0, activeAllowances.detailWidth);

  const ordered = rings
    .map((ring) => {
      const xs = ring.map((p) => p.x);
      const ys = ring.map((p) => p.y);
      return { ring, minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    })
    .sort((a, b) => (Math.abs(a.minX - b.minX) > 1 ? a.minX - b.minX : a.minY - b.minY));

  ordered.forEach((item, index) => {
    const label = splitLabel(parentLabel, index + 1);
    const nominalWidth = Math.max(1, item.maxX - item.minX);
    const nominalHeight = Math.max(1, item.maxY - item.minY);
    const local = item.ring.map((p) => ({ ...p, x: p.x - item.minX, y: p.y - item.minY }));

    // Кожен шматок отримує власний припуск на різ — так само, як це робили
    // попередні гілки для своїх прямокутників і Г-подібних сегментів.
    let finalPoints = local;
    let width = nominalWidth;
    let height = nominalHeight;
    let shiftX = 0;
    let shiftY = 0;
    if (padX > 0 || padY > 0) {
      const offset = offsetPolygon(local, padX, padY);
      finalPoints = offset.points.map((p, i) => ({ ...p, sideId: local[i]?.sideId }));
      width = offset.width;
      height = offset.height;
      shiftX = offset.shiftX;
      shiftY = offset.shiftY;
    }

    const meta = splitMeta(label, item.minX, item.minY);
    meta.nominalPoints = local.map((p) => ({ x: p.x + shiftX, y: p.y + shiftY }));
    meta.holes = holesForRing(detail, item.ring, item.minX - shiftX, item.minY - shiftY, width, height);

    const part = buildPart(detail, label, L_PART_SHAPE, finalPoints, width, height, true, label, undefined, undefined, meta);
    // Кромки шматок успадковує з імен сторін, що пережили різ.
    // Ребро самого стику імені не має, тому кромку туди не поставлять.
    const segments = ringSideSegments(finalPoints);
    part.sideSegments = Object.keys(segments).length ? segments : undefined;
    pushPartWithEdges(parts, detail, part);
  });
}

function explodeDetails(details: Detail[]): DetailPart[] {
  const counters = buildDetailCounters(details);
  const detailsById = new Map(details.map((detail) => [detail.id, detail]));
  const parts: DetailPart[] = [];

  /**
   * Межі партів кожного ЕКЗЕМПЛЯРА деталі — щоб наприкінці проставити їм
   * спільний текстурний кластер.
   *
   * Записуємо діапазони, а не правимо кожну гілку: тіло циклу має з десяток
   * `continue`, і будь-яка спроба дописати присвоєння в кінці пропустила б
   * половину форм. Мітка залежить від екземпляра (`-i`): два однакові вироби
   * — це два різні кластери, і малюнок між ними не тече.
   */
  const instanceRanges: Array<{ from: number; group?: string; detail: Detail }> = [];

  details.forEach((detail) => {
    for (let i = 0; i < detail.quantity; i += 1) {
      const parentLabel = parentLabelForDetail(detail, counters, i);
      instanceRanges.push({
        from: parts.length,
        group: detail.textureGroupLabel ? `${detail.textureGroupLabel}-${i}` : undefined,
        detail,
      });
      const g = detail.geometry;

      if (g.sinkKind === 'slot') {
        pushSlotSinkParts(parts, detail, parentLabel);
        continue;
      }

      if (g.sinkKind === 'rect') {
        pushRectSinkParts(parts, detail, parentLabel);
        continue;
      }

      // Довільні стики працюють на будь-якій формі: ріжемо готовий контур
      // так само, як і стики на увігнутих кутах. Потрібні, коли деталь більша
      // за сляб або коли ріжемо із залишку.
      if (g.manualJoints?.length && !g.wholeDetail) {
        const contour = contourForDetail(detail);
        const cuts = contour ? manualJointCuts(detail, contour) : [];
        if (contour && cuts.length) {
          const rings = splitContourByJoints(contour, cuts);
          if (rings.length >= 2) {
            pushRingParts(parts, detail, rings, parentLabel);
            continue;
          }
        }
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
          const complexLayout = buildComplexPolygonPoints(
            layout.points,
            detail.geometry?.corners,
            ['start', 'A', 'B', 'C', 'D', 'E'],
            ['A', 'B', 'C', 'D', 'E', 'F']
          );
          // Вирізи мусять прорізатись і в ЦІЛІЙ Г-подібній: розрізані стиками
          // сегменти і прямокутні деталі отвори отримували, а ця гілка — ні,
          // тому виріз існував у 3D, але зникав із розкрою і бланку.
          const wholeHoles = buildHolesFromCutouts(g.cutouts, complexLayout.points, layout.width, layout.height, layout.shiftX, layout.shiftY);
          const main = buildPart(detail, parentLabel, 'Г-подібна', complexLayout.points, layout.width, layout.height, true, parentLabel, undefined, undefined, {
            nominalPoints: layout.nominalPoints,
            holes: wholeHoles.length ? wholeHoles : undefined,
          });
          main.sideSegments = complexLayout.sideSegments;
          pushPartWithEdges(parts, detail, main);
        } else {
          const firstLabel = splitLabel(parentLabel, 1);
          const secondLabel = splitLabel(parentLabel, 2);
          if (g.jointDirection === 'vertical') {
            const m1 = splitMeta(parentLabel, 0, 0, { E: 'C', F: 'D' });
            m1.mappedCorners = mapCornersToRect(detail, 0, 0, ih, nominalOH);
            m1.mappedCutouts = mapCutoutsToRect(detail, 0, 0, ih, nominalOH);
            const first = buildSlotSinkRectPart(detail, firstLabel, ih, nominalOH, firstLabel, m1);
            first.sideSegments = {
              E: verticalSegment(first.width, Math.max(0, first.height - iv), iv),
              F: horizontalSegment(0, first.height, Math.min(first.width, ih)),
            };
            const m2 = splitMeta(parentLabel, first.width, 0);
            m2.mappedCorners = mapCornersToRect(detail, first.width, 0, Math.max(nominalOW - ih, 1), Math.max(nominalOH - iv, 1));
            m2.mappedCutouts = mapCutoutsToRect(detail, first.width, 0, Math.max(nominalOW - ih, 1), Math.max(nominalOH - iv, 1));
            const second = buildSlotSinkRectPart(detail, secondLabel, Math.max(nominalOW - ih, 1), Math.max(nominalOH - iv, 1), secondLabel, m2);
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
            const m1 = splitMeta(parentLabel, 0, 0);
            m1.mappedCorners = mapCornersToRect(detail, 0, 0, nominalOW, firstHeight);
            m1.mappedCutouts = mapCutoutsToRect(detail, 0, 0, nominalOW, firstHeight);
            const first = buildSlotSinkRectPart(detail, firstLabel, nominalOW, firstHeight, firstLabel, m1);
            first.sideSegments = {
              D: horizontalSegment(ih, first.height, Math.max(nominalOW - ih, 1)),
            };
            const m2 = splitMeta(parentLabel, 0, first.height, { E: 'C', F: 'D' });
            m2.mappedCorners = mapCornersToRect(detail, 0, first.height, ih, iv);
            m2.mappedCutouts = mapCutoutsToRect(detail, 0, first.height, ih, iv);
            const second = buildSlotSinkRectPart(detail, secondLabel, ih, iv, secondLabel, m2);
            second.sideSegments = {
              E: verticalSegment(second.width, 0, Math.min(second.height, iv)),
              F: horizontalSegment(0, second.height, Math.min(second.width, ih)),
            };
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
        const leftH = g.leftLegHeight ?? nominalH;
        const rightH = g.rightLegHeight ?? nominalH;
        if (g.wholeDetail) {
          const layout = uShapeWithAllowances(nominalW, nominalH, cutW, cutD, offset, side, leftH, rightH);
          const complexLayout = buildComplexPolygonPoints(
            layout.points,
            detail.geometry?.corners,
            ['start', 'A', 'B', 'C', 'D', 'E', 'F', 'G'],
            ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
          );
          // Та сама діра, що й у цілої Г-подібної: вирізи не прорізались.
          const wholeHoles = buildHolesFromCutouts(g.cutouts, complexLayout.points, layout.width, layout.height, layout.shiftX, layout.shiftY);
          const main = buildPart(detail, parentLabel, 'П-подібна', complexLayout.points, layout.width, layout.height, true, parentLabel, undefined, undefined, {
            nominalPoints: layout.nominalPoints,
            holes: wholeHoles.length ? wholeHoles : undefined,
          });
          main.sideSegments = complexLayout.sideSegments;
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
          const markRect = (name: string, nominalW: number, nominalH: number, parentLabel: string, x: number, y: number, sideAliases?: Record<string, 'A' | 'B' | 'C' | 'D'>) => {
            const mappedCorners = mapCornersToRect(detail, x, y, nominalW, nominalH);
            const mappedCutouts = mapCutoutsToRect(detail, x, y, nominalW, nominalH);
            const meta = splitMeta(parentLabel, x, y, sideAliases);
            meta.mappedCorners = mappedCorners;
            meta.mappedCutouts = mappedCutouts;
            const part = buildSlotSinkRectPart(detail, name, nominalW, nominalH, parentLabel, meta);
            const sideSegments: Record<string, { start: Point; end: Point }> = {};
            if (sideAliases?.E) sideSegments.E = verticalSegment(Math.max(0, rightX - x), Math.max(0, part.height - cutD), Math.min(cutD, part.height));
            if (sideAliases?.F) sideSegments.F = horizontalSegment(Math.max(0, leftWidth - x), part.height, Math.min(cutW, part.width));
            if (sideAliases?.G) sideSegments.G = verticalSegment(Math.max(0, leftWidth - x), Math.max(0, part.height - cutD), Math.min(cutD, part.height));
            if (sideAliases?.H) sideSegments.H = horizontalSegment(0, part.height, Math.min(leftWidth, part.width));
            part.sideSegments = Object.keys(sideSegments).length ? sideSegments : undefined;
            return part;
          };

          const markL = (name: string, nominalW: number, nominalH: number, innerW: number, innerH: number, orient: 'TL' | 'TR' | 'BL' | 'BR', parentLabel: string, x: number, y: number, sideAliases?: Record<string, 'A' | 'B' | 'C' | 'D'>) => {
            // Сегмент Г-подібний, тому зіставляти треба з його ВЛАСНИМИ шістьма вершинами,
            // а не з чотирма рогами описуючого прямокутника: кути на внутрішньому вирізі
            // (як-от скруглення) інакше не збігаються з жодним рогом і губляться.
            const segmentVertices = lShapePoints(nominalW, nominalH, innerW, innerH, orient)
              .map((p) => ({ x: p.x + x, y: p.y + y }));
            const mappedCorners = mapCornersToPolygon(detail, segmentVertices, L_CORNER_IDS);
            const mappedCutouts = mapCutoutsToRect(detail, x, y, nominalW, nominalH);
            const meta = splitMeta(parentLabel, x, y, sideAliases);
            meta.mappedCorners = mappedCorners;
            meta.mappedCutouts = mappedCutouts;
            const part = buildAllowanceLPart(detail, name, nominalW, nominalH, innerW, innerH, orient, parentLabel, meta);
            return part;
          };

          // ── Різ готового контуру ────────────────────────────────────────────
          // Будуємо повний контур виробу з усіма радіусами, фасками й Г-зарізами
          // і ріжемо його хордами стиків. Форма шматка виходить сама.
          //
          // Правило радіуса: лінія стику не має перетинати дугу увігнутого кута —
          // деталь звузилась би там у нуль, і вістря лопнуло б при різі. Тому стик
          // відсувається рівно на радіус, а вбік — за вибором користувача.
          const nominalContour = uShapePoints(nominalW, nominalH, cutW, cutD, offset, side, leftH, rightH);
          const processedContour = buildComplexPolygonPoints(
            nominalContour,
            detail.geometry?.corners,
            U_CORNER_IDS,
            U_SIDE_IDS,
          );

          const jointCuts: JointCut[] = [];
          const addJointCut = (
            direction: 'vertical' | 'horizontal' | undefined,
            cornerX: number,
            cornerY: number,
            shift: number,
            outwardX: number,
          ) => {
            if (!direction) return;
            jointCuts.push(
              direction === 'vertical'
                ? { start: { x: cornerX + shift, y: cornerY }, dir: { x: 0, y: -1 } }
                : { start: { x: cornerX, y: cornerY + shift }, dir: { x: outwardX, y: 0 } },
            );
          };

          // Зсув з дуги рахує спільна `reflexJointShift` — та сама, якою 3D малює
          // цю ж лінію. Своя копія тут означала б, що модель показує одне, а різ
          // іде по іншому.
          const corners = detail.geometry?.corners;
          addJointCut(omega, offset, topHeight, reflexJointShift(corners, 'E', [cutW, cutD], g.jointOmegaRadiusSide), -1);
          addJointCut(lambda, offset + cutW, topHeight, reflexJointShift(corners, 'D', [cutW, cutD], g.jointLambdaRadiusSide), 1);
          jointCuts.push(...manualJointCuts(detail, processedContour.points));

          const jointRings = jointCuts.length
            ? splitContourByJoints(processedContour.points, jointCuts)
            : [];

          if (jointRings.length >= 2) {
            pushRingParts(parts, detail, jointRings, parentLabel);
          } else if (omega === 'vertical' && lambda === 'vertical') {
            pushPartWithEdges(parts, detail, markRect(firstLabel, offset, nominalH, firstLabel, 0, 0, { G: 'C', H: 'D' }), leftLegSpecs);
            pushPartWithEdges(parts, detail, markRect(secondLabel, cutW, topHeight, secondLabel, leftWidth, 0, { F: 'D' }), bridgeSpecs);
            pushPartWithEdges(parts, detail, markRect(thirdLabel, rightWidth, nominalH, thirdLabel, rightX, 0, { E: 'A' }), rightLegSpecs);
          } else if (omega === 'horizontal' && lambda === 'horizontal') {
            pushPartWithEdges(parts, detail, markRect(firstLabel, nominalW, topHeight, firstLabel, 0, 0, { F: 'D' }), topSpecs);
            pushPartWithEdges(parts, detail, markRect(secondLabel, offset, cutD, secondLabel, 0, topY, { G: 'C', H: 'D' }), leftFootSpecs);
            pushPartWithEdges(parts, detail, markRect(thirdLabel, rightWidth, cutD, thirdLabel, rightX, topY, { E: 'A' }), rightFootSpecs);
          } else if (omega === 'vertical' && lambda === 'horizontal') {
            pushPartWithEdges(parts, detail, markRect(firstLabel, offset, nominalH, firstLabel, 0, 0, { G: 'C', H: 'D' }), leftLegSpecs);
            pushPartWithEdges(parts, detail, markRect(secondLabel, Math.max(cutW + rightWidth, 1), topHeight, secondLabel, leftWidth, 0, { F: 'D' }), [
              { side: 'B', length: Math.max(cutW + nominalRightWidth, 1), horizontal: true },
              { side: 'C', length: nominalTopHeight, horizontal: false },
              { side: 'F', length: cutW, horizontal: true },
            ]);
            pushPartWithEdges(parts, detail, markRect(thirdLabel, rightWidth, cutD, thirdLabel, rightX, topY, { E: 'A' }), rightFootSpecs);
          } else if (omega === 'horizontal' && lambda === 'vertical') {
            pushPartWithEdges(parts, detail, markRect(firstLabel, offset, cutD, firstLabel, 0, topY, { G: 'C', H: 'D' }), leftFootSpecs);
            pushPartWithEdges(parts, detail, markRect(secondLabel, Math.max(offset + cutW, 1), topHeight, secondLabel, 0, 0, { F: 'D' }), [
              { side: 'A', length: nominalTopHeight, horizontal: false },
              { side: 'B', length: Math.max(offset + cutW, 1), horizontal: true },
              { side: 'F', length: cutW, horizontal: true },
            ]);
            pushPartWithEdges(parts, detail, markRect(thirdLabel, rightWidth, nominalH, thirdLabel, rightX, 0, { E: 'A' }), rightLegSpecs);
          } else if (omega === 'vertical') {
            pushPartWithEdges(parts, detail, markRect(firstLabel, offset, nominalH, firstLabel, 0, 0, { G: 'C', H: 'D' }), leftLegSpecs);
            const second = markL(secondLabel, Math.max(nominalW - offset, 1), nominalH, cutW, cutD, 'BL', secondLabel, leftWidth, 0);
            pushPartWithEdges(parts, detail, second, [
              { side: 'B', length: Math.max(cutW + nominalRightWidth, 1), horizontal: true },
              { side: 'C', length: nominalH, horizontal: false },
              { side: 'D', length: nominalRightWidth, horizontal: true },
              { side: 'E', length: cutD, horizontal: false },
              { side: 'F', length: cutW, horizontal: true },
            ]);
          } else if (lambda === 'vertical') {
            const first = markL(firstLabel, Math.max(offset + cutW, 1), nominalH, offset, cutD, 'BR', firstLabel, 0, 0);
            pushPartWithEdges(parts, detail, first, [
              { side: 'A', length: nominalH, horizontal: false },
              { side: 'B', length: Math.max(offset + cutW, 1), horizontal: true },
              { side: 'F', length: cutW, horizontal: true },
              { side: 'G', length: cutD, horizontal: false },
              { side: 'H', length: offset, horizontal: true },
            ]);
            pushPartWithEdges(parts, detail, markRect(secondLabel, rightWidth, nominalH, secondLabel, rightX, 0, { E: 'A' }), rightLegSpecs);
          } else if (omega === 'horizontal') {
            pushPartWithEdges(parts, detail, markRect(firstLabel, offset, cutD, firstLabel, 0, topY, { G: 'C', H: 'D' }), leftFootSpecs);
            const second = markL(secondLabel, nominalW, nominalH, Math.max(offset + cutW, 1), cutD, 'BL', secondLabel, 0, 0);
            pushPartWithEdges(parts, detail, second, [
              { side: 'A', length: nominalTopHeight, horizontal: false },
              { side: 'B', length: nominalW, horizontal: true },
              { side: 'C', length: nominalH, horizontal: false },
              { side: 'D', length: nominalRightWidth, horizontal: true },
              { side: 'E', length: cutD, horizontal: false },
              { side: 'F', length: cutW, horizontal: true },
            ]);
          } else if (lambda === 'horizontal') {
            const first = markL(firstLabel, nominalW, nominalH, offset, cutD, 'BR', firstLabel, 0, 0);
            pushPartWithEdges(parts, detail, first, [
              { side: 'A', length: nominalH, horizontal: false },
              { side: 'B', length: nominalW, horizontal: true },
              { side: 'C', length: nominalTopHeight, horizontal: false },
              { side: 'F', length: cutW, horizontal: true },
              { side: 'G', length: cutD, horizontal: false },
              { side: 'H', length: offset, horizontal: true },
            ]);
            pushPartWithEdges(parts, detail, markRect(secondLabel, rightWidth, cutD, secondLabel, rightX, topY, { E: 'A' }), rightFootSpecs);
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

  // Спільний текстурний кластер на всі парти екземпляра деталі.
  // Ставиться ПІСЛЯ побудови, тому `id` партів не змінюється (він рахується з
  // meta ще на `buildPart`) — збережені розміщення й розкладка текстури лишаються
  // валідними. Мітки `import:` не чіпаємо: DXF і бланк погодження мають власний
  // шлях групування, і він недоторканний.
  instanceRanges.forEach((range, index) => {
    const to = instanceRanges[index + 1]?.from ?? parts.length;
    for (let k = range.from; k < to; k += 1) {
      const part = parts[k];
      if (range.group && !part.textureGroupLabel?.startsWith('import:')) {
        part.textureGroupLabel = range.group;
      }
      // Прив'язка доповнення до сторони батька. Без неї розкрій знає, що
      // підворот належить виробу, але не знає, до якої сторони стільниці він
      // кріпиться — і кладе його просто поруч замість розгортки.
      // Тільки коли батько справді є: у головного елемента `parentDetailSide`
      // дорівнює його ж слоту (`main`) — це артефакт `elementToDetail`, а не
      // прив'язка, і в парт йому потрапляти нема за чим.
      if (range.detail.parentDetailId && range.detail.parentDetailSide && part.parentDetailSide === undefined) {
        part.parentDetailSide = range.detail.parentDetailSide;
      }
    }
  });

  return parts;
}

  return { explodeDetails };
}


export function explodeDetails(details: Detail[], allowances: CutAllowances = DEFAULT_ALLOWANCES): DetailPart[] {
  return createGeometryEngine({ ...DEFAULT_ALLOWANCES, ...allowances }).explodeDetails(details);
}
