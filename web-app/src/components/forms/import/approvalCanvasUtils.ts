import { type DxfPoint } from '../../../parsers/dxf';
import type { ApprovalImportItem, EdgeProfileType } from '../../../utils/approvalImport';
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
      const x = ((previous.x - current.x) * (point.y - current.y)) / Math.max(0.0001, previous.y - current.y) + current.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

export function isPointInsideApprovalItem(item: ApprovalImportItem, globalPoint: DxfPoint) {
  const localPoint = { x: globalPoint.x - item.sourceX, y: globalPoint.y - item.sourceY };
  if (!isPointInsidePreviewPolygon(localPoint, item.customPoints ?? [])) return false;
  return !(item.customHoles ?? []).some((hole) => isPointInsidePreviewPolygon(localPoint, hole));
}

export function approvalFeatureOutwardNormal(item: ApprovalImportItem, middle: DxfPoint, normal: DxfPoint, size: number) {
  const probe = Math.max(6, size * 0.45);
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
  const normalA = { x: -dy / length, y: dx / length };
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const away = approvalFeatureOutwardNormal(item, middle, normalA, size);
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
  const normalA = { x: -dy / length, y: dx / length };
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const away = approvalFeatureOutwardNormal(item, middle, normalA, size);
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

export function edgeProfileShortLabel(profile: EdgeProfileType) {
  if (profile === 'T') return 'T';
  if (profile === 'A') return 'A';
  if (profile === 'V') return 'V';
  if (profile === 'Z') return 'Z';
  if (profile === 'M') return 'M';
  if (profile === 'Z-45') return 'Z45';
  if (profile === 'None') return '';
  return profile;
}

export function approvalEdgeOverlayForSide(item: ApprovalImportItem, side: string) {
  const profile = item.edgeProfiles[side];
  if (!profile) return undefined;
  const offset = Math.max(10, Math.min(item.width, item.height) * 0.035);
  if ((item.shape === SHAPE_CIRCLE || item.shape === SHAPE_ELLIPSE) && ['A', 'B', 'C', 'D'].includes(side)) {
    const rx = Math.max(1, item.width / 2 - offset);
    const ry = Math.max(1, item.height / 2 - offset);
    const cx = item.sourceX + item.width / 2;
    const cy = item.sourceY + item.height / 2;
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
  const start = segment.start;
  const end = segment.end;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const shorten = Math.min(18, length * 0.12);
  const ux = dx / length;
  const uy = dy / length;
  const normalA = { x: -dy / length, y: dx / length };
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const points = item.customPoints ?? [];
  const insideForNormal = (normal: DxfPoint) => [offset, 6, 2].some((distance) => (
    isPointInsidePreviewPolygon({ x: middle.x + normal.x * distance, y: middle.y + normal.y * distance }, points)
  ));
  const inward = insideForNormal(normalA) ? normalA : { x: -normalA.x, y: -normalA.y };
  const p1 = {
    x: item.sourceX + start.x + ux * shorten + inward.x * offset,
    y: item.sourceY + start.y + uy * shorten + inward.y * offset,
  };
  const p2 = {
    x: item.sourceX + end.x - ux * shorten + inward.x * offset,
    y: item.sourceY + end.y - uy * shorten + inward.y * offset,
  };
  return {
    path: `M${p1.x} ${p1.y} L${p2.x} ${p2.y}`,
    labelX: (p1.x + p2.x) / 2,
    labelY: (p1.y + p2.y) / 2,
    label: edgeProfileShortLabel(profile),
  };
}

export function approvalEdgeOverlaysForItem(item: ApprovalImportItem): DxfOverviewOverlay[] {
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
