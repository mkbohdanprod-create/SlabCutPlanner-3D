import type { Point } from '../domain/types';

export function pointOnSegment(point: Point, a: Point, b: Point, epsilon = 0.001) {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > epsilon) return false;
  return (
    point.x >= Math.min(a.x, b.x) - epsilon
    && point.x <= Math.max(a.x, b.x) + epsilon
    && point.y >= Math.min(a.y, b.y) - epsilon
    && point.y <= Math.max(a.y, b.y) + epsilon
  );
}

export function pointInPolygonStrict(point: Point, polygon: Point[]) {
  if (polygon.some((current, index) => pointOnSegment(point, current, polygon[(index + 1) % polygon.length]))) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const crossesRay = (a.y > point.y) !== (b.y > point.y);
    if (crossesRay) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygonOrOn(point: Point, polygon: Point[]) {
  return polygon.some((current, index) => pointOnSegment(point, current, polygon[(index + 1) % polygon.length]))
    || pointInPolygonStrict(point, polygon);
}
