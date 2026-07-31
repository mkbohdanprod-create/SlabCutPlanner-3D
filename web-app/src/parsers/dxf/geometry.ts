import type { DxfContour, DxfPoint, DxfPreviewContour } from './types';

export function dxfBounds(points: DxfPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function dxfArea(points: DxfPoint[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2);
}

export function dxfPointInPolygon(point: DxfPoint, polygon: DxfPoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && (point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1) + a.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function dxfIsClosed(points: DxfPoint[]) {
  if (points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(first.x - last.x, first.y - last.y) < 0.5;
}

export function dxfIsConcave(points: DxfPoint[]) {
  let direction = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const c = points[(index + 2) % points.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 0.01) continue;
    const sign = Math.sign(cross);
    if (!direction) direction = sign;
    if (direction !== sign) return true;
  }
  return false;
}

export function expandDxfBulges(points: DxfPoint[]) {
  if (points.length < 2) return points;
  const closed = dxfIsClosed(points);
  const source = closed ? points.slice(0, -1) : points;
  const result: DxfPoint[] = [];

  source.forEach((point, index) => {
    const next = source[(index + 1) % source.length];
    result.push({ x: point.x, y: point.y });
    if (!next || (!closed && index === source.length - 1) || !point.bulge) return;

    const chord = Math.hypot(next.x - point.x, next.y - point.y);
    if (chord <= 0.01) return;
    const theta = 4 * Math.atan(point.bulge);
    const radius = chord / (2 * Math.sin(Math.abs(theta) / 2));
    const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
    const normal = { x: -(next.y - point.y) / chord, y: (next.x - point.x) / chord };
    const centerOffset = chord / (2 * Math.tan(theta / 2));
    const center = { x: midpoint.x + normal.x * centerOffset, y: midpoint.y + normal.y * centerOffset };
    const startAngle = Math.atan2(point.y - center.y, point.x - center.x);
    const steps = Math.min(48, Math.max(6, Math.ceil(Math.abs(theta) / (Math.PI / 16))));
    for (let step = 1; step < steps; step += 1) {
      const angle = startAngle + (theta * step) / steps;
      result.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
    }
  });

  if (closed && result.length) result.push({ ...result[0] });
  return result;
}

export function dxfContour(points: DxfPoint[]): Omit<DxfContour, 'layer'> | undefined {
  const expanded = expandDxfBulges(points);
  if (expanded.length < 3) return undefined;
  const bounds = dxfBounds(expanded);
  if (bounds.width <= 1 || bounds.height <= 1) return undefined;
  return {
    points: expanded,
    width: bounds.width,
    height: bounds.height,
    area: dxfArea(expanded) || bounds.width * bounds.height,
    center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
  };
}

export function dxfHoleSize(hole: DxfPoint[]) {
  const bounds = dxfBounds(hole);
  return { min: Math.min(bounds.width, bounds.height), max: Math.max(bounds.width, bounds.height) };
}

export function dxfSvgPath(points: DxfPoint[], holes: DxfPoint[][] = []) {
  const path = (items: DxfPoint[]) => {
    if (!items.length) return '';
    let d = `M${items[0].x} ${items[0].y}`;
    for (let i = 1; i <= items.length; i++) {
      const isLast = i === items.length;
      const prev = items[i - 1];
      const point = items[isLast ? 0 : i];
      if (isLast && !prev.bulge) {
        d += ' Z';
        break;
      }
      if (prev.bulge) {
        const theta = 4 * Math.atan(prev.bulge);
        const chord = Math.hypot(point.x - prev.x, point.y - prev.y);
        const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
        const largeArcFlag = Math.abs(theta) > Math.PI ? 1 : 0;
        const sweepFlag = prev.bulge > 0 ? 1 : 0;
        d += ` A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${point.x} ${point.y}`;
      } else {
        d += ` L ${point.x} ${point.y}`;
      }
    }
    return d;
  };
  return [path(points), ...holes.map(path)].join(' ');
}

export function dxfCanvasSize(contours: Pick<DxfPreviewContour, 'sourceX' | 'sourceY' | 'width' | 'height'>[]) {
  const width = Math.max(1, ...contours.map((contour) => contour.sourceX + contour.width));
  const height = Math.max(1, ...contours.map((contour) => contour.sourceY + contour.height));
  return { width: width * 1.25, height: height * 1.25 };
}

export function dxfViewportForContours(contours: Pick<DxfPreviewContour, 'sourceX' | 'sourceY' | 'width' | 'height'>[]) {
  if (!contours.length) return undefined;
  const minX = Math.min(...contours.map((contour) => contour.sourceX));
  const minY = Math.min(...contours.map((contour) => contour.sourceY));
  const maxX = Math.max(...contours.map((contour) => contour.sourceX + contour.width));
  const maxY = Math.max(...contours.map((contour) => contour.sourceY + contour.height));
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

export function dxfSelectionBounds(contours: DxfPreviewContour[], contourIds: string[]) {
  const selectedSet = new Set(contourIds);
  const selected = contours.filter((contour) => selectedSet.has(contour.id));
  if (!selected.length) return undefined;
  return {
    minX: Math.min(...selected.map((contour) => contour.sourceX)),
    minY: Math.min(...selected.map((contour) => contour.sourceY)),
    maxX: Math.max(...selected.map((contour) => contour.sourceX + contour.width)),
    maxY: Math.max(...selected.map((contour) => contour.sourceY + contour.height)),
  };
}

export function rotateDxfPreviewContour(contour: DxfPreviewContour, center: DxfPoint): DxfPreviewContour {
  const rotatePoint = (point: DxfPoint) => ({
    x: center.x - (contour.sourceY + point.y - center.y),
    y: center.y + contour.sourceX + point.x - center.x,
  });
  const absolutePoints = contour.points.map(rotatePoint);
  const absoluteHoles = contour.holes.map((hole) => hole.map(rotatePoint));
  const minX = Math.min(...absolutePoints.map((point) => point.x));
  const minY = Math.min(...absolutePoints.map((point) => point.y));
  const maxX = Math.max(...absolutePoints.map((point) => point.x));
  const maxY = Math.max(...absolutePoints.map((point) => point.y));
  const normalize = (point: DxfPoint) => ({ x: point.x - minX, y: point.y - minY });
  return {
    ...contour,
    sourceX: minX,
    sourceY: minY,
    width: maxX - minX,
    height: maxY - minY,
    points: absolutePoints.map(normalize),
    holes: absoluteHoles.map((hole) => hole.map(normalize)),
  };
}

