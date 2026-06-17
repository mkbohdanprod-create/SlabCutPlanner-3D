import type { CutAllowances, DetailPart, Placement, Point, SlabInstance } from '../../domain/types';
import { normalizeRotation, placementPolygon, polygonBounds, rotatedLocalPoints, rotatedPoints, rotatedSize, translatePoints } from '../../lib/project';

// ── Geometry helpers ────────────────────────────────

export function defaultDefectPolygon(x: number, y: number, width: number, height: number) {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

export type LocalRect = { minX: number; minY: number; maxX: number; maxY: number };

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
    point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY
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

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// ── SVG helpers ──────────────────────────────────

export function svgPath(points: Array<{ x: number; y: number }>, scale: number, holes: Array<Array<{ x: number; y: number }>> = []) {
  const pathFor = (items: Array<{ x: number; y: number }>) => items
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x * scale} ${point.y * scale}`)
    .join(' ');
  return `${pathFor(points)} Z ${holes.map((hole) => `${pathFor(hole)} Z`).join(' ')}`;
}

// ── Label helpers ────────────────────────────────

export function assemblyGroupKey(part: DetailPart) {
  if (part.textureGroupLabel?.startsWith('import:')) return part.textureGroupLabel;
  return `${part.detailId}:${part.textureGroupLabel ?? part.parentLabel}`;
}

export function fitLabel(text: string, dimsText: string, width: number, height: number, side?: string) {
  const safeWidth = Math.max(width * 0.78, 18);
  const safeHeight = Math.max(height * 0.32, 10);
  const singleLine = height < 30 && width > height * 1.8;
  const baseText = singleLine ? `${text} ${dimsText}` : text;
  const fullSize = Math.min(15, Math.max(7, safeHeight * 0.5));
  const fittedSize = Math.max(7, Math.min(fullSize, safeWidth / Math.max(baseText.length * 0.56, 1)));
  const maxChars = Math.max(3, Math.floor(safeWidth / Math.max(fittedSize * 0.58, 1)));
  const display = baseText.length > maxChars ? (side ?? `${baseText.slice(0, Math.max(2, maxChars - 1))}…`) : baseText;
  const dimsSize = Math.max(7, Math.min(12, fittedSize - 1));
  const textWidth = display.length * fittedSize * 0.58;
  const dimsWidth = singleLine ? 0 : dimsText.length * dimsSize * 0.55;
  return {
    text: display,
    fontSize: fittedSize,
    dimsSize,
    singleLine,
    zoneWidth: Math.min(width * 0.88, Math.max(34, Math.max(textWidth, dimsWidth) + 12)),
    zoneHeight: singleLine ? Math.max(18, fittedSize * 1.8) : Math.max(22, fittedSize * 2.4),
  };
}

export function elementLabel(part: DetailPart) {
  if (part.isMain || !part.edgeKind || !part.edgeSide) return undefined;
  return {
    title: part.edgeKind === 'fold' ? 'Підв.' : 'Пот.',
    side: `Сторона ${part.edgeSide.toUpperCase()}`,
  };
}

// ── Defect geometry ──────────────────────────────

export function defectPoints(defect: { shapeType?: string; x: number; y: number; width: number; height: number; points?: Array<{ x: number; y: number }> }) {
  if (defect.shapeType === 'circle') {
    const r = defect.width / 2;
    const cx = defect.x + r; const cy = defect.y + defect.height / 2;
    return Array.from({ length: 28 }, (_, i) => { const a = Math.PI * 2 * i / 28; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * defect.height / 2 }; });
  }
  if (defect.shapeType === 'triangle') return [{ x: defect.x + defect.width / 2, y: defect.y }, { x: defect.x + defect.width, y: defect.y + defect.height }, { x: defect.x, y: defect.y + defect.height }];
  if (defect.shapeType === 'polygon' && defect.points?.length) return defect.points;
  return [{ x: defect.x, y: defect.y }, { x: defect.x + defect.width, y: defect.y }, { x: defect.x + defect.width, y: defect.y + defect.height }, { x: defect.x, y: defect.y + defect.height }];
}

// ── Snapping ─────────────────────────────────────

export function snapValue(target: number, candidates: number[], threshold = 25) {
  let best = target; let bestDistance = Infinity;
  candidates.forEach((candidate) => {
    const distance = Math.abs(candidate - target);
    if (distance < bestDistance && distance <= threshold) { best = candidate; bestDistance = distance; }
  });
  return best;
}

export function clampToSlab(part: DetailPart, placement: Placement, x: number, y: number, slab: SlabInstance) {
  const size = rotatedSize(part, placement.rotation);
  return {
    x: Math.max(slab.minMargin, Math.min(x, slab.width - slab.minMargin - size.width)),
    y: Math.max(slab.minMargin, Math.min(y, slab.height - slab.minMargin - size.height)),
  };
}

export function findSnap(placement: Placement, desiredX: number, desiredY: number, slab: SlabInstance, placements: Placement[], parts: DetailPart[], allowances?: CutAllowances) {
  const part = parts.find((p) => p.id === placement.partId);
  if (!part) return { x: desiredX, y: desiredY };
  const size = rotatedSize(part, placement.rotation);
  const interPartSpacing = Math.max(0, allowances?.interPartSpacing ?? 0);
  const rightLimit = slab.width - slab.minMargin;
  const bottomLimit = slab.height - slab.minMargin;
  const xCandidates = [slab.minMargin, rightLimit - size.width, slab.width / 2 - size.width / 2];
  const yCandidates = [slab.minMargin, bottomLimit - size.height, slab.height / 2 - size.height / 2];
  const xSpacingCandidates: number[] = [];
  const ySpacingCandidates: number[] = [];
  placements.forEach((other) => {
    if (other.id === placement.id || other.slabId !== placement.slabId) return;
    const otherPart = parts.find((p) => p.id === other.partId); if (!otherPart) return;
    const os = rotatedSize(otherPart, other.rotation);
    const otherCenterX = other.x + os.width / 2;
    const otherCenterY = other.y + os.height / 2;
    xCandidates.push(other.x, other.x + os.width, other.x - size.width, other.x + os.width - size.width, otherCenterX - size.width / 2, other.x - size.width - slab.minMargin, other.x + os.width + slab.minMargin);
    if (interPartSpacing > 0) xSpacingCandidates.push(other.x - size.width - interPartSpacing, other.x + os.width + interPartSpacing);
    yCandidates.push(other.y, other.y + os.height, other.y - size.height, other.y + os.height - size.height, otherCenterY - size.height / 2, other.y - size.height - slab.minMargin, other.y + os.height + slab.minMargin);
    if (interPartSpacing > 0) ySpacingCandidates.push(other.y - size.height - interPartSpacing, other.y + os.height + interPartSpacing);
  });
  const xBySpacing = interPartSpacing > 0 ? snapValue(desiredX, xSpacingCandidates, Math.min(90, Math.max(42, interPartSpacing + 28))) : desiredX;
  const yBySpacing = interPartSpacing > 0 ? snapValue(desiredY, ySpacingCandidates, Math.min(90, Math.max(42, interPartSpacing + 28))) : desiredY;
  return {
    x: snapValue(xBySpacing, xCandidates, xBySpacing === desiredX ? 34 : 16),
    y: snapValue(yBySpacing, yCandidates, yBySpacing === desiredY ? 34 : 16),
  };
}

export function resolveSnappedPlacement(part: DetailPart, placement: Placement, slab: SlabInstance, placements: Placement[], parts: DetailPart[], allowances?: CutAllowances) {
  const clamped = clampToSlab(part, placement, placement.x, placement.y, slab);
  const snapped = findSnap(placement, clamped.x, clamped.y, slab, placements, parts, allowances);
  return clampToSlab(part, placement, snapped.x, snapped.y, slab);
}

// ── Angle snapping ───────────────────────────────

export type EdgeSegment = { start: { x: number; y: number }; end: { x: number; y: number }; angle: number; length: number; key: string; index: number };
export type AngleSnapCandidate = { key: string; rotation: number; score: number; sourceIndex: number; target: EdgeSegment };

export function segmentAngle(start: { x: number; y: number }, end: { x: number; y: number }) {
  const raw = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  return ((raw % 180) + 180) % 180;
}

export function angleDelta(from: number, to: number) {
  return ((to - from + 90 + 180) % 180) - 90;
}

function pointToSegmentDistance(point: { x: number; y: number }, segment: EdgeSegment) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return Math.hypot(point.x - segment.start.x, point.y - segment.start.y);
  const t = Math.max(0, Math.min(1, ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSq));
  const x = segment.start.x + dx * t;
  const y = segment.start.y + dy * t;
  return Math.hypot(point.x - x, point.y - y);
}

function segmentDistance(a: EdgeSegment, b: EdgeSegment) {
  const aMid = { x: (a.start.x + a.end.x) / 2, y: (a.start.y + a.end.y) / 2 };
  const bMid = { x: (b.start.x + b.end.x) / 2, y: (b.start.y + b.end.y) / 2 };
  const endpointDistance = Math.min(
    pointToSegmentDistance(aMid, b), pointToSegmentDistance(bMid, a),
    pointToSegmentDistance(a.start, b), pointToSegmentDistance(a.end, b),
    pointToSegmentDistance(b.start, a), pointToSegmentDistance(b.end, a),
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

export function alignPlacementSegmentToTarget(part: DetailPart, placement: Placement, sourceIndex: number, target: EdgeSegment): Placement {
  const source = polygonSegments(placementPolygon(part, placement), `moving:${placement.id}`).find((segment) => segment.index === sourceIndex);
  if (!source) return placement;
  const sourceMid = { x: (source.start.x + source.end.x) / 2, y: (source.start.y + source.end.y) / 2 };
  const dx = target.end.x - target.start.x;
  const dy = target.end.y - target.start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return placement;
  const t = ((sourceMid.x - target.start.x) * dx + (sourceMid.y - target.start.y) * dy) / lengthSq;
  const projected = { x: target.start.x + dx * t, y: target.start.y + dy * t };
  return { ...placement, x: placement.x + projected.x - sourceMid.x, y: placement.y + projected.y - sourceMid.y };
}

export function findAngledSideSnap(part: DetailPart, placement: Placement, slab: SlabInstance, placements: Placement[], parts: DetailPart[], includeAligned = false) {
  const moving = polygonSegments(placementPolygon(part, placement), `moving:${placement.id}`);
  if (!moving.length) return undefined;
  const margin = Math.max(0, slab.minMargin);
  const slabEdges = polygonSegments([
    { x: margin, y: margin }, { x: slab.width - margin, y: margin },
    { x: slab.width - margin, y: slab.height - margin }, { x: margin, y: slab.height - margin },
  ], `slab:${slab.id}`);
  const otherEdges = placements.flatMap((other) => {
    if (other.id === placement.id || other.slabId !== placement.slabId) return [];
    const otherPart = parts.find((item) => item.id === other.partId);
    return otherPart ? polygonSegments(placementPolygon(otherPart, other), `placement:${other.id}`) : [];
  });
  const targetEdges = [...slabEdges, ...otherEdges];
  let best: AngleSnapCandidate | undefined;
  moving.forEach((source) => {
    targetEdges.forEach((target) => {
      const diff = angleDelta(source.angle, target.angle);
      const absDiff = Math.abs(diff);
      if ((includeAligned ? absDiff > 12 : absDiff < 1 || absDiff > 12)) return;
      const distance = segmentDistance(source, target);
      if (distance > 110) return;
      const score = distance + absDiff * 4;
      if (!best || score < best.score) {
        best = { key: `${source.key}->${target.key}`, rotation: normalizeRotation(placement.rotation + diff), sourceIndex: source.index, target, score };
      }
    });
  });
  return best;
}

// ── Rotation helpers ─────────────────────────────

export function polygonCentroid(points: Array<{ x: number; y: number }>) {
  let area = 0; let cx = 0; let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]; const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross; cx += (a.x + b.x) * cross; cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area) < 0.01) {
    const bounds = polygonBounds(points);
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

export function rotateCoordinateAround(point: { x: number; y: number }, pivot: { x: number; y: number }, degrees: number) {
  const angle = degrees * Math.PI / 180;
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return { x: pivot.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: pivot.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
}

export function rigidRotatePlacementMove(part: DetailPart, placement: Placement, pivot: { x: number; y: number }, degrees: number) {
  const nextRotation = normalizeRotation(placement.rotation + degrees);
  const before = placementPolygon(part, placement).map((point) => rotateCoordinateAround(point, pivot, degrees));
  const afterLocal = rotatedPoints(part, nextRotation);
  const anchor = afterLocal.reduce((acc, point, index) => {
    const target = before[index] ?? before[0];
    return { x: acc.x + target.x - point.x, y: acc.y + target.y - point.y };
  }, { x: 0, y: 0 });
  const count = Math.max(afterLocal.length, 1);
  return { placementId: placement.id, x: anchor.x / count, y: anchor.y / count, slabId: placement.slabId, rotation: nextRotation };
}

export type CanvasDrag = 
  | { type: 'placement'; id: string; clientX: number; clientY: number; offsetX: number; offsetY: number; rotation: number; groupIds?: string[]; groupStart?: Record<string, import('../../domain/types').Placement>; ghostClientX?: number; ghostClientY?: number; ghostX?: number; ghostY?: number; ghostSlabId?: string; angleSnap?: AngleSnapCandidate; }
  | { type: 'pan'; clientX: number; clientY: number; startScrollX: number; startScrollY: number; }
  | { type: 'selection'; clientX: number; clientY: number; originX: number; originY: number; };

export interface SelectionBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface CanvasContextMenu {
  placementId?: string;
  partId?: string;
  slabId: string;
  clientX: number;
  clientY: number;
  x: number;
  y: number;
}

export interface AngleEditorState {
  placementId: string;
  slabId: string;
  initialRotation: number;
}

export interface SlabEditorDraft {
  width: number;
  height: number;
  thickness: number;
  material: import('../../domain/types').MaterialType;
  decor: string;
  comment: string;
  minMargin: number;
  serialNumber: string;
}

