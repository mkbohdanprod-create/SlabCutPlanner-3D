import type { DetailPart, EdgeProfileSelection, EdgeProfileType, Point, Rotation } from '../domain/types';
import { polygonBounds, rotatePoint, rotatedPoints } from '../lib/project';

export const DEFAULT_EDGE_PROFILE: EdgeProfileType = 'polished_straight';

export const EDGE_PROFILE_OPTIONS: Array<{
  value: EdgeProfileType;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  { value: 'polished_straight', label: 'Пряма полірована кромка', shortLabel: 'Полір.', description: 'Straight edge' },
  { value: 'chamfer_2x2', label: 'Фаска 2×2', shortLabel: 'Фаска 2×2', description: 'фаска зверху 2 мм' },
  { value: 'chamfer_2x2_top_bottom', label: 'Фаска 2×2 верх/низ', shortLabel: '2×2 в/н', description: 'фаска зверху і знизу' },
  { value: 'r2_top', label: 'R2 верх', shortLabel: 'R2', description: 'радіус 2 мм зверху' },
  { value: 'r2_top_bottom', label: 'R2 верх/низ', shortLabel: 'R2 в/н', description: 'радіус 2 мм зверху і знизу' },
  { value: 'chamfer_45_r2', label: 'Фаска 45° з R2', shortLabel: '45° R2', description: 'скошена кромка 45° з мікрорадіусом' },
  { value: 'chamfered_edge', label: 'Chamfered edge', shortLabel: 'Chamfer', description: 'скошена фаска' },
  { value: 'half_bullnose', label: 'Half bullnose', shortLabel: 'Half bull', description: 'верхній великий радіус' },
  { value: 'full_bullnose', label: 'Full bullnose', shortLabel: 'Full bull', description: 'повний радіус торця' },
  { value: 'sharknose', label: 'Sharknose', shortLabel: 'Shark', description: 'скошена піднутрена кромка' },
  { value: 'straight_edge', label: 'Straight edge', shortLabel: 'Straight', description: 'пряма кромка без фаски/радіуса' },
];

export type EdgeProfileMarker = {
  side: string;
  profile: EdgeProfileType;
  start: Point;
  end: Point;
  labelPoint: Point;
};

export function edgeProfileLabel(profile: EdgeProfileType) {
  return EDGE_PROFILE_OPTIONS.find((option) => option.value === profile)?.label ?? profile;
}

export function edgeProfileShortLabel(profile: EdgeProfileType) {
  return EDGE_PROFILE_OPTIONS.find((option) => option.value === profile)?.shortLabel ?? profile;
}

function pointOnSegment(point: Point, a: Point, b: Point, epsilon = 0.001) {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > epsilon) return false;
  return (
    point.x >= Math.min(a.x, b.x) - epsilon
    && point.x <= Math.max(a.x, b.x) + epsilon
    && point.y >= Math.min(a.y, b.y) - epsilon
    && point.y <= Math.max(a.y, b.y) + epsilon
  );
}

function pointInPolygon(point: Point, polygon: Point[]) {
  if (polygon.some((current, index) => pointOnSegment(point, current, polygon[(index + 1) % polygon.length]))) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

function rotateLocalPoint(point: Point, rotation: Rotation, part: DetailPart) {
  const rotatedReference = part.points.map((item) => rotatePoint(item, rotation, part.width, part.height));
  const bounds = polygonBounds(rotatedReference);
  const rotated = rotatePoint(point, rotation, part.width, part.height);
  return { x: rotated.x - bounds.minX, y: rotated.y - bounds.minY };
}

function segmentForSide(part: DetailPart, side: string, rotation: Rotation) {
  const customSegment = part.sideSegments?.[side];
  if (customSegment) {
    return {
      start: rotateLocalPoint(customSegment.start, rotation, part),
      end: rotateLocalPoint(customSegment.end, rotation, part),
    };
  }

  const resolvedSide = part.sideAliases?.[side] ?? side;
  const byPointCount: Record<number, Partial<Record<string, number>>> = {
    4: { B: 0, C: 1, D: 2, A: 3 },
    6: { B: 0, C: 1, D: 2, E: 3, F: 4, A: 5 },
    8: { B: 0, C: 1, D: 2, E: 3, F: 4, G: 5, H: 6, A: 7 },
  };
  const index = byPointCount[part.points.length]?.[resolvedSide];
  if (index === undefined || !part.points[index]) return undefined;
  const points = rotatedPoints(part, rotation);
  return { start: points[index], end: points[(index + 1) % points.length] };
}

function curvedSegment(part: DetailPart, side: string, rotation: Rotation) {
  const sizeBounds = polygonBounds(rotatedPoints(part, rotation));
  const width = Math.max(1, sizeBounds.maxX - sizeBounds.minX);
  const height = Math.max(1, sizeBounds.maxY - sizeBounds.minY);
  const inset = Math.min(width, height) * 0.22;
  if (side === 'A') return { start: { x: inset, y: height * 0.25 }, end: { x: inset, y: height * 0.75 } };
  if (side === 'B') return { start: { x: width * 0.25, y: inset }, end: { x: width * 0.75, y: inset } };
  if (side === 'C') return { start: { x: width - inset, y: height * 0.25 }, end: { x: width - inset, y: height * 0.75 } };
  if (side === 'D') return { start: { x: width * 0.25, y: height - inset }, end: { x: width * 0.75, y: height - inset } };
  return undefined;
}

function inwardNormal(segment: { start: Point; end: Point }, polygon: Point[]) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const midpoint = { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 };
  const candidates = [
    { x: -dy / length, y: dx / length },
    { x: dy / length, y: -dx / length },
  ];
  return candidates.find((normal) => pointInPolygon({ x: midpoint.x + normal.x * 10, y: midpoint.y + normal.y * 10 }, polygon)) ?? candidates[0];
}

function insetSegment(segment: { start: Point; end: Point }, polygon: Point[], offset: number) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const shorten = Math.min(18, Math.max(0, length * 0.12));
  const ux = dx / length;
  const uy = dy / length;
  const normal = inwardNormal(segment, polygon);
  return {
    start: {
      x: segment.start.x + ux * shorten + normal.x * offset,
      y: segment.start.y + uy * shorten + normal.y * offset,
    },
    end: {
      x: segment.end.x - ux * shorten + normal.x * offset,
      y: segment.end.y - uy * shorten + normal.y * offset,
    },
  };
}

export function edgeMarkersForPart(
  part: DetailPart,
  profiles: EdgeProfileSelection | undefined,
  rotation: Rotation,
  offset = 16,
): EdgeProfileMarker[] {
  if (!part.isMain || !profiles) return [];
  const entries = Object.entries(profiles).filter((entry): entry is [string, EdgeProfileType] => Boolean(entry[1]));
  if (!entries.length) return [];

  const polygon = rotatedPoints(part, rotation);
  return entries
    .map(([side, profile]) => {
      const isCurved = part.points.length > 8 && !part.sideSegments?.[side];
      const segment = isCurved ? curvedSegment(part, side, rotation) : segmentForSide(part, side, rotation);
      if (!segment) return undefined;
      const line = isCurved ? segment : insetSegment(segment, polygon, offset);
      return {
        side,
        profile,
        start: line.start,
        end: line.end,
        labelPoint: {
          x: (line.start.x + line.end.x) / 2,
          y: (line.start.y + line.end.y) / 2,
        },
      };
    })
    .filter(Boolean) as EdgeProfileMarker[];
}
