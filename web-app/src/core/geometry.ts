import type { CalculationStatus, Detail, DetailPart, DetailType, Placement, Point, Rotation, UiLanguage } from '../domain/types';
import { statusLabel } from '../i18n';

export function getStatusLabel(status: CalculationStatus, language?: UiLanguage): string {
  return statusLabel(language, status);
}

export function buildDetailCounters(details: Detail[]): Map<string, number> {
  const counters = new Map<DetailType, number>();
  const result = new Map<string, number>();
  details.forEach((detail) => {
    for (let i = 0; i < detail.quantity; i += 1) {
      const next = (counters.get(detail.type) ?? 0) + 1;
      counters.set(detail.type, next);
      result.set(`${detail.id}:${i}`, next);
    }
  });
  return result;
}

export function getDimsLabel(part: DetailPart): string {
  if (part.nominalPoints?.length) {
    const bounds = polygonBounds(part.nominalPoints);
    return `${Math.round(bounds.maxX - bounds.minX)}×${Math.round(bounds.maxY - bounds.minY)}`;
  }
  return `${Math.round(part.width)}×${Math.round(part.height)}`;
}

export function normalizeRotation(rotation: Rotation): number {
  const normalized = ((rotation % 360) + 360) % 360;
  return Math.abs(normalized - 360) < 0.0001 ? 0 : normalized;
}

function isRotation(rotation: number, target: number) {
  return Math.abs(rotation - target) < 0.0001;
}

export function rotatePoint(point: Point, rotation: Rotation, width: number, height: number): Point {
  const normalized = normalizeRotation(rotation);
  if (isRotation(normalized, 90)) return { x: height - point.y, y: point.x };
  if (isRotation(normalized, 180)) return { x: width - point.x, y: height - point.y };
  if (isRotation(normalized, 270)) return { x: point.y, y: width - point.x };
  if (isRotation(normalized, 0)) return point;

  const angle = normalized * Math.PI / 180;
  const cx = width / 2;
  const cy = height / 2;
  const dx = point.x - cx;
  const dy = point.y - cy;
  return {
    x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: cy + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

export function rotatedLocalPoints(points: Point[], rotation: Rotation, width: number, height: number, referencePoints = points): Point[] {
  const rotatedReference = referencePoints.map((point) => rotatePoint(point, rotation, width, height));
  const bounds = polygonBounds(rotatedReference);
  return points
    .map((point) => rotatePoint(point, rotation, width, height))
    .map((point) => ({ x: point.x - bounds.minX, y: point.y - bounds.minY }));
}

export function rotatedPoints(part: DetailPart, rotation: Rotation): Point[] {
  return rotatedLocalPoints(part.points, rotation, part.width, part.height, part.points);
}

export function rotatedSize(part: DetailPart, rotation: Rotation) {
  const normalized = normalizeRotation(rotation);
  if (isRotation(normalized, 90) || isRotation(normalized, 270)) return { width: part.height, height: part.width };
  if (isRotation(normalized, 0) || isRotation(normalized, 180)) return { width: part.width, height: part.height };
  const bounds = polygonBounds(rotatedPoints(part, rotation));
  return { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
}

export function translatePoints(points: Point[], x: number, y: number): Point[] {
  return points.map((p) => ({ x: p.x + x, y: p.y + y }));
}

export function polygonBounds(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function placementPolygon(part: DetailPart, placement: Placement): Point[] {
  return translatePoints(rotatedPoints(part, placement.rotation), placement.x, placement.y);
}

export function pointString(points: Point[], scale = 1, offsetX = 0, offsetY = 0) {
  return points.map((p) => `${p.x * scale + offsetX},${p.y * scale + offsetY}`).join(' ');
}

export function labelFontSize(part: DetailPart, rotation: Rotation, scale = 1) {
  const size = rotatedSize(part, rotation);
  const minSide = Math.min(size.width, size.height) * scale;
  return Math.max(8, Math.min(14, minSide / 7));
}
