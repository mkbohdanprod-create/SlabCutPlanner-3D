import type { DetailPart, EdgeProfileSelection, EdgeProfileType, Point, Rotation } from '../domain/types';
import { polygonBounds, rotatePoint, rotatedPoints } from '../lib/project';
import { pointInPolygonStrict as pointInPolygon } from '../engines/geometryUtils';

export const DEFAULT_EDGE_PROFILE: EdgeProfileType = 'polished_straight';

export type EdgeProfileMarker = {
  side: string;
  profiles: string[];
  start: Point;
  end: Point;
  points?: Point[];
  labelPoint: Point;
};

function rotateLocalPoint(point: Point, rotation: Rotation, part: DetailPart) {
  const rotatedReference = part.points.map((item) => rotatePoint(item, rotation, part.width, part.height));
  const bounds = polygonBounds(rotatedReference);
  const rotated = rotatePoint(point, rotation, part.width, part.height);
  return { x: rotated.x - bounds.minX, y: rotated.y - bounds.minY };
}

function logicalSegmentForSide(part: DetailPart, side: string, rotation: Rotation) {
  if (part.sideSegments?.[side]) {
    return {
      start: rotateLocalPoint(part.sideSegments[side].start, rotation, part),
      end: rotateLocalPoint(part.sideSegments[side].end, rotation, part),
    };
  }
  const resolvedSide = part.sideAliases?.[side] ?? side;
  const points = rotatedPoints(part, rotation);
  
  if (part.shape === 'Прямокутна' || part.shape === 'Кругла' || part.shape === 'Овальна') {
    const sizeBounds = polygonBounds(points);
    if (resolvedSide === 'A') return { start: { x: sizeBounds.minX, y: sizeBounds.maxY }, end: { x: sizeBounds.minX, y: sizeBounds.minY } };
    if (resolvedSide === 'B') return { start: { x: sizeBounds.minX, y: sizeBounds.minY }, end: { x: sizeBounds.maxX, y: sizeBounds.minY } };
    if (resolvedSide === 'C') return { start: { x: sizeBounds.maxX, y: sizeBounds.minY }, end: { x: sizeBounds.maxX, y: sizeBounds.maxY } };
    if (resolvedSide === 'D') return { start: { x: sizeBounds.maxX, y: sizeBounds.maxY }, end: { x: sizeBounds.minX, y: sizeBounds.maxY } };
  }
  
  const byPointCount: Record<number, Partial<Record<string, number>>> = {
    4: { B: 0, C: 1, D: 2, A: 3 },
    6: { B: 0, C: 1, D: 2, E: 3, F: 4, A: 5 },
    8: { B: 0, C: 1, D: 2, E: 3, F: 4, G: 5, H: 6, A: 7 },
  };
  const index = byPointCount[part.points.length]?.[resolvedSide];
  if (index === undefined || !points[index]) return undefined;
  return { start: points[index], end: points[(index + 1) % points.length] };
}

function insetPathForSide(segment: { start: Point; end: Point }, polygon: Point[], offset: number): Point[] {
  if (polygon.length < 3) return [segment.start, segment.end];

  const startIdx = polygon.reduce((best, p, i) => {
    const dist = Math.hypot(p.x - segment.start.x, p.y - segment.start.y);
    return dist < best.dist ? { i, dist } : best;
  }, { i: 0, dist: Infinity }).i;

  const endIdx = polygon.reduce((best, p, i) => {
    const dist = Math.hypot(p.x - segment.end.x, p.y - segment.end.y);
    return dist < best.dist ? { i, dist } : best;
  }, { i: 0, dist: Infinity }).i;

  let forwardSteps = 0;
  let i = startIdx;
  while (i !== endIdx && forwardSteps < polygon.length) {
    i = (i + 1) % polygon.length;
    forwardSteps++;
  }
  let backwardSteps = 0;
  i = startIdx;
  while (i !== endIdx && backwardSteps < polygon.length) {
    i = (i - 1 + polygon.length) % polygon.length;
    backwardSteps++;
  }
  
  const step = forwardSteps <= backwardSteps ? 1 : -1;
  const stepsCount = step === 1 ? forwardSteps : backwardSteps;

  const midSeqIdx = (startIdx + Math.floor(stepsCount / 2) * step + polygon.length) % polygon.length;
  const midP = polygon[midSeqIdx];
  const midNext = polygon[(midSeqIdx + step + polygon.length) % polygon.length];
  const midPoint = { x: (midP.x + midNext.x) / 2, y: (midP.y + midNext.y) / 2 };
  const midDx = midNext.x - midP.x;
  const midDy = midNext.y - midP.y;
  const midLen = Math.hypot(midDx, midDy) || 1;
  const midLeftNorm = { x: -midDy / midLen, y: midDx / midLen };
  const isMidLeftInside = [offset, 6, 2].some((d) => (
    pointInPolygon({ x: midPoint.x + midLeftNorm.x * d, y: midPoint.y + midLeftNorm.y * d }, polygon)
  ));
  const globalSign = isMidLeftInside ? 1 : -1;

  const insetPathPoints: Point[] = [];
  i = startIdx;
  while (true) {
    const p = polygon[i];
    const prevIdx = (i - step + polygon.length) % polygon.length;
    const nextIdx = (i + step + polygon.length) % polygon.length;
    const prevP = polygon[prevIdx];
    const nextP = polygon[nextIdx];
    
    const dx1 = p.x - prevP.x;
    const dy1 = p.y - prevP.y;
    const len1 = Math.hypot(dx1, dy1) || 1;
    const n1 = { x: -dy1 / len1, y: dx1 / len1 };
    
    const dx2 = nextP.x - p.x;
    const dy2 = nextP.y - p.y;
    const len2 = Math.hypot(dx2, dy2) || 1;
    const n2 = { x: -dy2 / len2, y: dx2 / len2 };
    
    let nx = n1.x + n2.x;
    let ny = n1.y + n2.y;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    
    const dot = n1.x * n2.x + n1.y * n2.y;
    const scale = Math.min(5, 1 / Math.max(0.1, Math.sqrt(Math.max(0, (1 + dot) / 2))));
    
    insetPathPoints.push({
      x: p.x + nx * globalSign * offset * scale,
      y: p.y + ny * globalSign * offset * scale,
    });
    
    if (i === endIdx) break;
    i = (i + step + polygon.length) % polygon.length;
  }
  return insetPathPoints;
}

export function edgeMarkersForPart(
  part: DetailPart,
  profiles: EdgeProfileSelection | undefined,
  rotation: Rotation,
  offset = 16,
): EdgeProfileMarker[] {
  if (!part.isMain || !profiles) return [];
  const entries = Object.entries(profiles).filter((entry) => Boolean(entry[1]));
  if (!entries.length) return [];

  const polygon = rotatedPoints(part, rotation);
  return entries
    .map(([side, rawProfile]) => {
      const treatment = (typeof rawProfile === 'string') 
        ? { top: { profileId: rawProfile } } 
        : rawProfile as any;
        
      const p1 = treatment.top?.profileId;
      const p2 = treatment.bottom?.profileId;
      if (!p1 && !p2) return undefined;
      
      const profileIds = [];
      if (p1) profileIds.push(p1);
      if (p2 && p2 !== p1) profileIds.push(p2);

      const segment = logicalSegmentForSide(part, side, rotation);
      if (!segment) return undefined;
      const points = insetPathForSide(segment, polygon, offset);
      const middleIdx = Math.floor(points.length / 2);
      return {
        side,
        profiles: profileIds,
        start: points[0] ?? segment.start,
        end: points[points.length - 1] ?? segment.end,
        points,
        labelPoint: points[middleIdx] ?? points[0] ?? segment.start,
      };
    })
    .filter(Boolean) as EdgeProfileMarker[];
}
