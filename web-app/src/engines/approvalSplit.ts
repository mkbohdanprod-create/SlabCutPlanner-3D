// =====================================================================
//  src/engines/approvalSplit.ts   (P1.2 — розбиття деталі по стику)
//  Самодостатній модуль. Уся геометрія split-логіки, перенесена 1:1 з
//  робочого застосунку (5174). Імпортує лише dxfBounds/dxfArea, які вже
//  існують у проєкті (parsers/dxf). НЕ створює дублікатів.
//
//  [ВИПРАВЛЕНО] filterFeature приведено до реального EdgeFeature {enabled,size,sides}.
//  Експортує одну функцію: splitApprovalItemByJoint(item) -> item[]
//  Якщо ділити нема по чому — повертає [item] (no-op, безпечно).
// =====================================================================

import type { DxfPoint } from '../parsers/dxf';
import { dxfBounds, dxfArea } from '../parsers/dxf/geometry';
import type { ApprovalImportItem, ApprovalImportJoint } from '../utils/approvalImport';
import type { EdgeFeature } from '../domain/types';

// --- базова геометрія полігонів ---

function isPointInsidePreviewPolygon(point: DxfPoint, polygon: DxfPoint[]) {
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

function clipPolygonByAxis(points: DxfPoint[], axis: 'x' | 'y', value: number, keepLess: boolean) {
  if (points.length < 3) return [];
  const inside = (point: DxfPoint) => keepLess ? point[axis] <= value + 0.001 : point[axis] >= value - 0.001;
  const intersect = (start: DxfPoint, end: DxfPoint): DxfPoint => {
    const delta = end[axis] - start[axis];
    const t = Math.abs(delta) < 0.001 ? 0 : (value - start[axis]) / delta;
    return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
  };
  const output: DxfPoint[] = [];
  points.forEach((current, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside) {
      if (!previousInside) output.push(intersect(previous, current));
      output.push(current);
    } else if (previousInside) {
      output.push(intersect(previous, current));
    }
  });
  return output.filter((point, index, list) => {
    const previous = list[(index + list.length - 1) % list.length];
    return Math.hypot(point.x - previous.x, point.y - previous.y) > 0.5;
  });
}

function clipPolygonByLine(points: DxfPoint[], lineStart: DxfPoint, lineEnd: DxfPoint, keepPositive: boolean) {
  if (points.length < 3) return [];
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const side = (point: DxfPoint) => (point.x - lineStart.x) * dy - (point.y - lineStart.y) * dx;
  const inside = (point: DxfPoint) => keepPositive ? side(point) >= -0.001 : side(point) <= 0.001;
  const intersect = (start: DxfPoint, end: DxfPoint): DxfPoint => {
    const startSide = side(start);
    const endSide = side(end);
    const t = Math.abs(startSide - endSide) < 0.001 ? 0 : startSide / (startSide - endSide);
    return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
  };
  const output: DxfPoint[] = [];
  points.forEach((current, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside) {
      if (!previousInside) output.push(intersect(previous, current));
      output.push(current);
    } else if (previousInside) {
      output.push(intersect(previous, current));
    }
  });
  return output.filter((point, index, list) => {
    const previous = list[(index + list.length - 1) % list.length];
    return Math.hypot(point.x - previous.x, point.y - previous.y) > 0.5;
  });
}

function normalizeApprovalSplit(points: DxfPoint[]) {
  if (points.length < 3) return undefined;
  const bounds = dxfBounds(points);
  return {
    points: points.map((point) => ({ x: point.x - bounds.minX, y: point.y - bounds.minY })),
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height),
    sourceX: bounds.minX,
    sourceY: bounds.minY,
  };
}

// --- розпізнавання валідності стику ---

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

function splitApprovalRawPolygonByJoint(points: DxfPoint[], joint: ApprovalImportJoint) {
  if (joint.source !== 'manual' && approvalJointCrossesWholeDetail(points, joint)) return [points];
  if (!approvalJointHasInteriorRun(points, joint)) return [points];

  const getClosest = (point: DxfPoint) => {
    let bestIndex = -1;
    let bestDist = Infinity;
    let closestPoint = point;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lenSq));
      const proj = { x: p1.x + t * dx, y: p1.y + t * dy };
      const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
        closestPoint = proj;
      }
    }
    return { index: bestIndex, dist: bestDist, point: closestPoint };
  };

  const startHit = getClosest(joint.start);
  const endHit = getClosest(joint.end);

  if (startHit.dist > 5 || endHit.dist > 5) return [points];
  if (startHit.index === endHit.index) return [points];

  const firstPoints: DxfPoint[] = [startHit.point, endHit.point];
  let curr = (endHit.index + 1) % points.length;
  while (curr !== (startHit.index + 1) % points.length) {
    firstPoints.push(points[curr]);
    curr = (curr + 1) % points.length;
  }

  const secondPoints: DxfPoint[] = [endHit.point, startHit.point];
  curr = (startHit.index + 1) % points.length;
  while (curr !== (endHit.index + 1) % points.length) {
    secondPoints.push(points[curr]);
    curr = (curr + 1) % points.length;
  }

  const cleanPolygon = (poly: DxfPoint[]) => poly.filter((p, i, arr) => {
    const prev = arr[(i + arr.length - 1) % arr.length];
    return Math.hypot(p.x - prev.x, p.y - prev.y) > 0.5;
  });

  const first = cleanPolygon(firstPoints);
  const second = cleanPolygon(secondPoints);

  if (first.length < 3 || second.length < 3) return [points];

  const originalBounds = dxfBounds(points);
  const minAllowedThickness = Math.min(90, Math.max(35, Math.min(originalBounds.width, originalBounds.height) * 0.035));
  const partLooksLikeSliver = (part: DxfPoint[], area: number) => {
    const bounds = dxfBounds(part);
    const minSide = Math.min(bounds.width, bounds.height);
    return minSide < minAllowedThickness || area < Math.max(900, Math.abs(dxfArea(points)) * 0.025);
  };
  const originalArea = Math.abs(dxfArea(points));
  const firstArea = Math.abs(dxfArea(first));
  const secondArea = Math.abs(dxfArea(second));
  if (
    originalArea < 1
    || partLooksLikeSliver(first, firstArea)
    || partLooksLikeSliver(second, secondArea)
    || Math.abs(firstArea + secondArea - originalArea) > Math.max(60, originalArea * 0.08)
  ) {
    return [points];
  }
  return [first, second];
}

// --- перенесення сторін/кромок/потовщень на частину після розрізу ---

function approvalSplitSideData(item: ApprovalImportItem, part: { points: DxfPoint[]; width: number; height: number; sourceX: number; sourceY: number }) {
  const sideSegments: Record<string, { start: DxfPoint; end: DxfPoint }> = {};
  const edgeProfiles: ApprovalImportItem['edgeProfiles'] = {};

  const isEdgeOnSegment = (edgeStart: DxfPoint, edgeEnd: DxfPoint, segStart: DxfPoint, segEnd: DxfPoint) => {
    const distToLine = (p: DxfPoint) => {
      const dx = segEnd.x - segStart.x;
      const dy = segEnd.y - segStart.y;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq <= 0 ? 0 : ((p.x - segStart.x) * dx + (p.y - segStart.y) * dy) / lengthSq;
      const closest = { x: segStart.x + dx * t, y: segStart.y + dy * t };
      return { distance: Math.hypot(p.x - closest.x, p.y - closest.y), t };
    };
    const d1 = distToLine(edgeStart);
    const d2 = distToLine(edgeEnd);
    if (d1.distance > 5 || d2.distance > 5) return false;
    if (Math.max(d1.t, d2.t) < -0.1 || Math.min(d1.t, d2.t) > 1.1) return false;
    const len = Math.hypot(edgeEnd.x - edgeStart.x, edgeEnd.y - edgeStart.y);
    return len >= 10;
  };

  Object.entries(item.sideSegments ?? {}).forEach(([side, segment]) => {
    const start = { x: segment.start.x - part.sourceX, y: segment.start.y - part.sourceY };
    const end = { x: segment.end.x - part.sourceX, y: segment.end.y - part.sourceY };
    const points = part.points;
    let matchedEdge: { start: DxfPoint; end: DxfPoint } | undefined = undefined;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      if (isEdgeOnSegment(p1, p2, start, end)) {
        if (!matchedEdge || Math.hypot(p2.x - p1.x, p2.y - p1.y) > Math.hypot(matchedEdge.end.x - matchedEdge.start.x, matchedEdge.end.y - matchedEdge.start.y)) {
          matchedEdge = { start: p1, end: p2 };
        }
      }
    }
    if (matchedEdge) {
      sideSegments[side] = matchedEdge;
      if (item.edgeProfiles[side]) edgeProfiles[side] = item.edgeProfiles[side];
    }
  });
  const keptSides = new Set(Object.keys(sideSegments));
  // EdgeFeature у цьому проєкті = { enabled, size, sides } — без sideSizes/sideLengths.
  const filterFeature = (feature: EdgeFeature): EdgeFeature => {
    const sides = feature.sides.filter((side) => keptSides.has(side));
    return { ...feature, enabled: sides.length > 0, sides };
  };
  return {
    sideSegments: Object.keys(sideSegments).length ? sideSegments : undefined,
    edgeProfiles,
    thickening: filterFeature(item.thickening),
    fold: filterFeature(item.fold),
  };
}

// --- ПУБЛІЧНА функція ---

export function splitApprovalItemByJoint(item: ApprovalImportItem): ApprovalImportItem[] {
  if (!item.customPoints?.length || !(item.joints?.length || item.jointVertical || item.jointHorizontal)) return [item];
  const jointList = item.joints ?? [];
  const normalizedParts = jointList.length
    ? jointList
      .reduce<DxfPoint[][]>((parts, joint) => parts.flatMap((part) => splitApprovalRawPolygonByJoint(part, joint)), [item.customPoints])
      .map(normalizeApprovalSplit)
      .filter(Boolean) as Array<{ points: DxfPoint[]; width: number; height: number; sourceX: number; sourceY: number }>
    : [
      normalizeApprovalSplit(clipPolygonByAxis(item.customPoints, item.jointVertical ? 'x' : 'y', item.jointVertical ? item.width / 2 : item.height / 2, true)),
      normalizeApprovalSplit(clipPolygonByAxis(item.customPoints, item.jointVertical ? 'x' : 'y', item.jointVertical ? item.width / 2 : item.height / 2, false)),
    ].filter(Boolean) as Array<{ points: DxfPoint[]; width: number; height: number; sourceX: number; sourceY: number }>;
  if (normalizedParts.length < 2) return [item];
  return normalizedParts.map((part, index) => ({
    ...item,
    ...approvalSplitSideData(item, part),
    id: `${item.id}_split_${index + 1}`,
    name: `${item.name}.${index + 1}`,
    width: Math.round(part.width),
    height: Math.round(part.height),
    customPoints: part.points,
    customHoles: [],
    joints: [],
    sourceX: item.sourceX + part.sourceX,
    sourceY: item.sourceY + part.sourceY,
    jointVertical: false,
    jointHorizontal: false,
  }));
}
