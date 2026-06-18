import { uid } from '../domain/defaults';
import type { DefectZone, DetailPart, PackingMode, Placement, Point, Project, Rotation, SlabInstance } from '../domain/types';
import { rotatePoint as rotateProjectPoint, rotatedLocalPoints, rotatedSize as projectRotatedSize } from '../lib/project';
import { SIDE_SEGMENT_INDEXES } from '../domain/constants';
import { pointInPolygonStrict, pointInPolygonOrOn, pointOnSegment, outwardNormal } from './geometryUtils';

type OccupiedBox = { x: number; y: number; width: number; height: number };
type OccupiedShape = { box: OccupiedBox; polygon: Point[]; holes: Point[][] };
type PlacementValidation = { ok: true } | { ok: false; reason: string };
type PlacementSearchResult = { placement?: Placement; reason?: string };
type PlacementPreference = 'first' | 'remnant';
type PackingContext = {
  occupiedBySlab: Map<string, OccupiedShape[]>;
  placements: Placement[];
  placedIds: Set<string>;
  pinnedSlabByPart: Map<string, string>;
  unplacedReasons: Map<string, string>;
};

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const REASON_NO_SPACE = 'недостатньо місця на слебах';
const REASON_DEFECT = 'перетин із дефектом';
const REASON_OUT_OF_BOUNDS = 'вихід за межі слеба';
const REASON_MARGIN = 'порушення мінімального відступу';
const REASON_COLLISION = 'неможливо розмістити без колізії';
const REASON_ONE_SLAB = 'Неможливо розмістити деталь та її елементи на одному слебі';
const TARGET_REMAINDER_WIDTH = 600;
const MIN_GRID_STEP = 24;
const MIN_REMNANT_GRID_STEP = 42;
const MAX_PLACEMENT_ATTEMPTS = 2600;
const MAX_REMNANT_VALID_ATTEMPTS = 90;
const MAX_FULL_TEXTURE_ANCHOR_ATTEMPTS = 3400;

function rotatedSize(part: DetailPart, rotation: Placement['rotation']) {
  return projectRotatedSize(part, rotation);
}

function longitudinalRotations(part: DetailPart, slab: SlabInstance, rotations: Rotation[]) {
  return [...rotations].sort((a, b) => {
    const aSize = rotatedSize(part, a);
    const bSize = rotatedSize(part, b);
    const aAlong = aSize.width >= aSize.height ? 0 : 1;
    const bAlong = bSize.width >= bSize.height ? 0 : 1;
    if (aAlong !== bAlong) return aAlong - bAlong;
    const aFit = aSize.width <= slab.width && aSize.height <= slab.height ? 0 : 1;
    const bFit = bSize.width <= slab.width && bSize.height <= slab.height ? 0 : 1;
    if (aFit !== bFit) return aFit - bFit;
    const aAxis = a === 0 || a === 180 ? 0 : 1;
    const bAxis = b === 0 || b === 180 ? 0 : 1;
    if (aAxis !== bAxis) return aAxis - bAxis;
    return bSize.width - aSize.width;
  });
}

function overlaps(a: OccupiedBox, b: OccupiedBox) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function overlapsWithGap(a: OccupiedBox, b: OccupiedBox, gap: number) {
  if (gap <= 0) return overlaps(a, b);
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

function pointDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointSegmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return pointDistance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return pointDistance(point, { x: a.x + dx * t, y: a.y + dy * t });
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

function polygonDistance(a: Point[], b: Point[]) {
  let best = Infinity;
  for (let i = 0; i < a.length; i += 1) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j += 1) {
      best = Math.min(best, segmentDistance(a1, a2, b[j], b[(j + 1) % b.length]));
      if (best <= 0.001) return 0;
    }
  }
  return best;
}

function packingClearance(project: Project) {
  return Math.max(0, project.allowances?.interPartSpacing ?? 0);
}

function polygonBounds(points: Point[]): OccupiedBox {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function rotatePoint(point: Point, rotation: Rotation, width: number, height: number): Point {
  return rotateProjectPoint(point, rotation, width, height);
}

function polygonForPlacement(part: DetailPart, placement: Placement): Point[] {
  return rotatedLocalPoints(part.points, placement.rotation, part.width, part.height, part.points).map((rotated) => {
    return { x: rotated.x + placement.x, y: rotated.y + placement.y };
  });
}

function holesForPlacement(part: DetailPart, placement: Placement): Point[][] {
  return (part.holes ?? []).map((hole) => rotatedLocalPoints(hole, placement.rotation, part.width, part.height, part.points).map((rotated) => {
    return { x: rotated.x + placement.x, y: rotated.y + placement.y };
  }));
}

function defectPolygon(defect: DefectZone): Point[] {
  if (defect.shapeType === 'circle') {
    const rx = defect.width / 2;
    const ry = defect.height / 2;
    const cx = defect.x + rx;
    const cy = defect.y + ry;
    return Array.from({ length: 36 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 36;
      return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
    });
  }
  if (defect.shapeType === 'triangle') {
    return [
      { x: defect.x + defect.width / 2, y: defect.y },
      { x: defect.x + defect.width, y: defect.y + defect.height },
      { x: defect.x, y: defect.y + defect.height },
    ];
  }
  if (defect.shapeType === 'polygon' && defect.points?.length) return defect.points;
  return [
    { x: defect.x, y: defect.y },
    { x: defect.x + defect.width, y: defect.y },
    { x: defect.x + defect.width, y: defect.y + defect.height },
    { x: defect.x, y: defect.y + defect.height },
  ];
}

function sideSegment(part: DetailPart, side: string | undefined, rotation: Rotation) {
  if (!side) return undefined;
  const customSegment = part.sideSegments?.[side];
  if (customSegment) {
    const [start, end] = rotatedLocalPoints([customSegment.start, customSegment.end], rotation, part.width, part.height, part.points);
    return {
      start,
      end,
    };
  }
  const resolvedSide = part.sideAliases?.[side] ?? side;
  const index = SIDE_SEGMENT_INDEXES[part.shape]?.[resolvedSide];
  if (index === undefined || !part.points[index]) return undefined;
  const rotated = rotatedLocalPoints(part.points, rotation, part.width, part.height, part.points);
  return { start: rotated[index], end: rotated[(index + 1) % rotated.length] };
}





function cross(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersectStrict(a: Point, b: Point, c: Point, d: Point, epsilon = 0.001) {
  if (pointOnSegment(a, c, d, epsilon) || pointOnSegment(b, c, d, epsilon) || pointOnSegment(c, a, b, epsilon) || pointOnSegment(d, a, b, epsilon)) {
    return false;
  }
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < -epsilon && cdA * cdB < -epsilon;
}



function polygonCenter(polygon: Point[]) {
  const sum = polygon.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / polygon.length, y: sum.y / polygon.length };
}

function polygonsOverlap(a: Point[], b: Point[]) {
  const aBox = polygonBounds(a);
  const bBox = polygonBounds(b);
  const overlapX1 = Math.max(aBox.x, bBox.x);
  const overlapY1 = Math.max(aBox.y, bBox.y);
  const overlapX2 = Math.min(aBox.x + aBox.width, bBox.x + bBox.width);
  const overlapY2 = Math.min(aBox.y + aBox.height, bBox.y + bBox.height);
  if (overlapX2 - overlapX1 <= 0.001 || overlapY2 - overlapY1 <= 0.001) return false;

  for (let i = 0; i < a.length; i += 1) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j += 1) {
      if (segmentsIntersectStrict(a1, a2, b[j], b[(j + 1) % b.length])) return true;
    }
  }

  const aCenter = polygonCenter(a);
  const bCenter = polygonCenter(b);

  return (
    a.some((point) => pointInPolygonStrict(point, b))
    || b.some((point) => pointInPolygonStrict(point, a))
    || (pointInPolygonStrict(aCenter, a) && pointInPolygonStrict(aCenter, b))
    || (pointInPolygonStrict(bCenter, b) && pointInPolygonStrict(bCenter, a))
    || [0.25, 0.5, 0.75].some((fx) => [0.25, 0.5, 0.75].some((fy) => {
      const sample = {
        x: overlapX1 + (overlapX2 - overlapX1) * fx,
        y: overlapY1 + (overlapY2 - overlapY1) * fy,
      };
      return pointInPolygonStrict(sample, a) && pointInPolygonStrict(sample, b);
    }))
  );
}



function polygonInsidePolygonOrOn(inner: Point[], outer: Point[]) {
  const allPointsInside = inner.every((point) => pointInPolygonOrOn(point, outer));
  if (!allPointsInside) return false;
  return !inner.some((a, index) => {
    const b = inner[(index + 1) % inner.length];
    return outer.some((c, outerIndex) => segmentsIntersectStrict(a, b, c, outer[(outerIndex + 1) % outer.length]));
  });
}

function polygonInsideAnyHole(polygon: Point[], holes: Point[][]) {
  return holes.some((hole) => polygonInsidePolygonOrOn(polygon, hole));
}

function physicalPolygonsOverlap(a: Point[], aHoles: Point[][], b: Point[], bHoles: Point[][]) {
  if (!polygonsOverlap(a, b)) return false;
  if (polygonInsideAnyHole(a, bHoles)) return false;
  if (polygonInsideAnyHole(b, aHoles)) return false;
  return true;
}

function validatePlacement(
  part: DetailPart,
  x: number,
  y: number,
  rotation: Rotation,
  slab: SlabInstance,
  occupied: OccupiedShape[],
  clearance = 0,
): PlacementValidation {
  const placement = placementFor(part, 'probe', x, y, rotation);
  const polygon = polygonForPlacement(part, placement);
  const holes = holesForPlacement(part, placement);
  const box = polygonBounds(polygon);
  const outsideSlab = polygon.some((point) => (
    point.x < 0
    || point.y < 0
    || point.x > slab.width
    || point.y > slab.height
  ));
  if (outsideSlab) return { ok: false, reason: REASON_OUT_OF_BOUNDS };

  const violatesMargin = polygon.some((point) => (
    point.x < slab.minMargin
    || point.y < slab.minMargin
    || point.x > slab.width - slab.minMargin
    || point.y > slab.height - slab.minMargin
  ));
  if (violatesMargin) return { ok: false, reason: REASON_MARGIN };

  const defectConflict = slab.defects.some((defect) => polygonsOverlap(polygon, defectPolygon(defect)));
  if (defectConflict) return { ok: false, reason: REASON_DEFECT };

  const placementConflict = occupied.some((item) => (
    (overlaps(box, item.box) && physicalPolygonsOverlap(polygon, holes, item.polygon, item.holes))
    || (clearance > 0 && overlapsWithGap(box, item.box, clearance) && polygonDistance(polygon, item.polygon) < clearance - 0.001)
  ));
  if (placementConflict) return { ok: false, reason: REASON_COLLISION };

  return { ok: true };
}

function canPlace(part: DetailPart, x: number, y: number, rotation: Rotation, slab: SlabInstance, occupied: OccupiedShape[], clearance = 0): boolean {
  return validatePlacement(part, x, y, rotation, slab, occupied, clearance).ok;
}

function placementFor(part: DetailPart, slabId: string, x: number, y: number, rotation: Rotation): Placement {
  return {
    id: uid('placement'),
    slabId,
    partId: part.id,
    x,
    y,
    rotation,
    manualLocked: false,
  };
}

function getOccupied(context: PackingContext, slabId: string) {
  const occupied = context.occupiedBySlab.get(slabId) ?? [];
  context.occupiedBySlab.set(slabId, occupied);
  return occupied;
}

function occupiedShape(part: DetailPart, placement: Placement): OccupiedShape {
  const polygon = polygonForPlacement(part, placement);
  return { box: polygonBounds(polygon), polygon, holes: holesForPlacement(part, placement) };
}

function unionBox(boxes: OccupiedBox[]) {
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function remnantScore(slab: SlabInstance, occupied: OccupiedShape[], candidate: OccupiedShape) {
  const packed = unionBox([...occupied.map((shape) => shape.box), candidate.box]);
  const horizontalStrip = Math.max(packed.y, slab.height - packed.y - packed.height);
  const verticalStrip = Math.max(packed.x, slab.width - packed.x - packed.width);
  const packedArea = packed.width * packed.height;

  if (horizontalStrip >= TARGET_REMAINDER_WIDTH) return -3_000_000_000 - horizontalStrip * 10_000 + packedArea;
  if (verticalStrip >= TARGET_REMAINDER_WIDTH) return -2_000_000_000 - verticalStrip * 10_000 + packedArea;

  const bestRectangularRemainder = Math.max(horizontalStrip * slab.width, verticalStrip * slab.height);
  return -bestRectangularRemainder + packedArea;
}

function isLongitudinalRemainderScore(score: number) {
  return score < -3_000_000_000;
}

function addPlacement(context: PackingContext, part: DetailPart, placement: Placement) {
  const pinnedSlabId = context.pinnedSlabByPart.get(part.id);
  const storedPlacement = pinnedSlabId
    ? { ...placement, slabId: pinnedSlabId, pinnedToSlab: true, pinnedSlabId, pinMode: placement.pinMode ?? 'single' }
    : placement;
  const occupied = getOccupied(context, storedPlacement.slabId);
  context.placements.push(storedPlacement);
  context.placedIds.add(part.id);
  occupied.push(occupiedShape(part, storedPlacement));
}

function existingPlacementForPart(context: PackingContext, partId: string) {
  return context.placements.find((placement) => placement.partId === partId);
}

function findPlacementOnSlab(
  part: DetailPart,
  slab: SlabInstance,
  occupied: OccupiedShape[],
  rotations: Rotation[] = ROTATIONS,
  stepDivisor = 4,
  preference: PlacementPreference = 'first',
  clearance = 0,
): PlacementSearchResult {
  let reason: string | undefined = REASON_NO_SPACE;
  let best: { placement: Placement; score: number } | undefined;
  let attempts = 0;
  let validAttempts = 0;
  const orderedRotations = preference === 'remnant' ? longitudinalRotations(part, slab, rotations) : rotations;
  for (const rotation of orderedRotations) {
    const size = rotatedSize(part, rotation);
    const step = Math.max(preference === 'remnant' ? MIN_REMNANT_GRID_STEP : MIN_GRID_STEP, Math.floor(Math.min(size.width, size.height) / stepDivisor));
    for (let y = slab.minMargin; y <= slab.height - size.height - slab.minMargin; y += step) {
      for (let x = slab.minMargin; x <= slab.width - size.width - slab.minMargin; x += step) {
        attempts += 1;
        const validation = validatePlacement(part, x, y, rotation, slab, occupied, clearance);
        if (validation.ok) {
          const placement = placementFor(part, slab.id, x, y, rotation);
          if (preference === 'first') return { placement };
          const score = remnantScore(slab, occupied, occupiedShape(part, placement));
          validAttempts += 1;
          if (isLongitudinalRemainderScore(score)) return { placement };
          if (!best || score < best.score) best = { placement, score };
          if (validAttempts >= MAX_REMNANT_VALID_ATTEMPTS) return { placement: best.placement };
        } else {
          reason = validation.reason;
        }
        if (attempts >= MAX_PLACEMENT_ATTEMPTS) return best ? { placement: best.placement } : { reason };
      }
    }
  }
  return best ? { placement: best.placement } : { reason };
}

function findPlacement(project: Project, part: DetailPart, context: PackingContext, stepDivisor: number, preference: PlacementPreference = 'first'): PlacementSearchResult {
  let reason: string | undefined = REASON_NO_SPACE;
  const pinnedSlabId = context.pinnedSlabByPart.get(part.id);
  const slabs = pinnedSlabId ? project.slabs.filter((slab) => slab.id === pinnedSlabId) : project.slabs;
  const clearance = packingClearance(project);
  for (const slab of slabs) {
    const result = findPlacementOnSlab(part, slab, getOccupied(context, slab.id), ROTATIONS, stepDivisor, preference, clearance);
    if (result.placement) return result;
    reason = result.reason ?? reason;
  }
  return { reason };
}

function packIndependent(
  project: Project,
  parts: DetailPart[],
  context: PackingContext,
  unplaced: Set<string>,
  stepDivisor: number,
  preference: PlacementPreference = 'first',
) {
  const sorted = parts
    .filter((part) => !context.placedIds.has(part.id))
    .sort((a, b) => {
      const aPinned = context.pinnedSlabByPart.has(a.id) ? 1 : 0;
      const bPinned = context.pinnedSlabByPart.has(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return b.width * b.height - a.width * a.height;
    });

  sorted.forEach((part) => {
    const result = findPlacement(project, part, context, stepDivisor, preference);
    if (result.placement) addPlacement(context, part, result.placement);
    else {
      unplaced.add(part.id);
      context.unplacedReasons.set(part.id, result.reason ?? REASON_NO_SPACE);
    }
  });
}

/** Recovers parts rejected by a strict group layout when a valid free position still exists on a slab. */
function retryLegallyPlaceableUnplaced(
  project: Project,
  parts: DetailPart[],
  context: PackingContext,
  unplaced: Set<string>,
  stepDivisor: number,
) {
  const pending = parts
    .filter((part) => unplaced.has(part.id) && !context.placedIds.has(part.id))
    .sort((a, b) => {
      if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
      return b.width * b.height - a.width * a.height;
    });

  pending.forEach((part) => {
    const result = findPlacement(project, part, context, stepDivisor);
    if (!result.placement) return;
    addPlacement(context, part, result.placement);
    unplaced.delete(part.id);
    context.unplacedReasons.delete(part.id);
  });
}

function groupKey(part: DetailPart) {
  return `${part.detailId}:${part.parentLabel}`;
}

function textureGroupKey(part: DetailPart) {
  if (part.textureGroupLabel?.startsWith('import:')) return part.textureGroupLabel;
  return `${part.detailId}:${part.textureGroupLabel ?? part.parentLabel}`;
}

function groupedParts(parts: DetailPart[]) {
  const groups = new Map<string, DetailPart[]>();
  parts.forEach((part) => {
    const key = groupKey(part);
    groups.set(key, [...(groups.get(key) ?? []), part]);
  });
  return [...groups.values()].sort((a, b) => (
    b.reduce((sum, part) => sum + part.width * part.height, 0)
    - a.reduce((sum, part) => sum + part.width * part.height, 0)
  ));
}

function groupedTextureParts(parts: DetailPart[]) {
  const groups = new Map<string, DetailPart[]>();
  parts.forEach((part) => {
    const key = textureGroupKey(part);
    groups.set(key, [...(groups.get(key) ?? []), part]);
  });
  return [...groups.values()].sort((a, b) => (
    b.reduce((sum, part) => sum + part.width * part.height, 0)
    - a.reduce((sum, part) => sum + part.width * part.height, 0)
  ));
}

function isSinkTextureGroup(group: DetailPart[]) {
  return group.some((part) => part.textureGroupKind === 'rectSink' || part.textureGroupKind === 'slotSink');
}

function isImportedTextureGroup(group: DetailPart[]) {
  return group.length > 1 && group.some((part) => part.textureGroupLabel?.startsWith('import:'));
}

function hasImportedBinding(group: DetailPart[]) {
  return group.some((part) => (
    !part.isMain
    && part.textureGroupLabel?.startsWith('import:')
    && Boolean(part.edgeSide && part.elementSide)
  ));
}

function isImportedBlockGroup(group: DetailPart[]) {
  return group.some((part) => part.textureGroupLabel?.startsWith('import:DXF блок '));
}

function isCurvedTextureGroup(group: DetailPart[]) {
  const main = group.find((part) => part.isMain);
  return Boolean(main && main.points.length > 8 && !isSinkTextureGroup(group));
}

function cloneOccupied(occupied: OccupiedShape[]) {
  return occupied.map((shape) => ({
    box: { ...shape.box },
    polygon: shape.polygon.map((point) => ({ ...point })),
    holes: shape.holes.map((hole) => hole.map((point) => ({ ...point }))),
  }));
}

function slabsForGroup(project: Project, group: DetailPart[], context: PackingContext) {
  const pinnedSlabIds = [...new Set(group.map((part) => context.pinnedSlabByPart.get(part.id)).filter((id): id is string => Boolean(id)))];
  if (pinnedSlabIds.length > 1) return [];
  if (pinnedSlabIds.length === 1) return project.slabs.filter((slab) => slab.id === pinnedSlabIds[0]);
  return project.slabs;
}

function sortPinnedGroups(groups: DetailPart[][], context: PackingContext) {
  return [...groups].sort((a, b) => {
    const aPinned = a.some((part) => context.pinnedSlabByPart.has(part.id)) ? 1 : 0;
    const bPinned = b.some((part) => context.pinnedSlabByPart.has(part.id)) ? 1 : 0;
    return bPinned - aPinned;
  });
}

function tryPlaceGroupOnOneSlab(project: Project, group: DetailPart[], context: PackingContext, stepDivisor: number, preference: PlacementPreference = 'first') {
  const sorted = [...group].sort((a, b) => b.width * b.height - a.width * a.height);
  const clearance = packingClearance(project);

  for (const slab of slabsForGroup(project, group, context)) {
    const tempOccupied = cloneOccupied(getOccupied(context, slab.id));
    const tempPlacements: Array<{ part: DetailPart; placement: Placement }> = [];
    let ok = true;

    for (const part of sorted) {
      const result = findPlacementOnSlab(part, slab, tempOccupied, ROTATIONS, stepDivisor, preference, clearance);
      if (!result.placement) {
        ok = false;
        break;
      }
      tempOccupied.push(occupiedShape(part, result.placement));
      tempPlacements.push({ part, placement: result.placement });
    }

    if (ok) {
      tempPlacements.forEach(({ part, placement }) => addPlacement(context, part, placement));
      return true;
    }
  }

  return false;
}

function markGroupUnplaced(group: DetailPart[], unplaced: Set<string>, context: PackingContext, reason: string) {
  group.forEach((part) => {
    unplaced.add(part.id);
    context.unplacedReasons.set(part.id, reason);
  });
}

function canSplitElementsAcrossSlabs(group: DetailPart[]) {
  return group.some((part) => !part.isMain)
    && group.some((part) => part.isMain)
    && !isSinkTextureGroup(group)
    && !isCurvedTextureGroup(group);
}

function tryPlaceMainThenLooseElements(
  project: Project,
  group: DetailPart[],
  context: PackingContext,
  unplaced: Set<string>,
  stepDivisor: number,
  preference: PlacementPreference = 'remnant',
) {
  if (!canSplitElementsAcrossSlabs(group)) return false;
  const mainParts = group.filter((part) => part.isMain);
  const missingMainParts = mainParts.filter((part) => !context.placedIds.has(part.id));
  const elements = group.filter((part) => !part.isMain && !context.placedIds.has(part.id));

  if (missingMainParts.length && !tryPlaceGroupOnOneSlab(project, missingMainParts, context, stepDivisor, preference)) {
    return false;
  }

  packIndependent(project, elements, context, unplaced, stepDivisor, preference);
  return true;
}

function findEdgeThickness(part: DetailPart, group: DetailPart[], rotation: Rotation) {
  const thickening = group.find((candidate) => (
    candidate.edgeKind === 'thickening'
    && candidate.edgeSide === part.edgeSide
    && candidate.parentLabel === part.parentLabel
  ));
  if (!thickening) return 0;
  const size = rotatedSize(thickening, rotation);
  return ['B', 'D', 'F', 'H'].includes(part.edgeSide ?? '') ? size.height : size.width;
}

function rotateVector(point: Point, rotation: Rotation): Point {
  const normalized = ((rotation % 360) + 360) % 360;
  if (Math.abs(normalized - 90) < 0.0001) return { x: -point.y, y: point.x };
  if (Math.abs(normalized - 180) < 0.0001) return { x: -point.x, y: -point.y };
  if (Math.abs(normalized - 270) < 0.0001) return { x: point.y, y: -point.x };
  if (Math.abs(normalized) < 0.0001) return point;
  const angle = normalized * Math.PI / 180;
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}

function curvedSideDirection(side: string | undefined, rotation: Rotation) {
  const directions: Record<string, Point> = {
    A: { x: -1, y: -1 },
    B: { x: 1, y: -1 },
    C: { x: 1, y: 1 },
    D: { x: -1, y: 1 },
  };
  const direction = side ? directions[side] : undefined;
  return direction ? rotateVector(direction, rotation) : undefined;
}

function curvedEdgeOffset(part: DetailPart, group: DetailPart[], rotation: Rotation) {
  if (part.edgeKind !== 'fold') return { width: 0, height: 0 };
  const thickening = group.find((candidate) => (
    candidate.edgeKind === 'thickening'
    && candidate.edgeSide === part.edgeSide
    && candidate.parentLabel === part.parentLabel
  ));
  if (!thickening) return { width: 0, height: 0 };
  return rotatedSize(thickening, rotation);
}

function attachedCurvedPlacement(
  main: Placement,
  mainPart: DetailPart,
  part: DetailPart,
  group: DetailPart[],
  clearance = 0,
) {
  const rotation = main.rotation;
  const direction = curvedSideDirection(part.edgeSide, rotation);
  if (!direction) return undefined;
  const mainSize = rotatedSize(mainPart, rotation);
  const size = rotatedSize(part, rotation);
  const offset = curvedEdgeOffset(part, group, rotation);
  const gap = Math.max(0, clearance);
  const x = direction.x < 0
    ? main.x - offset.width - gap - size.width
    : main.x + mainSize.width + offset.width + gap;
  const y = direction.y < 0
    ? main.y - offset.height - gap - size.height
    : main.y + mainSize.height + offset.height + gap;
  return placementFor(part, main.slabId, x, y, rotation);
}

function attachedPlacement(
  main: Placement,
  mainPart: DetailPart,
  part: DetailPart,
  group: DetailPart[],
  clearance = 0,
) {
  return attachedPlacementToSide(main, mainPart, part, group, part.edgeSide, main.rotation, clearance);
}

function segmentIsHorizontal(segment: { start: Point; end: Point }) {
  return Math.abs(segment.end.x - segment.start.x) >= Math.abs(segment.end.y - segment.start.y);
}

function importedElementPlacements(
  main: Placement,
  mainPart: DetailPart,
  part: DetailPart,
  group: DetailPart[],
  clearance = 0,
) {
  if (!part.elementSide || !part.edgeSide) return [];
  const mainSegment = sideSegment(mainPart, part.edgeSide, main.rotation);
  if (!mainSegment) return [];
  const mainHorizontal = segmentIsHorizontal(mainSegment);
  const rotations = [main.rotation, main.rotation + 90, main.rotation + 180, main.rotation + 270]
    .map((rotation) => ((rotation % 360) + 360) % 360);
  const preferred = rotations.filter((rotation) => {
    const elementSegment = sideSegment(part, part.elementSide, rotation);
    return elementSegment ? segmentIsHorizontal(elementSegment) === mainHorizontal : false;
  });
  return preferred
    .map((rotation) => importedAttachedPlacement(main, mainPart, part, group, rotation, clearance))
    .filter(Boolean) as Placement[];
}

function attachedPlacementToSide(
  main: Placement,
  mainPart: DetailPart,
  part: DetailPart,
  group: DetailPart[],
  side: string | undefined,
  elementRotation: Rotation,
  clearance = 0,
  extraOutsideOffset = 0,
) {
  const rotation = main.rotation;
  const size = rotatedSize(part, elementRotation);
  const outsideOffset = extraOutsideOffset + (part.edgeKind === 'fold' ? findEdgeThickness(part, group, elementRotation) : 0) + Math.max(0, clearance);
  const segment = sideSegment(mainPart, side, rotation);
  if (!segment) return attachedCurvedPlacement(main, mainPart, part, group, clearance);
  const polygon = rotatedLocalPoints(mainPart.points, rotation, mainPart.width, mainPart.height, mainPart.points);
  const normal = outwardNormal(segment, polygon);
  const minX = Math.min(segment.start.x, segment.end.x);
  const maxX = Math.max(segment.start.x, segment.end.x);
  const minY = Math.min(segment.start.y, segment.end.y);
  const maxY = Math.max(segment.start.y, segment.end.y);
  const horizontal = Math.abs(segment.end.x - segment.start.x) >= Math.abs(segment.end.y - segment.start.y);
  const x = horizontal
    ? main.x + minX + ((maxX - minX) - size.width) / 2
    : normal.x < 0 ? main.x + minX - outsideOffset - size.width : main.x + maxX + outsideOffset;
  const y = horizontal
    ? normal.y < 0 ? main.y + minY - outsideOffset - size.height : main.y + maxY + outsideOffset
    : main.y + minY + ((maxY - minY) - size.height) / 2;
  return placementFor(part, main.slabId, x, y, elementRotation);
}

function segmentAnchorPoint(segment: { start: Point; end: Point }, anchor: DetailPart['parentAnchor']) {
  if (anchor === 'start') return segment.start;
  if (anchor === 'end') return segment.end;
  return {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
  };
}

/** Positions an imported edge element by its selected parent and element reference points. */
function importedAttachedPlacement(
  main: Placement,
  mainPart: DetailPart,
  part: DetailPart,
  group: DetailPart[],
  rotation: Rotation,
  clearance: number,
) {
  const placement = attachedPlacementToSide(main, mainPart, part, group, part.edgeSide, rotation, clearance);
  if (!placement || !part.parentAnchor || !part.elementAnchor || !part.elementSide) return placement;
  const parentSegment = sideSegment(mainPart, part.edgeSide, main.rotation);
  const elementSegment = sideSegment(part, part.elementSide, rotation);
  if (!parentSegment || !elementSegment) return placement;
  const target = segmentAnchorPoint(parentSegment, part.parentAnchor);
  const source = segmentAnchorPoint(elementSegment, part.elementAnchor);
  if (segmentIsHorizontal(parentSegment)) {
    return { ...placement, x: placement.x + main.x + target.x - (placement.x + source.x) };
  }
  return { ...placement, y: placement.y + main.y + target.y - (placement.y + source.y) };
}

function normalizeVector(point: Point) {
  const length = Math.max(Math.hypot(point.x, point.y), 1);
  return { x: point.x / length, y: point.y / length };
}

function elementShiftFrame(mainPart: DetailPart, part: DetailPart, rotation: Rotation) {
  const segment = sideSegment(mainPart, part.edgeSide, rotation);
  if (segment) {
    const normal = outwardNormal(segment, rotatedPointsForPart(mainPart, rotation));
    const tangent = normalizeVector({ x: segment.end.x - segment.start.x, y: segment.end.y - segment.start.y });
    return { normal, tangent };
  }

  const direction = curvedSideDirection(part.edgeSide, rotation);
  if (!direction) return undefined;
  const normal = normalizeVector(direction);
  return { normal, tangent: { x: -normal.y, y: normal.x } };
}

function rotatedPointsForPart(part: DetailPart, rotation: Rotation) {
  return rotatedLocalPoints(part.points, rotation, part.width, part.height, part.points);
}

function sideSegmentLengthForGroup(group: DetailPart[], side: string, rotation: Rotation) {
  return group
    .filter((part) => part.isMain)
    .reduce((max, part) => {
      const segment = sideSegment(part, side, rotation);
      if (!segment) return max;
      return Math.max(max, Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y));
    }, 0);
}

function sideElementStackWidth(group: DetailPart[], side: string, rotation: Rotation) {
  const byKind = new Map<DetailPart['edgeKind'], number>();
  group
    .filter((part) => !part.isMain && part.edgeSide === side)
    .forEach((part) => {
      const size = rotatedSize(part, rotation);
      const width = ['B', 'D', 'F', 'H'].includes(side) ? size.height : size.width;
      byKind.set(part.edgeKind, Math.max(byKind.get(part.edgeKind) ?? 0, width));
    });
  return Array.from(byKind.values()).reduce((sum, width) => sum + width, 0);
}

function hasSideElement(group: DetailPart[], side: string) {
  return group.some((part) => !part.isMain && part.edgeSide === side);
}

function isUTextureGroup(group: DetailPart[]) {
  return group.some((part) => (
    part.edgeSide === 'G'
    || part.edgeSide === 'H'
    || part.sideSegments?.G
    || part.sideSegments?.H
  ));
}

function conflictShiftOffset(part: DetailPart, group: DetailPart[], rotation: Rotation) {
  const side = part.edgeSide;
  if (!side || !part.edgeKind) return 0;

  if (isUTextureGroup(group)) {
    if (side !== 'F' || !hasSideElement(group, 'F')) return 0;
    return Math.max(
      sideElementStackWidth(group, 'D', rotation),
      sideElementStackWidth(group, 'H', rotation),
      sideElementStackWidth(group, 'E', rotation),
      sideElementStackWidth(group, 'G', rotation),
      20,
    );
  }

  if ((side === 'D' || side === 'E') && hasSideElement(group, 'D') && hasSideElement(group, 'E')) {
    const dLength = sideSegmentLengthForGroup(group, 'D', rotation);
    const eLength = sideSegmentLengthForGroup(group, 'E', rotation);
    if (dLength <= 0 || eLength <= 0) return 0;
    const shorterSide = dLength <= eLength ? 'D' : 'E';
    if (side !== shorterSide) return 0;
    const otherSide = shorterSide === 'D' ? 'E' : 'D';
    return Math.max(sideElementStackWidth(group, otherSide, rotation), 20);
  }

  return 0;
}

function conflictShiftedElementPlacements(
  primary: Placement | undefined,
  main: Placement,
  mainPart: DetailPart,
  part: DetailPart,
  group: DetailPart[],
  clearance = 0,
) {
  if (!primary) return [];
  const baseOffset = conflictShiftOffset(part, group, main.rotation);
  if (baseOffset <= 0) return [];
  const offset = baseOffset + Math.max(0, clearance);
  const frame = elementShiftFrame(mainPart, part, main.rotation);
  if (!frame) return [];

  return [placementFor(
    part,
    main.slabId,
    primary.x + frame.normal.x * offset,
    primary.y + frame.normal.y * offset,
    primary.rotation,
  )];
}

function tangentReliefPlacements(
  primary: Placement | undefined,
  mainPart: DetailPart,
  part: DetailPart,
  rotation: Rotation,
) {
  if (!primary) return [];
  const frame = elementShiftFrame(mainPart, part, rotation);
  if (!frame) return [];
  const steps = [20, 40, 70, 110, 160];
  return steps.flatMap((step) => [
    placementFor(part, primary.slabId, primary.x + frame.tangent.x * step, primary.y + frame.tangent.y * step, primary.rotation),
    placementFor(part, primary.slabId, primary.x - frame.tangent.x * step, primary.y - frame.tangent.y * step, primary.rotation),
  ]);
}

function sideAttachPlacements(
  main: Placement,
  mainPart: DetailPart,
  part: DetailPart,
  group: DetailPart[],
  side: string,
  clearance: number,
  rotationDeltas: Rotation[],
  mainPlacements: Array<{ part: DetailPart; placement: Placement }> = [],
) {
  const anchorStack = sideElementStackWidth(group, side, main.rotation);
  const target = mainPlacements.find((item) => item.part.isMain && sideSegment(item.part, side, main.rotation)) ?? { part: mainPart, placement: main };
  return rotationDeltas
    .map((delta) => attachedPlacementToSide(
      target.placement,
      target.part,
      part,
      group,
      side,
      ((main.rotation + delta) % 360) as Rotation,
      clearance,
      anchorStack,
    ))
    .filter(Boolean) as Placement[];
}

function uShapeElementPlacements(
  primary: Placement | undefined,
  main: Placement,
  mainPart: DetailPart,
  part: DetailPart,
  group: DetailPart[],
  clearance: number,
  mainPlacements: Array<{ part: DetailPart; placement: Placement }> = [],
) {
  const side = part.edgeSide;
  if (side === 'E' || side === 'G') return tangentReliefPlacements(primary, mainPart, part, main.rotation);
  if (side !== 'F') return [];

  return [
    ...sideAttachPlacements(main, mainPart, part, group, 'D', clearance, [0, 90, 270, 180], mainPlacements),
    ...sideAttachPlacements(main, mainPart, part, group, 'H', clearance, [0, 90, 270, 180], mainPlacements),
  ];
}

function lShapeElementPlacements(
  primary: Placement | undefined,
  main: Placement,
  mainPart: DetailPart,
  part: DetailPart,
  group: DetailPart[],
  clearance: number,
  mainPlacements: Array<{ part: DetailPart; placement: Placement }> = [],
) {
  const side = part.edgeSide;
  if (side !== 'D' && side !== 'E') return [];
  if (!hasSideElement(group, 'D') || !hasSideElement(group, 'E')) return [];

  const dLength = sideSegmentLengthForGroup(group, 'D', main.rotation);
  const eLength = sideSegmentLengthForGroup(group, 'E', main.rotation);
  if (dLength <= 0 || eLength <= 0) return [];

  const longerSide = dLength >= eLength ? 'D' : 'E';
  const shorterSide = longerSide === 'D' ? 'E' : 'D';
  if (side === longerSide) return tangentReliefPlacements(primary, mainPart, part, main.rotation);
  if (side !== shorterSide) return [];

  return [
    ...sideAttachPlacements(main, mainPart, part, group, longerSide, clearance, [90, 270], mainPlacements),
  ];
}

function specialFullTexturePlacements(
  primary: Placement | undefined,
  main: Placement,
  mainPart: DetailPart,
  part: DetailPart,
  group: DetailPart[],
  clearance: number,
  mainPlacements: Array<{ part: DetailPart; placement: Placement }> = [],
) {
  if (isUTextureGroup(group)) return uShapeElementPlacements(primary, main, mainPart, part, group, clearance, mainPlacements);
  return lShapeElementPlacements(primary, main, mainPart, part, group, clearance, mainPlacements);
}

function usesSpecialFullTexturePlacement(part: DetailPart, group: DetailPart[], rotation: Rotation) {
  const side = part.edgeSide;
  if (!side) return false;
  if (isUTextureGroup(group)) return side === 'E' || side === 'F' || side === 'G';
  if (side !== 'D' && side !== 'E') return false;
  if (!hasSideElement(group, 'D') || !hasSideElement(group, 'E')) return false;
  return sideSegmentLengthForGroup(group, 'D', rotation) > 0
    && sideSegmentLengthForGroup(group, 'E', rotation) > 0;
}

function nearbyElementReliefPlacements(
  primary: Placement | undefined,
  main: Placement,
  mainPart: DetailPart,
  part: DetailPart,
  clearance = 0,
) {
  if (!primary || !part.edgeKind) return [];
  const frame = elementShiftFrame(mainPart, part, main.rotation);
  if (!frame) return [];
  const size = rotatedSize(part, primary.rotation);
  const crossSize = ['B', 'D', 'F', 'H'].includes(part.edgeSide ?? '') ? size.height : size.width;
  const normalSteps = [
    Math.max(24, clearance + 20),
    Math.max(crossSize, clearance + crossSize),
  ];
  const tangentSteps = [0, -80, 80, -160, 160];
  const candidates: Placement[] = [];
  normalSteps.forEach((normalStep) => {
    tangentSteps.forEach((tangentStep) => {
      candidates.push(placementFor(
        part,
        main.slabId,
        primary.x + frame.normal.x * normalStep + frame.tangent.x * tangentStep,
        primary.y + frame.normal.y * normalStep + frame.tangent.y * tangentStep,
        primary.rotation,
      ));
    });
  });
  return candidates;
}

function uniquePlacements(placements: Placement[]) {
  const seen = new Set<string>();
  return placements.filter((placement) => {
    const key = `${Math.round(placement.x)}:${Math.round(placement.y)}:${placement.rotation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function placementCandidates(
  main: Placement,
  mainPart: DetailPart,
  part: DetailPart,
  group: DetailPart[],
  index: number,
  clearance = 0,
  mainPlacements: Array<{ part: DetailPart; placement: Placement }> = [],
) {
  const primary = attachedPlacement(main, mainPart, part, group, clearance);
  const imported = importedElementPlacements(main, mainPart, part, group, clearance);
  const special = specialFullTexturePlacements(primary, main, mainPart, part, group, clearance, mainPlacements);
  if (imported.length) {
    return uniquePlacements([
      ...imported,
      ...(primary ? [primary] : []),
      ...special,
    ]);
  }
  if (usesSpecialFullTexturePlacement(part, group, main.rotation)) {
    const side = part.edgeSide;
    if (isUTextureGroup(group)) {
      if (side === 'F') return uniquePlacements(special);
      return uniquePlacements([
        ...(primary ? [primary] : []),
        ...special,
      ]);
    }

    const dLength = sideSegmentLengthForGroup(group, 'D', main.rotation);
    const eLength = sideSegmentLengthForGroup(group, 'E', main.rotation);
    const longerSide = dLength >= eLength ? 'D' : 'E';
    if (side !== longerSide) return uniquePlacements(special);
    return uniquePlacements([
      ...(primary ? [primary] : []),
      ...special,
    ]);
  }

  const conflictShifted = conflictShiftedElementPlacements(primary, main, mainPart, part, group, clearance);
  return uniquePlacements([
    ...(primary ? [primary] : []),
    ...conflictShifted,
  ]);
}

function textureOffset(part: DetailPart) {
  return { x: part.textureOffsetX ?? 0, y: part.textureOffsetY ?? 0 };
}

function textureGroupBounds(mainParts: DetailPart[]) {
  return mainParts.reduce((bounds, part) => {
    const offset = textureOffset(part);
    return {
      width: Math.max(bounds.width, offset.x + part.width),
      height: Math.max(bounds.height, offset.y + part.height),
    };
  }, { width: 0, height: 0 });
}

function rotatedGroupSize(bounds: { width: number; height: number }, rotation: Rotation) {
  return rotation === 90 || rotation === 270
    ? { width: bounds.height, height: bounds.width }
    : bounds;
}

function placementForGroupOffset(part: DetailPart, slabId: string, anchorX: number, anchorY: number, rotation: Rotation, bounds: { width: number; height: number }) {
  const offset = textureOffset(part);
  if (rotation === 90) return placementFor(part, slabId, anchorX + bounds.height - offset.y - part.height, anchorY + offset.x, rotation);
  if (rotation === 180) return placementFor(part, slabId, anchorX + bounds.width - offset.x - part.width, anchorY + bounds.height - offset.y - part.height, rotation);
  if (rotation === 270) return placementFor(part, slabId, anchorX + offset.y, anchorY + bounds.width - offset.x - part.width, rotation);
  return placementFor(part, slabId, anchorX + offset.x, anchorY + offset.y, rotation);
}

function groupAnchorFromPlacement(part: DetailPart, placement: Placement, bounds: { width: number; height: number }) {
  const offset = textureOffset(part);
  if (placement.rotation === 90) {
    return {
      x: placement.x - bounds.height + offset.y + part.height,
      y: placement.y - offset.x,
    };
  }
  if (placement.rotation === 180) {
    return {
      x: placement.x - bounds.width + offset.x + part.width,
      y: placement.y - bounds.height + offset.y + part.height,
    };
  }
  if (placement.rotation === 270) {
    return {
      x: placement.x - offset.y,
      y: placement.y - bounds.width + offset.x + part.width,
    };
  }
  return {
    x: placement.x - offset.x,
    y: placement.y - offset.y,
  };
}

function placeFullTextureElements(
  slab: SlabInstance,
  group: DetailPart[],
  mainPlacements: Array<{ part: DetailPart; placement: Placement }>,
  occupied: OccupiedShape[],
  stepDivisor: number,
  clearance = 0,
  alreadyPlacedIds: Set<string> = new Set(),
): { placements: Array<{ part: DetailPart; placement: Placement }>; reason?: string } {
  const tempPlacements: Array<{ part: DetailPart; placement: Placement }> = [];
  const mainByLabel = new Map(mainPlacements.map((item) => [item.part.parentLabel, item]));
  const elements = group
    .filter((part) => !part.isMain && !alreadyPlacedIds.has(part.id))
    .sort((a, b) => (
      a.edgeKind === b.edgeKind
        ? b.width * b.height - a.width * a.height
        : a.edgeKind === 'thickening' ? -1 : 1
    ));

  for (let elementIndex = 0; elementIndex < elements.length; elementIndex += 1) {
    const element = elements[elementIndex];
    const main = mainByLabel.get(element.parentLabel);
    const candidates = main
      ? placementCandidates(main.placement, main.part, element, group, elementIndex, clearance, mainPlacements)
      : [];
    const placement = candidates.find((candidate) => (
      validatePlacement(element, candidate.x, candidate.y, candidate.rotation, slab, occupied, clearance).ok
    ));

    if (!placement) return { placements: tempPlacements, reason: REASON_NO_SPACE };

    occupied.push(occupiedShape(element, placement));
    tempPlacements.push({ part: element, placement });
  }

  return { placements: tempPlacements };
}

function tryPlaceFullTextureGroup(project: Project, group: DetailPart[], context: PackingContext, stepDivisor: number) {
  const mainParts = group.filter((part) => part.isMain);
  const clearance = packingClearance(project);

  if (mainParts.length === 0) return false;
  if (mainParts.length > 1 && !mainParts.every((part) => part.textureGroupLabel)) {
    return tryPlaceGroupOnOneSlab(project, group, context, stepDivisor);
  }

  const orderedMainParts = [...mainParts].sort((a, b) => {
    const ao = textureOffset(a);
    const bo = textureOffset(b);
    return ao.y === bo.y ? ao.x - bo.x : ao.y - bo.y;
  });
  const bounds = textureGroupBounds(orderedMainParts);

  const existingMainPlacements = orderedMainParts
    .map((part) => {
      const placement = existingPlacementForPart(context, part.id);
      return placement ? { part, placement } : undefined;
    })
    .filter(Boolean) as Array<{ part: DetailPart; placement: Placement }>;

  if (existingMainPlacements.length) {
    const slabId = existingMainPlacements[0].placement.slabId;
    if (!existingMainPlacements.every(({ placement }) => placement.slabId === slabId)) return false;
    const slab = project.slabs.find((item) => item.id === slabId);
    if (!slab) return false;
    const anchor = groupAnchorFromPlacement(existingMainPlacements[0].part, existingMainPlacements[0].placement, bounds);
    const rotation = existingMainPlacements[0].placement.rotation;
    const tempOccupied = cloneOccupied(getOccupied(context, slab.id));
    const mainPlacements = [...existingMainPlacements];

    for (const mainPart of orderedMainParts) {
      if (existingPlacementForPart(context, mainPart.id)) continue;
      const mainPlacement = placementForGroupOffset(mainPart, slab.id, anchor.x, anchor.y, rotation, bounds);
      const validation = validatePlacement(mainPart, mainPlacement.x, mainPlacement.y, rotation, slab, tempOccupied, clearance);
      if (!validation.ok) return false;
      tempOccupied.push(occupiedShape(mainPart, mainPlacement));
      mainPlacements.push({ part: mainPart, placement: mainPlacement });
    }

    const elementResult = placeFullTextureElements(slab, group, mainPlacements, tempOccupied, stepDivisor, clearance, context.placedIds);
    if (elementResult.reason) return false;
    mainPlacements
      .filter(({ part }) => !context.placedIds.has(part.id))
      .forEach(({ part, placement }) => addPlacement(context, part, placement));
    elementResult.placements.forEach(({ part, placement }) => addPlacement(context, part, placement));
    return true;
  }

  for (const slab of slabsForGroup(project, group, context)) {
    const baseOccupied = getOccupied(context, slab.id);
    let anchorAttempts = 0;

    for (const rotation of ROTATIONS) {
      const groupSize = rotatedGroupSize(bounds, rotation);
      const step = Math.max(MIN_GRID_STEP, Math.floor(Math.min(groupSize.width, groupSize.height) / stepDivisor));

      for (let y = slab.minMargin; y <= slab.height - groupSize.height - slab.minMargin; y += step) {
        for (let x = slab.minMargin; x <= slab.width - groupSize.width - slab.minMargin; x += step) {
          anchorAttempts += 1;
          const tempOccupied = cloneOccupied(baseOccupied);
          const mainPlacements: Array<{ part: DetailPart; placement: Placement }> = [];
          let ok = true;

          for (const mainPart of orderedMainParts) {
            const mainPlacement = placementForGroupOffset(mainPart, slab.id, x, y, rotation, bounds);
            const validation = validatePlacement(mainPart, mainPlacement.x, mainPlacement.y, rotation, slab, tempOccupied, clearance);
            if (!validation.ok) {
              ok = false;
              break;
            }
            tempOccupied.push(occupiedShape(mainPart, mainPlacement));
            mainPlacements.push({ part: mainPart, placement: mainPlacement });
          }
          if (!ok) continue;

          const elementResult = placeFullTextureElements(slab, group, mainPlacements, tempOccupied, stepDivisor, clearance, context.placedIds);
          if (elementResult.reason) continue;
          const groupPlacements = [...mainPlacements, ...elementResult.placements];
          groupPlacements.forEach(({ part, placement }) => addPlacement(context, part, placement));
          return true;
        }
        if (anchorAttempts >= MAX_FULL_TEXTURE_ANCHOR_ATTEMPTS) break;
      }
      if (anchorAttempts >= MAX_FULL_TEXTURE_ANCHOR_ATTEMPTS) break;
    }
  }

  return false;
}

function placePartialFullTextureElements(
  slab: SlabInstance,
  group: DetailPart[],
  mainPlacements: Array<{ part: DetailPart; placement: Placement }>,
  occupied: OccupiedShape[],
  clearance = 0,
  alreadyPlacedIds: Set<string> = new Set(),
) {
  const tempPlacements: Array<{ part: DetailPart; placement: Placement }> = [];
  const mainByLabel = new Map(mainPlacements.map((item) => [item.part.parentLabel, item]));
  const elements = group
    .filter((part) => !part.isMain && !alreadyPlacedIds.has(part.id))
    .sort((a, b) => {
      if (a.edgeKind !== b.edgeKind) return a.edgeKind === 'thickening' ? -1 : 1;
      return a.width * a.height - b.width * b.height;
    });

  for (let elementIndex = 0; elementIndex < elements.length; elementIndex += 1) {
    const element = elements[elementIndex];
    const main = mainByLabel.get(element.parentLabel);
    const candidates = main
      ? placementCandidates(main.placement, main.part, element, group, elementIndex, clearance, mainPlacements)
      : [];
    const placement = candidates.find((candidate) => (
      validatePlacement(element, candidate.x, candidate.y, candidate.rotation, slab, occupied, clearance).ok
    ));
    if (!placement) continue;
    occupied.push(occupiedShape(element, placement));
    tempPlacements.push({ part: element, placement });
  }

  return tempPlacements;
}

/**
 * Keeps the largest valid part of a texture assembly attached to its main shape.
 * Remaining elements are packed later as overflow, without dismantling the valid core.
 */
function tryPlacePartialFullTextureGroup(project: Project, group: DetailPart[], context: PackingContext, stepDivisor: number) {
  const mainParts = group.filter((part) => part.isMain);
  if (!mainParts.length) return false;
  if (mainParts.length > 1 && !mainParts.every((part) => part.textureGroupLabel)) return false;

  const clearance = packingClearance(project);
  const orderedMainParts = [...mainParts].sort((a, b) => {
    const ao = textureOffset(a);
    const bo = textureOffset(b);
    return ao.y === bo.y ? ao.x - bo.x : ao.y - bo.y;
  });
  const bounds = textureGroupBounds(orderedMainParts);
  const existingMainPlacements = orderedMainParts
    .map((part) => {
      const placement = existingPlacementForPart(context, part.id);
      return placement ? { part, placement } : undefined;
    })
    .filter(Boolean) as Array<{ part: DetailPart; placement: Placement }>;
  let best: { score: number; placements: Array<{ part: DetailPart; placement: Placement }> } | undefined;

  const considerAnchor = (slab: SlabInstance, x: number, y: number, rotation: Rotation) => {
    const tempOccupied = cloneOccupied(getOccupied(context, slab.id));
    const pendingMain: Array<{ part: DetailPart; placement: Placement }> = [];
    const mainPlacements = [...existingMainPlacements];

    for (const mainPart of orderedMainParts) {
      if (context.placedIds.has(mainPart.id)) continue;
      const placement = placementForGroupOffset(mainPart, slab.id, x, y, rotation, bounds);
      const validation = validatePlacement(mainPart, placement.x, placement.y, rotation, slab, tempOccupied, clearance);
      if (!validation.ok) {
        if (orderedMainParts.length === 1) return;
        continue;
      }
      tempOccupied.push(occupiedShape(mainPart, placement));
      const entry = { part: mainPart, placement };
      pendingMain.push(entry);
      mainPlacements.push(entry);
    }

    if (!mainPlacements.length) return;
    const elements = placePartialFullTextureElements(slab, group, mainPlacements, tempOccupied, clearance, context.placedIds);
    const candidate = [...pendingMain, ...elements];
    const score = candidate.length * 1000 + mainPlacements.length;
    if (!best || score > best.score) best = { score, placements: candidate };
  };

  if (existingMainPlacements.length) {
    const slabId = existingMainPlacements[0].placement.slabId;
    if (!existingMainPlacements.every(({ placement }) => placement.slabId === slabId)) return false;
    const slab = project.slabs.find((item) => item.id === slabId);
    if (!slab) return false;
    const anchor = groupAnchorFromPlacement(existingMainPlacements[0].part, existingMainPlacements[0].placement, bounds);
    considerAnchor(slab, anchor.x, anchor.y, existingMainPlacements[0].placement.rotation);
  } else {
    for (const slab of slabsForGroup(project, group, context)) {
      let anchorAttempts = 0;
      for (const rotation of ROTATIONS) {
        const size = rotatedGroupSize(bounds, rotation);
        const step = Math.max(MIN_GRID_STEP, Math.floor(Math.min(size.width, size.height) / stepDivisor));
        for (let y = slab.minMargin; y <= slab.height - slab.minMargin; y += step) {
          for (let x = slab.minMargin; x <= slab.width - slab.minMargin; x += step) {
            anchorAttempts += 1;
            considerAnchor(slab, x, y, rotation);
          }
          if (anchorAttempts >= MAX_FULL_TEXTURE_ANCHOR_ATTEMPTS) break;
        }
        if (anchorAttempts >= MAX_FULL_TEXTURE_ANCHOR_ATTEMPTS) break;
      }
    }
  }

  if (!best) return existingMainPlacements.length > 0;
  best.placements.forEach(({ part, placement }) => addPlacement(context, part, placement));
  return true;
}

// Imported DXF blocks already carry a deliberate local layout; place the block without repacking its members.
function tryPlaceImportedTextureGroup(project: Project, group: DetailPart[], context: PackingContext, stepDivisor: number) {
  const orderedParts = [...group].sort((a, b) => {
    const ao = textureOffset(a);
    const bo = textureOffset(b);
    return ao.y === bo.y ? ao.x - bo.x : ao.y - bo.y;
  });
  const bounds = textureGroupBounds(orderedParts);
  const clearance = packingClearance(project);
  const existing = orderedParts
    .map((part) => {
      const placement = existingPlacementForPart(context, part.id);
      return placement ? { part, placement } : undefined;
    })
    .filter(Boolean) as Array<{ part: DetailPart; placement: Placement }>;

  const commitAtAnchor = (slab: SlabInstance, x: number, y: number, rotation: Rotation) => {
    const tempOccupied = cloneOccupied(getOccupied(context, slab.id));
    const pending: Array<{ part: DetailPart; placement: Placement }> = [];
    for (const part of orderedParts) {
      if (context.placedIds.has(part.id)) continue;
      const placement = placementForGroupOffset(part, slab.id, x, y, rotation, bounds);
      const validation = validatePlacement(part, placement.x, placement.y, rotation, slab, tempOccupied, clearance);
      if (!validation.ok) return false;
      tempOccupied.push(occupiedShape(part, placement));
      pending.push({ part, placement });
    }
    pending.forEach(({ part, placement }) => addPlacement(context, part, placement));
    return true;
  };

  if (existing.length) {
    const slabId = existing[0].placement.slabId;
    if (!existing.every(({ placement }) => placement.slabId === slabId)) return false;
    const slab = project.slabs.find((item) => item.id === slabId);
    if (!slab) return false;
    const anchor = groupAnchorFromPlacement(existing[0].part, existing[0].placement, bounds);
    return commitAtAnchor(slab, anchor.x, anchor.y, existing[0].placement.rotation);
  }

  for (const slab of slabsForGroup(project, group, context)) {
    let anchorAttempts = 0;
    for (const rotation of [0] as Rotation[]) {
      const size = rotatedGroupSize(bounds, rotation);
      const step = Math.max(MIN_GRID_STEP, Math.floor(Math.min(size.width, size.height) / stepDivisor));
      for (let y = slab.minMargin; y <= slab.height - size.height - slab.minMargin; y += step) {
        for (let x = slab.minMargin; x <= slab.width - size.width - slab.minMargin; x += step) {
          anchorAttempts += 1;
          if (commitAtAnchor(slab, x, y, rotation)) return true;
        }
        if (anchorAttempts >= MAX_FULL_TEXTURE_ANCHOR_ATTEMPTS) break;
      }
      if (anchorAttempts >= MAX_FULL_TEXTURE_ANCHOR_ATTEMPTS) break;
    }
  }

  return false;
}

/**
 * Preserves imported DXF local coordinates while retaining as many contours as possible.
 * Only contours that do not fit are left for the overflow pass.
 */
function tryPlacePartialImportedTextureGroup(project: Project, group: DetailPart[], context: PackingContext, stepDivisor: number) {
  const orderedParts = [...group].sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    const ao = textureOffset(a);
    const bo = textureOffset(b);
    return ao.y === bo.y ? ao.x - bo.x : ao.y - bo.y;
  });
  const bounds = textureGroupBounds(orderedParts);
  const clearance = packingClearance(project);
  const existing = orderedParts
    .map((part) => {
      const placement = existingPlacementForPart(context, part.id);
      return placement ? { part, placement } : undefined;
    })
    .filter(Boolean) as Array<{ part: DetailPart; placement: Placement }>;
  const groupMainLabels = new Set(group.filter((part) => part.isMain).map((part) => part.parentLabel));
  let best: { score: number; placements: Array<{ part: DetailPart; placement: Placement }> } | undefined;

  const considerAnchor = (slab: SlabInstance, x: number, y: number, rotation: Rotation) => {
    const tempOccupied = cloneOccupied(getOccupied(context, slab.id));
    const pending: Array<{ part: DetailPart; placement: Placement }> = [];
    const acceptedMainLabels = new Set(existing.filter(({ part }) => part.isMain).map(({ part }) => part.parentLabel));

    for (const part of orderedParts) {
      if (context.placedIds.has(part.id)) continue;
      if (!part.isMain && groupMainLabels.has(part.parentLabel) && !acceptedMainLabels.has(part.parentLabel)) continue;
      const placement = placementForGroupOffset(part, slab.id, x, y, rotation, bounds);
      const validation = validatePlacement(part, placement.x, placement.y, rotation, slab, tempOccupied, clearance);
      if (!validation.ok) continue;
      tempOccupied.push(occupiedShape(part, placement));
      pending.push({ part, placement });
      if (part.isMain) acceptedMainLabels.add(part.parentLabel);
    }

    const acceptedMainCount = pending.filter(({ part }) => part.isMain).length
      + existing.filter(({ part }) => part.isMain).length;
    if (groupMainLabels.size > 0 && acceptedMainCount === 0) return;
    const score = pending.length * 1000 + acceptedMainCount;
    if (!best || score > best.score) best = { score, placements: pending };
  };

  if (existing.length) {
    const slabId = existing[0].placement.slabId;
    if (!existing.every(({ placement }) => placement.slabId === slabId)) return false;
    const slab = project.slabs.find((item) => item.id === slabId);
    if (!slab) return false;
    const anchor = groupAnchorFromPlacement(existing[0].part, existing[0].placement, bounds);
    considerAnchor(slab, anchor.x, anchor.y, existing[0].placement.rotation);
  } else {
    for (const slab of slabsForGroup(project, group, context)) {
      let anchorAttempts = 0;
      const step = Math.max(MIN_GRID_STEP, Math.floor(Math.min(Math.max(bounds.width, 1), Math.max(bounds.height, 1)) / stepDivisor));
      for (let y = slab.minMargin; y <= slab.height - slab.minMargin; y += step) {
        for (let x = slab.minMargin; x <= slab.width - slab.minMargin; x += step) {
          anchorAttempts += 1;
          considerAnchor(slab, x, y, 0);
        }
        if (anchorAttempts >= MAX_FULL_TEXTURE_ANCHOR_ATTEMPTS) break;
      }
    }
  }

  if (!best) return existing.length > 0;
  best.placements.forEach(({ part, placement }) => addPlacement(context, part, placement));
  return true;
}

function placeTextureMainGroupFallback(project: Project, group: DetailPart[], context: PackingContext) {
  const mainParts = group
    .filter((part) => part.isMain && !context.placedIds.has(part.id))
    .sort((a, b) => {
      const ao = textureOffset(a);
      const bo = textureOffset(b);
      return ao.y === bo.y ? ao.x - bo.x : ao.y - bo.y;
    });
  if (!mainParts.length) return false;

  const allMainParts = group.filter((part) => part.isMain);
  const bounds = textureGroupBounds(allMainParts);
  const slab = slabsForGroup(project, group, context)[0];
  if (!slab) return false;

  const x = slab.minMargin;
  const y = slab.minMargin;
  const tempOccupied = cloneOccupied(getOccupied(context, slab.id));
  const tempPlacements: Array<{ part: DetailPart; placement: Placement }> = [];
  for (const part of mainParts) {
    const placement = placementForGroupOffset(part, slab.id, x, y, 0, bounds);
    const validation = validatePlacement(part, placement.x, placement.y, placement.rotation, slab, tempOccupied, packingClearance(project));
    if (!validation.ok) return false;
    tempOccupied.push(occupiedShape(part, placement));
    tempPlacements.push({ part, placement });
  }
  tempPlacements.forEach(({ part, placement }) => {
    addPlacement(context, part, placement);
  });
  return true;
}

function buildContext(project: Project, parts: DetailPart[]) {
  const partIds = new Set(parts.map((part) => part.id));
  const slabIds = new Set(project.slabs.map((slab) => slab.id));
  const locked = project.placements.filter((p) => p.manualLocked && partIds.has(p.partId) && slabIds.has(p.slabId));
  const context: PackingContext = {
    occupiedBySlab: new Map(),
    placements: [...locked],
    placedIds: new Set(locked.map((p) => p.partId)),
    pinnedSlabByPart: new Map(project.placements
      .filter((p) => p.pinnedToSlab && partIds.has(p.partId) && slabIds.has(p.pinnedSlabId ?? p.slabId))
      .map((p) => [p.partId, p.pinnedSlabId ?? p.slabId])),
    unplacedReasons: new Map(),
  };

  locked.forEach((placement) => {
    const part = parts.find((item) => item.id === placement.partId);
    if (!part) return;
    getOccupied(context, placement.slabId).push(occupiedShape(part, placement));
  });

  return context;
}

function autoPackEconomy(project: Project, parts: DetailPart[], context: PackingContext) {
  const unplaced = new Set<string>();
  const rigidGroups = sortPinnedGroups(
    groupedTextureParts(parts).filter((group) => (
      (isSinkTextureGroup(group) || isImportedTextureGroup(group))
      && group.some((part) => !context.placedIds.has(part.id))
    )),
    context,
  );

  rigidGroups.forEach((group) => {
    const placed = isImportedTextureGroup(group) && (!hasImportedBinding(group) || isImportedBlockGroup(group))
      ? tryPlaceImportedTextureGroup(project, group, context, 4)
      : tryPlaceFullTextureGroup(project, group, context, 4);
    if (!placed) markGroupUnplaced(group, unplaced, context, REASON_ONE_SLAB);
  });

  packIndependent(project, parts.filter((part) => !unplaced.has(part.id)), context, unplaced, 5, 'remnant');
  return unplaced;
}

function autoPackOptimal(project: Project, parts: DetailPart[], context: PackingContext) {
  const unplaced = new Set<string>();
  const groups = sortPinnedGroups(groupedTextureParts(parts.filter((part) => !context.placedIds.has(part.id))), context);

  groups.forEach((group) => {
    const placed = isImportedTextureGroup(group) && (!hasImportedBinding(group) || isImportedBlockGroup(group))
      ? tryPlaceImportedTextureGroup(project, group, context, 4)
      : tryPlaceGroupOnOneSlab(project, group, context, 4, 'remnant');
    if (!placed && !tryPlaceMainThenLooseElements(project, group, context, unplaced, 4, 'remnant')) {
      markGroupUnplaced(group, unplaced, context, REASON_ONE_SLAB);
    }
  });

  return unplaced;
}

function autoPackFullTexture(project: Project, parts: DetailPart[], context: PackingContext) {
  const unplaced = new Set<string>();
  const groups = sortPinnedGroups(
    groupedTextureParts(parts).filter((group) => group.some((part) => !context.placedIds.has(part.id))),
    context,
  );

  groups.forEach((group) => {
    const hasElements = group.some((part) => !part.isMain);
    const hasMultipleMainParts = group.filter((part) => part.isMain).length > 1;
    const importedGroup = isImportedTextureGroup(group);
    const placed = importedGroup
      ? tryPlaceImportedTextureGroup(project, group, context, 4)
      : isCurvedTextureGroup(group)
      ? tryPlaceGroupOnOneSlab(project, group, context, 4)
      : hasElements
      ? tryPlaceFullTextureGroup(project, group, context, 4)
      : hasMultipleMainParts
        ? tryPlaceFullTextureGroup(project, group, context, 4)
        : false;

    if (!placed && isSinkTextureGroup(group)) {
      const fallbackPlaced = placeTextureMainGroupFallback(project, group, context);
      if (!fallbackPlaced) markGroupUnplaced(group, unplaced, context, REASON_ONE_SLAB);
      return;
    }

    if (!placed && (hasElements || hasMultipleMainParts)) {
      const partialPlaced = importedGroup
        ? tryPlacePartialImportedTextureGroup(project, group, context, 4)
        : tryPlacePartialFullTextureGroup(project, group, context, 4);
      if (!partialPlaced) markGroupUnplaced(group, unplaced, context, REASON_ONE_SLAB);
    }
  });

  packIndependent(
    project,
    parts.filter((part) => !unplaced.has(part.id)),
    context,
    unplaced,
    4,
  );
  return unplaced;
}

// Фінальна страховка: автоматичне розміщення не має лишати накладки, дефекти або порушення відступів.
function sanitizeAutoPlacements(
  project: Project,
  parts: DetailPart[],
  placements: Placement[],
  unplaced: Set<string>,
  unplacedReasons: Map<string, string>,
) {
  const partById = new Map(parts.map((part) => [part.id, part]));
  const slabById = new Map(project.slabs.map((slab) => [slab.id, slab]));
  const occupiedBySlab = new Map<string, OccupiedShape[]>();
  const kept: Placement[] = [];
  const clearance = packingClearance(project);

  placements.forEach((placement) => {
    const part = partById.get(placement.partId);
    const slab = slabById.get(placement.slabId);
    if (!part || !slab) return;

    const occupied = occupiedBySlab.get(slab.id) ?? [];
    occupiedBySlab.set(slab.id, occupied);
    const validation = validatePlacement(part, placement.x, placement.y, placement.rotation, slab, occupied, clearance);

    if (placement.manualLocked || validation.ok) {
      kept.push(placement);
      occupied.push(occupiedShape(part, placement));
      return;
    }

    unplaced.add(part.id);
    unplacedReasons.set(part.id, validation.reason);
  });

  return kept;
}

export function autoPack(project: Project, parts: DetailPart[], mode: PackingMode = 'economy'): { placements: Placement[]; unplacedPartIds: string[]; unplacedReasons: Record<string, string> } {
  const context = buildContext(project, parts);
  let unplaced: Set<string>;

  if (mode === 'full_texture') unplaced = autoPackFullTexture(project, parts, context);
  else if (mode === 'optimal') unplaced = autoPackOptimal(project, parts, context);
  else unplaced = autoPackEconomy(project, parts, context);

  retryLegallyPlaceableUnplaced(project, parts, context, unplaced, mode === 'economy' ? 5 : 4);
  const placements = sanitizeAutoPlacements(project, parts, context.placements, unplaced, context.unplacedReasons);
  const placedIds = new Set(placements.map((placement) => placement.partId));

  return {
    placements,
    unplacedPartIds: [...unplaced].filter((partId) => !placedIds.has(partId)),
    unplacedReasons: Object.fromEntries(context.unplacedReasons),
  };
}

export function detectConflicts(project: Project, parts: DetailPart[], placements: Placement[]): Placement[] {
  return placements.map((placement) => {
    const slab = project.slabs.find((s) => s.id === placement.slabId);
    const part = parts.find((p) => p.id === placement.partId);
    if (!slab || !part) return placement;
    const polygon = polygonForPlacement(part, placement);
    const outOfBounds =
      polygon.some((point) => (
        point.x < slab.minMargin
        || point.y < slab.minMargin
        || point.x > slab.width - slab.minMargin
        || point.y > slab.height - slab.minMargin
      ));
    const holes = holesForPlacement(part, placement);
    const conflict = placements.some((other) => {
      if (other.id === placement.id || other.slabId !== placement.slabId) return false;
      const otherPart = parts.find((p) => p.id === other.partId);
      if (!otherPart) return false;
      return physicalPolygonsOverlap(polygon, holes, polygonForPlacement(otherPart, other), holesForPlacement(otherPart, other));
    }) || slab.defects.some((defect) => polygonsOverlap(polygon, defectPolygon(defect)));
    return { ...placement, conflict, outOfBounds };
  });
}

export function buildTextureLayout(placements: Placement[], parts: DetailPart[] = []): Project['textureLayouts'] {
  const partById = new Map(parts.map((part) => [part.id, part]));
  const groups = new Map<string, Placement[]>();
  placements.forEach((placement) => {
    const part = partById.get(placement.partId);
    const key = part ? textureGroupKey(part) : placement.partId;
    groups.set(key, [...(groups.get(key) ?? []), placement]);
  });

  const layouts: Project['textureLayouts'] = [];
  let cursorX = 60;
  let cursorY = 40;
  let rowHeight = 0;
  const rowLimit = 3100;
  const groupGap = 90;
  const rowGap = 90;

  [...groups.values()].forEach((group) => {
    const groupParts = group.map((placement) => partById.get(placement.partId)).filter(Boolean) as DetailPart[];
    const hasTextureOffsets = groupParts.some((part) => part.textureOffsetX !== undefined || part.textureOffsetY !== undefined);
    const elementReserve = hasTextureOffsets
      ? { x: 0, y: 0 }
      : groupParts
        .filter((part) => !part.isMain)
        .reduce((sum, part) => {
          const size = rotatedSize(part, 0);
          const cross = Math.min(size.width, size.height) + 32;
          return { x: sum.x + cross, y: sum.y + cross };
        }, { x: 0, y: 0 });
    const insetX = hasTextureOffsets ? 0 : elementReserve.x / 2;
    const insetY = hasTextureOffsets ? 0 : elementReserve.y / 2;
    const groupWidth = Math.max(
      120,
      ...groupParts
        .map((part) => (part.textureOffsetX ?? 0) + rotatedSize(part, 0).width),
    ) + elementReserve.x;
    const groupHeight = Math.max(
      120,
      ...groupParts
        .map((part) => (part.textureOffsetY ?? 0) + rotatedSize(part, 0).height),
    ) + elementReserve.y;
    if (cursorX > 60 && cursorX + groupWidth > rowLimit) {
      cursorX = 60;
      cursorY += rowHeight + rowGap;
      rowHeight = 0;
    }

    group.forEach((p) => {
      const part = partById.get(p.partId);
      layouts.push({
        id: uid('texture'),
        slabId: p.slabId,
        partId: p.partId,
        x: cursorX + insetX + (part?.textureOffsetX ?? 0),
        y: cursorY + insetY + (part?.textureOffsetY ?? 0),
        rotation: 0,
        sourceX: p.x,
        sourceY: p.y,
        sourceRotation: p.rotation,
      });
    });
    cursorX += groupWidth + groupGap;
    rowHeight = Math.max(rowHeight, groupHeight);
  });

  return layouts;
}
