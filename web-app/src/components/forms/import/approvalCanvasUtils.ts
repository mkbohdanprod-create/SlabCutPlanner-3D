import { type DxfPoint } from '../../../parsers/dxf';
import type { ApprovalImportItem, EdgeProfileType, ApprovalImportJoint } from '../../../utils/approvalImport';
import type { DxfOverviewOverlay } from './DxfOverview';
import type { DxfPreviewContour } from '../../../parsers/dxf';
import { SHAPE_CIRCLE, SHAPE_ELLIPSE } from '../utils/draftHelpers';

export function isPointInsidePreviewPolygon(point: DxfPoint, polygon: DxfPoint[]) {
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const crosses = (current.y > point.y) !== (previous.y > point.y);
    if (crosses) {
      const x = ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

export function pointNearPreviewPolygonBoundary(point: DxfPoint, polygon: DxfPoint[], tolerance = 2.0) {
  for (let i = 0; i < polygon.length; i += 1) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq <= 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
    const closest = { x: start.x + dx * t, y: start.y + dy * t };
    if (Math.hypot(point.x - closest.x, point.y - closest.y) <= tolerance) return true;
  }
  return false;
}

export function isPointInsideApprovalItem(item: ApprovalImportItem, globalPoint: DxfPoint) {
  const localPoint = { x: globalPoint.x - item.sourceX, y: globalPoint.y - item.sourceY };
  if (!isPointInsidePreviewPolygon(localPoint, item.customPoints ?? [])) return false;
  return !(item.customHoles ?? []).some((hole) => isPointInsidePreviewPolygon(localPoint, hole));
}

export function approvalFeatureOutwardNormal(item: ApprovalImportItem, middle: DxfPoint, normal: DxfPoint, size: number) {
  const probe = 5;
  const a = { x: middle.x + normal.x * probe, y: middle.y + normal.y * probe };
  const b = { x: middle.x - normal.x * probe, y: middle.y - normal.y * probe };
  const aInside = isPointInsideApprovalItem(item, a);
  const bInside = isPointInsideApprovalItem(item, b);
  if (aInside !== bInside) return aInside ? { x: -normal.x, y: -normal.y } : normal;
  const center = { x: item.sourceX + item.width / 2, y: item.sourceY + item.height / 2 };
  return ((a.x - center.x) ** 2 + (a.y - center.y) ** 2) >= ((b.x - center.x) ** 2 + (b.y - center.y) ** 2)
    ? normal
    : { x: -normal.x, y: -normal.y };
}

export function approvalDimensionValue(item: ApprovalImportItem, side: string) {
  return item.dimensions.find((dimension) => dimension.side === side)?.value ?? '';
}

export function dxfSegmentLength(segment: { start: DxfPoint; end: DxfPoint }) {
  return Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
}

export function approvalThickeningValue(item: ApprovalImportItem, side: string) {
  if (!item.thickening.sides.includes(side)) return '—';
  const segment = item.sideSegments?.[side];
  const length = Math.round(
    item.thickening.sideLengths?.[side]
    ?? (segment ? dxfSegmentLength(segment) : Number(approvalDimensionValue(item, side)) || 0),
  );
  const size = Math.round(item.thickening.sideSizes?.[side] ?? item.thickening.size);
  return length > 0 && size > 0 ? `${length}×${size}` : `${size}`;
}

export function approvalFoldValue(item: ApprovalImportItem, side: string) {
  if (!item.fold.sides.includes(side)) return '---';
  const segment = item.sideSegments?.[side];
  const length = Math.round(
    item.fold.sideLengths?.[side]
    ?? (segment ? dxfSegmentLength(segment) : Number(approvalDimensionValue(item, side)) || 0),
  );
  const size = Math.round(item.fold.sideSizes?.[side] ?? item.fold.size);
  return length > 0 && size > 0 ? `${length}x${size}` : `${size}`;
}

function getOutwardNormal(segment: { start: DxfPoint; end: DxfPoint }, item: ApprovalImportItem) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const len = Math.hypot(dx, dy) || 1;
  const n1 = { x: dy / len, y: -dx / len };
  const n2 = { x: -dy / len, y: dx / len };
  if (item.customPoints && item.customPoints.length >= 3) {
    const midLocal = { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 };
    let score1 = 0;
    let score2 = 0;
    for (const dist of [5, 15, 30, 60]) {
      const t1 = { x: midLocal.x + n1.x * dist, y: midLocal.y + n1.y * dist };
      const t2 = { x: midLocal.x + n2.x * dist, y: midLocal.y + n2.y * dist };
      if (isPointInsidePreviewPolygon(t1, item.customPoints)) score1++;
      if (isPointInsidePreviewPolygon(t2, item.customPoints)) score2++;
    }
    if (score1 > score2) return n2;
    if (score2 > score1) return n1;
  }
  return n1;
}

export function approvalFeatureBandPath(item: ApprovalImportItem, side: string) {
  const segment = item.sideSegments?.[side];
  if (!segment || !item.thickening.sides.includes(side)) return undefined;
  const size = Math.max(8, item.thickening.sideSizes?.[side] ?? item.thickening.size);
  const start = { x: item.sourceX + segment.start.x, y: item.sourceY + segment.start.y };
  const end = { x: item.sourceX + segment.end.x, y: item.sourceY + segment.end.y };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return undefined;
  const away = getOutwardNormal(segment, item);
  const p1 = start;
  const p2 = end;
  const p3 = { x: end.x + away.x * size, y: end.y + away.y * size };
  const p4 = { x: start.x + away.x * size, y: start.y + away.y * size };
  return {
    path: `M${p1.x} ${p1.y} L${p2.x} ${p2.y} L${p3.x} ${p3.y} L${p4.x} ${p4.y} Z`,
    labelX: (p3.x + p4.x) / 2,
    labelY: (p3.y + p4.y) / 2,
  };
}

export function approvalFoldBandPath(item: ApprovalImportItem, side: string) {
  const segment = item.sideSegments?.[side];
  if (!segment || !item.fold.sides.includes(side)) return undefined;
  const size = Math.max(8, item.fold.sideSizes?.[side] ?? item.fold.size);
  const start = { x: item.sourceX + segment.start.x, y: item.sourceY + segment.start.y };
  const end = { x: item.sourceX + segment.end.x, y: item.sourceY + segment.end.y };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return undefined;
  const away = getOutwardNormal(segment, item);
  const baseOffset = item.thickening.sides.includes(side)
    ? Math.max(8, item.thickening.sideSizes?.[side] ?? item.thickening.size)
    : 0;
  const p1 = { x: start.x + away.x * baseOffset, y: start.y + away.y * baseOffset };
  const p2 = { x: end.x + away.x * baseOffset, y: end.y + away.y * baseOffset };
  const p3 = { x: end.x + away.x * (baseOffset + size), y: end.y + away.y * (baseOffset + size) };
  const p4 = { x: start.x + away.x * (baseOffset + size), y: start.y + away.y * (baseOffset + size) };
  return {
    path: `M${p1.x} ${p1.y} L${p2.x} ${p2.y} L${p3.x} ${p3.y} L${p4.x} ${p4.y} Z`,
    labelX: (p3.x + p4.x) / 2,
    labelY: (p3.y + p4.y) / 2,
  };
}

export function approvalFeatureOverlaysForItem(item: ApprovalImportItem): DxfOverviewOverlay[] {
  const thickeningOverlays = item.thickening.sides.flatMap((side) => {
    const band = approvalFeatureBandPath(item, side);
    if (!band) return [];
    return [{
      id: `${item.id}-thickening-${side}`,
      path: band.path,
      label: approvalThickeningValue(item, side),
      labelX: band.labelX,
      labelY: band.labelY,
      className: 'dxf-thickening-overlay',
    }];
  });
  const foldOverlays = item.fold.sides.flatMap((side) => {
    const band = approvalFoldBandPath(item, side);
    if (!band) return [];
    return [{
      id: `${item.id}-fold-${side}`,
      path: band.path,
      label: approvalFoldValue(item, side),
      labelX: band.labelX,
      labelY: band.labelY,
      className: 'dxf-fold-overlay',
    }];
  });
  return [...thickeningOverlays, ...foldOverlays];
}

function edgeProfileShortLabel(profile: EdgeProfileType) {
  if (profile === 'Скруглення R3') return 'R3';
  if (profile === 'Скруглення R6') return 'R6';
  if (profile === 'Фаска 3x45') return '3x45';
  if (profile === 'Фаска 6x45') return '6x45';
  return 'Полірування';
}

export function approvalEdgeOverlayForSide(item: ApprovalImportItem, side: string, offset?: number) {
  const actualOffset = offset ?? Math.max(10, Math.min(item.width, item.height) * 0.035);
  const profile = item.edgeProfiles[side];
  if (!profile) return undefined;
  if (!item.sideSegments) {
    const bounds = {
        minX: Math.min(...(item.customPoints || []).map(p => p.x)),
        maxX: Math.max(...(item.customPoints || []).map(p => p.x)),
        minY: Math.min(...(item.customPoints || []).map(p => p.y)),
        maxY: Math.max(...(item.customPoints || []).map(p => p.y)),
    };
    const cx = item.sourceX + (bounds.minX + bounds.maxX) / 2;
    const cy = item.sourceY + (bounds.minY + bounds.maxY) / 2;
    const rx = Math.max(4, (bounds.maxX - bounds.minX) / 2 - actualOffset);
    const ry = Math.max(4, (bounds.maxY - bounds.minY) / 2 - actualOffset);
    const ranges: Record<string, [number, number]> = {
      A: [Math.PI * 1.12, Math.PI * 1.88],
      B: [Math.PI * 1.62, Math.PI * 2.38],
      C: [Math.PI * 0.12, Math.PI * 0.88],
      D: [Math.PI * 0.62, Math.PI * 1.38],
    };
    const range = ranges[side];
    const points = Array.from({ length: 20 }, (_, index) => {
      const angle = range[0] + ((range[1] - range[0]) * index) / 19;
      return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
    });
    const middle = points[Math.floor(points.length / 2)];
    return {
      path: points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' '),
      labelX: middle.x,
      labelY: middle.y,
      label: edgeProfileShortLabel(profile),
    };
  }
  const segment = item.sideSegments?.[side];
  if (!segment) return undefined;
  const p1 = { x: item.sourceX + segment.start.x, y: item.sourceY + segment.start.y };
  const p2 = { x: item.sourceX + segment.end.x, y: item.sourceY + segment.end.y };
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  if (len < 1) return undefined;
  const away = getOutwardNormal(segment, item);
  const inward = { x: -away.x, y: -away.y };
  const ux = -away.y, uy = away.x;

  let startShift = 0;
  let endShift = 0;
  if (item.sideSegments) {
    const segments = Object.values(item.sideSegments);
    const prev = segments.find(s => Math.hypot(s.end.x - segment.start.x, s.end.y - segment.start.y) < 5);
    if (prev) {
      const plen = Math.hypot(prev.end.x - prev.start.x, prev.end.y - prev.start.y) || 1;
      const pux = (prev.end.x - prev.start.x) / plen;
      const puy = (prev.end.y - prev.start.y) / plen;
      const crossStart = pux * uy - puy * ux;
      if (crossStart > 0.1) startShift = actualOffset;
      else if (crossStart < -0.1) startShift = -actualOffset;
    }
    const next = segments.find(s => Math.hypot(s.start.x - segment.end.x, s.start.y - segment.end.y) < 5);
    if (next) {
      const nlen = Math.hypot(next.end.x - next.start.x, next.end.y - next.start.y) || 1;
      const nux = (next.end.x - next.start.x) / nlen;
      const nuy = (next.end.y - next.start.y) / nlen;
      const crossEnd = ux * nuy - uy * nux;
      if (crossEnd > 0.1) endShift = -actualOffset;
      else if (crossEnd < -0.1) endShift = actualOffset;
    }
  }

  let q1 = { x: p1.x + inward.x * actualOffset + ux * startShift, y: p1.y + inward.y * actualOffset + uy * startShift };
  let q2 = { x: p2.x + inward.x * actualOffset + ux * endShift, y: p2.y + inward.y * actualOffset + uy * endShift };
  if (((q2.x - q1.x) * dx + (q2.y - q1.y) * dy) <= 0) {
    const midX = (p1.x + p2.x) / 2 + inward.x * actualOffset;
    const midY = (p1.y + p2.y) / 2 + inward.y * actualOffset;
    q1 = { x: midX, y: midY };
    q2 = { x: midX, y: midY };
  }

  return {
    path: `M${q1.x} ${q1.y} L${q2.x} ${q2.y}`,
    labelX: (q1.x + q2.x) / 2,
    labelY: (q1.y + q2.y) / 2,
    label: edgeProfileShortLabel(profile),
  };
}

export function approvalEdgeOverlaysForItem(item: ApprovalImportItem): DxfOverviewOverlay[] {
  const clipId = `clip-${item.id}`;
  return Object.keys(item.edgeProfiles).flatMap((side) => {
    const edge = approvalEdgeOverlayForSide(item, side);
    if (!edge) return [];
    return [{
      id: `${item.id}-edge-${side}`,
      path: edge.path,
      label: edge.label,
      labelX: edge.labelX,
      labelY: edge.labelY,
      className: 'dxf-edge-overlay',
      clipPathId: clipId,
    }];
  });
}

export function approvalJointOverlaysForItem(item: ApprovalImportItem): DxfOverviewOverlay[] {
  return (item.joints ?? []).map((joint) => ({
    id: `${item.id}-joint-${joint.id}`,
    path: `M${item.sourceX + joint.start.x} ${item.sourceY + joint.start.y} L${item.sourceX + joint.end.x} ${item.sourceY + joint.end.y}`,
    label: joint.source === 'manual' ? 'Стик' : 'Стик з бланку',
    labelX: item.sourceX + (joint.start.x + joint.end.x) / 2,
    labelY: item.sourceY + (joint.start.y + joint.end.y) / 2,
    className: 'dxf-joint-overlay',
  }));
}

export function approvalItemPoints(item: ApprovalImportItem): DxfPoint[] {
  if (item.customPoints?.length) return item.customPoints;
  return [];
}

export function approvalItemToDxfContour(item: ApprovalImportItem): DxfPreviewContour {
  return {
    id: item.id,
    name: item.name,
    width: item.width,
    height: item.height,
    points: approvalItemPoints(item),
    holes: item.customHoles ?? [],
    sideSegments: item.sideSegments,
    sourceX: item.sourceX,
    sourceY: item.sourceY,
    groupId: `Бланк група ${item.sourceProductNumber}`,
    layer: 'Бланк погодження',
    edgeProfiles: item.edgeProfiles,
    type: item.type,
    shape: item.shape,
    role: 'detail',
  };
}

export type ApprovalJointToolMode = 'vertical' | 'horizontal' | 'diagonal45' | 'pointToPoint';

export type ApprovalJointHover = {
  itemId: string;
  point: DxfPoint;
  edgeStart: DxfPoint;
  edgeEnd: DxfPoint;
  snappedToCorner: boolean;
  previewJoint?: { start: DxfPoint; end: DxfPoint };
};

export function approvalJointCirclePath(point: DxfPoint, radius = 7) {
  return `M${point.x - radius} ${point.y} A${radius} ${radius} 0 1 0 ${point.x + radius} ${point.y} A${radius} ${radius} 0 1 0 ${point.x - radius} ${point.y}`;
}

export function nearestApprovalContourPoint(item: ApprovalImportItem, globalPoint: DxfPoint) {
  const points = item.customPoints ?? [];
  const localPoint = { x: globalPoint.x - item.sourceX, y: globalPoint.y - item.sourceY };
  if (points.length < 2) return undefined;
  const cornerSnap = Math.min(140, Math.max(36, Math.min(item.width, item.height) * 0.075));
  let bestCorner: { point: DxfPoint; distance: number } | undefined;
  points.forEach((point) => {
    const distance = Math.hypot(localPoint.x - point.x, localPoint.y - point.y);
    if (!bestCorner || distance < bestCorner.distance) bestCorner = { point, distance };
  });
  if (bestCorner && bestCorner.distance <= cornerSnap) {
    return {
      point: bestCorner.point,
      edgeStart: bestCorner.point,
      edgeEnd: points[(points.indexOf(bestCorner.point) + 1) % points.length],
      snappedToCorner: true,
    };
  }
  let best: { point: DxfPoint; edgeStart: DxfPoint; edgeEnd: DxfPoint; distance: number } | undefined;
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    const candidate = distancePointToSegment(localPoint, start, end);
    if (!best || candidate.distance < best.distance) {
      best = { point: candidate.closest, edgeStart: start, edgeEnd: end, distance: candidate.distance };
    }
  });
  return best ? { ...best, snappedToCorner: false } : undefined;
}

export function approvalJointSegmentForPoint(item: ApprovalImportItem, globalPoint: DxfPoint, mode: ApprovalJointToolMode) {
  const snap = nearestApprovalContourPoint(item, globalPoint);
  const points = item.customPoints ?? [];
  if (!snap || points.length < 3) return { error: 'Не вдалося прив’язати стик до контуру деталі.' };
  if (mode === 'pointToPoint') return { snap };
  const edgeDx = snap.edgeEnd.x - snap.edgeStart.x;
  const edgeDy = snap.edgeEnd.y - snap.edgeStart.y;
  const edgeLength = Math.max(1, Math.hypot(edgeDx, edgeDy));
  const edgeUnit = { x: edgeDx / edgeLength, y: edgeDy / edgeLength };
  const adjacentEdgeUnits: typeof edgeUnit[] = [];
  if (snap.snappedToCorner) {
    const cornerIndex = points.indexOf(snap.point);
    const previousPoint = points[(cornerIndex + points.length - 1) % points.length];
    const previousDx = snap.point.x - previousPoint.x;
    const previousDy = snap.point.y - previousPoint.y;
    const previousLength = Math.hypot(previousDx, previousDy);
    if (previousLength > 1) adjacentEdgeUnits.push({ x: previousDx / previousLength, y: previousDy / previousLength });
  }
  const directions = mode === 'vertical'
    ? [{ x: 0, y: 1 }]
    : mode === 'horizontal'
      ? [{ x: 1, y: 0 }]
      : [{ x: 1, y: 1 }, { x: 1, y: -1 }];
  const normalizedDirections = directions.map((direction) => {
    const length = Math.hypot(direction.x, direction.y);
    return { x: direction.x / length, y: direction.y / length };
  });
  const cross = (a: DxfPoint, b: DxfPoint) => a.x * b.y - a.y * b.x;
  const anchor = snap.point;
  let best: { start: DxfPoint; end: DxfPoint; length: number } | undefined;
  normalizedDirections.forEach((direction) => {
    const values: number[] = [0];
    points.forEach((start, index) => {
      const end = points[(index + 1) % points.length];
      const edge = { x: end.x - start.x, y: end.y - start.y };
      const denominator = cross(direction, edge);
      if (Math.abs(denominator) < 0.001) return;
      const delta = { x: start.x - anchor.x, y: start.y - anchor.y };
      const t = cross(delta, edge) / denominator;
      const u = cross(delta, direction) / denominator;
      if (u >= -0.001 && u <= 1.001) values.push(t);
    });
    const sorted = [...new Set(values.map((value) => Math.round(value * 10000) / 10000))].sort((a, b) => a - b);
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const min = sorted[index];
      const max = sorted[index + 1];
      if (max - min < 0.001 || !(min <= 0.001 && max >= -0.001)) continue;
      const endpoints = [
        Math.abs(min) <= 0.001 ? max : min,
        Math.abs(max) <= 0.001 ? min : max,
      ].filter((value, valueIndex, list) => Math.abs(value) > 0.001 && list.indexOf(value) === valueIndex);
      endpoints.forEach((endpoint) => {
        const middleT = endpoint / 2;
        const middle = { x: anchor.x + direction.x * middleT, y: anchor.y + direction.y * middleT };
        if (!isPointInsidePreviewPolygon(middle, points)) return;
        if (pointNearPreviewPolygonBoundary(middle, points, 2.0)) return;
        const length = Math.abs(endpoint);
        if (length < 20) return;
        const candidate = {
          start: anchor,
          end: { x: anchor.x + direction.x * endpoint, y: anchor.y + direction.y * endpoint },
          length,
        };
        if (approvalJointCrossesWholeDetail(points, candidate)) return;
        if (!approvalJointHasInteriorRun(points, { ...candidate, id: 'preview', type: mode, source: 'manual' })) return;
        if (!best || candidate.length > best.length) best = candidate;
      });
    }
  });
  if (!best) return { error: 'Не вдалося протягнути стик до іншої сторони деталі. Спробуйте іншу точку або тип стику.' };
  return { joint: best, snap };
}

export function approvalCustomJointIsInside(item: ApprovalImportItem, start: DxfPoint, end: DxfPoint) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < 20) return false;
  const points = item.customPoints ?? [];
  if (points.length < 3) return false;
  if (approvalJointCrossesWholeDetail(points, { start, end })) return false;
  if (!approvalJointHasInteriorRun(points, { id: 'manual', type: 'pointToPoint', start, end, source: 'manual' })) return false;
  for (let index = 1; index < 8; index += 1) {
    const t = index / 8;
    const point = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    if (!isPointInsidePreviewPolygon(point, points)) return false;
  }
  const direction = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  return !points.some((edgeStart, index) => {
    const edgeEnd = points[(index + 1) % points.length];
    const edgeLength = Math.hypot(edgeEnd.x - edgeStart.x, edgeEnd.y - edgeStart.y);
    if (edgeLength < 1) return false;
    const edgeDirection = { x: (edgeEnd.x - edgeStart.x) / edgeLength, y: (edgeEnd.y - edgeStart.y) / edgeLength };
    const parallel = Math.abs(direction.x * edgeDirection.x + direction.y * edgeDirection.y) > 0.98;
    if (!parallel) return false;
    return distancePointToSegment(start, edgeStart, edgeEnd).distance < 2 && distancePointToSegment(end, edgeStart, edgeEnd).distance < 2;
  });
}

function distancePointToSegment(point: DxfPoint, start: DxfPoint, end: DxfPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq <= 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  const closest = { x: start.x + dx * t, y: start.y + dy * t };
  return { distance: Math.hypot(point.x - closest.x, point.y - closest.y), closest, t };
}

function pointNearPolygonBoundary(point: DxfPoint, polygon: DxfPoint[], tolerance = 3) {
  return polygon.some((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    return distancePointToSegment(point, start, end).distance <= tolerance;
  });
}

function approvalJointHasInteriorRun(points: DxfPoint[], joint: ApprovalImportJoint) {
  const dx = joint.end.x - joint.start.x;
  const dy = joint.end.y - joint.start.y;
  const length = Math.hypot(dx, dy);
  if (points.length < 3 || length < 20) return false;
  const samples = 14;
  let insideCount = 0;
  let boundaryCount = 0;
  for (let index = 1; index < samples; index += 1) {
    const t = index / samples;
    const point = { x: joint.start.x + dx * t, y: joint.start.y + dy * t };
    const nearBoundary = pointNearPolygonBoundary(point, points, 4);
    if (nearBoundary) boundaryCount += 1;
    if (isPointInsidePreviewPolygon(point, points) && !nearBoundary) insideCount += 1;
  }
  return insideCount >= 2 && boundaryCount < samples - 3;
}

function dxfBounds(points: DxfPoint[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function approvalJointCrossesWholeDetail(points: DxfPoint[], joint: { start: DxfPoint; end: DxfPoint }) {
  if (points.length < 3) return false;
  const bounds = dxfBounds(points);
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const dx = joint.end.x - joint.start.x;
  const dy = joint.end.y - joint.start.y;
  const length = Math.hypot(dx, dy);
  const tolerance = Math.max(8, Math.min(width, height) * 0.025);
  const nearMinX = (point: DxfPoint) => Math.abs(point.x - bounds.minX) <= tolerance;
  const nearMaxX = (point: DxfPoint) => Math.abs(point.x - bounds.maxX) <= tolerance;
  const nearMinY = (point: DxfPoint) => Math.abs(point.y - bounds.minY) <= tolerance;
  const nearMaxY = (point: DxfPoint) => Math.abs(point.y - bounds.maxY) <= tolerance;
  const spansOuterX = (nearMinX(joint.start) && nearMaxX(joint.end)) || (nearMaxX(joint.start) && nearMinX(joint.end));
  const spansOuterY = (nearMinY(joint.start) && nearMaxY(joint.end)) || (nearMaxY(joint.start) && nearMinY(joint.end));
  const horizontal = Math.abs(dy) <= Math.max(3, Math.abs(dx) * 0.04);
  const vertical = Math.abs(dx) <= Math.max(3, Math.abs(dy) * 0.04);
  if (horizontal && spansOuterX && length >= width * 0.7) return true;
  if (vertical && spansOuterY && length >= height * 0.7) return true;
  return Math.abs(dx) >= width * 0.7 && Math.abs(dy) >= height * 0.7 && (spansOuterX || spansOuterY);
}

export function approvalJointGuideOverlaysForItem(
  item: ApprovalImportItem,
  tool: { itemId: string; mode: ApprovalJointToolMode } | null,
  hover: ApprovalJointHover | null,
  draft: { itemId: string; point: DxfPoint } | null,
): DxfOverviewOverlay[] {
  if (tool?.itemId !== item.id) return [];
  const absolute = (point: DxfPoint) => ({ x: item.sourceX + point.x, y: item.sourceY + point.y });
  const overlays: DxfOverviewOverlay[] = [];
  const points = item.customPoints ?? [];
  if (points.length > 2 && points.length <= 24) {
    overlays.push({
      id: `${item.id}-joint-corners`,
      path: points.map((point) => approvalJointCirclePath(absolute(point), 6)).join(''),
      className: 'dxf-joint-corner-guide',
    });
  }
  if (hover?.itemId === item.id) {
    const edgeStart = absolute(hover.edgeStart);
    const edgeEnd = absolute(hover.edgeEnd);
    const point = absolute(hover.point);
    overlays.push({
      id: `${item.id}-joint-hover-edge`,
      path: `M${edgeStart.x} ${edgeStart.y} L${edgeEnd.x} ${edgeEnd.y}`,
      className: 'dxf-joint-edge-hover',
    });
    overlays.push({
      id: `${item.id}-joint-hover-point`,
      path: approvalJointCirclePath(point, hover.snappedToCorner ? 8 : 6),
      className: 'dxf-joint-point-guide',
    });
    if (hover.previewJoint) {
      const start = absolute(hover.previewJoint.start);
      const end = absolute(hover.previewJoint.end);
      overlays.push({
        id: `${item.id}-joint-preview`,
        path: `M${start.x} ${start.y} L${end.x} ${end.y}`,
        className: 'dxf-joint-preview-overlay',
      });
    }
  }
  if (draft?.itemId === item.id) {
    const point = absolute(draft.point);
    overlays.push({
      id: `${item.id}-joint-draft-point`,
      path: approvalJointCirclePath(point, 9),
      className: 'dxf-joint-draft-point',
    });
  }
  return overlays;
}
