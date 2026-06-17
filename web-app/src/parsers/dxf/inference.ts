import type { BindingAnchor, Detail, DetailShape, DetailType, EdgeProfileType } from '../../domain/types';
import { referenceData } from '../../domain/defaults';
import type { DxfPoint, DxfPreviewContour } from './types';
import { dxfArea, dxfBounds, dxfHoleSize, dxfIsConcave } from './geometry';

const SHAPE_RECT = referenceData.detailShapes[0] as DetailShape;
const SHAPE_L = referenceData.detailShapes[1] as DetailShape;
const SHAPE_U = referenceData.detailShapes[2] as DetailShape;
const SHAPE_CIRCLE = referenceData.detailShapes[3] as DetailShape;
const SHAPE_ELLIPSE = referenceData.detailShapes[4] as DetailShape;
const TYPE_COUNTERTOP = referenceData.detailTypes[0] as DetailType;
const TYPE_WALL_PANEL = referenceData.detailTypes[1] as DetailType;
const TYPE_SINK = referenceData.detailTypes[2] as DetailType;

export function inferDxfShape(contour: Pick<DxfPreviewContour, 'width' | 'height' | 'points'>): DetailShape {
  const ratio = contour.width / Math.max(contour.height, 1);
  const areaRatio = dxfArea(contour.points) / Math.max(contour.width * contour.height, 1);
  if (contour.points.length > 10 && areaRatio > 0.68 && areaRatio < 0.86) {
    return ratio > 0.86 && ratio < 1.14 ? SHAPE_CIRCLE : SHAPE_ELLIPSE;
  }
  if (dxfIsConcave(contour.points)) return contour.points.length >= 8 ? SHAPE_U : SHAPE_L;
  return SHAPE_RECT;
}

export function inferDxfType(contour: Pick<DxfPreviewContour, 'width' | 'height' | 'holes'>, sourceName = ''): DetailType {
  const name = sourceName.toLocaleLowerCase();
  if (/(мийк|sink)/u.test(name)) return TYPE_SINK;
  if (/(стін|панел|panel|фартух)/u.test(name)) return TYPE_WALL_PANEL;
  if (/(фасад|facade|front)/u.test(name)) return referenceData.detailTypes[3] as DetailType;
  const smallHoles = contour.holes.filter((hole) => dxfHoleSize(hole).min <= 100).length;
  const largeHoles = contour.holes.filter((hole) => dxfHoleSize(hole).min > 100).length;
  if (smallHoles >= 2 && largeHoles === 0) return TYPE_WALL_PANEL;
  return TYPE_COUNTERTOP;
}

export function inferDxfRole(contour: Pick<DxfPreviewContour, 'width' | 'height' | 'holes'>, sourceName = ''): 'detail' | 'thickening' | 'fold' {
  const name = sourceName.toLocaleLowerCase();
  if (/(потовщ|підклей|thicken|laminat)/u.test(name)) return 'thickening';
  if (/(підвор|fold|miter)/u.test(name)) return 'fold';
  const minSide = Math.min(contour.width, contour.height);
  const maxSide = Math.max(contour.width, contour.height);
  return contour.holes.length === 0 && minSide <= 160 && maxSide >= 350 && maxSide / Math.max(minSide, 1) >= 5 ? 'thickening' : 'detail';
}

export function inferDxfEdgeProfile(value = ''): EdgeProfileType | undefined {
  const label = value.toLocaleLowerCase();
  if (/sharknose|акул/u.test(label)) return 'sharknose';
  if (/full\s*bullnose|повн.*радіус/u.test(label)) return 'full_bullnose';
  if (/half\s*bullnose|напів.*радіус/u.test(label)) return 'half_bullnose';
  if (/r2.*(верх.*низ|top.*bottom)/u.test(label)) return 'r2_top_bottom';
  if (/r2/u.test(label)) return 'r2_top';
  if (/(фаск|chamfer).*(2\s*[x×]\s*2).*(верх.*низ|top.*bottom)/u.test(label)) return 'chamfer_2x2_top_bottom';
  if (/(фаск|chamfer).*(2\s*[x×]\s*2)/u.test(label)) return 'chamfer_2x2';
  if (/(фаск|chamfer).*(45)/u.test(label)) return 'chamfer_45_r2';
  if (/chamfered|скош/u.test(label)) return 'chamfered_edge';
  if (/прям.*полір|polished/u.test(label)) return 'polished_straight';
  if (/кром|edge/u.test(label)) return 'straight_edge';
  return undefined;
}

export function inferDxfEdgeSide(value = '') {
  return value.match(/(?:сторон[аи]?|side)\s*[:=-]?\s*([a-h])/iu)?.[1]?.toUpperCase();
}

export function detailMainDimensions(detail: Detail) {
  const g = detail.geometry;
  if (g.customPoints?.length) {
    const bounds = dxfBounds(g.customPoints);
    return [bounds.width, bounds.height];
  }
  return [
    g.width ?? g.outerWidth ?? g.ellipseWidth ?? g.diameter ?? 0,
    g.height ?? g.outerHeight ?? g.ellipseHeight ?? g.diameter ?? 0,
  ];
}

export function inferDxfParentDetailId(contour: Pick<DxfPreviewContour, 'width' | 'height'>, details: Detail[]) {
  const longSide = Math.max(contour.width, contour.height);
  const tolerance = Math.max(40, longSide * 0.03);
  return details.find((detail) => {
    const [a, b] = detailMainDimensions(detail);
    return Math.abs(a - longSide) <= tolerance || Math.abs(b - longSide) <= tolerance;
  })?.id;
}

export function dxfBindingSides(contour: DxfPreviewContour) {
  const labels = contour.shape === SHAPE_U
    ? ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'A']
    : contour.shape === SHAPE_L
      ? ['B', 'C', 'D', 'E', 'F', 'A']
      : ['B', 'C', 'D', 'A'];
  return labels.map((side, index) => ({
    side,
    start: contour.points[index],
    end: contour.points[(index + 1) % contour.points.length],
  })).filter((segment) => Boolean(segment.start && segment.end));
}

export function dxfBindingAnchorPoint(segment: { start: DxfPoint; end: DxfPoint }, anchor: BindingAnchor) {
  if (anchor === 'start') return segment.start;
  if (anchor === 'end') return segment.end;
  return {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
  };
}

export function inferDxfBindingPair(parent: DxfPreviewContour, element: DxfPreviewContour) {
  const scale = Math.max(parent.width, parent.height, element.width, element.height, 1);
  let best: {
    parentDetailSide: string;
    elementSide: string;
    parentAnchor: BindingAnchor;
    elementAnchor: BindingAnchor;
    score: number;
  } | undefined;
  dxfBindingSides(parent).forEach((parentSegment) => {
    const parentPoint = dxfBindingAnchorPoint(parentSegment, 'center');
    const parentVector = {
      x: parentSegment.end.x - parentSegment.start.x,
      y: parentSegment.end.y - parentSegment.start.y,
    };
    const parentLength = Math.max(Math.hypot(parentVector.x, parentVector.y), 1);
    dxfBindingSides(element).forEach((elementSegment) => {
      const elementPoint = dxfBindingAnchorPoint(elementSegment, 'center');
      const elementVector = {
        x: elementSegment.end.x - elementSegment.start.x,
        y: elementSegment.end.y - elementSegment.start.y,
      };
      const elementLength = Math.max(Math.hypot(elementVector.x, elementVector.y), 1);
      const parallel = Math.abs(
        (parentVector.x * elementVector.x + parentVector.y * elementVector.y)
        / (parentLength * elementLength),
      );
      const distance = Math.hypot(
        parent.sourceX + parentPoint.x - element.sourceX - elementPoint.x,
        parent.sourceY + parentPoint.y - element.sourceY - elementPoint.y,
      );
      const score = distance + (1 - parallel) * scale;
      if (!best || score < best.score) {
        best = {
          parentDetailSide: parentSegment.side,
          elementSide: elementSegment.side,
          parentAnchor: 'center',
          elementAnchor: 'center',
          score,
        };
      }
    });
  });
  return best;
}
