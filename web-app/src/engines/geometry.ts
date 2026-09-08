import type { CornerProcessing, CutAllowances, Detail, DetailPart, EdgeFeature, MaterialType, Point, DetailShape, SurfaceCutout } from '../domain/types';
import { getDimsLabel, buildDetailCounters } from '../lib/project';
import { mm2ToM2 } from '../utils/math';
import { pointsBounds } from './geometryUtils';
import { radiusElementSpecs } from '../domain/radiusElement';

import { DEFAULT_ALLOWANCES } from '../domain/defaults';
import { SIDE_SEGMENT_INDEXES } from '../domain/constants';
import { allJointsOf, manualJointPosition, jointAnchorPoints, snapJointPosition } from '../domain/joints';
import { metalProfileById, pieceWeightKg } from '../domain/metalProfiles';
import { EDGE_KIND_LABEL } from '../domain/ids';

function createGeometryEngine(activeAllowances: CutAllowances, activeMaterial?: MaterialType) {
const SHAPE_LABELS = new Set([
  'Прямокутна',
  'Коло',
  'Еліпс',
  'Кругла',
  'Овальна',
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

/**
 * МЕЖА СТОРІН — НЕ ЗАЙВА ТОЧКА (№105, 04.09.2026).
 *
 * Вершина, в якій міняється ім'я сторони (`sideId`) або починається /
 * закінчується ребро різу (`cut`), несе інформацію, якої в координатах
 * немає. Після різу стиком по внутрішньому куту ніжки П/Г ребро різу
 * лежить на одній прямій зі стороною (x = 600: різ (600,0)→(600,600) і
 * F (600,600)→(600,2100)) — геометрично точка (600,600) «майже пряма»,
 * але саме вона відділяє різ від кромки. Її викидання зсувало всі імена
 * сторін шматка на одне ребро (XD20 на короткій стороні, метраж 605
 * замість 1500, кромка по ребру різу). Тому такі вершини чистка не чіпає.
 */
function isSideBoundary(previous: Point, point: Point) {
  return previous.sideId !== point.sideId || Boolean(previous.cut) !== Boolean(point.cut);
}

/** Removes tiny DXF artifacts so allowance offsets do not create visible teeth at dirty corners. */
function cleanPolygonForOffset(points: Point[], tolerance: number) {
  if (points.length <= 3) return points;
  const minSegment = Math.max(0.4, tolerance);
  let cleaned = points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    if (isSideBoundary(previous, point)) return true;
    return pointDistance(point, points[(index + 1) % points.length]) > minSegment;
  });
  if (cleaned.length < 3) cleaned = points;

  let changed = true;
  while (changed && cleaned.length > 3) {
    changed = false;
    cleaned = cleaned.filter((point, index, items) => {
      const previous = items[(index - 1 + items.length) % items.length];
      const next = items[(index + 1) % items.length];
      if (isSideBoundary(previous, point)) return true;
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

  // --- ТІ САМІ ОБМЕЖЕННЯ ДЛЯ ФАСОК І Г-ВИРІЗІВ (FG-11) ---
  // Радіуси вище захищені cap+fitPair, а sizeB/sizeC фасок і Г-вирізів
  // читались як є. Два сусідні вирізи по 1500 мм на стороні 700 мм гнали
  // контур у зворотний бік — полігон самоперетинався, і тріангуляція
  // малювала «діагональний зріз» замість прямого кута.
  //
  // Хто скільки з'їдає (з побудови контуру нижче):
  //   сторона A (верх, w):  DA.sizeC зліва  + AB.sizeB справа
  //   сторона B (права, h): AB.sizeC зверху + BC.sizeB знизу
  //   сторона C (низ, w):   BC.sizeC справа + CD.sizeB зліва
  //   сторона D (ліва, h):  CD.sizeC знизу  + DA.sizeB зверху
  // Радіус з'їдає обидві свої сторони на r. Якщо пара на стороні не
  // влазить: два вирізи стискаються пропорційно; виріз поруч із радіусом
  // поступається (радіус уже узгоджений зі своєю парою вище).
  const eff = { DA: { b: 0, c: 0 }, AB: { b: 0, c: 0 }, BC: { b: 0, c: 0 }, CD: { b: 0, c: 0 } };
  {
    type CK = keyof typeof eff;
    const cornerOf: Record<CK, import('../domain/types').CornerProcessing | undefined> = {
      DA: cornerDA, AB: cornerAB, BC: cornerBC, CD: cornerCD,
    };
    const radiusOf: Record<CK, number> = { DA: rDA, AB: rAB, BC: rBC, CD: rCD };
    (Object.keys(eff) as CK[]).forEach((k) => {
      const c = cornerOf[k];
      if (c && c.type !== 'radius') {
        eff[k].b = Math.max(0, c.sizeB || 0);
        eff[k].c = Math.max(0, c.sizeC || 0);
      }
    });
    // (сторона, [кут1, поле1], [кут2, поле2]) — поле = яка з величин кута
    // з'їдає саме цю сторону.
    const SIDES: Array<[number, [CK, 'b' | 'c'], [CK, 'b' | 'c']]> = [
      [w, ['DA', 'c'], ['AB', 'b']], // A
      [h, ['AB', 'c'], ['BC', 'b']], // B
      [w, ['BC', 'c'], ['CD', 'b']], // C
      [h, ['CD', 'c'], ['DA', 'b']], // D
    ];
    for (const [side, [k1, f1], [k2, f2]] of SIDES) {
      const r1 = radiusOf[k1];
      const r2 = radiusOf[k2];
      const a = r1 > 0 ? r1 : eff[k1][f1];
      const b = r2 > 0 ? r2 : eff[k2][f2];
      if (a + b <= side) continue;
      if (r1 > 0 && r2 > 0) continue; // пара радіусів уже узгоджена fitPair
      if (r1 > 0) {
        eff[k2][f2] = Math.max(0, side - r1);
      } else if (r2 > 0) {
        eff[k1][f1] = Math.max(0, side - r2);
      } else {
        const kf = side / (a + b);
        eff[k1][f1] = a * kf;
        eff[k2][f2] = b * kf;
      }
    }
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
    endA = { x: w - eff.AB.b, y: 0 };
    points.push(endA);
    points.push({ x: w, y: eff.AB.c });
  } else if (cornerAB?.type === 'l-cut') {
    endA = { x: w - eff.AB.b, y: 0 };
    points.push(endA);
    const midAB = { x: w - eff.AB.b, y: eff.AB.c };
    const outAB = { x: w, y: eff.AB.c };
    points.push(midAB);
    points.push(outAB);
    // Ребра Г-зарізу — іменовані сторони (Б-002, 07.09.2026): ключі ті
    // самі, що дає 3D-контур (`buildDetailShape`), тож кромка з панелі
    // знаходить свою ділянку і в розкрої, і в грошах, і на карті крою.
    // lcut1 — паралельне наступній стороні кута, lcut2 — попередній.
    sideSegments['AB_lcut1'] = { start: endA, end: midAB };
    sideSegments['AB_lcut2'] = { start: midAB, end: outAB };
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
    endB = { x: w, y: h - eff.BC.b };
    points.push(endB);
    points.push({ x: w - eff.BC.c, y: h });
  } else if (cornerBC?.type === 'l-cut') {
    endB = { x: w, y: h - eff.BC.b };
    points.push(endB);
    const midBC = { x: w - eff.BC.c, y: h - eff.BC.b };
    const outBC = { x: w - eff.BC.c, y: h };
    points.push(midBC);
    points.push(outBC);
    sideSegments['BC_lcut1'] = { start: endB, end: midBC };
    sideSegments['BC_lcut2'] = { start: midBC, end: outBC };
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
    endC = { x: eff.CD.b, y: h };
    points.push(endC);
    points.push({ x: 0, y: h - eff.CD.c });
  } else if (cornerCD?.type === 'l-cut') {
    endC = { x: eff.CD.b, y: h };
    points.push(endC);
    const midCD = { x: eff.CD.b, y: h - eff.CD.c };
    const outCD = { x: 0, y: h - eff.CD.c };
    points.push(midCD);
    points.push(outCD);
    sideSegments['CD_lcut1'] = { start: endC, end: midCD };
    sideSegments['CD_lcut2'] = { start: midCD, end: outCD };
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
    endD = { x: 0, y: eff.DA.b };
    points.push(endD);
    points.push({ x: eff.DA.c, y: 0 });
  } else if (cornerDA?.type === 'l-cut') {
    endD = { x: 0, y: eff.DA.b };
    points.push(endD);
    const midDA = { x: eff.DA.c, y: eff.DA.b };
    const outDA = { x: eff.DA.c, y: 0 };
    points.push(midDA);
    points.push(outDA);
    sideSegments['DA_lcut1'] = { start: endD, end: midDA };
    sideSegments['DA_lcut2'] = { start: midDA, end: outDA };
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
    // Товщина їде з деталлю в розкрій: там вона єдиний критерій, чи
    // можна класти деталь на конкретний сляб (заборона за товщиною).
    thickness: detail.thickness,
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
      pts.push({ x: hit.point.x, y: hit.point.y, sideId: ring[i].sideId, cut: ring[i].cut });
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
    // Кромку на нього ставити не можна, тому ім'я сторони знімаємо, а саме
    // ребро позначаємо різом — щоб метраж сусідньої кромки не «дотягувався»
    // по ньому як по кутовому переходу.
    if (out.length) out[out.length - 1] = { ...out[out.length - 1], sideId: undefined, cut: true };
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
      prev.cut = p.cut;
      continue;
    }
    out.push({ ...p });
  }
  while (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01) {
      first.sideId = last.sideId;
      first.cut = last.cut;
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

/**
 * Стик: точка початку різу та напрямок, у якому він іде.
 *
 * `line` заповнюється для довільних стиків — це наскрізна лінія, а не промінь
 * із кута. Різниця принципова, коли стиків кілька: наскрізна лінія має
 * розрізати КОЖЕН шматок, крізь який проходить, тому для кожного шматка
 * початок різу шукається заново. Промінь омега/лямбда виходить із конкретного
 * увігнутого кута і живе лише в тому шматку, де цей кут лишився.
 */
type JointCut = {
  start: Point;
  dir: { x: number; y: number };
  line?: { axis: 'vertical' | 'horizontal'; position: number };
  /**
   * ПОЛЕ СТИКУ (№141, 08.09.2026) — точка всередині тієї ділянки, між якою
   * парою сторін стик поставлено. Різ застосовується РІВНО до того шматка, у
   * якому ця точка лежить, і рівно раз.
   *
   * Без неї наскрізна лінія різала кожен шматок, крізь який проходила: стик
   * «між H і F» (лівий виступ П-подібної) заодно розрізав і праву ногу —
   * власник спіймав це на 3D: «у редакторі ріже лише лівий виступ, а по факту
   * ріже всю стільницю навпіл».
   */
  field?: Point;
  /** Тип з'єднання — з нього кошторис бере, це пряма склейка чи заусовка 45°. */
  jointType?: string;
};

/** Шов, який фактично зробив різ: довжина хорди і тип з'єднання. */
type JointSeam = { lengthMm: number; jointType?: string; chord?: { from: Point; to: Point } };

/**
 * Вішає перелік швів на ПЕРШИЙ парт, що з'явився після різу.
 *
 * Один шов належить двом деталям одразу. Якби ми поклали його на обидві,
 * кошторис порахував би склейку двічі — тому носій рівно один, а решта
 * шматків про шов не знають. `before` — довжина масиву партів ДО різу.
 */
function attachJointSeams(parts: DetailPart[], before: number, seams: JointSeam[]) {
  const real = seams.filter((seam) => seam.lengthMm > 1).map(({ lengthMm, jointType }) => ({ lengthMm, jointType }));
  if (!real.length) return;
  const owner = parts.slice(before).find((part) => part.isMain) ?? parts[before];
  if (owner) owner.jointSeams = real;
}

/**
 * Ріже контур хордами стиків.
 *
 * Початок різу може лежати або НА контурі (стик зсунутий углиб вирізу — тоді він
 * потрапляє в дотичну точку дуги), або ВСЕРЕДИНІ матеріалу (стик зсунутий від
 * вирізу). У другому випадку хорда має йти в обидва боки, інакше різ не замкнеться.
 */
function splitContourByJoints(contour: Point[], cuts: JointCut[], seams?: JointSeam[]): Point[][] {
  let rings: Point[][] = [contour];

  for (const cut of cuts) {
    const next: Point[][] = [];
    // Промінь із увігнутого кута застосовується РІВНО раз: він виходить з одної
    // конкретної точки, і другого шматка з тим самим кутом не існує. Стик із
    // полем пари (№141) — теж рівно раз: він живе у своїй ділянці. Наскрізна
    // лінія БЕЗ поля (старі стики) — навпаки, ріже все, крізь що проходить.
    const onceOnly = !cut.line || Boolean(cut.field);
    let applied = false;

    for (const ring of rings) {
      if (onceOnly && applied) { next.push(ring); continue; }

      // Для наскрізної лінії початок різу шукаємо всередині САМЕ цього шматка.
      // Без цього другий стик відштовхувався б від точки, що лежить у сусідньому
      // шматку, і хорда йшла б повз матеріал.
      // Якщо стик має поле пари — беремо точку цього поля і ріжемо лише той
      // шматок, у якому вона лежить: інакше «стик між H і F» різав би і праву
      // ногу теж (правка власника 08.09).
      const start = cut.field
        ? (isPointInRing(ring, cut.field) ? cut.field : undefined)
        : cut.line
          ? interiorPointOnLine(ring, cut.line.axis, cut.line.position)
          : cut.start;
      if (!start) { next.push(ring); continue; }

      const nearest = findContourHit(ring, start);
      if (!nearest) { next.push(ring); continue; }

      const startsOnContour = Math.hypot(nearest.point.x - start.x, nearest.point.y - start.y) < 1;
      const forward = castRayToContour(ring, start, cut.dir);
      const backward = startsOnContour
        ? nearest
        : castRayToContour(ring, start, { x: -cut.dir.x, y: -cut.dir.y });

      if (!forward || !backward) { next.push(ring); continue; }

      const split = splitRingByChord(ring, backward, forward);
      if (!split) { next.push(ring); continue; }

      // Різ по самій межі шматка дає виродок нульової площі. Такий «розріз»
      // не є розрізом — лишаємо шматок цілим, інакше в карту крою поїхала б
      // деталь-волосина, яку неможливо зробити.
      if (Math.abs(signedRingArea(split[0])) < 1 || Math.abs(signedRingArea(split[1])) < 1) {
        next.push(ring);
        continue;
      }

      // Довжина шва — це довжина хорди, по якій щойно розділили контур.
      // Беремо саме її, а не номінальну сторону: після радіусів і фасок шов
      // коротший, і цех клеїть рівно стільки, скільки тут порахували.
      seams?.push({
        lengthMm: Math.hypot(forward.point.x - backward.point.x, forward.point.y - backward.point.y),
        jointType: cut.jointType,
        // Хорда потрібна, щоб виріз на стику (distributeHoles) знайшов свій шов.
        chord: { from: { x: backward.point.x, y: backward.point.y }, to: { x: forward.point.x, y: forward.point.y } },
      });

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

  // --- ОБМЕЖЕННЯ РОЗМІРІВ ОБРОБКИ МЕЖАМИ РЕБЕР (FG-11) ---
  // Раніше radius/sizeB/sizeC читались як є: Г-виріз 1500 мм на ребрі 700 мм
  // гнав контур у зворотний бік, полігон самоперетинався і тріангуляція
  // малювала діагональний «зріз» замість прямого кута.
  // Правило те саме, що в прямокутного будівника: два сусідні вторгнення
  // на одному ребрі не можуть сумарно перевищити його довжину — інакше
  // обидва стискаються пропорційно. Радіус після стискання бере мінімум
  // зі своїх двох напрямків, щоб дуга лишилась дугою.
  const effPrev: number[] = new Array(len).fill(0);
  const effNext: number[] = new Array(len).fill(0);
  {
    const edgeLen: number[] = new Array(len);
    for (let i = 0; i < len; i++) {
      const a = basePoints[i];
      const b = basePoints[(i + 1) % len];
      edgeLen[i] = Math.hypot(b.x - a.x, b.y - a.y);
    }
    for (let i = 0; i < len; i++) {
      const c = corners[cornerIds[i]];
      if (!c) continue;
      if (c.type === 'radius') {
        effPrev[i] = effNext[i] = Math.max(0, c.radius || 0);
      } else {
        effPrev[i] = Math.max(0, c.sizeB || 0);
        effNext[i] = Math.max(0, c.sizeC || 0);
      }
    }
    for (let i = 0; i < len; i++) {
      const j = (i + 1) % len;
      const a = effNext[i];
      const b = effPrev[j];
      const L = edgeLen[i];
      if (a + b <= L || a + b <= 0) continue;
      const k = L / (a + b);
      effNext[i] = a * k;
      effPrev[j] = b * k;
    }
  }

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
      const r = Math.min(effPrev[i], effNext[i]);
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
      const sizeB = effPrev[i];
      const sizeC = effNext[i];
      const S = { x: px + dirPrev.x * sizeB, y: py + dirPrev.y * sizeB };
      const E = { x: px + dirNext.x * sizeC, y: py + dirNext.y * sizeC };
      cornerEnds.push(S);
      points.push(S);
      points.push(E);
      cornerStarts.push(E);
    } else if (corner?.type === 'l-cut') {
      const sizeB = effPrev[i];
      const sizeC = effNext[i];
      const S: Point = { x: px + dirPrev.x * sizeB, y: py + dirPrev.y * sizeB };
      const M: Point = { x: px + dirPrev.x * sizeB + dirNext.x * sizeC, y: py + dirPrev.y * sizeB + dirNext.y * sizeC };
      const E = { x: px + dirNext.x * sizeC, y: py + dirNext.y * sizeC };
      cornerEnds.push(S);
      points.push(S);
      points.push(M);
      points.push(E);
      cornerStarts.push(E);
      // Ребра Г-зарізу — іменовані сторони (Б-002, 07.09.2026): ключі ті
      // самі, що в 3D-контурі. Точки несуть sideId, щоб шматки після
      // різу стиками впізнали свої кромки, як і на звичайних сторонах.
      S.sideId = `${cornerId}_lcut1`;
      M.sideId = `${cornerId}_lcut2`;
      sideSegments[`${cornerId}_lcut1`] = { start: S, end: M };
      sideSegments[`${cornerId}_lcut2`] = { start: M, end: E };
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

  // Сюди вирізи приходять уже з АБСОЛЮТНИМ центром: прив'язку до кута знімає
  // `buildGeometry` через `domain/cutoutAnchor.ts`. Тут своєї математики
  // прив'язки бути не повинно — раніше вона тут була, шукала кут за іменем
  // точки контуру, а точки контуру імен кутів не несуть (тільки sideId), тому
  // гілка ніколи не спрацьовувала і виріз мовчки лягав від початку координат.
  Object.values(cutouts).forEach((c) => {
    let cx = c.x;
    let cy = c.y;

    cx += shiftX;
    cy += shiftY;

    if (c.shape === 'rect') {
      const cw = c.width || 0;
      const ch = c.height || 0;
      /*
       * №161 (скарга власника 08.09: «в розкрій невірно попадає виріз мийки,
       * коли його крутиш — мийка покрутилась, а виріз ні»). Поворот вирізу
       * (і мийки, яка віддає йому своє поле `rotation`) мусить дійти й СЮДИ:
       * розкрій — це те, що поїде на верстат, і прямий отвір під повернуту
       * чашу означає зіпсований лист. Обхід точок той самий, що в
       * `rectPoints`, тільки навколо центру і з поворотом.
       */
      const rot = ((c as { rotation?: number }).rotation ?? 0) * (Math.PI / 180);
      if (Math.abs(rot) > 1e-4) {
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const corners: Array<[number, number]> = [
          [-cw / 2, -ch / 2], [cw / 2, -ch / 2], [cw / 2, ch / 2], [-cw / 2, ch / 2],
        ];
        holes.push(corners.map(([x, y]) => ({
          x: cx + x * cos - y * sin,
          y: cy + x * sin + y * cos,
        })));
      } else {
        holes.push(offsetPoints(rectPoints(cw, ch), cx - cw / 2, cy - ch / 2));
      }
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
  const prefix = EDGE_KIND_LABEL[edgeKind === 'fold' ? 'fold' : 'thickening'];
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

/**
 * Гнуті елементи смуги — FG-27.
 *
 * Смуга потовщення чи підвороту, яка проходить обидві сторони скругленого
 * кута, обходить його по дузі. Раніше цей шматок просто зникав: пряма смуга
 * рахувалась по `sideSegments`, а вони дуг не містять, — тобто матеріал на
 * дугу не списувався, і робота цеху не виставлялась.
 *
 * Тепер на кожну таку дугу народжується окремий ПРЯМОКУТНИК: довжина —
 * зовнішня дуга плюс запас, висота — виліт смуги. Він лягає в розкрій як
 * звичайна деталь (матеріал рахується чесно), а позначка `radiusElement`
 * дає кошторису підставу нарахувати виготовлення гнутого елемента.
 *
 * Якщо на тому самому куті сходяться і потовщення, і підворот — це ДВА
 * гнуті елементи, бо це дві різні смуги, і кожну цех гне окремо.
 */
function radiusElementParts(
  detail: Detail,
  feature: EdgeFeature | undefined,
  basePart: DetailPart,
  edgeKind: DetailPart['edgeKind'],
  validSides: string[],
): DetailPart[] {
  // Правило «де саме є дуга» живе в domain/radiusElement — воно спільне з
  // виробом, де смуги народжуються окремими Елементами.
  const covered = new Set(validSides);
  const specs = radiusElementSpecs(feature, detail.geometry?.corners, detail.shape, activeMaterial)
    .filter((spec) => covered.has(spec.sides[0]) && covered.has(spec.sides[1]));

  return specs.map((spec) => {
    const prefix = EDGE_KIND_LABEL[edgeKind === 'fold' ? 'fold' : 'thickening'];
    const name = `Обробка гнутої деталі · ${prefix} ${genitiveLabel(basePart.parentLabel)} кут ${spec.cornerId} R${Math.round(spec.radiusMm)}`;
    const part = buildRectPart(detail, name, spec.lengthMm, spec.bandSizeMm, false, basePart.parentLabel, edgeKind, spec.cornerId);
    part.radiusElement = {
      radiusMm: spec.radiusMm,
      arcLengthMm: spec.arcLengthMm,
      cornerId: spec.cornerId,
      arcAngleDeg: spec.arcAngleDeg,
      bandSizeMm: spec.bandSizeMm,
      method: spec.method,
      role: 'countertop',
      complex: spec.complex,
    };
    return part;
  });
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
  const straightBands = validSides.map((side) => {
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

  // Пряма частина смуги йде по сторонах, гнута — окремими шматками по дугах.
  // Подвійного рахунку тут немає: довжина прямої смуги береться з
  // `sideSegments`, а вони закінчуються там, де починається скруглення.
  return [...straightBands, ...radiusElementParts(detail, feature, basePart, edgeKind, validSides)];
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

/**
 * ОТВІР ПІД ВСТАВКУ ЗЛИВУ (28.08.2026, зауваження власника).
 *
 * Чотири трикутники дна сходяться гострими вершинами в ЦЕНТРІ чаші —
 * рівно там, куди стає «кругла деталь дна» Ø114 (деталь №14 у цій же
 * розкладці, вона ж носій решітки зливу). Отвору під неї не було
 * взагалі: трикутники малювались до точки, і вставку не було куди
 * ставити — ні на кресленні, ні фізично.
 *
 * Тому гостра вершина кожного трикутника ЗРІЗАЄТЬСЯ дугою радіуса
 * `drainDiameter/2` з центром у самій вершині. Чотири чверті разом
 * складають повне коло під вставку, а метраж каменю перестає
 * рахуватись із надлишком.
 */
function cutDrainVertex(points: Point[], vertexIndex: number, radius: number, segments = 8): Point[] {
  const n = points.length;
  if (n < 3 || radius <= 0) return points;

  const apex = points[vertexIndex];
  const prev = points[(vertexIndex - 1 + n) % n];
  const next = points[(vertexIndex + 1) % n];

  const toPrev = { x: prev.x - apex.x, y: prev.y - apex.y };
  const toNext = { x: next.x - apex.x, y: next.y - apex.y };
  const lenPrev = Math.hypot(toPrev.x, toPrev.y);
  const lenNext = Math.hypot(toNext.x, toNext.y);
  if (lenPrev < 1 || lenNext < 1) return points;

  // Радіус не може з'їсти сторону цілком — інакше деталі не лишиться
  const r = Math.min(radius, lenPrev * 0.9, lenNext * 0.9);

  const a0 = Math.atan2(toPrev.y, toPrev.x);
  const a1 = Math.atan2(toNext.y, toNext.x);
  // Коротка дуга від сторони до сторони — саме її проходить інструмент
  let delta = a1 - a0;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  const arc: Point[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const a = a0 + (delta * i) / segments;
    arc.push({ x: apex.x + r * Math.cos(a), y: apex.y + r * Math.sin(a) });
  }

  return [...points.slice(0, vertexIndex), ...arc, ...points.slice(vertexIndex + 1)];
}

function triangleBack(base: number, height: number, drainRadius = 0): Point[] {
  return cutDrainVertex([{ x: 0, y: 0 }, { x: base, y: 0 }, { x: base / 2, y: height }], 2, drainRadius);
}

function triangleFront(base: number, height: number, drainRadius = 0): Point[] {
  return cutDrainVertex([{ x: 0, y: height }, { x: base, y: height }, { x: base / 2, y: 0 }], 2, drainRadius);
}

function triangleLeft(width: number, height: number, drainRadius = 0): Point[] {
  return cutDrainVertex([{ x: 0, y: 0 }, { x: 0, y: height }, { x: width, y: height / 2 }], 2, drainRadius);
}

function triangleRight(width: number, height: number, drainRadius = 0): Point[] {
  return cutDrainVertex([{ x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height / 2 }], 2, drainRadius);
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
  /*
   * ⚠️ ОТВІР ПІД ВСТАВКУ ЗЛИВУ — ТИМЧАСОВО ВИМКНЕНИЙ (28.08, регресія).
   *
   * Зріз гострої вершини (`cutDrainVertex`) правильний за кресленням:
   * чотири трикутники мають віддати по чверті кола Ø114 під вставку.
   * Але 3D центрує деталь по НОМІНАЛЬНОМУ габариту (`translate(-pw/2,
   * -ph/2)` у ProductElement3DNode), а зріз зменшує ФАКТИЧНИЙ — і дно
   * чаші розповзається щілинами по кутах. Власник це побачив одразу.
   *
   * Щоб увімкнути назад, спершу треба навчити 3D центрувати деталі
   * мийки по фактичному контуру, а не по номіналу. Функція
   * `cutDrainVertex` лишається готовою — міняється лише цей рядок.
   */
  const drainRadius = 0;
  const t5 = triangleBack(n5.width, n5.height, drainRadius);
  const t6 = triangleFront(n6.width, n6.height, drainRadius);
  const t7 = triangleLeft(n7.width, n7.height, drainRadius);
  const t8 = triangleRight(n8.width, n8.height, drainRadius);
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
    // ЛІВА Г ('BL', 26.08): той самий обхід, що в lShapePoints — інакше
    // кути, задані на цілому виробі, мапились би на дзеркально не ті
    // вершини. Увігнута вершина в лівої — D, не C.
    if (g.cornerOrientation === 'BL') {
      return {
        points: {
          start: { x: 0, y: 0 }, A: { x: width, y: 0 }, B: { x: width, y: height }, C: { x: iw, y: height },
          D: { x: iw, y: height - ih }, E: { x: 0, y: height - ih }
        },
        reflexIds: ['D'],
      };
    }
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
    /*
     * РЕБРО, ЩО ЛЕЖИТЬ НА ЛІНІЇ РІЗУ (03.09.2026).
     *
     * У П-подібної стик іде рівно по внутрішньому ребру вирізу, у Г — по
     * внутрішньому ребру кута. Таке ребро лінію не «перетинає», тому в
     * список воно не потрапляло — і середина рахувалась між двома
     * далекими перетинами, тобто ЗА межами матеріалу, на самій межі.
     * Різ від такої точки давав виродження: замість трьох шматків
     * виходило два (спіймано сторожем «омега + лямбда»).
     * Кінці такого ребра — теж межі інтервалів, тому додаємо їх.
     */
    if (Math.abs(ca - position) < 0.01 && Math.abs(cb - position) < 0.01) {
      crossings.push(axis === 'vertical' ? a.y : a.x);
      crossings.push(axis === 'vertical' ? b.y : b.x);
    }
  }

  if (crossings.length < 2) return undefined;
  crossings.sort((p, q) => p - q);

  // Беремо середину ПЕРШОГО інтервалу, який справді лежить у матеріалі.
  // Раніше бралась середина перших двох перетинів без перевірки — на
  // формах із вирізом це могла бути точка на межі або поза деталлю.
  for (let i = 0; i + 1 < crossings.length; i++) {
    const mid = (crossings[i] + crossings[i + 1]) / 2;
    if (Math.abs(crossings[i + 1] - crossings[i]) < 0.01) continue;
    const candidate = axis === 'vertical' ? { x: position, y: mid } : { x: mid, y: position };
    if (isPointInRing(ring, candidate)) return candidate;
  }

  const fallback = (crossings[0] + crossings[1]) / 2;
  return axis === 'vertical' ? { x: position, y: fallback } : { x: fallback, y: position };
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
 * Довільний контур деталі в робочих координатах (лівий-верхній кут у 0,0)
 * з обробкою кутів і ІМЕНАМИ СТОРІН за угодою customPoints:
 *   id точки — ім'я ребра, що в ній ЗАКІНЧУЄТЬСЯ;
 *   замикальне ребро — `points[0].closeId ?? points[0].id`.
 * Точки без імен (імпорт DXF) віддаються як є — сторін у них немає, і
 * вигадувати їх позиційно не можна (те саме правило, що в sideVertexIndices).
 *
 * Одне місце для обох шляхів — цілої деталі й деталі зі стиками, — щоб
 * форма, кути та імена сторін не могли розійтись між ними.
 */
function namedCustomContour(g: NonNullable<Detail['geometry']>): {
  points: Point[];
  sideSegments?: Record<string, { start: Point; end: Point }>;
  width: number;
  height: number;
} | undefined {
  if (!g.customPoints?.length) return undefined;
  const src = g.customPoints;
  const n = src.length;
  const normalized = normalizePoints(src);
  const cornerIds = src.map((point) => (point as { id?: string }).id ?? '');
  const closeId = (src[0] as { closeId?: string }).closeId;
  // Ім'я ребра, що ПОЧИНАЄТЬСЯ в точці i, — id НАСТУПНОЇ точки.
  const sideIds = src.map((_, index) => (index < n - 1 ? cornerIds[index + 1] : (closeId ?? cornerIds[0])));
  const hasNames = sideIds.some(Boolean);
  const cornerRecord = g.corners as Record<string, CornerProcessing> | undefined;
  const hasCorners = Boolean(cornerRecord && cornerIds.some((id) => id && cornerRecord[id]));
  if (!hasNames && !hasCorners) {
    return { points: normalized.points, width: normalized.width, height: normalized.height };
  }
  const built = buildComplexPolygonPoints(normalized.points, hasCorners ? cornerRecord : undefined, cornerIds, sideIds);
  const sideSegments = hasNames
    ? Object.fromEntries(Object.entries(built.sideSegments).filter(([name]) => name))
    : undefined;
  return { points: built.points, sideSegments, width: normalized.width, height: normalized.height };
}

/**
 * Готовий контур деталі — з радіусами, фасками й Г-зарізами, з іменами сторін.
 * Це те, що ріжуть стики: форма шматка після різу виходить сама.
 *
 * Віддано назовні 04.09.2026 для конструктора (зведення з заміром,
 * фанера) через експортну обгортку внизу файла: та сама математика
 * деталі, другої не буде (ОДНА_МАТЕМАТИКА_ДЕТАЛІ).
 */
function contourForDetail(detail: Detail): Point[] | undefined {
  return contourBuildForDetail(detail)?.points;
}

/**
 * Той самий контур разом із сегментами сторін (ім'я сторони → відрізок).
 * Розділено 04.09.2026 для конструктора: йому потрібні імена сторін, а
 * `contourForDetail` віддавав лише точки. Математика не змінилась —
 * `contourForDetail` тепер бере `.points` звідси.
 */
function contourBuildForDetail(detail: Detail): { points: Point[]; sideSegments?: Record<string, { start: Point; end: Point }> } | undefined {
  const g = detail.geometry;
  if (!g) return undefined;
  const corners = g.corners;

  /*
   * ДОВІЛЬНИЙ КОНТУР ГОЛОВНІШИЙ ЗА ФОРМУ (03.09.2026, кейс 81-2009298).
   *
   * Стільниця «прямокутна» за типом, але з довільним контуром (ніша вікна,
   * виступ за пенал) і двома стиками їхала в розкрій трьома РІВНИМИ
   * прямокутниками 990 завширшки: ніж різав номінальний прямокутник
   * width×height, а customPoints читала лише гілка «деталь цілком». Той
   * самий пріоритет, що в 3D (shapeBuilder: контур головніший за kind) і
   * в гілці цілої деталі нижче, — тепер і тут. Імена сторін — з id точок,
   * за угодою customPoints, тому кромки й панелі на шматках лишаються.
   */
  const custom = namedCustomContour(g);
  if (custom) return { points: custom.points, sideSegments: custom.sideSegments };

  if (detail.shape === 'П-подібна') {
    const base = uShapePoints(
      g.width ?? 1200, g.height ?? 600,
      g.innerCutWidth ?? 600, g.innerCutDepth ?? 300, g.innerCutOffset ?? 200,
      g.innerCutSide ?? 'bottom', g.leftLegHeight, g.rightLegHeight,
    );
    return buildComplexPolygonPoints(base, corners, U_CORNER_IDS, U_SIDE_IDS);
  }

  if (detail.shape === 'Г-подібна') {
    const base = lShapePoints(
      g.outerWidth ?? 1200, g.outerHeight ?? 1200,
      g.innerHorizontal ?? 900, g.innerVertical ?? 500,
      g.cornerOrientation,
    );
    return buildComplexPolygonPoints(base, corners, L_CORNER_IDS, L_SIDE_IDS);
  }

  if (detail.shape === 'Прямокутна') {
    const base = rectPoints(g.width ?? 600, g.height ?? 600);
    return buildComplexPolygonPoints(base, corners, ['DA', 'AB', 'BC', 'CD'], ['A', 'B', 'C', 'D']);
  }

  return undefined;
}

/** Перетворює довільні стики деталі на різи контуру. */
function manualJointCuts(detail: Detail, ring: Point[]): JointCut[] {
  // ОДИН ВИД СТИКУ (03.09.2026, рішення власника). Старі описи — кутовий
  // стик Г і омега/лямбда П — перекладаються в довільні тут, на вході в
  // рушій. Далі шлях один на всіх: спільна позиція, спільна перевірка на
  // радіус, ніж по готовому контуру, імена сторін від оригіналу.
  const joints = allJointsOf(detail.shape, detail.geometry);
  if (!joints.length) return [];

  // Опорні точки беремо спільною функцією: вона знає і прямокутник теж,
  // а саме на прямокутних деталях довільні стики й потрібні найчастіше.
  const anchors = jointAnchorPoints(detail.shape, detail.geometry);
  /* Сторони контуру за іменами — з них рахується поле пари (№141). */
  const sides = ringSideSegments(ring);
  const cuts: JointCut[] = [];

  // Два стики на тому самому місці — не два різи, а один. Так буває, коли
  // менеджер тисне «+ Вертикальний» двічі: обидва лягають на типову відстань,
  // і другий «система не бачить» (FG-07). Прибираємо дублі тут, у рушії, щоб
  // жоден шлях створення стику не міг завести деталь у різ нульової ширини.
  // №141: дубль — це той самий різ у ТОМУ САМОМУ полі. Два стики на одній
  // координаті, але в різних полях (H↔F у лівій нозі і D↔B у правій) — два
  // різні шви, і схлопувати їх не можна: поле входить у ключ.
  const seen: Array<{ axis: string; position: number; field: string }> = [];

  for (const joint of joints) {
    // Позицію рахує СПІЛЬНА manualJointPosition (domain/joints) — тут жила її
    // копія `base + offset`, і саме вона не знала, що відступ від дальнього
    // кута відкладається всередину деталі. Копія давала стик за контуром:
    // у 3D лінія зникала, а в розкрої різ ішов повз матеріал.
    const { requested } = manualJointPosition(anchors, detail.geometry?.corners, joint);
    const position = snapJointOffArcs(detail, joint.axis, requested);
    const fieldKey = joint.sideId && joint.oppositeSideId
      ? [joint.sideId, joint.oppositeSideId].sort().join('|')
      : '';
    if (seen.some((item) => item.axis === joint.axis && item.field === fieldKey
      && Math.abs(item.position - position) < 1)) continue;
    seen.push({ axis: joint.axis, position, field: fieldKey });

    const start = interiorPointOnLine(ring, joint.axis, position);
    if (!start) continue; // лінія не перетинає деталь — стик ігноруємо
    cuts.push({
      start,
      dir: joint.axis === 'vertical' ? { x: 0, y: -1 } : { x: -1, y: 0 },
      line: { axis: joint.axis, position },
      field: jointFieldPoint(sides, joint, position),
      jointType: joint.jointType,
    });
  }

  return cuts;
}

/**
 * ТОЧКА ПОЛЯ СТИКУ (№141, 08.09.2026).
 *
 * Стик, поставлений на кресленні, знає свою пару сторін — «між H і F». Пара
 * однозначно вказує ділянку деталі: беремо середину між цими двома сторонами
 * впоперек різу, і разом із координатою лінії це точка всередині потрібного
 * шматка. Далі `splitContourByJoints` ріже тільки той шматок, у якому вона
 * лежить, а не все, крізь що проходить пряма.
 *
 * Порожньо — стик без пари (панель «+ Вертикальний», омега/лямбда): для таких
 * лишається стара наскрізна поведінка, щоб збережені проєкти не поїхали.
 */
function jointFieldPoint(
  sides: Record<string, { start: Point; end: Point }>,
  joint: { axis: 'vertical' | 'horizontal'; sideId?: string; oppositeSideId?: string },
  position: number,
): Point | undefined {
  if (!joint.sideId || !joint.oppositeSideId) return undefined;
  const a = sides[joint.sideId];
  const b = sides[joint.oppositeSideId];
  if (!a || !b) return undefined;
  /* Впоперек різу: вертикальний різ іде по X, значить «поперек» — це Y. */
  const across = (s: { start: Point; end: Point }) =>
    joint.axis === 'vertical' ? (s.start.y + s.end.y) / 2 : (s.start.x + s.end.x) / 2;
  const mid = (across(a) + across(b)) / 2;
  return joint.axis === 'vertical' ? { x: position, y: mid } : { x: mid, y: position };
}

/**
 * Усі отвори деталі в координатах її контуру (0,0 — лівий-верхній кут):
 * вирізи з редактора (центр уже абсолютний) і готові отвори імпорту.
 */
function detailHoles(detail: Detail, contour: Point[], width: number, height: number): Point[][] {
  const g = detail.geometry;
  if (!g) return [];
  const holes = buildHolesFromCutouts(g.cutouts, contour, width, height);
  // Готові отвори довільного контуру (імпорт) — у координатах вихідних точок,
  // а контур ножа вже зсунуто в 0,0: переносимо на той самий зсув.
  // Раніше деталь із такими отворами і стиком їхала в цех без отворів.
  if (g.customHoles?.length && g.customPoints?.length) {
    const originX = Math.min(...g.customPoints.map((point) => point.x));
    const originY = Math.min(...g.customPoints.map((point) => point.y));
    g.customHoles.forEach((hole) => {
      if (hole.length >= 3) holes.push(hole.map((point) => ({ x: point.x - originX, y: point.y - originY })));
    });
  }
  return holes;
}

/** Точка перетину відрізка p→q з прямою a→b (за знаковими відстанями sp, sq). */
function lineHit(p: Point, q: Point, sp: number, sq: number): Point {
  const t = sp / (sp - sq);
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
}

/**
 * Сазерленд–Ходжман по одній півплощині: лишає частину `subject` з того
 * боку прямої a→b, куди показує `keepSign` (знак площі кільця-господаря).
 */
function clipByHalfPlane(subject: Point[], a: Point, b: Point, keepSign: number): Point[] {
  const EPS = 1e-6;
  const side = (p: Point) => ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) * keepSign;
  const out: Point[] = [];
  for (let i = 0; i < subject.length; i++) {
    const cur = subject[i];
    const prev = subject[(i + subject.length - 1) % subject.length];
    const sc = side(cur);
    const sp = side(prev);
    const inCur = sc >= -EPS;
    const inPrev = sp >= -EPS;
    if (inCur) {
      if (!inPrev) out.push(lineHit(prev, cur, sp, sc));
      out.push({ x: cur.x, y: cur.y });
    } else if (inPrev) {
      out.push(lineHit(prev, cur, sp, sc));
    }
  }
  // Точка полігона рівно на прямій дає перетин, що збігається з нею самою, —
  // прибираємо такі дублі, інакше на різі з'являється ребро нульової довжини.
  return out.filter((point, index) => {
    const prev = out[(index + out.length - 1) % out.length];
    return index === 0 || Math.hypot(point.x - prev.x, point.y - prev.y) > 0.01;
  });
}

/** Параметр точки p уздовж відрізка a→b і її відстань від прямої. */
function alongSegment(p: Point, a: Point, b: Point): { t: number; dist: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const dist = Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / Math.sqrt(len2);
  return { t, dist };
}

/**
 * ВИРІЗ НА СТИКУ (03.09.2026, кейс 81-2009298: варильна 562×492 стоїть
 * рівно на шві Ст1/Ст2).
 *
 * Раніше отвір діставався ОДНОМУ шматку — тому, де опинився центр
 * вирізу, — і 280 мм отвору висіли за краєм шматка, а сусід їхав у цех
 * без своєї половини. Тепер частина отвору, що лежить у шматку,
 * врізається в його контур ВИЇМКОЮ по ребру різу, а шов коротшає на
 * ширину вирізу — цех клеїть рівно стільки, скільки лишилось матеріалу.
 *
 * Вхід: `clipped` — частина отвору з боку цього шматка (після відсікання
 * всіма його ребрами різу). Рівно одне ребро `clipped` має лежати на
 * ребрі різу кільця; решта ланцюга й стає виїмкою. Якщо ребер на різі
 * два (отвір ширший за шматок) — виїмка розвалила б шматок надвоє, тож
 * повертаємо порожньо, і виріз лишається отвором, як було.
 */
function spliceNotch(ring: Point[], clipped: Point[]): { ring: Point[]; line: { a: Point; b: Point }; spanMm: number } | undefined {
  const n = ring.length;
  const m = clipped.length;
  if (m < 3) return undefined;
  const ON_LINE = 0.05;
  const found: Array<{ j: number; i: number; tp: number; tq: number }> = [];
  for (let j = 0; j < m; j++) {
    const p = clipped[j];
    const q = clipped[(j + 1) % m];
    if (Math.hypot(q.x - p.x, q.y - p.y) < 0.01) continue;
    for (let i = 0; i < n; i++) {
      if (!ring[i].cut) continue;
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const ap = alongSegment(p, a, b);
      const aq = alongSegment(q, a, b);
      if (ap.dist > ON_LINE || aq.dist > ON_LINE) continue;
      if (ap.t < -1e-6 || ap.t > 1 + 1e-6 || aq.t < -1e-6 || aq.t > 1 + 1e-6) continue;
      found.push({ j, i, tp: ap.t, tq: aq.t });
    }
  }
  if (found.length !== 1) return undefined;
  const { j, i, tp, tq } = found[0];

  // Ланцюг виїмки — від q далі по отвору до p (усе, крім ребра на різі).
  const chain: Point[] = [];
  for (let k = 1; k <= m; k++) chain.push({ x: clipped[(j + k) % m].x, y: clipped[(j + k) % m].y });
  // Вставляємо в напрямку обходу a→b: перша точка ланцюга — з меншим параметром.
  if (tq > tp) chain.reverse();
  const first = chain[0];
  const last = chain[chain.length - 1];
  const spanMm = Math.hypot(last.x - first.x, last.y - first.y);
  if (spanMm < 1) return undefined;

  // Ребра виїмки — без імені сторони і без позначки різу; лише останнє
  // ребро ланцюга, що повертає на лінію різу, знову є різом.
  const notch: Point[] = chain.map((point, index) => ({
    ...point,
    sideId: undefined,
    cut: index === chain.length - 1 ? true : undefined,
  }));
  const next = dedupeRing([...ring.slice(0, i + 1), ...notch, ...ring.slice(i + 1)]);
  if (next.length < 3 || Math.abs(signedRingArea(next)) < 1) return undefined;
  return { ring: next, line: { a: ring[i], b: ring[(i + 1) % n] }, spanMm };
}

/** Шов, що лежить на цій лінії різу. */
function seamOnLine(seams: JointSeam[], line: { a: Point; b: Point }): JointSeam | undefined {
  return seams.find((item) => {
    if (!item.chord) return false;
    const from = alongSegment(item.chord.from, line.a, line.b);
    const to = alongSegment(item.chord.to, line.a, line.b);
    return from.dist < 0.5 && to.dist < 0.5;
  });
}

/** Центроїд полігона — для перевірки «отвір у цьому шматку». */
function ringCentroid(ring: Point[]): Point {
  const n = ring.length || 1;
  return {
    x: ring.reduce((sum, p) => sum + p.x, 0) / n,
    y: ring.reduce((sum, p) => sum + p.y, 0) / n,
  };
}

/**
 * Роздає отвори деталі шматкам після різу: отвір цілком усередині шматка —
 * лишається отвором; отвір, який перетинає ребро різу, стає виїмкою на
 * кожному шматку, якого торкається (див. spliceNotch).
 */
function distributeHoles(rings: Point[][], holes: Point[][], seams?: JointSeam[]): Array<{ ring: Point[]; holes: Point[][] }> {
  const out = rings.map((ring) => ({ ring, holes: [] as Point[][] }));
  holes.forEach((hole) => {
    if (hole.length < 3) return;
    const holeArea = Math.abs(signedRingArea(hole));
    if (holeArea < 1) return;
    // «Отвір у цьому шматку» — за центроїдом, як і раніше за центром вирізу
    // (перша точка отвору може лежати рівно на межі й «випасти» з обох).
    const centre = ringCentroid(hole);
    // Один шов ділять два шматки, а виїмка на ньому одна — знімати ширину
    // зі шва треба один раз на отвір, але з КОЖНОГО шва, якого він торкнувся.
    const reducedSeams = new Set<JointSeam>();
    for (const item of out) {
      const ring = item.ring;
      const sign = Math.sign(signedRingArea(ring)) || 1;
      const cutEdges = ring.map((point, index) => (point.cut ? index : -1)).filter((index) => index >= 0);
      if (!cutEdges.length) {
        if (isPointInRing(ring, centre)) item.holes.push(hole);
        continue;
      }
      let clipped = hole;
      for (const index of cutEdges) {
        clipped = clipByHalfPlane(clipped, ring[index], ring[(index + 1) % ring.length], sign);
        if (clipped.length < 3) break;
      }
      const area = clipped.length >= 3 ? Math.abs(signedRingArea(clipped)) : 0;
      if (area < 1) continue; // не в цьому шматку
      if (Math.abs(area - holeArea) < 0.5) {
        // Різ отвору не торкнувся — звичайний отвір, якщо він справді тут.
        if (isPointInRing(ring, centre)) item.holes.push(hole);
        continue;
      }
      const notched = spliceNotch(ring, clipped);
      if (!notched) {
        // Виріз наскрізь через вузький шматок (торкається двох різів) — виїмка
        // розвалила б його надвоє. Як було: отвір цілком тому шматку, де центр,
        // і гучно в консоль — таку деталь має побачити людина.
        if (isPointInRing(ring, centre)) {
          item.holes.push(hole);
          console.warn('[ВИРІЗ] Виріз проходить крізь шматок між двома стиками — шматок лишено з отвором, що виходить за його межі. Перевір у розкрої.');
        }
        continue;
      }
      item.ring = notched.ring;
      if (seams) {
        const seam = seamOnLine(seams, notched.line);
        if (seam && !reducedSeams.has(seam)) {
          seam.lengthMm = Math.max(0, seam.lengthMm - notched.spanMm);
          reducedSeams.add(seam);
        }
      }
    }
  });
  return out;
}

/**
 * Перетворює шматки, отримані різом контуру, на парти розкрою.
 *
 * Порядок стабільний — зліва направо, згори вниз. Інакше нумерація Виріб.1/2/3
 * стрибала б між перерахунками, і менеджер щоразу бачив би інші номери.
 */
function pushRingParts(parts: DetailPart[], detail: Detail, rings: Point[][], parentLabel: string, ringHoles?: Point[][][]) {
  const padX = Math.max(0, activeAllowances.detailLength);
  const padY = Math.max(0, activeAllowances.detailWidth);

  const ordered = rings
    .map((ring, ringIndex) => {
      const xs = ring.map((p) => p.x);
      const ys = ring.map((p) => p.y);
      return { ring, holes: ringHoles?.[ringIndex] ?? [], minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
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
      /*
       * Імена сторін і позначки різу переносяться на контур з припуском.
       * За індексом — лише коли точок стільки ж, скільки було (чистка
       * `cleanPolygonForOffset` межі сторін тепер не чіпає, №105). Якщо
       * кількість усе ж розійшлась — за найближчою вихідною вершиною, а
       * не «за номером»: інакше кожна сторона після викинутої точки
       * з'їжджає на сусіднє ребро.
       */
      const sameCount = offset.points.length === local.length;
      if (!sameCount) console.warn(`[РОЗКРІЙ] ${label}: контур з припуском має ${offset.points.length} точок проти ${local.length} — імена сторін перенесено за найближчою вершиною`);
      const sourceFor = (p: Point, i: number): Point | undefined => {
        if (sameCount) return local[i];
        let best: Point | undefined; let bestDist = Infinity;
        for (const q of local) {
          const d = (q.x + offset.shiftX - p.x) ** 2 + (q.y + offset.shiftY - p.y) ** 2;
          if (d < bestDist) { bestDist = d; best = q; }
        }
        return best;
      };
      finalPoints = offset.points.map((p, i) => { const src = sourceFor(p, i); return { ...p, sideId: src?.sideId, cut: src?.cut }; });
      width = offset.width;
      height = offset.height;
      shiftX = offset.shiftX;
      shiftY = offset.shiftY;
    }

    const meta = splitMeta(label, item.minX, item.minY);
    meta.nominalPoints = local.map((p) => ({ x: p.x + shiftX, y: p.y + shiftY }));
    // Отвори шматка — у його локальних координатах (разом із припуском).
    const localHoles = item.holes.map((hole) => hole.map((point) => ({ x: point.x - item.minX + shiftX, y: point.y - item.minY + shiftY })));
    meta.holes = localHoles.length ? localHoles : undefined;

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

      /**
       * «Деталь цілком» і стик — взаємно виключні стани, і вирішує це рушій,
       * а не той, хто його викликав.
       *
       * FG-20: у 3D пунктир стику намальовано, а в карту крою деталь їде
       * цілою. Редактор цю пару вже розводить (`elementToDetail`), але
       * проєкти, збережені до появи тієї перевірки, несуть обидва прапорці
       * одразу — і рушій слухняно робив «цілком». Стик, який видно на
       * екрані, мусить різати; інакше програма показує одне, а цех отримує
       * інше. Тому нормалізуємо тут, у єдиній точці.
       */
      const wholeDetail = Boolean(g.wholeDetail)
        && !g.jointDirection
        && !g.jointOmegaDirection
        && !g.jointLambdaDirection
        && !g.manualJoints?.length;

      if (g.sinkKind === 'slot') {
        pushSlotSinkParts(parts, detail, parentLabel);
        continue;
      }

      if (g.sinkKind === 'rect') {
        pushRectSinkParts(parts, detail, parentLabel);
        continue;
      }

      // Металопрокат (MVP Viyar Metal): відрізок профілю йде в розкрій
      // однією смужкою «довжина × висота перерізу» — 1D-розкрій хлистів
      // поверх наявного пакувальника. Маса — прямо в назві, щоб менеджер
      // бачив вагу без калькулятора.
      if (g.metalProfileId) {
        const profile = metalProfileById(g.metalProfileId);
        const lengthMm = Math.max(1, g.width ?? 1000);
        const heightMm = Math.max(1, profile?.h ?? g.height ?? 40);
        const weight = profile ? pieceWeightKg(profile, lengthMm) : 0;
        const name = `${profile?.label ?? 'Профіль'} — ${Math.round(lengthMm)} мм${weight ? ` (${weight.toFixed(2)} кг)` : ''}`;
        parts.push(buildRectPart(detail, name, lengthMm, heightMm, true, parentLabel));
        continue;
      }

      // Довільні стики працюють на будь-якій формі: ріжемо готовий контур
      // так само, як і стики на увігнутих кутах. Потрібні, коли деталь більша
      // за сляб або коли ріжемо із залишку.
      if (allJointsOf(detail.shape, g).length && !wholeDetail) {
        const contour = contourForDetail(detail);
        const cuts = contour ? manualJointCuts(detail, contour) : [];
        if (contour && cuts.length) {
          const seams: JointSeam[] = [];
          const rings = splitContourByJoints(contour, cuts, seams);
          if (rings.length >= 2) {
            const before = parts.length;
            // Отвори — по шматках: усередині шматка лишаються отворами, на
            // ребрі різу стають виїмками і вкорочують шов.
            const bounds = pointsBounds(contour);
            const shared = distributeHoles(rings, detailHoles(detail, contour, bounds.width, bounds.height), seams);
            pushRingParts(parts, detail, shared.map((item) => item.ring), parentLabel, shared.map((item) => item.holes));
            attachJointSeams(parts, before, seams);
            continue;
          }
        }
      }

      if (g.customPoints?.length) {
        const normalized = normalizePoints(g.customPoints);
        const minX = Math.min(...g.customPoints.map((point) => point.x));
        const minY = Math.min(...g.customPoints.map((point) => point.y));
        const holes = (g.customHoles ?? []).map((hole) => hole.map((point) => ({ x: point.x - minX, y: point.y - minY })));
        const translatedSegments = g.sideSegments
          ? Object.fromEntries(Object.entries(g.sideSegments).map(([side, segment]) => [
            side,
            {
              start: { x: segment.start.x - minX, y: segment.start.y - minY },
              end: { x: segment.end.x - minX, y: segment.end.y - minY },
            },
          ]))
          : undefined;

        /*
         * РЕМОНТ 19.08 — ОБРОБКА КУТІВ НА ДОВІЛЬНОМУ КОНТУРІ.
         *
         * Ця гілка (ніша, шаблон подіуму, імпорт) брала точки як є і
         * ІГНОРУВАЛА detail.corners: радіуси жили в 3D, а бланк і карта
         * крою різали гострі кути — цех отримував не ту деталь, яку
         * погодив клієнт. Проганяємо контур через той самий будівник, що
         * й Г/П-форми (buildComplexPolygonPoints): він знає обмеження
         * FG-11 і повертає чесні sideSegments разом із дугами.
         *
         * Кути шукаються за id точки — та сама угода, що в 3D. Точки без
         * імен (імпорт DXF) просто не матчаться, і контур не змінюється.
         *
         * 03.09.2026: будівник винесено в `namedCustomContour` — той самий,
         * що дає контур ножу стиків. Заразом іменований контур БЕЗ кутів
         * теж отримує таблицю сторін: раніше вона з'являлась лише разом із
         * радіусом, і кромка на довільному контурі без кутів губила сторону.
         */
        const named = namedCustomContour(g)!;
        const contourPoints = named.points;
        const sideSegments = named.sideSegments ?? translatedSegments;
        const useImportAllowance = activeAllowances.applyToImports;
        const isElementImport = detail.importRole === 'thickening' || detail.importRole === 'fold';
        const outerPadX = useImportAllowance ? (isElementImport ? activeAllowances.elementLength : activeAllowances.detailLength) : 0;
        const outerPadY = useImportAllowance ? (isElementImport ? activeAllowances.elementWidth : activeAllowances.detailWidth) : 0;
        const offsetOuter = offsetPolygon(contourPoints, outerPadX, outerPadY);
        const actualPoints = useImportAllowance ? offsetOuter.points : contourPoints;
        const actualHoles = useImportAllowance
          ? holes.map((hole) => {
            const shiftedHole = offsetPoints(hole, offsetOuter.shiftX, offsetOuter.shiftY);
            return contractHoleTowardCenter(shiftedHole, cutoutAllowanceForHole(hole, isElementImport));
          })
          : holes;
        const nominalPoints = useImportAllowance
          ? offsetPoints(contourPoints, offsetOuter.shiftX, offsetOuter.shiftY)
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
        /*
         * ХВИЛЯ 4, крок 4.4 — вирізи на деталі з ДОВІЛЬНИМ контуром.
         *
         * Ця гілка брала отвори лише з `customHoles` (їх кладе імпорт), а
         * `cutouts` — те, що користувач малює в редакторі, — мовчки
         * втрачала: далі йде `continue`, і перетворення вирізів в отвори
         * нижче вже не спрацьовує. Наслідок тихий і дорогий: панель із
         * нішею І мийкою/вентиляційним отвором їхала в цех без отвору.
         *
         * Тепер вирізи домішуються тут-таки, тим самим будівельником, що
         * й для прямокутних деталей.
         */
        const cutoutHoles = buildHolesFromCutouts(
          g.cutouts,
          actualPoints,
          nextWidth,
          nextHeight,
        );
        const allHoles = cutoutHoles.length ? [...actualHoles, ...cutoutHoles] : actualHoles;

        const importMeta: PartLayoutMeta = {
          holes: allHoles,
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
        // Доповнення-дуга з редактора виробу: сам прямокутник звичайний,
        // але позначка мусить дожити до фактів — з неї нараховується
        // виготовлення гнутого елемента.
        if (g.radiusElement) main.radiusElement = g.radiusElement;
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
        if (wholeDetail) {
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
          /*
           * СТИК НЕ ВДАВСЯ (03.09.2026). Тут жила стара математика Г —
           * різ «двома прямокутниками з номіналів» на 68 рядків: власні
           * імена сторін, власне мапування кутів і вирізів на прямокутник,
           * аналітична довжина шва і НУЛЬ перевірок на радіус. Саме вона
           * давала різні площі залежно від напрямку стику, стик по дотичній
           * дуги і кромки на лініях різу.
           *
           * За рішенням власника (03.09.2026) стик тепер один — довільний,
           * і ріже його спільний ніж вище (гілка `allJointsOf`). Сюди
           * потрапляємо тільки якщо ніж НЕ спрацював: лінія не перетнула
           * матеріал або дала менше двох шматків.
           *
           * У такому разі чесно віддаємо ЦІЛУ деталь і кажемо про це вголос.
           * Мовчки перемикатись на іншу математику — рівно те, від чого ми
           * пішли: цех отримував шматки, порахувані не тим кодом.
           */
          const layout = lShapeWithAllowances(nominalOW, nominalOH, nominalIH, nominalIV, g.cornerOrientation);
          const complexLayout = buildComplexPolygonPoints(
            layout.points,
            detail.geometry?.corners,
            ['start', 'A', 'B', 'C', 'D', 'E'],
            ['A', 'B', 'C', 'D', 'E', 'F']
          );
          const wholeHoles = buildHolesFromCutouts(g.cutouts, complexLayout.points, layout.width, layout.height, layout.shiftX, layout.shiftY);
          const main = buildPart(detail, parentLabel, 'Г-подібна', complexLayout.points, layout.width, layout.height, true, parentLabel, undefined, undefined, {
            nominalPoints: layout.nominalPoints,
            holes: wholeHoles.length ? wholeHoles : undefined,
          });
          main.sideSegments = complexLayout.sideSegments;
          pushPartWithEdges(parts, detail, main);
          const notice = `Деталь «${detail.label}»: стик не вдалося застосувати (лінія не перетинає матеріал або дає менше двох шматків) — деталь пішла в розкрій ЦІЛОЮ. Перевірте відступ стику.`;
          if (!jointNotices.includes(notice)) jointNotices.push(notice);
          console.warn('[СТИК]', notice);
        }
        continue;
      }
      if (detail.shape === 'П-подібна') {
        const nominalW = g.width ?? 1800;
        const nominalH = g.height ?? 700;
        const cutW = g.innerCutWidth ?? 600;
        const cutD = g.innerCutDepth ?? 300;
        const offset = g.innerCutOffset ?? 200;
        const side = g.innerCutSide ?? 'bottom';
        const leftH = g.leftLegHeight ?? nominalH;
        const rightH = g.rightLegHeight ?? nominalH;
        if (wholeDetail) {
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
        } else {
          /*
           * СТИК НЕ ВДАВСЯ або його немає (03.09.2026).
           *
           * Тут жила стара математика П: вісім гілок різу «прямокутниками
           * з номіналів» (омега/лямбда в усіх комбінаціях) плюс окремий
           * шлях для вирізу збоку, який давав три прямокутники ЗОВСІМ без
           * імен сторін — тому на них не малювались кромки і не
           * переносились кути з вирізами. Разом ≈200 рядків.
           *
           * За рішенням власника (03.09.2026) стик один — довільний, і
           * ріже його спільний ніж вище (гілка `allJointsOf`; омега та
           * лямбда перекладаються в довільні в `legacyJointsToManual`).
           * Сюди потрапляємо лише тоді, коли різати нема чим або ніж не
           * спрацював.
           *
           * Віддаємо ЦІЛУ деталь і кажемо про це вголос. Якщо менеджер
           * зняв «деталь цілком», але стику не поставив — деталь поїде
           * цілою, і він побачить чому, а не отримає мовчки три
           * прямокутники, яких не просив.
           */
          const layout = uShapeWithAllowances(nominalW, nominalH, cutW, cutD, offset, side, leftH, rightH);
          const complexLayout = buildComplexPolygonPoints(
            layout.points,
            detail.geometry?.corners,
            U_CORNER_IDS,
            U_SIDE_IDS,
          );
          const wholeHoles = buildHolesFromCutouts(g.cutouts, complexLayout.points, layout.width, layout.height, layout.shiftX, layout.shiftY);
          const main = buildPart(detail, parentLabel, 'П-подібна', complexLayout.points, layout.width, layout.height, true, parentLabel, undefined, undefined, {
            nominalPoints: layout.nominalPoints,
            holes: wholeHoles.length ? wholeHoles : undefined,
          });
          main.sideSegments = complexLayout.sideSegments;
          pushPartWithEdges(parts, detail, main);
          const notice = `Деталь «${detail.label}»: стику немає або його не вдалося застосувати — деталь пішла в розкрій ЦІЛОЮ. Додайте стик у панелі «Стики».`;
          if (!jointNotices.includes(notice)) jointNotices.push(notice);
          console.warn('[СТИК]', notice);
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

  return { explodeDetails, contourForDetail, contourBuildForDetail };
}


export function explodeDetails(
  details: Detail[],
  allowances: CutAllowances = DEFAULT_ALLOWANCES,
  /**
   * Матеріал проєкту. Потрібен рівно для одного: технологічний запас на
   * гнутий елемент — 30% на сегментацію каменю, 20% на гнуття акрилу.
   * Порожньо — рахуємо як сегментацію (безпечніший, більший запас).
   */
  material?: MaterialType,
): DetailPart[] {
  return createGeometryEngine({ ...DEFAULT_ALLOWANCES, ...allowances }, material).explodeDetails(details);
}

/**
 * Готовий контур деталі з іменами сторін — для конструктора (04.09.2026).
 * Та сама функція, що ріже стики всередині рушія; припуски на контур не
 * впливають, тому беремо замовчування.
 */
export function contourForDetail(detail: Detail): Point[] | undefined {
  return createGeometryEngine(DEFAULT_ALLOWANCES).contourForDetail(detail);
}

/** Контур + сегменти сторін (ім'я → відрізок) — для конструктора (04.09.2026). */
export function contourWithSidesForDetail(detail: Detail): { points: Point[]; sideSegments?: Record<string, { start: Point; end: Point }> } | undefined {
  return createGeometryEngine(DEFAULT_ALLOWANCES).contourBuildForDetail(detail);
}
