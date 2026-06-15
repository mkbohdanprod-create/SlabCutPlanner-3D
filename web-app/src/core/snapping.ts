import type { CutAllowances, DetailPart, Placement, Point, SlabInstance, DefectZone } from '../domain/types';
import { placementPolygon, rotatedLocalPoints, rotatedPoints, rotatedSize, translatePoints, polygonBounds } from './geometry';

export type LocalRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function defaultDefectPolygon(x: number, y: number, width: number, height: number) {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

export function normalizeRect(startX: number, startY: number, currentX: number, currentY: number): LocalRect {
  return {
    minX: Math.min(startX, currentX),
    minY: Math.min(startY, currentY),
    maxX: Math.max(startX, currentX),
    maxY: Math.max(startY, currentY),
  };
}

export function polygonInsideRect(points: Array<{ x: number; y: number }>, rect: LocalRect) {
  return points.every((point) => (
    point.x >= rect.minX
    && point.x <= rect.maxX
    && point.y >= rect.minY
    && point.y <= rect.maxY
  ));
}

export function pointsForPlacement(part: DetailPart, placement: Placement, points = part.points) {
  return translatePoints(rotatedLocalPoints(points, placement.rotation, part.width, part.height, part.points), placement.x, placement.y);
}

export function closestPointOnSegment(point: Point, start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return start;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  return { x: start.x + dx * t, y: start.y + dy * t };
}

export function manualPointDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function manualDimensionSegments(points: Point[]) {
  return points.map((start, index) => ({ start, end: points[(index + 1) % points.length] }));
}

export function assemblyGroupKey(part: DetailPart) {
  if (part.textureGroupLabel?.startsWith('import:')) return part.textureGroupLabel;
  return `${part.detailId}:${part.textureGroupLabel ?? part.parentLabel}`;
}

export function snapValue(target: number, candidates: number[], threshold = 25) {
  let best = target; let bestDistance = Infinity;
  candidates.forEach((candidate) => {
    const distance = Math.abs(candidate - target);
    if (distance < bestDistance && distance <= threshold) { best = candidate; bestDistance = distance; }
  });
  return best;
}

export function findSnap(placement: Placement, desiredX: number, desiredY: number, slab: SlabInstance, placements: Placement[], parts: DetailPart[], allowances?: CutAllowances) {
  const part = parts.find((p) => p.id === placement.partId);
  if (!part) return { x: desiredX, y: desiredY };
  const size = rotatedSize(part, placement.rotation);
  const interPartSpacing = Math.max(0, allowances?.interPartSpacing ?? 0);
  const rightLimit = slab.width - slab.minMargin;
  const bottomLimit = slab.height - slab.minMargin;
  const xCandidates = [
    slab.minMargin,
    rightLimit - size.width,
    slab.width / 2 - size.width / 2,
  ];
  const yCandidates = [
    slab.minMargin,
    bottomLimit - size.height,
    slab.height / 2 - size.height / 2,
  ];
  const xSpacingCandidates: number[] = [];
  const ySpacingCandidates: number[] = [];
  placements.forEach((other) => {
    if (other.id === placement.id || other.slabId !== placement.slabId) return;
    const otherPart = parts.find((p) => p.id === other.partId); if (!otherPart) return;
    const os = rotatedSize(otherPart, other.rotation);
    const otherCenterX = other.x + os.width / 2;
    const otherCenterY = other.y + os.height / 2;
    xCandidates.push(
      other.x,
      other.x + os.width,
      other.x - size.width,
      other.x + os.width - size.width,
      otherCenterX - size.width / 2,
      other.x - size.width - slab.minMargin,
      other.x + os.width + slab.minMargin,
    );
    if (interPartSpacing > 0) {
      xSpacingCandidates.push(
        other.x - size.width - interPartSpacing,
        other.x + os.width + interPartSpacing,
      );
    }
    yCandidates.push(
      other.y,
      other.y + os.height,
      other.y - size.height,
      other.y + os.height - size.height,
      otherCenterY - size.height / 2,
      other.y - size.height - slab.minMargin,
      other.y + os.height + slab.minMargin,
    );
    if (interPartSpacing > 0) {
      ySpacingCandidates.push(
        other.y - size.height - interPartSpacing,
        other.y + os.height + interPartSpacing,
      );
    }
  });
  const xBySpacing = interPartSpacing > 0 ? snapValue(desiredX, xSpacingCandidates, Math.min(90, Math.max(42, interPartSpacing + 28))) : desiredX;
  const yBySpacing = interPartSpacing > 0 ? snapValue(desiredY, ySpacingCandidates, Math.min(90, Math.max(42, interPartSpacing + 28))) : desiredY;
  return {
    x: snapValue(xBySpacing, xCandidates, xBySpacing === desiredX ? 34 : 16),
    y: snapValue(yBySpacing, yCandidates, yBySpacing === desiredY ? 34 : 16),
  };
}

export type EdgeSegment = { start: { x: number; y: number }; end: { x: number; y: number }; angle: number; length: number; key: string; index: number };
export type AngleSnapCandidate = { key: string; rotation: number; score: number; sourceIndex: number; target: EdgeSegment };

export function segmentAngle(start: { x: number; y: number }, end: { x: number; y: number }) {
  const raw = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  return ((raw % 180) + 180) % 180;
}

export function angleDelta(from: number, to: number) {
  return ((to - from + 90 + 180) % 180) - 90;
}

export function pointToSegmentDistance(point: { x: number; y: number }, segment: EdgeSegment) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return Math.hypot(point.x - segment.start.x, point.y - segment.start.y);
  const t = Math.max(0, Math.min(1, ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSq));
  const x = segment.start.x + dx * t;
  const y = segment.start.y + dy * t;
  return Math.hypot(point.x - x, point.y - y);
}

export function segmentDistance(a: EdgeSegment, b: EdgeSegment) {
  const aMid = { x: (a.start.x + a.end.x) / 2, y: (a.start.y + a.end.y) / 2 };
  const bMid = { x: (b.start.x + b.end.x) / 2, y: (b.start.y + b.end.y) / 2 };
  const endpointDistance = Math.min(
    pointToSegmentDistance(aMid, b),
    pointToSegmentDistance(bMid, a),
    pointToSegmentDistance(a.start, b),
    pointToSegmentDistance(a.end, b),
    pointToSegmentDistance(b.start, a),
    pointToSegmentDistance(b.end, a),
  );
  const ux = (b.end.x - b.start.x) / Math.max(b.length, 0.0001);
  const uy = (b.end.y - b.start.y) / Math.max(b.length, 0.0001);
  const nx = -uy;
  const ny = ux;
  const axis = (point: { x: number; y: number }) => (point.x - b.start.x) * ux + (point.y - b.start.y) * uy;
  const normal = (point: { x: number; y: number }) => (point.x - b.start.x) * nx + (point.y - b.start.y) * ny;
  const a1 = axis(a.start);
  const a2 = axis(a.end);
  const minA = Math.min(a1, a2);
  const maxA = Math.max(a1, a2);
  const gap = Math.max(0, Math.max(minA - b.length, -maxA));
  const lineDistance = (Math.abs(normal(a.start)) + Math.abs(normal(a.end))) / 2;
  return Math.min(endpointDistance, Math.hypot(gap, lineDistance));
}

export function polygonSegments(points: Array<{ x: number; y: number }>, keyPrefix: string) {
  return points
    .map((start, index) => {
      const end = points[(index + 1) % points.length];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      return { start, end, length, angle: segmentAngle(start, end), key: `${keyPrefix}:${index}`, index };
    })
    .filter((segment) => segment.length >= 40);
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampToSlab(part: DetailPart, placement: Placement, x: number, y: number, slab: SlabInstance) {
  const size = rotatedSize(part, placement.rotation);
  return {
    x: Math.max(slab.minMargin, Math.min(x, slab.width - slab.minMargin - size.width)),
    y: Math.max(slab.minMargin, Math.min(y, slab.height - slab.minMargin - size.height)),
  };
}

export function resolveSnappedPlacement(part: DetailPart, placement: Placement, slab: SlabInstance, placements: Placement[], parts: DetailPart[], allowances?: CutAllowances) {
  const clamped = clampToSlab(part, placement, placement.x, placement.y, slab);
  const snapped = findSnap(placement, clamped.x, clamped.y, slab, placements, parts, allowances);
  return clampToSlab(part, placement, snapped.x, snapped.y, slab);
}

export function defectPoints(defect: DefectZone) {
  if (defect.shapeType === 'circle') {
    const r = defect.width / 2;
    const cx = defect.x + r; const cy = defect.y + defect.height / 2;
    return Array.from({ length: 28 }, (_, i) => { const a = Math.PI * 2 * i / 28; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * defect.height / 2 }; });
  }
  if (defect.shapeType === 'triangle') return [{ x: defect.x + defect.width / 2, y: defect.y }, { x: defect.x + defect.width, y: defect.y + defect.height }, { x: defect.x, y: defect.y + defect.height }];
  if (defect.shapeType === 'polygon' && defect.points?.length) return defect.points;
  return [{ x: defect.x, y: defect.y }, { x: defect.x + defect.width, y: defect.y }, { x: defect.x + defect.width, y: defect.y + defect.height }, { x: defect.x, y: defect.y + defect.height }];
}
