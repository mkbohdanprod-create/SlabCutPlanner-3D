import { ReactNode, useMemo, useState } from 'react';
import { referenceData, uid } from '../domain/defaults';
import { ChangeEvent, useEffect, useRef } from 'react';
import { BindingAnchor, Detail, DetailShape, DetailType, EdgeFeature, EdgeProfileSelection, EdgeProfileType, MaterialType, SlabInstance, UiLanguage } from '../domain/types';
import { translateStaticUiText } from '../i18n';
import { useProjectStore } from '../store/useProjectStore';
import { ApprovalImportItem, ApprovalImportPreview, parseApprovalFile } from '../utils/approvalImport';
import { DEFAULT_EDGE_PROFILE, EDGE_PROFILE_OPTIONS } from '../utils/edgeProfiles';

const rectDetailTemplateSrc = new URL('../assets/rect-detail-template.svg', import.meta.url).href;
const lDetailTemplateSrc = new URL('../assets/l-detail-template.svg', import.meta.url).href;

type ShapeKind = 'rect' | 'circle' | 'ellipse' | 'l' | 'u' | 'sink_rect' | 'sink_slot';
type CircleSizeMode = 'diameter' | 'radius';

type DetailDraft = {
  type: DetailType;
  kind: ShapeKind;
  quantity: number;
  thickness: number;
  width: number;
  height: number;
  outerWidth: number;
  outerHeight: number;
  innerHorizontal: number;
  innerVertical: number;
  wholeDetail: boolean;
  innerCutWidth: number;
  innerCutDepth: number;
  innerCutOffset: number;
  innerCutSide: 'top' | 'bottom' | 'left' | 'right';
  diameter: number;
  circleSizeMode: CircleSizeMode;
  ellipseWidth: number;
  ellipseHeight: number;
  jointVertical: boolean;
  jointHorizontal: boolean;
  jointOmegaVertical: boolean;
  jointOmegaHorizontal: boolean;
  jointLambdaVertical: boolean;
  jointLambdaHorizontal: boolean;
  thickening: EdgeFeature;
  fold: EdgeFeature;
  edgeProfiles: EdgeProfileSelection;
};

const detailTypes = referenceData.detailTypes as DetailType[];
const TYPE_COUNTERTOP = referenceData.detailTypes[0] as DetailType;
const TYPE_WALL_PANEL = referenceData.detailTypes[1] as DetailType;
const TYPE_SINK = referenceData.detailTypes[2] as DetailType;
const TYPE_SUPPORT = referenceData.detailTypes[4] as DetailType;
const SHAPE_RECT = referenceData.detailShapes[0] as DetailShape;
const SHAPE_L = referenceData.detailShapes[1] as DetailShape;
const SHAPE_U = referenceData.detailShapes[2] as DetailShape;
const SHAPE_CIRCLE = referenceData.detailShapes[3] as DetailShape;
const SHAPE_ELLIPSE = referenceData.detailShapes[4] as DetailShape;
const baseDesigns: Array<{ kind: ShapeKind; label: string; shape: DetailShape }> = [
  { kind: 'rect', label: 'Прямокутна', shape: SHAPE_RECT },
  { kind: 'circle', label: 'Коло', shape: SHAPE_CIRCLE },
  { kind: 'ellipse', label: 'Еліпс', shape: SHAPE_ELLIPSE },
  { kind: 'l', label: 'Г-подібна', shape: SHAPE_L },
  { kind: 'u', label: 'П-подібна', shape: SHAPE_U },
];
const sinkDesigns: Array<{ kind: ShapeKind; label: string; shape: DetailShape }> = [
  { kind: 'sink_rect', label: 'Мийка прямокутна', shape: SHAPE_RECT },
  { kind: 'sink_slot', label: 'Мийка щілинна', shape: SHAPE_RECT },
];
const allSides = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const curveSides = ['A', 'B', 'C', 'D'];

function feature(size: number): EdgeFeature {
  return { enabled: false, size, sides: [] };
}

function createDraft(): DetailDraft {
  return {
    type: TYPE_COUNTERTOP,
    kind: 'rect',
    quantity: 1,
    thickness: 20,
    width: 1200,
    height: 600,
    outerWidth: 1200,
    outerHeight: 900,
    innerHorizontal: 500,
    innerVertical: 400,
    wholeDetail: true,
    innerCutWidth: 800,
    innerCutDepth: 500,
    innerCutOffset: 400,
    innerCutSide: 'bottom',
    diameter: 1200,
    circleSizeMode: 'diameter',
    ellipseWidth: 1200,
    ellipseHeight: 600,
    jointVertical: false,
    jointHorizontal: false,
    jointOmegaVertical: false,
    jointOmegaHorizontal: false,
    jointLambdaVertical: false,
    jointLambdaHorizontal: false,
    thickening: feature(40),
    fold: feature(100),
    edgeProfiles: {},
  };
}

function defaultsForKind(kind: ShapeKind, previousKind?: ShapeKind): Partial<DetailDraft> {
  if (kind === previousKind) return {};
  if (kind === 'l') return { outerWidth: 1200, outerHeight: 1200, innerHorizontal: 600, innerVertical: 600 };
  if (kind === 'u') return { width: 2400, height: 1200, innerCutWidth: 1200, innerCutDepth: 600, innerCutOffset: 600 };
  if (kind === 'sink_slot') return { width: 600, height: 400, innerVertical: 150 };
  if (kind === 'sink_rect') return { width: 500, height: 400, innerVertical: 200 };
  return {};
}

function cloneFeature(value: EdgeFeature | undefined, fallbackSize = 40): EdgeFeature {
  return value ? { enabled: value.enabled, size: value.size, sides: [...value.sides] } : feature(fallbackSize);
}

function cloneEdgeProfiles(value: EdgeProfileSelection | undefined): EdgeProfileSelection {
  return value ? { ...value } : {};
}

function draftFromDetail(source: Detail): DetailDraft {
  const draft = createDraft();
  const geometry = source.geometry;
  const kind: ShapeKind = geometry.sinkKind === 'slot'
    ? 'sink_slot'
    : geometry.sinkKind === 'rect'
      ? 'sink_rect'
      : source.shape === SHAPE_L
        ? 'l'
        : source.shape === SHAPE_U
          ? 'u'
          : source.shape === SHAPE_CIRCLE
            ? 'circle'
            : source.shape === SHAPE_ELLIPSE
              ? 'ellipse'
              : 'rect';
  return {
    ...draft,
    type: source.type,
    kind,
    quantity: source.quantity,
    thickness: source.thickness,
    width: geometry.width ?? draft.width,
    height: geometry.height ?? draft.height,
    outerWidth: geometry.outerWidth ?? draft.outerWidth,
    outerHeight: geometry.outerHeight ?? draft.outerHeight,
    innerHorizontal: geometry.innerHorizontal ?? draft.innerHorizontal,
    innerVertical: geometry.innerVertical ?? draft.innerVertical,
    wholeDetail: geometry.wholeDetail ?? draft.wholeDetail,
    innerCutWidth: geometry.innerCutWidth ?? draft.innerCutWidth,
    innerCutDepth: geometry.innerCutDepth ?? draft.innerCutDepth,
    innerCutOffset: geometry.innerCutOffset ?? draft.innerCutOffset,
    innerCutSide: geometry.innerCutSide ?? draft.innerCutSide,
    diameter: geometry.diameter ?? draft.diameter,
    ellipseWidth: geometry.ellipseWidth ?? draft.ellipseWidth,
    ellipseHeight: geometry.ellipseHeight ?? draft.ellipseHeight,
    jointVertical: geometry.jointDirection === 'vertical',
    jointHorizontal: geometry.jointDirection === 'horizontal',
    jointOmegaVertical: geometry.jointOmegaDirection === 'vertical',
    jointOmegaHorizontal: geometry.jointOmegaDirection === 'horizontal',
    jointLambdaVertical: geometry.jointLambdaDirection === 'vertical',
    jointLambdaHorizontal: geometry.jointLambdaDirection === 'horizontal',
    thickening: cloneFeature(source.thickening),
    fold: cloneFeature(source.fold, 100),
    edgeProfiles: cloneEdgeProfiles(source.edgeProfiles),
  };
}

type DxfPoint = { x: number; y: number; bulge?: number };
type DxfContour = { points: DxfPoint[]; width: number; height: number; area: number; center: DxfPoint; layer: string };
type DxfTextLabel = { text: string; point: DxfPoint; layer: string };
type DxfImportRole = 'detail' | 'thickening' | 'fold';
type DxfBindingStep = 'detail' | 'element' | 'detailSide' | 'elementSide' | 'detailAnchor' | 'elementAnchor';
type DxfPreviewContour = {
  id: string;
  width: number;
  height: number;
  name: string;
  points: DxfPoint[];
  holes: DxfPoint[][];
  sideSegments?: Record<string, { start: DxfPoint; end: DxfPoint }>;
  type: DetailType;
  shape: DetailShape;
  role: DxfImportRole;
  parentDetailId?: string;
  parentDetailSide?: string;
  elementSide?: string;
  parentAnchor?: BindingAnchor;
  elementAnchor?: BindingAnchor;
  sourceX: number;
  sourceY: number;
  groupId: string;
  layer: string;
  edgeProfiles: EdgeProfileSelection;
};
type DxfBindingSession = {
  step: DxfBindingStep;
  parentDetailId?: string;
  elementId?: string;
  parentDetailSide?: string;
  elementSide?: string;
  parentAnchor?: BindingAnchor;
};
type DxfBlockDraft = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};
type DxfModalResize = {
  edge: 'right' | 'bottom' | 'corner';
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
};
type DxfPreviewDrag = {
  startX: number;
  startY: number;
  contourIds: string[];
  origins: Record<string, { x: number; y: number }>;
};
type ParsedDxfContour = Pick<DxfPreviewContour, 'width' | 'height' | 'points' | 'holes' | 'sourceX' | 'sourceY' | 'groupId' | 'layer'> & {
  suggestedName?: string;
  suggestedEdgeProfile?: EdgeProfileType;
  suggestedEdgeSide?: string;
};
type ParsedDxfFile = { contours: ParsedDxfContour[]; layers: string[] };

const DXF_ROLE_LABELS: Record<DxfImportRole, string> = {
  detail: 'Деталь',
  thickening: 'Потовщення',
  fold: 'Підворот',
};

function dxfHoleSize(hole: DxfPoint[]) {
  const bounds = dxfBounds(hole);
  return { min: Math.min(bounds.width, bounds.height), max: Math.max(bounds.width, bounds.height) };
}

function dxfIsConcave(points: DxfPoint[]) {
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

function inferDxfShape(contour: Pick<DxfPreviewContour, 'width' | 'height' | 'points'>): DetailShape {
  const ratio = contour.width / Math.max(contour.height, 1);
  const areaRatio = dxfArea(contour.points) / Math.max(contour.width * contour.height, 1);
  if (contour.points.length > 10 && areaRatio > 0.68 && areaRatio < 0.86) {
    return ratio > 0.86 && ratio < 1.14 ? SHAPE_CIRCLE : SHAPE_ELLIPSE;
  }
  if (dxfIsConcave(contour.points)) return contour.points.length >= 8 ? SHAPE_U : SHAPE_L;
  return SHAPE_RECT;
}

function inferDxfType(contour: Pick<DxfPreviewContour, 'width' | 'height' | 'holes'>, sourceName = ''): DetailType {
  const name = sourceName.toLocaleLowerCase();
  if (/(мийк|sink)/u.test(name)) return TYPE_SINK;
  if (/(стін|панел|panel|фартух)/u.test(name)) return TYPE_WALL_PANEL;
  if (/(фасад|facade|front)/u.test(name)) return referenceData.detailTypes[3] as DetailType;
  const smallHoles = contour.holes.filter((hole) => dxfHoleSize(hole).min <= 100).length;
  const largeHoles = contour.holes.filter((hole) => dxfHoleSize(hole).min > 100).length;
  if (smallHoles >= 2 && largeHoles === 0) return TYPE_WALL_PANEL;
  return TYPE_COUNTERTOP;
}

function inferDxfRole(contour: Pick<DxfPreviewContour, 'width' | 'height' | 'holes'>, sourceName = ''): DxfImportRole {
  const name = sourceName.toLocaleLowerCase();
  if (/(потовщ|підклей|thicken|laminat)/u.test(name)) return 'thickening';
  if (/(підвор|fold|miter)/u.test(name)) return 'fold';
  const minSide = Math.min(contour.width, contour.height);
  const maxSide = Math.max(contour.width, contour.height);
  return contour.holes.length === 0 && minSide <= 160 && maxSide >= 350 && maxSide / Math.max(minSide, 1) >= 5 ? 'thickening' : 'detail';
}

function detailMainDimensions(detail: Detail) {
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

function inferDxfParentDetailId(contour: Pick<DxfPreviewContour, 'width' | 'height'>, details: Detail[]) {
  const longSide = Math.max(contour.width, contour.height);
  const tolerance = Math.max(40, longSide * 0.03);
  return details.find((detail) => {
    const [a, b] = detailMainDimensions(detail);
    return Math.abs(a - longSide) <= tolerance || Math.abs(b - longSide) <= tolerance;
  })?.id;
}

function dxfBounds(points: DxfPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function dxfArea(points: DxfPoint[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2);
}

function dxfPointInPolygon(point: DxfPoint, polygon: DxfPoint[]) {
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

function dxfIsClosed(points: DxfPoint[]) {
  if (points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(first.x - last.x, first.y - last.y) < 0.5;
}

function expandDxfBulges(points: DxfPoint[]) {
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

function dxfContour(points: DxfPoint[]): Omit<DxfContour, 'layer'> | undefined {
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

function normalizeDxfLabel(value: string) {
  return value.replace(/\\P/gi, ' ').replace(/\{\\[^;]+;/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

function semanticDxfLabel(value: string) {
  return /(стільниц|мийк|фасад|плінтус|бортик|торець|потовщ|підклей|підвор|стін|панел|опор|кром|фаск|countertop|sink|facade|plinth|edge|fold|thicken|panel|chamfer|bullnose|sharknose|r2)/iu.test(value);
}

function likelyDimensionArrow(contour: DxfContour) {
  const vertices = dxfIsClosed(contour.points) ? contour.points.slice(0, -1) : contour.points;
  return vertices.length === 3 && contour.width <= 40 && contour.height <= 40 && contour.area <= 800;
}

function contourGap(a: ReturnType<typeof dxfBounds>, b: ReturnType<typeof dxfBounds>) {
  const dx = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
  const dy = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY));
  return Math.hypot(dx, dy);
}

function dxfEntityLayer(lines: string[], entityIndex: number) {
  for (let index = entityIndex + 1; index < lines.length; index += 2) {
    const code = lines[index];
    const value = lines[index + 1];
    if (!value || code === '0') break;
    if (code === '8') return value || '0';
  }
  return '0';
}

function inferDxfEdgeProfile(value = ''): EdgeProfileType | undefined {
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

function inferDxfEdgeSide(value = '') {
  return value.match(/(?:сторон[аи]?|side)\s*[:=-]?\s*([a-h])/iu)?.[1]?.toUpperCase();
}

function parseDxfContours(text: string): ParsedDxfFile {
  const sourceLines = text.split(/\r?\n/).map((line) => line.trim());
  const entitiesIndex = sourceLines.findIndex((line) => line === 'ENTITIES');
  const entitiesEnd = entitiesIndex >= 0
    ? sourceLines.findIndex((line, index) => index > entitiesIndex && line === 'ENDSEC')
    : -1;
  const lines = entitiesIndex >= 0 && entitiesEnd > entitiesIndex
    ? sourceLines.slice(entitiesIndex + 1, entitiesEnd)
    : sourceLines;
  const contours: DxfContour[] = [];
  const labels: DxfTextLabel[] = [];
  const layers = new Set<string>();

  for (let i = 0; i < lines.length; i += 1) {
    const layer = dxfEntityLayer(lines, i);
    if (lines[i - 1] === '0') layers.add(layer);

    if (lines[i] === 'TEXT' || lines[i] === 'MTEXT') {
      const content: string[] = [];
      let x: number | undefined;
      let y: number | undefined;
      for (let j = i + 1; j < lines.length; j += 2) {
        const code = lines[j];
        const value = lines[j + 1];
        if (!value || code === '0') break;
        if (code === '1' || code === '3') content.push(value);
        if (code === '10') x = Number(value);
        if (code === '20') y = Number(value);
      }
      const label = normalizeDxfLabel(content.join(' '));
      if (label && semanticDxfLabel(label) && Number.isFinite(x) && Number.isFinite(y)) {
        labels.push({ text: label, point: { x: x as number, y: y as number }, layer });
      }
    }

    if (lines[i] === 'LWPOLYLINE') {
      const points: DxfPoint[] = [];
      let closed = false;
      for (let j = i + 1; j < lines.length; j += 2) {
        const code = lines[j];
        const value = lines[j + 1];
        if (!value || code === '0') break;
        if (code === '70') closed = (Number(value) & 1) === 1;
        if (code === '10') {
          const x = Number(value);
          let y: number | undefined;
          let bulge = 0;
          for (let k = j + 2; k < Math.min(lines.length, j + 12); k += 2) {
            if (lines[k] === '20') {
              y = Number(lines[k + 1]);
            }
            if (lines[k] === '42') bulge = Number(lines[k + 1]);
            if (lines[k] === '0' || lines[k] === '10') break;
          }
          if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y: y as number, bulge });
        }
      }
      const contour = (closed || dxfIsClosed(points)) ? dxfContour(points) : undefined;
      if (contour) contours.push({ ...contour, layer });
    }

    if (lines[i] === 'POLYLINE') {
      const points: DxfPoint[] = [];
      let closed = false;
      for (let j = i + 1; j < lines.length; j += 2) {
        const code = lines[j];
        const value = lines[j + 1];
        if (code === '0' && value === 'SEQEND') {
          i = j;
          break;
        }
        if (code === '70') closed = (Number(value) & 1) === 1;
        if (code === '0' && value === 'VERTEX') {
          let x: number | undefined;
          let y: number | undefined;
          let bulge = 0;
          for (let k = j + 2; k < lines.length; k += 2) {
            const vertexCode = lines[k];
            const vertexValue = lines[k + 1];
            if (vertexCode === '0') break;
            if (vertexCode === '10') x = Number(vertexValue);
            if (vertexCode === '20') y = Number(vertexValue);
            if (vertexCode === '42') bulge = Number(vertexValue);
          }
          if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x: x as number, y: y as number, bulge });
        }
      }
      const contour = (closed || dxfIsClosed(points)) ? dxfContour(points) : undefined;
      if (contour) contours.push({ ...contour, layer });
    }

    if (lines[i] === 'CIRCLE') {
      let cx: number | undefined;
      let cy: number | undefined;
      let radius: number | undefined;
      for (let j = i + 1; j < lines.length; j += 2) {
        const code = lines[j];
        const value = lines[j + 1];
        if (!value || code === '0') break;
        if (code === '10') cx = Number(value);
        if (code === '20') cy = Number(value);
        if (code === '40') radius = Number(value);
      }
      if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(radius) && (radius as number) > 0) {
        const points = Array.from({ length: 32 }, (_, index) => {
          const angle = (Math.PI * 2 * index) / 32;
          return {
            x: (cx as number) + Math.cos(angle) * (radius as number),
            y: (cy as number) + Math.sin(angle) * (radius as number),
          };
        });
        const contour = dxfContour(points);
        if (contour) contours.push({ ...contour, layer });
      }
    }
  }

  const filteredContours = contours.filter((contour) => !likelyDimensionArrow(contour));
  const depthOf = (contour: DxfContour) => filteredContours.filter((other) => (
    other !== contour
    && other.area > contour.area
    && dxfPointInPolygon(contour.center, other.points)
  )).length;

  const outerContours = filteredContours
    .filter((contour) => depthOf(contour) % 2 === 0)
    .sort((a, b) => b.area - a.area);
  if (!outerContours.length) return { contours: [], layers: [...layers].sort() };

  const documentBounds = outerContours.reduce((bounds, contour) => {
    const contourBounds = dxfBounds(contour.points);
    return {
      minX: Math.min(bounds.minX, contourBounds.minX),
      minY: Math.min(bounds.minY, contourBounds.minY),
      maxX: Math.max(bounds.maxX, contourBounds.maxX),
      maxY: Math.max(bounds.maxY, contourBounds.maxY),
    };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

  const assignedGroups = new Map<DxfContour, string>();
  let groupNumber = 0;
  outerContours.forEach((start) => {
    if (assignedGroups.has(start)) return;
    groupNumber += 1;
    const groupId = `DXF група ${groupNumber}`;
    const queue = [start];
    assignedGroups.set(start, groupId);
    while (queue.length) {
      const current = queue.shift() as DxfContour;
      const currentBounds = dxfBounds(current.points);
      outerContours.forEach((candidate) => {
        if (assignedGroups.has(candidate)) return;
        if (contourGap(currentBounds, dxfBounds(candidate.points)) <= 160) {
          assignedGroups.set(candidate, groupId);
          queue.push(candidate);
        }
      });
    }
  });

  return {
    layers: [...layers].sort(),
    contours: outerContours.map((contour) => {
      const bounds = dxfBounds(contour.points);
      const depth = depthOf(contour);
      const holes = filteredContours
        .filter((candidate) => (
          depthOf(candidate) === depth + 1
          && candidate.area < contour.area
          && dxfPointInPolygon(candidate.center, contour.points)
        ))
        .map((hole) => hole.points.map((point) => ({ x: point.x - bounds.minX, y: bounds.maxY - point.y })));
      const insideLabels = labels.filter((label) => dxfPointInPolygon(label.point, contour.points));
      const nearbyLabels = labels
          .map((label) => ({ label, distance: Math.hypot(label.point.x - contour.center.x, label.point.y - contour.center.y) }))
          .filter((item) => item.distance <= Math.max(contour.width, contour.height) * 0.75 + 120)
          .sort((a, b) => a.distance - b.distance);
      const sourceLabel = insideLabels.find((label) => label.layer === contour.layer)
        ?? insideLabels[0]
        ?? nearbyLabels.find((item) => item.label.layer === contour.layer)?.label
        ?? nearbyLabels[0]?.label;
      const semanticLayerName = semanticDxfLabel(contour.layer) ? contour.layer : undefined;
      const semanticSource = sourceLabel?.text ?? semanticLayerName;
      return {
        width: contour.width,
        height: contour.height,
        points: contour.points.map((point) => ({ x: point.x - bounds.minX, y: bounds.maxY - point.y })),
        holes,
        sourceX: bounds.minX - documentBounds.minX,
        sourceY: documentBounds.maxY - bounds.maxY,
        groupId: assignedGroups.get(contour) ?? 'DXF група 1',
        layer: contour.layer,
        suggestedName: semanticSource,
        suggestedEdgeProfile: inferDxfEdgeProfile(semanticSource),
        suggestedEdgeSide: inferDxfEdgeSide(semanticSource),
      };
    }),
  };
}

function dxfSvgPath(points: DxfPoint[], holes: DxfPoint[][] = []) {
  const path = (items: DxfPoint[]) => items.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ') + ' Z';
  return [path(points), ...holes.map(path)].join(' ');
}

function DxfPreviewShape({ contour }: { contour: DxfPreviewContour }) {
  const pad = Math.max(contour.width, contour.height) * 0.08;
  return (
    <svg className="dxf-preview-shape" viewBox={`${-pad} ${-pad} ${contour.width + pad * 2} ${contour.height + pad * 2}`} aria-hidden="true">
      <path d={dxfSvgPath(contour.points, contour.holes)} fillRule="evenodd" />
    </svg>
  );
}

function dxfBindingSides(contour: DxfPreviewContour) {
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

function dxfBindingAnchorPoint(segment: { start: DxfPoint; end: DxfPoint }, anchor: BindingAnchor) {
  if (anchor === 'start') return segment.start;
  if (anchor === 'end') return segment.end;
  return {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
  };
}

function inferDxfBindingPair(parent: DxfPreviewContour, element: DxfPreviewContour) {
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

function dxfCanvasSize(contours: Pick<DxfPreviewContour, 'sourceX' | 'sourceY' | 'width' | 'height'>[]) {
  const width = Math.max(1, ...contours.map((contour) => contour.sourceX + contour.width));
  const height = Math.max(1, ...contours.map((contour) => contour.sourceY + contour.height));
  return { width: width * 1.25, height: height * 1.25 };
}

function dxfViewportForContours(contours: Pick<DxfPreviewContour, 'sourceX' | 'sourceY' | 'width' | 'height'>[]) {
  if (!contours.length) return undefined;
  const minX = Math.min(...contours.map((contour) => contour.sourceX));
  const minY = Math.min(...contours.map((contour) => contour.sourceY));
  const maxX = Math.max(...contours.map((contour) => contour.sourceX + contour.width));
  const maxY = Math.max(...contours.map((contour) => contour.sourceY + contour.height));
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function dxfSelectionBounds(contours: DxfPreviewContour[], contourIds: string[]) {
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

function rotateDxfPreviewContour(contour: DxfPreviewContour, center: DxfPoint): DxfPreviewContour {
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

function DxfOverview({
  contours,
  binding,
  blockMode,
  blockDraft,
  selectedContourIds,
  canvasSize,
  viewport,
  dragging,
  zoom,
  onContourClick,
  onContourDragStart,
  onContourDoubleClick,
  onCanvasDragMove,
  onCanvasDragFinish,
  onClearSelection,
  onSideClick,
  onAnchorClick,
  onBlockStart,
  onBlockMove,
  onBlockFinish,
}: {
  contours: DxfPreviewContour[];
  binding: DxfBindingSession | null;
  blockMode: boolean;
  blockDraft: DxfBlockDraft | null;
  selectedContourIds: string[];
  canvasSize: { width: number; height: number };
  viewport?: { x: number; y: number; width: number; height: number };
  dragging: boolean;
  zoom: number;
  onContourClick: (contour: DxfPreviewContour) => void;
  onContourDragStart: (contour: DxfPreviewContour, point: DxfPoint, additive: boolean) => void;
  onContourDoubleClick: (contour: DxfPreviewContour) => void;
  onCanvasDragMove: (point: DxfPoint) => void;
  onCanvasDragFinish: () => void;
  onClearSelection: () => void;
  onSideClick: (contourId: string, side: string) => void;
  onAnchorClick: (anchor: BindingAnchor) => void;
  onBlockStart: (point: DxfPoint) => void;
  onBlockMove: (point: DxfPoint) => void;
  onBlockFinish: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const width = viewport?.width ?? canvasSize.width;
  const height = viewport?.height ?? canvasSize.height;
  const originX = viewport?.x ?? 0;
  const originY = viewport?.y ?? 0;
  const pad = Math.max(width, height) * 0.04;
  const safeZoom = Math.max(zoom, 0.35);
  const parent = contours.find((contour) => contour.id === binding?.parentDetailId);
  const element = contours.find((contour) => contour.id === binding?.elementId);
  const sideTarget = binding?.step === 'detailSide' ? parent : binding?.step === 'elementSide' ? element : undefined;
  const anchorTarget = binding?.step === 'detailAnchor' ? parent : binding?.step === 'elementAnchor' ? element : undefined;
  const anchorSide = binding?.step === 'detailAnchor' ? binding.parentDetailSide : binding?.elementSide;
  const anchorSegment = anchorTarget && dxfBindingSides(anchorTarget).find((segment) => segment.side === anchorSide);
  const selectedEdges = [
    parent && binding?.parentDetailSide ? { contour: parent, side: binding.parentDetailSide } : undefined,
    element && binding?.elementSide ? { contour: element, side: binding.elementSide } : undefined,
  ].filter(Boolean) as Array<{ contour: DxfPreviewContour; side: string }>;
  const selectedContourSet = new Set(selectedContourIds);
  const blockPoint = (event: React.MouseEvent<SVGElement>) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return undefined;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  };
  const completedBindings = contours.flatMap((contour) => {
    const linkedParent = contour.parentDetailId ? contours.find((item) => item.id === contour.parentDetailId) : undefined;
    const parentSegment = linkedParent && contour.parentDetailSide
      ? dxfBindingSides(linkedParent).find((segment) => segment.side === contour.parentDetailSide)
      : undefined;
    const elementSegment = contour.elementSide
      ? dxfBindingSides(contour).find((segment) => segment.side === contour.elementSide)
      : undefined;
    if (!linkedParent || !parentSegment || !elementSegment) return [];
    const parentPoint = dxfBindingAnchorPoint(parentSegment, contour.parentAnchor ?? 'center');
    const elementPoint = dxfBindingAnchorPoint(elementSegment, contour.elementAnchor ?? 'center');
    return [{
      id: contour.id,
      start: { x: linkedParent.sourceX + parentPoint.x, y: linkedParent.sourceY + parentPoint.y },
      end: { x: contour.sourceX + elementPoint.x, y: contour.sourceY + elementPoint.y },
      startVector: { x: parentSegment.end.x - parentSegment.start.x, y: parentSegment.end.y - parentSegment.start.y },
      endVector: { x: elementSegment.end.x - elementSegment.start.x, y: elementSegment.end.y - elementSegment.start.y },
    }];
  });
  const blockGroupIds = new Set(contours.filter((contour) => contour.groupId.startsWith('DXF блок ')).map((contour) => contour.groupId));
  return (
    <svg
      ref={svgRef}
      className={blockMode ? 'dxf-overview block-mode' : 'dxf-overview'}
      style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
      viewBox={`${originX - pad} ${originY - pad} ${width + pad * 2} ${height + pad * 2}`}
      aria-label="Композиція DXF"
      onMouseDown={(event) => {
        if (!blockMode) {
          if (event.target === event.currentTarget) onClearSelection();
          return;
        }
        event.preventDefault();
        const point = blockPoint(event);
        if (point) onBlockStart(point);
      }}
      onMouseMove={(event) => {
        const point = blockPoint(event);
        if (!point) return;
        if (blockMode && blockDraft) onBlockMove(point);
        else if (dragging) onCanvasDragMove(point);
      }}
      onMouseUp={() => {
        if (blockMode && blockDraft) onBlockFinish();
        else if (dragging) onCanvasDragFinish();
      }}
      onMouseLeave={() => {
        if (blockMode && blockDraft) onBlockFinish();
        else if (dragging) onCanvasDragFinish();
      }}
    >
      {contours.map((contour) => (
        <g key={contour.id} transform={`translate(${contour.sourceX} ${contour.sourceY})`}>
          <path
            className={[
              'dxf-overview-contour',
              binding?.parentDetailId === contour.id ? 'binding-detail' : '',
              binding?.elementId === contour.id ? 'binding-element' : '',
              contour.parentDetailId ? 'bound-element' : '',
              binding && (
                binding.step === 'detail'
                || (binding.step === 'element' && contour.id !== binding.parentDetailId)
              ) ? 'selectable' : '',
              selectedContourSet.has(contour.id) ? 'block-selected' : '',
              !binding && !blockMode ? 'draggable' : '',
            ].filter(Boolean).join(' ')}
            d={dxfSvgPath(contour.points, contour.holes)}
            fillRule="evenodd"
            onMouseDown={(event) => {
              if (binding || blockMode) return;
              event.stopPropagation();
              const point = blockPoint(event);
              if (point) onContourDragStart(contour, point, event.ctrlKey || event.metaKey);
            }}
            onClick={() => {
              if (!blockMode) onContourClick(contour);
            }}
            onDoubleClick={(event) => {
              if (binding || blockMode) return;
              event.stopPropagation();
              onContourDoubleClick(contour);
            }}
          />
          <text x={contour.width / 2} y={contour.height / 2}>{contour.name}</text>
          {blockGroupIds.has(contour.groupId) && (
            <text className="dxf-block-mark" style={{ fontSize: `${24 / safeZoom}px` }} x={12 / safeZoom} y={18 / safeZoom}>≡</text>
          )}
        </g>
      ))}
      {completedBindings.map((link) => {
        const markLength = 18 / safeZoom;
        const markSpacing = 7 / safeZoom;
        const ticks = (
          point: DxfPoint,
          vector: DxfPoint,
          prefix: string,
        ) => {
          const vectorLength = Math.max(Math.hypot(vector.x, vector.y), 1);
          const tangent = { x: vector.x / vectorLength, y: vector.y / vectorLength };
          const normal = { x: -tangent.y, y: tangent.x };
          return [-1, 0, 1].map((offset) => {
            const x = point.x + tangent.x * markSpacing * offset;
            const y = point.y + tangent.y * markSpacing * offset;
            return (
              <line
                key={`${prefix}-${offset}`}
                className="dxf-link-tick"
                x1={x - normal.x * markLength / 2}
                y1={y - normal.y * markLength / 2}
                x2={x + normal.x * markLength / 2}
                y2={y + normal.y * markLength / 2}
              />
            );
          });
        };
        return (
          <g key={`binding-${link.id}`} className="dxf-completed-binding">
            <line className="dxf-link-guide" x1={link.start.x} y1={link.start.y} x2={link.end.x} y2={link.end.y} />
            {ticks(link.start, link.startVector, 'start')}
            {ticks(link.end, link.endVector, 'end')}
          </g>
        );
      })}
      {selectedEdges.map(({ contour, side }) => {
        const segment = dxfBindingSides(contour).find((item) => item.side === side);
        if (!segment) return null;
        return (
          <line
            key={`selected-${contour.id}-${side}`}
            className="dxf-binding-side selected"
            x1={contour.sourceX + segment.start.x}
            y1={contour.sourceY + segment.start.y}
            x2={contour.sourceX + segment.end.x}
            y2={contour.sourceY + segment.end.y}
          />
        );
      })}
      {sideTarget && dxfBindingSides(sideTarget).map((segment) => (
        <g key={`choose-${sideTarget.id}-${segment.side}`}>
          <line
            className="dxf-binding-side candidate"
            x1={sideTarget.sourceX + segment.start.x}
            y1={sideTarget.sourceY + segment.start.y}
            x2={sideTarget.sourceX + segment.end.x}
            y2={sideTarget.sourceY + segment.end.y}
          />
          <line
            className="dxf-binding-side-hit"
            x1={sideTarget.sourceX + segment.start.x}
            y1={sideTarget.sourceY + segment.start.y}
            x2={sideTarget.sourceX + segment.end.x}
            y2={sideTarget.sourceY + segment.end.y}
            onClick={() => onSideClick(sideTarget.id, segment.side)}
          />
        </g>
      ))}
      {anchorTarget && anchorSegment && (['start', 'center', 'end'] as BindingAnchor[]).map((anchor) => {
        const point = dxfBindingAnchorPoint(anchorSegment, anchor);
        return (
          <circle
            key={`anchor-${anchorTarget.id}-${anchor}`}
            className="dxf-binding-anchor"
            cx={anchorTarget.sourceX + point.x}
            cy={anchorTarget.sourceY + point.y}
            r={6 / safeZoom}
            onClick={() => onAnchorClick(anchor)}
          />
        );
      })}
      {blockDraft && (
        <rect
          className="dxf-block-draft"
          x={Math.min(blockDraft.startX, blockDraft.currentX)}
          y={Math.min(blockDraft.startY, blockDraft.currentY)}
          width={Math.abs(blockDraft.currentX - blockDraft.startX)}
          height={Math.abs(blockDraft.currentY - blockDraft.startY)}
        />
      )}
    </svg>
  );
}

function ImportedDetailPreview({ detail, linkedElements }: { detail: Detail; linkedElements: Detail[] }) {
  const points = detail.geometry.customPoints ?? [];
  const holes = detail.geometry.customHoles ?? [];
  const bounds = dxfBounds(points);
  const pad = Math.max(bounds.width, bounds.height) * 0.08;
  return (
    <section className="imported-detail-editor">
      <h3>Імпортований контур DXF</h3>
      <p>Геометрія та вирізи зберігаються без приведення до шаблонної форми.</p>
      <svg viewBox={`${bounds.minX - pad} ${bounds.minY - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`} aria-label="Імпортована деталь">
        <path d={dxfSvgPath(points, holes)} fillRule="evenodd" />
      </svg>
      <span>{Math.round(bounds.width)}×{Math.round(bounds.height)} мм</span>
      {linkedElements.length > 0 && (
        <div className="imported-linked-elements">
          <strong>Прив'язані елементи</strong>
          {linkedElements.map((element) => (
            <span key={element.id}>
              {element.importRole === 'fold' ? 'Підворот' : 'Потовщення'}: {element.label || 'DXF контур'}
              {element.parentDetailSide ? `, сторона ${element.parentDetailSide}` : ''}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function approvalItemPoints(item: ApprovalImportItem): DxfPoint[] {
  if (item.customPoints?.length) return item.customPoints;
  return [];
}

function approvalItemHasExtractedGeometry(item: ApprovalImportItem) {
  return item.importStatus !== 'Error'
    && item.geometrySource !== 'none'
    && item.shapeMode === 'customContour'
    && Boolean(item.customPoints?.length)
    && item.dimensions.length > 0
    && Boolean(item.debug.sourcePage)
    && Boolean(item.debug.sourceImageRegion);
}

function approvalPreviewDebugDumpFromState(preview: ApprovalImportPreview): ApprovalImportPreview['debugDump'] {
  return {
    pipelineVersion: preview.pipelineVersion,
    approvalImportBuildId: preview.approvalImportBuildId,
    sourceFileName: preview.fileName,
    orderNumber: preview.orderNumber || null,
    customer: preview.customer || null,
    products: preview.items.map((item) => ({
      productNumber: item.sourceProductNumber,
      productName: item.name,
      sourcePage: item.debug.sourcePage ?? null,
      sourceImageRegion: item.debug.sourceImageRegion
        ? {
          x: item.debug.sourceImageRegion.x,
          y: item.debug.sourceImageRegion.y,
          width: item.debug.sourceImageRegion.width,
          height: item.debug.sourceImageRegion.height,
        }
        : null,
      detectedDimensions: item.dimensions.map((dimension) => ({
        label: dimension.side,
        valueMm: dimension.value,
        rawText: dimension.source,
      })),
      detectedSpecificationRows: item.rows.map((row) => ({
        side: row.side,
        type: row.elementType,
        height: row.height,
        width: row.width,
        form: row.profile,
      })),
      detectedGeometry: {
        source: item.geometrySource,
        outerContourPointsMm: item.customPoints ?? [],
        holesMm: item.customHoles ?? [],
        jointsMm: [],
        boundingBoxMm: { width: item.width, height: item.height },
      },
      finalDetail: {
        id: item.id,
        name: item.name,
        kind: item.type,
        shapeMode: item.shapeMode,
        widthMm: item.width,
        heightMm: item.height,
        contourPoints: item.customPoints ?? [],
        holes: item.customHoles ?? [],
        joints: [],
      },
      validation: {
        status: item.importStatus,
        warnings: item.warnings,
      },
      dimensionsSource: item.dimensionsSource,
      shapeMode: item.shapeMode,
      contourPointsCount: item.customPoints?.length ?? 0,
      finalImportAllowed: approvalItemHasExtractedGeometry(item),
      blockedReason: approvalItemHasExtractedGeometry(item)
        ? null
        : item.warnings.find((warning) => warning.includes('Geometry not extracted')) ?? 'No real contour extracted',
    })),
  };
}

function approvalPreviewDebugSummary(preview: ApprovalImportPreview) {
  const lines = [
    `BuildId: ${preview.approvalImportBuildId}`,
    `Pipeline: ${preview.pipelineVersion}`,
    `File: ${preview.fileName}`,
  ];
  preview.items.forEach((item) => {
    lines.push(
      `Product ${item.sourceProductNumber}: ${item.name}`,
      `sourcePage: ${item.debug.sourcePage ?? 'null'}`,
      `sourceImageRegion: ${item.debug.sourceImageRegion ? JSON.stringify(item.debug.sourceImageRegion) : 'null'}`,
      `dimensions: ${item.dimensions.length ? item.dimensions.map((dimension) => `${dimension.side}=${dimension.value}`).join(', ') : '[]'}`,
      `geometrySource: ${item.geometrySource}`,
      `shapeMode: ${item.shapeMode}`,
      `width/height: ${Math.round(item.width)}x${Math.round(item.height)}`,
      `contourPointsCount: ${item.customPoints?.length ?? 0}`,
      `finalImportAllowed: ${approvalItemHasExtractedGeometry(item)}`,
      `blockedReason: ${approvalItemHasExtractedGeometry(item) ? 'null' : item.warnings.find((warning) => warning.includes('Geometry not extracted')) ?? 'No real contour extracted'}`,
      `validation: ${item.importStatus}`,
    );
  });
  return lines.join('\n');
}

function ApprovalItemCrop({ item }: { item: ApprovalImportItem }) {
  if (!item.sourcePreview) return <span className="approval-error-text">Drawing crop was not found.</span>;
  const hasContour = Boolean(item.customPoints?.length);
  const viewWidth = hasContour
    ? Math.max(1, item.width, item.sourcePreview.x + item.sourcePreview.width)
    : Math.max(1, item.sourcePreview.width);
  const viewHeight = hasContour
    ? Math.max(1, item.height, item.sourcePreview.y + item.sourcePreview.height)
    : Math.max(1, item.sourcePreview.height);
  return (
    <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} aria-label="Crop креслення з PDF">
      <image
        href={item.sourcePreview.image}
        x={hasContour ? item.sourcePreview.x : 0}
        y={hasContour ? item.sourcePreview.y : 0}
        width={item.sourcePreview.width}
        height={item.sourcePreview.height}
        preserveAspectRatio="none"
      />
      {hasContour ? <path d={dxfSvgPath(approvalItemPoints(item), item.customHoles ?? [])} fillRule="evenodd" /> : null}
    </svg>
  );
}

function ApprovalOverview({ items }: { items: ApprovalImportItem[] }) {
  const drawableItems = items.filter(approvalItemHasExtractedGeometry);
  const width = Math.max(1, ...drawableItems.map((item) => item.sourceX + item.width));
  const height = Math.max(1, ...drawableItems.map((item) => item.sourceY + item.height));
  const pad = Math.max(60, Math.max(width, height) * 0.04);
  return (
    <svg className="approval-overview" viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`} aria-label="Схема імпорту бланку погодження">
      {drawableItems.map((item) => (
        <g key={item.id} transform={`translate(${item.sourceX} ${item.sourceY})`}>
          {item.sourcePreview && (
            <image
              href={item.sourcePreview.image}
              x={item.sourcePreview.x}
              y={item.sourcePreview.y}
              width={item.sourcePreview.width}
              height={item.sourcePreview.height}
              opacity="0.28"
              preserveAspectRatio="none"
            />
          )}
          <path d={dxfSvgPath(approvalItemPoints(item), item.customHoles ?? [])} fillRule="evenodd" />
          <text x={item.width / 2} y={item.height / 2}>{item.name}</text>
          {item.importStatus !== 'OK' && <text className="approval-overview-note" x={item.width / 2} y={item.height / 2 - 24}>{item.importStatus}</text>}
          {Object.keys(item.edgeProfiles).length > 0 && <text className="approval-overview-note" x={item.width / 2} y={item.height / 2 + 22}>Кромки: {Object.keys(item.edgeProfiles).join(', ')}</text>}
          {item.thickening.sides.length > 0 && <text className="approval-overview-note" x={item.width / 2} y={item.height / 2 + 40}>Потовщення: {item.thickening.sides.join(', ')}</text>}
          {item.fold.sides.length > 0 && <text className="approval-overview-note" x={item.width / 2} y={item.height / 2 + 58}>Підворот: {item.fold.sides.join(', ')}</text>}
        </g>
      ))}
    </svg>
  );
}

function designsForType(type: DetailType) {
  if (type === TYPE_SINK) return sinkDesigns;
  if (type === TYPE_COUNTERTOP) return baseDesigns;
  return baseDesigns.filter((item) => item.kind === 'rect');
}

function designForKind(kind: ShapeKind) {
  return [...baseDesigns, ...sinkDesigns].find((item) => item.kind === kind) ?? baseDesigns[0];
}

function sideOptionsFor(kind: ShapeKind) {
  if (kind === 'circle' || kind === 'ellipse') return curveSides;
  if (kind === 'u') return allSides;
  if (kind === 'l') return ['A', 'B', 'C', 'D', 'E', 'F'];
  return ['A', 'B', 'C', 'D'];
}

function supportsEdges(type: DetailType) {
  return type === TYPE_COUNTERTOP || type === TYPE_SUPPORT;
}

export function FormsPanel() {
  const { addSlab, addDetail, addDetails, updateDetailRecord, updateAllowances, updateProjectHeader, project, editingDetailId, clearEditDetail } = useProjectStore();
  const language = project.uiLanguage ?? 'uk';
  const ui = (value: string) => translateStaticUiText(language, value);
  const [error, setError] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [allowancesOpen, setAllowancesOpen] = useState(false);
  const dxfInputRef = useRef<HTMLInputElement | null>(null);
  const approvalInputRef = useRef<HTMLInputElement | null>(null);
  const [approvalPreview, setApprovalPreview] = useState<ApprovalImportPreview | null>(null);
  const [approvalDxfContext, setApprovalDxfContext] = useState<ApprovalImportPreview | null>(null);
  const [modalPosition, setModalPosition] = useState<{ x: number; y: number } | null>(null);
  const [modalDrag, setModalDrag] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [dxfModalPosition, setDxfModalPosition] = useState<{ x: number; y: number } | null>(null);
  const [dxfModalDrag, setDxfModalDrag] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [dxfModalSize, setDxfModalSize] = useState<{ width: number; height: number } | null>(null);
  const [dxfModalResize, setDxfModalResize] = useState<DxfModalResize | null>(null);
  const [dxfPreview, setDxfPreview] = useState<DxfPreviewContour[] | null>(null);
  const [dxfBinding, setDxfBinding] = useState<DxfBindingSession | null>(null);
  const [dxfBlockMode, setDxfBlockMode] = useState(false);
  const [dxfBlockDraft, setDxfBlockDraft] = useState<DxfBlockDraft | null>(null);
  const [dxfBlockEditorIds, setDxfBlockEditorIds] = useState<string[] | null>(null);
  const [dxfSelectedContourIds, setDxfSelectedContourIds] = useState<string[]>([]);
  const [dxfPreviewDrag, setDxfPreviewDrag] = useState<DxfPreviewDrag | null>(null);
  const [dxfPreviewCanvasSize, setDxfPreviewCanvasSize] = useState({ width: 1, height: 1 });
  const [dxfLayers, setDxfLayers] = useState<string[]>([]);
  const [selectedDxfLayers, setSelectedDxfLayers] = useState<string[]>([]);
  const [dxfLayersOpen, setDxfLayersOpen] = useState(false);
  const [dxfZoom, setDxfZoom] = useState(1);
  const [dxfNotice, setDxfNotice] = useState('');
  const dxfOverviewScrollRef = useRef<HTMLDivElement | null>(null);
  const [slab, setSlab] = useState({
    width: 3200,
    height: 1600,
    thickness: 20,
    material: referenceData.materials[0] as MaterialType,
    decor: '',
    comment: '',
    minMargin: 10,
    serialNumber: 'SL-1',
  });
  const [detail, setDetail] = useState<DetailDraft>(() => createDraft());
  const editingDetail = editingDetailId ? project.details.find((item) => item.id === editingDetailId) : undefined;
  const isImportedDetailEdit = Boolean(editingDetail?.geometry.customPoints?.length);
  const linkedImportedElements = editingDetail
    ? (() => {
      const linkedIds = new Set([editingDetail.id]);
      const result: Detail[] = [];
      let found = true;
      while (found) {
        found = false;
        project.details.forEach((item) => {
          if (
            item.parentDetailId
            && linkedIds.has(item.parentDetailId)
            && !linkedIds.has(item.id)
            && (item.importRole === 'thickening' || item.importRole === 'fold')
          ) {
            linkedIds.add(item.id);
            result.push(item);
            found = true;
          }
        });
      }
      return result;
    })()
    : [];
  const linkedImportedThickeningSides = linkedImportedElements
    .filter((item) => item.importRole === 'thickening' && item.parentDetailSide)
    .map((item) => item.parentDetailSide as string);
  const linkedImportedFoldSides = linkedImportedElements
    .filter((item) => item.importRole === 'fold' && item.parentDetailSide)
    .map((item) => item.parentDetailSide as string);
  const selectedDxfLayerSet = useMemo(() => new Set(selectedDxfLayers), [selectedDxfLayers]);
  const visibleDxfPreview = useMemo(
    () => dxfPreview?.filter((contour) => selectedDxfLayerSet.has(contour.layer)) ?? [],
    [dxfPreview, selectedDxfLayerSet],
  );
  const dxfBlockEditorContours = useMemo(() => {
    const idSet = new Set(dxfBlockEditorIds ?? []);
    return visibleDxfPreview.filter((contour) => idSet.has(contour.id));
  }, [dxfBlockEditorIds, visibleDxfPreview]);
  const dxfBlockEditorViewport = useMemo(() => dxfViewportForContours(dxfBlockEditorContours), [dxfBlockEditorContours]);

  const designs = useMemo(() => designsForType(detail.type), [detail.type]);
  const currentDesign = designForKind(detail.kind);
  const sides = sideOptionsFor(detail.kind);
  const showEdges = supportsEdges(detail.type);

  useEffect(() => {
    if (!editingDetail) return;
    setDetail(draftFromDetail(editingDetail));
    setDetailOpen(true);
  }, [editingDetail]);

  useEffect(() => {
    if (!modalDrag) return;
    const onMove = (event: globalThis.MouseEvent) => {
      setModalPosition({
        x: modalDrag.originX + event.clientX - modalDrag.startX,
        y: modalDrag.originY + event.clientY - modalDrag.startY,
      });
    };
    const onUp = () => setModalDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [modalDrag]);

  useEffect(() => {
    if (!dxfModalDrag) return;
    const onMove = (event: globalThis.MouseEvent) => {
      setDxfModalPosition({
        x: dxfModalDrag.originX + event.clientX - dxfModalDrag.startX,
        y: dxfModalDrag.originY + event.clientY - dxfModalDrag.startY,
      });
    };
    const onUp = () => setDxfModalDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dxfModalDrag]);

  useEffect(() => {
    if (!dxfModalResize) return;
    const onMove = (event: globalThis.MouseEvent) => {
      const maxWidth = Math.max(620, window.innerWidth - dxfModalResize.originX - 8);
      const maxHeight = Math.max(420, window.innerHeight - dxfModalResize.originY - 8);
      setDxfModalSize({
        width: dxfModalResize.edge === 'bottom'
          ? dxfModalResize.originWidth
          : Math.min(maxWidth, Math.max(620, dxfModalResize.originWidth + event.clientX - dxfModalResize.startX)),
        height: dxfModalResize.edge === 'right'
          ? dxfModalResize.originHeight
          : Math.min(maxHeight, Math.max(420, dxfModalResize.originHeight + event.clientY - dxfModalResize.startY)),
      });
    };
    const onUp = () => setDxfModalResize(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dxfModalResize]);

  useEffect(() => {
    if (!dxfNotice) return;
    const timeout = window.setTimeout(() => setDxfNotice(''), 2800);
    return () => window.clearTimeout(timeout);
  }, [dxfNotice]);

  const updateDetail = (patch: Partial<DetailDraft>) => setDetail((prev) => {
    const kindDefaults = patch.kind ? defaultsForKind(patch.kind, prev.kind) : {};
    const next = { ...prev, ...kindDefaults, ...patch };
    if (patch.jointVertical) next.jointHorizontal = false;
    if (patch.jointHorizontal) next.jointVertical = false;
    if (patch.jointOmegaVertical) next.jointOmegaHorizontal = false;
    if (patch.jointOmegaHorizontal) next.jointOmegaVertical = false;
    if (patch.jointLambdaVertical) next.jointLambdaHorizontal = false;
    if (patch.jointLambdaHorizontal) next.jointLambdaVertical = false;
    if (patch.edgeProfiles) {
      const edgeSides = new Set(Object.keys(patch.edgeProfiles).filter((side) => patch.edgeProfiles?.[side]));
      next.thickening = { ...next.thickening, sides: next.thickening.sides.filter((side) => !edgeSides.has(side)) };
      next.fold = { ...next.fold, sides: next.fold.sides.filter((side) => !edgeSides.has(side)) };
      next.thickening.enabled = next.thickening.sides.length > 0;
      next.fold.enabled = next.fold.sides.length > 0;
    } else if (patch.thickening || patch.fold) {
      const featureSides = new Set([...(patch.thickening?.sides ?? []), ...(patch.fold?.sides ?? [])]);
      if (featureSides.size) {
        next.edgeProfiles = Object.fromEntries(Object.entries(next.edgeProfiles).filter(([side]) => !featureSides.has(side)));
      }
    }
    return next;
  });

  const addSlabClick = () => {
    const item: SlabInstance = {
      id: uid('slab'),
      width: slab.width,
      height: slab.height,
      thickness: slab.thickness,
      material: slab.material,
      decor: slab.decor,
      comment: slab.comment,
      minMargin: slab.minMargin,
      serialNumber: slab.serialNumber,
      defects: [],
      textureTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, opacity: 0.85 },
    };
    addSlab(item);
    setSlab((prev) => ({ ...prev, serialNumber: `SL-${Number(prev.serialNumber.match(/\d+/)?.[0] ?? '1') + 1}` }));
  };

  const validateDetail = () => {
    if (detail.kind === 'u' && detail.innerCutOffset + detail.innerCutWidth > detail.width) {
      return 'Для П-подібної деталі відступ до вирізу + ширина вирізу не можуть перевищувати ширину деталі.';
    }
    if (detail.kind === 'l' && detail.innerHorizontal >= detail.outerWidth) {
      return 'Для Г-подібної деталі внутрішня горизонталь має бути меншою за зовнішню ширину.';
    }
    if (detail.kind === 'l' && detail.innerVertical >= detail.outerHeight) {
      return 'Для Г-подібної деталі внутрішня вертикаль має бути меншою за зовнішню висоту.';
    }
    return '';
  };

  const closeDetailModal = () => {
    setDetailOpen(false);
    clearEditDetail();
    setDxfPreview(null);
  };

  const closeDxfPreview = () => {
    setDxfBinding(null);
    setDxfBlockMode(false);
    setDxfBlockDraft(null);
    setDxfBlockEditorIds(null);
    setDxfSelectedContourIds([]);
    setDxfPreviewDrag(null);
    setDxfPreview(null);
    setDxfLayers([]);
    setSelectedDxfLayers([]);
    setDxfLayersOpen(false);
    setDxfZoom(1);
    setDxfNotice('');
    setApprovalDxfContext(null);
  };

  const closeDxfBlockEditor = () => {
    setDxfBinding(null);
    setDxfSelectedContourIds([]);
    setDxfPreviewDrag(null);
    setDxfBlockEditorIds(null);
  };

  const closeApprovalPreview = () => {
    setApprovalPreview(null);
  };

  const openApprovalFixture = async (fixtureFileName = '81-1305719.pdf') => {
    try {
      console.warn('[APPROVAL_IMPORT_V2_REACHED]', {
        fileName: fixtureFileName,
        timestamp: new Date().toISOString(),
        source: 'dev-fixture-button',
      });
      const response = await fetch(`/test-fixtures/approval-forms/${encodeURIComponent(fixtureFileName)}`);
      if (!response.ok) throw new Error(`fixture ${fixtureFileName} is not available (${response.status})`);
      const blob = await response.blob();
      const file = new File([blob], fixtureFileName, { type: 'application/pdf' });
      const parsed = await parseApprovalFile(file);
      if (!parsed.items.length) {
        setError('У бланку погодження не знайдено таблиць виробів для імпорту.');
        return;
      }
      setError('');
      setApprovalPreview(parsed);
    } catch (reason) {
      setError(`Не вдалося прочитати тестовий бланк погодження: ${reason instanceof Error ? reason.message : 'невідома помилка'}`);
    }
  };

  const onApprovalFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      console.warn('[APPROVAL_IMPORT_V2_REACHED]', {
        fileName: file.name,
        timestamp: new Date().toISOString(),
      });
      const parsed = await parseApprovalFile(file);
      if (!parsed.items.length) {
        setError('У бланку погодження не знайдено таблиць виробів для імпорту.');
        return;
      }
      setError('');
      setApprovalPreview(parsed);
    } catch (reason) {
      setError(`Не вдалося прочитати бланк погодження: ${reason instanceof Error ? reason.message : 'невідома помилка'}`);
    }
  };

  const updateApprovalPreview = (patch: Partial<ApprovalImportPreview>) => {
    setApprovalPreview((current) => current ? { ...current, ...patch } : current);
  };

  const downloadApprovalDebugJson = () => {
    if (!approvalPreview) return;
    const blob = new Blob([JSON.stringify(approvalPreviewDebugDumpFromState(approvalPreview), null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${approvalPreview.fileName.replace(/\.[^.]+$/u, '')}-approval-import-debug.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const copyApprovalDebugSummary = async () => {
    if (!approvalPreview) return;
    const summary = approvalPreviewDebugSummary(approvalPreview);
    try {
      await navigator.clipboard?.writeText(summary);
      setError('');
    } catch {
      setError(summary);
    }
  };

  const updateApprovalItem = (id: string, patch: Partial<ApprovalImportItem>) => {
    setApprovalPreview((current) => current ? {
      ...current,
      items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item),
    } : current);
  };

  const deleteApprovalItem = (id: string) => {
    setApprovalPreview((current) => {
      if (!current) return current;
      const items = current.items.filter((item) => item.id !== id);
      return items.length ? { ...current, items } : null;
    });
  };

  const approvalItemGeometry = (item: ApprovalImportItem): Detail['geometry'] => {
    if (item.customPoints?.length) {
      return {
        width: item.width,
        height: item.height,
        customPoints: item.customPoints,
        customHoles: item.customHoles ?? [],
        sideSegments: item.sideSegments,
      };
    }
    throw new Error('Approval form contour is missing. Template fallback disabled.');
  };

  const openApprovalBindingPreview = () => {
    if (!approvalPreview?.items.length) return;
    const contours: DxfPreviewContour[] = approvalPreview.items.map((item) => ({
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
      parentDetailId: undefined,
      parentDetailSide: undefined,
      elementSide: undefined,
      parentAnchor: 'center',
      elementAnchor: 'center',
    }));
    setApprovalDxfContext(approvalPreview);
    setDxfBinding(null);
    setDxfBlockMode(false);
    setDxfBlockDraft(null);
    setDxfBlockEditorIds(null);
    setDxfSelectedContourIds([]);
    setDxfPreviewDrag(null);
    setDxfLayers(['Бланк погодження']);
    setSelectedDxfLayers(['Бланк погодження']);
    setDxfLayersOpen(false);
    setDxfZoom(1);
    setDxfNotice('Контури бланку відкрито у вікні прив’язок.');
    setDxfPreviewCanvasSize(dxfCanvasSize(contours));
    setDxfPreview(contours);
    setApprovalPreview(null);
  };

  const importApprovalPreview = () => {
    if (!approvalPreview?.items.length) return;
    const importableItems = approvalPreview.items.filter(approvalItemHasExtractedGeometry);
    if (!importableItems.length) {
      setError('Geometry was not extracted. This product cannot be imported.');
      return;
    }
    updateProjectHeader({
      orderNumber: approvalPreview.orderNumber,
      customer: approvalPreview.customer,
    });
    if (approvalPreview.material) {
      setSlab((current) => ({
        ...current,
        material: approvalPreview.material as MaterialType,
        thickness: approvalPreview.thickness || current.thickness,
        decor: approvalPreview.decor || current.decor,
      }));
    }
    const imported = importableItems.map((item) => ({
      id: uid('detail'),
      type: item.type,
      shape: item.shape,
      quantity: item.quantity,
      thickness: approvalPreview.thickness || detail.thickness,
      label: item.name,
      thickening: item.thickening,
      fold: item.fold,
      edgeProfiles: item.edgeProfiles,
      geometry: approvalItemGeometry(item),
    } satisfies Detail));
    addDetails(imported);
    closeApprovalPreview();
  };

  const addDetailClick = () => {
    const validation = validateDetail();
    if (validation) {
      setError(validation);
      return;
    }
    setError('');

    const shape = isImportedDetailEdit && editingDetail ? editingDetail.shape : currentDesign.shape;
    const diameter = detail.circleSizeMode === 'radius' ? detail.diameter * 2 : detail.diameter;
    const geometry: Detail['geometry'] = isImportedDetailEdit && editingDetail
      ? editingDetail.geometry
      : shape === SHAPE_RECT
      ? {
        width: detail.width,
        height: detail.height,
        ...(detail.kind === 'sink_rect' ? { sinkKind: 'rect' as const, innerVertical: detail.innerVertical } : {}),
        ...(detail.kind === 'sink_slot' ? { sinkKind: 'slot' as const, innerVertical: detail.innerVertical } : {}),
      }
      : shape === SHAPE_L
        ? {
          outerWidth: detail.outerWidth,
          outerHeight: detail.outerHeight,
          innerHorizontal: detail.innerHorizontal,
          innerVertical: detail.innerVertical,
          wholeDetail: detail.wholeDetail && !detail.jointVertical && !detail.jointHorizontal,
          jointDirection: detail.jointVertical ? 'vertical' : detail.jointHorizontal ? 'horizontal' : undefined,
        }
        : shape === SHAPE_U
          ? {
            width: detail.width,
            height: detail.height,
            innerCutWidth: detail.innerCutWidth,
            innerCutDepth: detail.innerCutDepth,
            innerCutOffset: detail.innerCutOffset,
            innerCutSide: detail.innerCutSide,
            wholeDetail: detail.wholeDetail
              && !detail.jointOmegaVertical
              && !detail.jointOmegaHorizontal
              && !detail.jointLambdaVertical
              && !detail.jointLambdaHorizontal,
            jointOmegaDirection: detail.jointOmegaVertical ? 'vertical' : detail.jointOmegaHorizontal ? 'horizontal' : undefined,
            jointLambdaDirection: detail.jointLambdaVertical ? 'vertical' : detail.jointLambdaHorizontal ? 'horizontal' : undefined,
          }
          : shape === SHAPE_CIRCLE
            ? { diameter }
            : { ellipseWidth: detail.ellipseWidth, ellipseHeight: detail.ellipseHeight };

    const item: Detail = {
      ...(editingDetail ?? {}),
      id: editingDetail?.id ?? uid('detail'),
      type: detail.type,
      shape,
      quantity: detail.quantity,
      thickness: detail.thickness,
      geometry,
      label: editingDetail?.label,
      thickening: showEdges ? detail.thickening : undefined,
      fold: showEdges ? detail.fold : undefined,
      edgeProfiles: detail.edgeProfiles,
    };

    if (editingDetail) updateDetailRecord(editingDetail.id, item);
    else addDetail(item);
    closeDetailModal();
  };

  const setType = (type: DetailType) => {
    const nextDesigns = designsForType(type);
    setDetail((prev) => ({
      ...prev,
      type,
      ...(() => {
        const kind = nextDesigns.some((item) => item.kind === prev.kind) ? prev.kind : nextDesigns[0].kind;
        return { ...defaultsForKind(kind, prev.kind), kind };
      })(),
    }));
  };

  const onDxfFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (/\.dwg$/i.test(file.name)) {
      setError('DWG потребує попереднього перетворення в DXF для браузерного імпорту.');
      return;
    }
    const text = await file.text();
    const parsed = parseDxfContours(text);
    if (!parsed.contours.length) {
      setError('У DXF не знайдено закритих контурів для імпорту.');
      return;
    }
    setError('');
    setDxfBinding(null);
    setDxfBlockMode(false);
    setDxfBlockDraft(null);
    setDxfBlockEditorIds(null);
    setDxfSelectedContourIds([]);
    setDxfPreviewDrag(null);
    setDxfLayers(parsed.layers);
    setSelectedDxfLayers(parsed.layers);
    setDxfLayersOpen(false);
    setDxfZoom(1);
    const preview: DxfPreviewContour[] = parsed.contours.map((contour, index) => {
      const rounded = {
        width: Math.round(contour.width),
        height: Math.round(contour.height),
        points: contour.points,
        holes: contour.holes,
      };
      const role = inferDxfRole(rounded, contour.suggestedName);
      const type = inferDxfType(rounded, contour.suggestedName);
      const roleLabel = ui(DXF_ROLE_LABELS[role]);
      return {
        id: uid('dxf'),
        name: contour.suggestedName || (role === 'detail' ? `${ui(type)} ${index + 1}` : `${roleLabel} ${index + 1}`),
        ...rounded,
        sourceX: contour.sourceX,
        sourceY: contour.sourceY,
        groupId: contour.groupId,
        layer: contour.layer,
        edgeProfiles: contour.suggestedEdgeProfile && contour.suggestedEdgeSide
          ? { [contour.suggestedEdgeSide]: contour.suggestedEdgeProfile }
          : {},
        type,
        shape: inferDxfShape(rounded),
        role,
        parentDetailId: undefined,
        parentDetailSide: undefined,
        elementSide: undefined,
        parentAnchor: 'center',
        elementAnchor: 'center',
      };
    });
    setDxfPreviewCanvasSize(dxfCanvasSize(preview));
    setDxfPreview(preview);
  };

  const updateDxfPreviewItem = (id: string, patch: Partial<DxfPreviewContour>) => {
    setDxfPreview((items) => items?.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };
      if (patch.parentDetailId === '') {
        next.parentDetailId = undefined;
        next.parentDetailSide = undefined;
        next.elementSide = undefined;
        next.parentAnchor = undefined;
        next.elementAnchor = undefined;
      }
      return next;
    }) ?? null);
  };

  const updateDxfEdgeProfiles = (id: string, edgeProfiles: EdgeProfileSelection) => {
    const edgeSides = new Set(Object.keys(edgeProfiles).filter((side) => edgeProfiles[side]));
    setDxfPreview((items) => items?.map((item) => {
      if (item.id === id) return { ...item, edgeProfiles };
      if (
        item.role !== 'detail'
        && item.parentDetailId === id
        && item.parentDetailSide
        && edgeSides.has(item.parentDetailSide)
      ) {
        return {
          ...item,
          parentDetailId: undefined,
          parentDetailSide: undefined,
          elementSide: undefined,
          parentAnchor: undefined,
          elementAnchor: undefined,
        };
      }
      return item;
    }) ?? null);
  };

  const deleteDxfPreviewItem = (id: string) => {
    if (dxfBinding?.parentDetailId === id || dxfBinding?.elementId === id) setDxfBinding(null);
    setDxfPreview((items) => {
      const next = items?.filter((item) => item.id !== id) ?? null;
      return next?.length ? next : null;
    });
  };

  const importDxfPreview = () => {
    if (!visibleDxfPreview.length) return;
    const approvalContext = approvalDxfContext;
    if (approvalContext) {
      updateProjectHeader({
        orderNumber: approvalContext.orderNumber,
        customer: approvalContext.customer,
      });
      if (approvalContext.material) {
        setSlab((current) => ({
          ...current,
          material: approvalContext.material as MaterialType,
          thickness: approvalContext.thickness || current.thickness,
          decor: approvalContext.decor || current.decor,
        }));
      }
    }
    const approvalItemsById = new Map(approvalContext?.items.map((item) => [item.id, item]) ?? []);
    const importedIds = new Map(visibleDxfPreview.map((contour) => [contour.id, uid('detail')]));
    const groupOrigins = new Map<string, { x: number; y: number }>();
    visibleDxfPreview.forEach((contour) => {
      const origin = groupOrigins.get(contour.groupId);
      groupOrigins.set(contour.groupId, {
        x: Math.min(origin?.x ?? Infinity, contour.sourceX),
        y: Math.min(origin?.y ?? Infinity, contour.sourceY),
      });
    });
    const imported = visibleDxfPreview.map((contour, index) => {
      const parent = contour.parentDetailId ? visibleDxfPreview.find((item) => item.id === contour.parentDetailId) : undefined;
      const importedParentId = parent ? importedIds.get(parent.id) : undefined;
      const groupOrigin = groupOrigins.get(contour.groupId) ?? { x: 0, y: 0 };
      const approvalItem = approvalItemsById.get(contour.id);
      const label = contour.name.trim() || (contour.role === 'detail'
        ? `${ui(contour.type)} ${index + 1}`
        : `${ui(DXF_ROLE_LABELS[contour.role])} ${parent?.name || ''}`.trim());
      return {
        id: importedIds.get(contour.id) ?? uid('detail'),
        type: contour.type,
        shape: contour.shape,
        quantity: 1,
        thickness: approvalContext?.thickness || detail.thickness,
        label,
        thickening: approvalItem?.thickening,
        fold: approvalItem?.fold,
        importRole: contour.role,
        parentDetailId: importedParentId,
        parentDetailSide: importedParentId ? contour.parentDetailSide : undefined,
        elementSide: importedParentId ? contour.elementSide : undefined,
        parentAnchor: importedParentId ? contour.parentAnchor ?? 'center' : undefined,
        elementAnchor: importedParentId ? contour.elementAnchor ?? 'center' : undefined,
        importGroupId: contour.groupId,
        importOffsetX: contour.sourceX - groupOrigin.x,
        importOffsetY: contour.sourceY - groupOrigin.y,
        edgeProfiles: Object.keys(contour.edgeProfiles).length ? contour.edgeProfiles : approvalItem?.edgeProfiles,
        geometry: {
          width: contour.width,
          height: contour.height,
          customPoints: contour.points,
          customHoles: contour.holes,
          sideSegments: contour.sideSegments,
        },
      } satisfies Detail;
    });
    addDetails(imported);
    closeDxfPreview();
  };

  const dxfPreviewGroups = [...new Set(visibleDxfPreview.map((contour) => contour.groupId))];
  const dxfBindingHint = dxfBinding && {
    detail: 'Клікніть по першому контуру.',
    element: 'Клікніть по другому контуру.',
    detailSide: 'Клікніть по стороні першого контуру.',
    elementSide: 'Клікніть по стороні другого контуру, якою він примикає.',
    detailAnchor: 'Оберіть опорну точку на стороні першого контуру.',
    elementAnchor: 'Оберіть опорну точку на стороні другого контуру для завершення.',
  }[dxfBinding.step];

  const selectDxfBindingContour = (contour: DxfPreviewContour) => {
    if (!dxfBinding) return;
    if (dxfBinding.step === 'detail') {
      setDxfBinding({ step: 'element', parentDetailId: contour.id });
    } else if (dxfBinding.step === 'element' && contour.id !== dxfBinding.parentDetailId) {
      setDxfBinding({ ...dxfBinding, step: 'detailSide', elementId: contour.id });
    }
  };

  const selectDxfBindingSide = (contourId: string, side: string) => {
    if (!dxfBinding) return;
    if (dxfBinding.step === 'detailSide' && contourId === dxfBinding.parentDetailId) {
      setDxfBinding({ ...dxfBinding, parentDetailSide: side, step: 'elementSide' });
    } else if (dxfBinding.step === 'elementSide' && contourId === dxfBinding.elementId) {
      setDxfBinding({ ...dxfBinding, elementSide: side, step: 'detailAnchor' });
    }
  };

  const selectDxfBindingAnchor = (anchor: BindingAnchor) => {
    if (!dxfBinding) return;
    if (dxfBinding.step === 'detailAnchor') {
      setDxfBinding({ ...dxfBinding, parentAnchor: anchor, step: 'elementAnchor' });
      return;
    }
    if (
      dxfBinding.step === 'elementAnchor'
      && dxfBinding.elementId
      && dxfBinding.parentDetailId
      && dxfBinding.parentDetailSide
      && dxfBinding.elementSide
    ) {
      const parent = dxfPreview?.find((contour) => contour.id === dxfBinding.parentDetailId);
      const element = dxfPreview?.find((contour) => contour.id === dxfBinding.elementId);
      const rigidGroupId = parent && element && (parent.role !== 'detail' || element.role === 'detail')
        ? `DXF блок ${Date.now()}`
        : undefined;
      setDxfPreview((items) => items?.map((item) => {
        if (item.id === dxfBinding.elementId) {
          return {
            ...item,
            ...(rigidGroupId ? { groupId: rigidGroupId } : {}),
            parentDetailId: dxfBinding.parentDetailId,
            parentDetailSide: dxfBinding.parentDetailSide,
            elementSide: dxfBinding.elementSide,
            parentAnchor: dxfBinding.parentAnchor ?? 'center',
            elementAnchor: anchor,
          };
        }
        if (rigidGroupId && item.id === dxfBinding.parentDetailId) return { ...item, groupId: rigidGroupId };
        return item;
      }) ?? null);
      if (parent?.edgeProfiles[dxfBinding.parentDetailSide]) {
        const edgeProfiles = { ...parent.edgeProfiles };
        delete edgeProfiles[dxfBinding.parentDetailSide];
        updateDxfPreviewItem(parent.id, { edgeProfiles });
      }
      setDxfBinding(null);
      setDxfNotice('Прив’язку створено.');
    }
  };

  const editDxfBinding = (elementId: string) => {
    const element = dxfPreview?.find((contour) => contour.id === elementId);
    if (!element?.parentDetailId) return;
    setDxfSelectedContourIds([element.parentDetailId, element.id]);
    setDxfBinding({
      step: 'detailSide',
      parentDetailId: element.parentDetailId,
      elementId: element.id,
      parentDetailSide: element.parentDetailSide,
      elementSide: element.elementSide,
      parentAnchor: element.parentAnchor,
    });
  };

  const deleteDxfBinding = (elementId: string) => {
    setDxfPreview((items) => items?.map((item) => item.id === elementId ? {
      ...item,
      parentDetailId: undefined,
      parentDetailSide: undefined,
      elementSide: undefined,
      parentAnchor: undefined,
      elementAnchor: undefined,
    } : item) ?? null);
    setDxfBinding(null);
    setDxfNotice('Прив’язку видалено.');
  };

  const toggleDxfLayer = (layer: string) => {
    setDxfBinding(null);
    setDxfBlockDraft(null);
    setDxfSelectedContourIds([]);
    setDxfPreviewDrag(null);
    setSelectedDxfLayers((current) => current.includes(layer)
      ? current.filter((item) => item !== layer)
      : [...current, layer]);
  };

  const onDxfOverviewWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const viewport = event.currentTarget;
    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const nextZoom = Math.min(6, Math.max(0.35, dxfZoom * (event.deltaY < 0 ? 1.16 : 1 / 1.16)));
    const ratio = nextZoom / dxfZoom;
    const nextLeft = (viewport.scrollLeft + pointerX) * ratio - pointerX;
    const nextTop = (viewport.scrollTop + pointerY) * ratio - pointerY;
    setDxfZoom(nextZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = nextLeft;
      viewport.scrollTop = nextTop;
    });
  };

  const beginDxfPreviewDrag = (contour: DxfPreviewContour, point: DxfPoint, additive: boolean) => {
    const selected = dxfSelectedContourIds.includes(contour.id)
      ? dxfSelectedContourIds
      : additive ? [...dxfSelectedContourIds, contour.id] : [contour.id];
    const selectedSet = new Set(selected);
    setDxfSelectedContourIds(selected);
    setDxfPreviewDrag({
      startX: point.x,
      startY: point.y,
      contourIds: selected,
      origins: Object.fromEntries((dxfPreview ?? [])
        .filter((item) => selectedSet.has(item.id))
        .map((item) => [item.id, { x: item.sourceX, y: item.sourceY }])),
    });
  };

  const moveDxfPreviewSelection = (point: DxfPoint) => {
    if (!dxfPreviewDrag) return;
    const selectedSet = new Set(dxfPreviewDrag.contourIds);
    const selected = (dxfPreview ?? []).filter((contour) => selectedSet.has(contour.id));
    if (!selected.length) return;
    const minOriginX = Math.min(...selected.map((contour) => dxfPreviewDrag.origins[contour.id]?.x ?? contour.sourceX));
    const minOriginY = Math.min(...selected.map((contour) => dxfPreviewDrag.origins[contour.id]?.y ?? contour.sourceY));
    const maxOriginX = Math.max(...selected.map((contour) => (dxfPreviewDrag.origins[contour.id]?.x ?? contour.sourceX) + contour.width));
    const maxOriginY = Math.max(...selected.map((contour) => (dxfPreviewDrag.origins[contour.id]?.y ?? contour.sourceY) + contour.height));
    const rawDx = point.x - dxfPreviewDrag.startX;
    const rawDy = point.y - dxfPreviewDrag.startY;
    const dx = Math.max(-minOriginX, Math.min(dxfPreviewCanvasSize.width - maxOriginX, rawDx));
    const dy = Math.max(-minOriginY, Math.min(dxfPreviewCanvasSize.height - maxOriginY, rawDy));
    setDxfPreview((items) => items?.map((item) => {
      const origin = dxfPreviewDrag.origins[item.id];
      return origin ? { ...item, sourceX: origin.x + dx, sourceY: origin.y + dy } : item;
    }) ?? null);
  };

  const snapDxfPreviewSelection = (contourIds: string[]) => {
    const selectedSet = new Set(contourIds);
    setDxfPreview((items) => {
      if (!items) return null;
      const selectedBounds = dxfSelectionBounds(items, contourIds);
      const other = items.filter((contour) => !selectedSet.has(contour.id));
      if (!selectedBounds || !other.length) return items;
      const threshold = 20 / Math.max(dxfZoom, 0.35);
      const xCandidates = other
        .filter((contour) => contour.sourceY <= selectedBounds.maxY && contour.sourceY + contour.height >= selectedBounds.minY)
        .flatMap((contour) => [
          contour.sourceX - selectedBounds.maxX,
          contour.sourceX + contour.width - selectedBounds.minX,
        ])
        .filter((offset) => Math.abs(offset) <= threshold);
      const yCandidates = other
        .filter((contour) => contour.sourceX <= selectedBounds.maxX && contour.sourceX + contour.width >= selectedBounds.minX)
        .flatMap((contour) => [
          contour.sourceY - selectedBounds.maxY,
          contour.sourceY + contour.height - selectedBounds.minY,
        ])
        .filter((offset) => Math.abs(offset) <= threshold);
      const dx = xCandidates.sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? 0;
      const dy = yCandidates.sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? 0;
      if (!dx && !dy) return items;
      return items.map((item) => selectedSet.has(item.id)
        ? { ...item, sourceX: item.sourceX + dx, sourceY: item.sourceY + dy }
        : item);
    });
  };

  const finishDxfPreviewDrag = () => {
    if (!dxfPreviewDrag) return;
    snapDxfPreviewSelection(dxfPreviewDrag.contourIds);
    setDxfPreviewDrag(null);
  };

  const rotateDxfPreviewSelection = (contour: DxfPreviewContour) => {
    const contourIds = dxfSelectedContourIds.includes(contour.id) ? dxfSelectedContourIds : [contour.id];
    const bounds = dxfSelectionBounds(dxfPreview ?? [], contourIds);
    if (!bounds) return;
    const selectedSet = new Set(contourIds);
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    setDxfSelectedContourIds(contourIds);
    setDxfPreview((items) => items?.map((item) => selectedSet.has(item.id) ? rotateDxfPreviewContour(item, center) : item) ?? null);
  };

  const beginDxfModalResize = (event: React.MouseEvent<HTMLDivElement>, edge: DxfModalResize['edge']) => {
    event.preventDefault();
    const modal = event.currentTarget.parentElement as HTMLElement;
    const rect = modal.getBoundingClientRect();
    setDxfModalPosition((position) => position ?? { x: rect.left, y: rect.top });
    setDxfModalSize({ width: rect.width, height: rect.height });
    setDxfModalResize({
      edge,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      originWidth: rect.width,
      originHeight: rect.height,
    });
  };

  const finishDxfBlockSelection = () => {
    if (!dxfBlockDraft) return;
    const minX = Math.min(dxfBlockDraft.startX, dxfBlockDraft.currentX);
    const minY = Math.min(dxfBlockDraft.startY, dxfBlockDraft.currentY);
    const maxX = Math.max(dxfBlockDraft.startX, dxfBlockDraft.currentX);
    const maxY = Math.max(dxfBlockDraft.startY, dxfBlockDraft.currentY);
    const selected = visibleDxfPreview.filter((contour) => (
      contour.sourceX >= minX
      && contour.sourceY >= minY
      && contour.sourceX + contour.width <= maxX
      && contour.sourceY + contour.height <= maxY
    ));
    const selectedIds = selected.map((contour) => contour.id);
    setDxfSelectedContourIds(selectedIds);
    if (selected.length > 1) {
      const blockId = `DXF блок ${Date.now()}`;
      const selectedSet = new Set(selectedIds);
      const selectedDetails = selected.filter((item) => item.role === 'detail');
      const inferredBindings = new Map(selected
        .filter((item) => item.role !== 'detail' && !item.parentDetailId)
        .map((item) => {
          const nearest = selectedDetails
            .map((parent) => ({ parent, binding: inferDxfBindingPair(parent, item) }))
            .filter((entry) => Boolean(entry.binding))
            .sort((a, b) => (a.binding?.score ?? Infinity) - (b.binding?.score ?? Infinity))[0];
          return [item.id, nearest] as const;
        })
        .filter((entry) => Boolean(entry[1]?.binding)));
      setDxfPreview((items) => items?.map((item) => {
        if (!selectedSet.has(item.id)) return item;
        const nearest = inferredBindings.get(item.id);
        if (!nearest?.binding) return { ...item, groupId: blockId };
        return {
          ...item,
          groupId: blockId,
          parentDetailId: nearest.parent.id,
          parentDetailSide: nearest.binding.parentDetailSide,
          elementSide: nearest.binding.elementSide,
          parentAnchor: nearest.binding.parentAnchor,
          elementAnchor: nearest.binding.elementAnchor,
        };
      }) ?? null);
      setDxfNotice(
        inferredBindings.size
          ? `Блокову прив’язку створено: ${selected.length} контури, підв’язано елементів: ${inferredBindings.size}.`
          : `Блокову прив’язку створено: ${selected.length} контури.`,
      );
      setDxfBlockEditorIds(selectedIds);
      setDxfSelectedContourIds([]);
    } else {
      setDxfNotice('Для блокової прив’язки обведіть щонайменше два контури.');
    }
    setDxfBlockDraft(null);
    setDxfBlockMode(false);
  };

  return (
    <section className="panel forms-panel">
      <div className="subgrid two-col">
        <div className="form-zone">
          <h3>Додати слеб</h3>
          <div className="preset-row">
            {referenceData.slabSizes.map((s) => (
              <button key={`${s.width}-${s.height}`} type="button" onClick={() => setSlab((p) => ({ ...p, width: s.width, height: s.height }))}>{s.width}×{s.height}</button>
            ))}
          </div>
          <div className="form-grid compact">
            <Field label="Серійний номер"><input value={slab.serialNumber} onChange={(e) => setSlab({ ...slab, serialNumber: e.target.value })} /></Field>
            <Field label="Матеріал"><select value={slab.material} onChange={(e) => setSlab({ ...slab, material: e.target.value as MaterialType })}>{referenceData.materials.map((m) => <option key={m} value={m}>{ui(m)}</option>)}</select></Field>
            <Field label="Ширина"><input type="number" value={slab.width} onChange={(e) => setSlab({ ...slab, width: Number(e.target.value) })} /></Field>
            <Field label="Висота"><input type="number" value={slab.height} onChange={(e) => setSlab({ ...slab, height: Number(e.target.value) })} /></Field>
            <Field label="Товщина"><input type="number" value={slab.thickness} onChange={(e) => setSlab({ ...slab, thickness: Number(e.target.value) })} /></Field>
            <Field label="Мін. відступ"><input type="number" value={slab.minMargin} onChange={(e) => setSlab({ ...slab, minMargin: Number(e.target.value) })} /></Field>
            <Field label="Декор"><input value={slab.decor} onChange={(e) => setSlab({ ...slab, decor: e.target.value })} /></Field>
            <Field label="Коментар"><input value={slab.comment} onChange={(e) => setSlab({ ...slab, comment: e.target.value })} /></Field>
          </div>
          <button type="button" onClick={addSlabClick}>Додати слеб</button>
        </div>
        <div className="detail-launcher form-zone">
          <h3>Деталі</h3>
          <button type="button" className="primary-action detail-open-button" onClick={() => { clearEditDetail(); setDetail(createDraft()); setDetailOpen(true); }}>Додати деталь</button>
          <button type="button" onClick={() => dxfInputRef.current?.click()}>Імпортувати DXF</button>
          <button type="button" onClick={() => approvalInputRef.current?.click()}>Імпортувати бланк погодження</button>
          {(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ? (
            <button type="button" onClick={() => openApprovalFixture()}>Debug fixture 81-1305719</button>
          ) : null}
          <button type="button" onClick={() => setAllowancesOpen(true)}>Припуски</button>
          <input ref={dxfInputRef} type="file" accept=".dxf,.dwg" hidden onChange={onDxfFile} />
          <input ref={approvalInputRef} type="file" accept=".pdf,.xlsx,.xls,.docx" hidden onChange={onApprovalFile} />
        </div>
      </div>

      {allowancesOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="detail-modal allowances-modal" role="dialog" aria-modal="true" aria-label="Припуски">
            <div className="detail-modal-header">
              <div>
                <h2>Припуски</h2>
                <p>Технічні параметри припусків для нових розрахунків</p>
              </div>
              <button type="button" className="icon-button" aria-label="Закрити" onClick={() => setAllowancesOpen(false)}>×</button>
            </div>
            <div className="allowances-grid">
              <section className="pdf-section">
                <h3>Деталі</h3>
                <Field label="Припуск по довжині на сторону, мм"><input type="number" value={project.allowances.detailLength} onChange={(event) => updateAllowances({ detailLength: Number(event.target.value) })} /></Field>
                <Field label="Припуск по ширині на сторону, мм"><input type="number" value={project.allowances.detailWidth} onChange={(event) => updateAllowances({ detailWidth: Number(event.target.value) })} /></Field>
                <Field label="Малі внутрішні вирізи до 100 мм"><input type="number" value={project.allowances.detailSmallCutout} onChange={(event) => updateAllowances({ detailSmallCutout: Number(event.target.value) })} /></Field>
                <Field label="Великі внутрішні вирізи понад 100 мм"><input type="number" value={project.allowances.detailLargeCutout} onChange={(event) => updateAllowances({ detailLargeCutout: Number(event.target.value) })} /></Field>
              </section>
              <section className="pdf-section">
                <h3>Елементи</h3>
                <Field label="Припуск по довжині на сторону, мм"><input type="number" value={project.allowances.elementLength} onChange={(event) => updateAllowances({ elementLength: Number(event.target.value) })} /></Field>
                <Field label="Припуск по ширині на сторону, мм"><input type="number" value={project.allowances.elementWidth} onChange={(event) => updateAllowances({ elementWidth: Number(event.target.value) })} /></Field>
                <Field label="Малі внутрішні вирізи до 100 мм"><input type="number" value={project.allowances.elementSmallCutout} onChange={(event) => updateAllowances({ elementSmallCutout: Number(event.target.value) })} /></Field>
                <Field label="Великі внутрішні вирізи понад 100 мм"><input type="number" value={project.allowances.elementLargeCutout} onChange={(event) => updateAllowances({ elementLargeCutout: Number(event.target.value) })} /></Field>
              </section>
            </div>
            <section className="pdf-section allowance-spacing-section">
              <h3>Пропил між деталями</h3>
              <Field label="Відстань між деталями та елементами, мм"><input type="number" value={project.allowances.interPartSpacing} onChange={(event) => updateAllowances({ interPartSpacing: Number(event.target.value) })} /></Field>
            </section>
            <label className="pdf-check allowance-check">
              <input type="checkbox" checked={project.allowances.show} onChange={(event) => updateAllowances({ show: event.target.checked })} />
              Показувати припуски пунктиром
            </label>
            <label className="pdf-check allowance-check">
              <input type="checkbox" checked={project.allowances.applyToImports} onChange={(event) => updateAllowances({ applyToImports: event.target.checked })} />
              Використовувати припуски для імпортованих векторів
            </label>
            <div className="detail-modal-footer">
              <button type="button" className="primary-action" onClick={() => setAllowancesOpen(false)}>Готово</button>
            </div>
          </div>
        </div>
      )}

      {detailOpen && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Додати деталь"
            style={modalPosition ? { position: 'fixed', left: modalPosition.x, top: modalPosition.y, margin: 0 } : undefined}
          >
            <div
              className="detail-modal-header"
              onMouseDown={(event) => {
                if ((event.target as HTMLElement).closest('button, input, select, textarea')) return;
                const rect = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                setModalPosition((position) => position ?? { x: rect.left, y: rect.top });
                setModalDrag({
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: modalPosition?.x ?? rect.left,
                  originY: modalPosition?.y ?? rect.top,
                });
              }}
            >
              <div>
                <h2>{editingDetail ? 'Редагувати деталь' : 'Додати деталь'}</h2>
                <p>Швидкий вибір форми через мініатюри</p>
              </div>
              <button type="button" className="icon-button" aria-label="Закрити" onClick={closeDetailModal}>×</button>
            </div>

            <div className="designer-select-row">
              <Field label="Тип"><select value={detail.type} onChange={(e) => setType(e.target.value as DetailType)}>{detailTypes.map((type) => <option key={type} value={type}>{ui(type)}</option>)}</select></Field>
              <Field label="Форма"><select value={detail.kind} disabled={isImportedDetailEdit} onChange={(e) => updateDetail({ kind: e.target.value as ShapeKind })}>{designs.map((design) => <option key={design.kind} value={design.kind}>{ui(design.label)}</option>)}</select></Field>
            </div>

            <div className="shape-thumbnails">
              {designs.map((design) => (
                <button
                  key={design.kind}
                  type="button"
                  className={design.kind === detail.kind ? 'shape-thumb active' : 'shape-thumb'}
                  disabled={isImportedDetailEdit}
                  onClick={() => updateDetail({ kind: design.kind })}
                >
                  <ShapeIcon kind={design.kind} />
                  <span>{ui(design.label)}</span>
                </button>
              ))}
            </div>

            <div className="designer-meta">
              <span>{ui('Матеріал:')} {ui(project.slabs[0]?.material ?? slab.material)}</span>
              <span>{ui('Товщина, мм:')} <input type="number" value={detail.thickness} onChange={(e) => updateDetail({ thickness: Number(e.target.value) })} /></span>
            </div>

            {isImportedDetailEdit && editingDetail
              ? <ImportedDetailPreview detail={editingDetail} linkedElements={linkedImportedElements} />
              : <DesignerCanvas detail={detail} updateDetail={updateDetail} language={language} />}

            {showEdges && (
              <>
                <FeatureDesigner title="Потовщення" feature={detail.thickening} linkedSides={isImportedDetailEdit ? linkedImportedThickeningSides : []} sides={sides} onChange={(value) => updateDetail({ thickening: value })} />
                <FeatureDesigner title="Підворот" feature={detail.fold} linkedSides={isImportedDetailEdit ? linkedImportedFoldSides : []} sides={sides} onChange={(value) => updateDetail({ fold: value })} />
              </>
            )}
            <EdgeProfileDesigner
              title="Кромка"
              profiles={detail.edgeProfiles}
              sides={sides}
              blockedSides={isImportedDetailEdit ? [...linkedImportedThickeningSides, ...linkedImportedFoldSides] : []}
              onChange={(value) => updateDetail({ edgeProfiles: value })}
            />

            {error && <div className="error-box">{error}</div>}

            <div className="detail-modal-footer">
              <button type="button" onClick={closeDetailModal}>Закрити</button>
              <button type="button" className="primary-action" onClick={addDetailClick}>{editingDetail ? 'Зберегти' : 'Додати деталь'}</button>
            </div>
          </div>
        </div>
      )}
      {approvalPreview && (
        <div className="modal-backdrop" role="presentation">
          <div className="detail-modal pdf-modal approval-modal" role="dialog" aria-modal="true" aria-label="Попередній перегляд бланку погодження">
            <div className="detail-modal-header">
              <div>
                <h2>Попередній перегляд бланку погодження</h2>
                <p>Перевірте дані замовлення, вироби, кромки та елементи перед імпортом.</p>
                <p className="approval-pipeline-marker">Approval Import Pipeline: V2 · {approvalPreview.approvalImportBuildId}</p>
              </div>
              <button type="button" className="icon-button" aria-label="Закрити" onClick={closeApprovalPreview}>×</button>
            </div>
            <div className="approval-header-grid">
              <Field label="Номер замовлення">
                <input value={approvalPreview.orderNumber} onChange={(event) => updateApprovalPreview({ orderNumber: event.target.value })} />
              </Field>
              <Field label="Контрагент">
                <input value={approvalPreview.customer} onChange={(event) => updateApprovalPreview({ customer: event.target.value })} />
              </Field>
              <Field label="Матеріал">
                <select value={approvalPreview.material ?? ''} onChange={(event) => updateApprovalPreview({ material: event.target.value ? event.target.value as MaterialType : undefined })}>
                  <option value="">Не визначено</option>
                  {referenceData.materials.map((material) => <option key={material} value={material}>{ui(material)}</option>)}
                </select>
              </Field>
              <Field label="Товщина, мм">
                <input type="number" value={approvalPreview.thickness} onChange={(event) => updateApprovalPreview({ thickness: Number(event.target.value) })} />
              </Field>
              <Field label="Декор">
                <input value={approvalPreview.decor} onChange={(event) => updateApprovalPreview({ decor: event.target.value })} />
              </Field>
            </div>
            <div className="dxf-tool-row approval-tool-row">
              <button type="button" className="dxf-tool-button" disabled={!approvalPreview.items.length} onClick={openApprovalBindingPreview}>
                Прив'язка
              </button>
              <button type="button" className="dxf-tool-button" onClick={downloadApprovalDebugJson}>
                Download import debug JSON
              </button>
              <button type="button" className="dxf-tool-button" onClick={copyApprovalDebugSummary}>
                Copy actual UI debug summary
              </button>
              <span>Відкрити контури бланку у вікні прив’язок для ручного зв’язування деталей та елементів.</span>
            </div>
            {approvalPreview.warnings.length > 0 && (
              <div className="approval-warning-box">
                {approvalPreview.warnings.slice(0, 6).map((warning, index) => <div key={`approval-warning-${index}`}>{warning}</div>)}
              </div>
            )}
            <div className="approval-preview-workspace">
              <aside className="list-box approval-preview-list">
                {approvalPreview.items.map((item) => (
                  <div key={item.id} className={`list-item approval-preview-row ${approvalItemHasExtractedGeometry(item) ? '' : 'approval-preview-row-error'}`}>
                    <div className="approval-preview-item-head">
                      <strong>{item.name}</strong>
                      <span>
                        {Math.round(item.width)}×{Math.round(item.height)} мм ·{' '}
                        <b className={`approval-status approval-status-${item.importStatus.toLowerCase().replace(/\s+/g, '-')}`}>{item.importStatus}</b>
                        {' '}· рядків: {item.rows.length}
                      </span>
                    </div>
                    <div className="approval-item-crop">
                      <ApprovalItemCrop item={item} />
                    </div>
                    <div className="dxf-preview-controls">
                      <Field label="Назва">
                        <input value={item.name} onChange={(event) => updateApprovalItem(item.id, { name: event.target.value })} />
                      </Field>
                      <Field label="Тип">
                        <select value={item.type} onChange={(event) => updateApprovalItem(item.id, { type: event.target.value as DetailType })}>
                          {detailTypes.map((type) => <option key={type} value={type}>{ui(type)}</option>)}
                        </select>
                      </Field>
                      <Field label="Форма">
                        <select value={item.shape} onChange={(event) => updateApprovalItem(item.id, { shape: event.target.value as DetailShape })}>
                          {referenceData.detailShapes.map((shape) => <option key={shape} value={shape}>{ui(shape)}</option>)}
                        </select>
                      </Field>
                      <Field label="Ширина">
                        <input type="number" value={item.width} onChange={(event) => updateApprovalItem(item.id, { width: Number(event.target.value) })} />
                      </Field>
                      <Field label="Висота">
                        <input type="number" value={item.height} onChange={(event) => updateApprovalItem(item.id, { height: Number(event.target.value) })} />
                      </Field>
                      <Field label="Кількість">
                        <input type="number" value={item.quantity} onChange={(event) => updateApprovalItem(item.id, { quantity: Number(event.target.value) })} />
                      </Field>
                      <button type="button" className="danger-button" onClick={() => deleteApprovalItem(item.id)}>Видалити</button>
                    </div>
                    <div className="approval-spec-summary">
                      {item.area ? <span>Площа з бланку: {item.area.toFixed(3)} м²</span> : null}
                      <span>pipeline: {item.pipelineVersion}</span>
                      <span>buildId: {approvalPreview.approvalImportBuildId}</span>
                      <span>geometrySource: {item.geometrySource}</span>
                      <span>shapeMode: {item.shapeMode}</span>
                      <span>contourPointsCount: {item.customPoints?.length ?? 0}</span>
                      <span>finalImportAllowed: {approvalItemHasExtractedGeometry(item) ? 'true' : 'false'}</span>
                      <span>dimensionsSource: {item.dimensionsSource}</span>
                      <span>specSource: {item.specSource}</span>
                      {item.dimensions.length > 0 ? <span>Розміри з креслення: {item.dimensions.map((dimension) => `${dimension.side}=${dimension.value}`).join(', ')}</span> : null}
                      {item.sizeSource === 'drawing' ? <span>Геометрію взято з креслення бланку.</span> : null}
                      {!approvalItemHasExtractedGeometry(item) ? <span className="approval-error-text">Geometry was not extracted. This product cannot be imported.</span> : null}
                      {item.warnings.map((warning, index) => <span key={`${item.id}-warning-${index}`} className="approval-warning-text">{warning}</span>)}
                      {(item.jointVertical || item.jointHorizontal) && <span>Стик: {item.jointVertical ? 'вертикальний' : 'горизонтальний'}</span>}
                      {item.rows.slice(0, 6).map((row, index) => (
                        <span key={`${item.id}-row-${index}`}>{row.side}: {row.elementType} {row.width ? `${row.width} мм` : ''} {row.profile}</span>
                      ))}
                      {!item.rows.length && <span>Без таблиці специфікації у PDF-тексті.</span>}
                      <details className="approval-debug-details">
                        <summary>Діагностика імпорту</summary>
                        <pre>{JSON.stringify(item.debug, null, 2)}</pre>
                      </details>
                    </div>
                  </div>
                ))}
              </aside>
              <section className="dxf-overview-panel">
                <h3>Схема імпорту з бланку</h3>
                <p>Вироби створюються як звичайні деталі конструктора: кромки, потовщення та підвороти збережуться у записі деталі.</p>
                <div className="approval-overview-scroll">
                  <ApprovalOverview items={approvalPreview.items} />
                </div>
              </section>
            </div>
            <div className="detail-modal-footer">
              <button type="button" onClick={closeApprovalPreview}>Скасувати</button>
              <button type="button" className="primary-action" disabled={!approvalPreview.items.some(approvalItemHasExtractedGeometry)} onClick={importApprovalPreview}>Імпортувати</button>
            </div>
          </div>
        </div>
      )}
      {dxfPreview && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="detail-modal pdf-modal dxf-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Попередній перегляд DXF"
            style={{
              ...(dxfModalPosition ? { position: 'fixed', left: dxfModalPosition.x, top: dxfModalPosition.y, margin: 0 } : {}),
              ...(dxfModalSize ? { width: dxfModalSize.width, height: dxfModalSize.height } : {}),
            }}
          >
            <div
              className="detail-modal-header"
              onMouseDown={(event) => {
                if ((event.target as HTMLElement).closest('button, input, select, textarea')) return;
                const rect = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                setDxfModalPosition((position) => position ?? { x: rect.left, y: rect.top });
                setDxfModalDrag({
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: dxfModalPosition?.x ?? rect.left,
                  originY: dxfModalPosition?.y ?? rect.top,
                });
              }}
            >
              <div>
                <h2>Попередній перегляд DXF</h2>
                <p>Перевірте контури, призначте роль і тип перед імпортом.</p>
              </div>
              <button type="button" className="icon-button" aria-label="Закрити" onClick={closeDxfPreview}>×</button>
            </div>
            <div className="dxf-tool-row">
              <button
                type="button"
                className={dxfBinding ? 'dxf-tool-button active' : 'dxf-tool-button'}
                aria-pressed={Boolean(dxfBinding)}
                onClick={() => setDxfBinding((current) => current ? null : { step: 'detail' })}
              >
                Прив'язка
              </button>
              <button
                type="button"
                className={dxfBlockMode ? 'dxf-tool-button active' : 'dxf-tool-button'}
                aria-pressed={dxfBlockMode}
                onClick={() => {
                  setDxfBinding(null);
                  setDxfBlockDraft(null);
                  setDxfSelectedContourIds([]);
                  setDxfBlockMode((current) => !current);
                }}
              >
                Прив'язка блоком
              </button>
              <button
                type="button"
                className="dxf-tool-button"
                disabled={!dxfSelectedContourIds.length}
                onClick={() => {
                  const selected = visibleDxfPreview.find((contour) => dxfSelectedContourIds.includes(contour.id));
                  if (selected) rotateDxfPreviewSelection(selected);
                }}
              >
                Повернути 90°
              </button>
              <div className="dxf-layers-control">
                <button
                  type="button"
                  className={dxfLayersOpen ? 'dxf-tool-button active' : 'dxf-tool-button'}
                  aria-expanded={dxfLayersOpen}
                  onClick={() => setDxfLayersOpen((current) => !current)}
                >
                  Слої
                </button>
                {dxfLayersOpen && (
                  <div className="dxf-layers-panel">
                    <strong>Слої DXF</strong>
                    <div className="dxf-layers-actions">
                      <button type="button" onClick={() => { setSelectedDxfLayers(dxfLayers); setDxfBinding(null); }}>Виділити все</button>
                      <button type="button" onClick={() => { setSelectedDxfLayers([]); setDxfBinding(null); }}>Прибрати все</button>
                    </div>
                    <div className="dxf-layer-list">
                      {dxfLayers.map((layer) => (
                        <label key={layer}>
                          <input type="checkbox" checked={selectedDxfLayerSet.has(layer)} onChange={() => toggleDxfLayer(layer)} />
                          <span>{layer}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <span className="dxf-zoom-label">Масштаб {Math.round(dxfZoom * 100)}%</span>
              {(dxfBindingHint || dxfBlockMode) && <span>{dxfBindingHint ?? 'Обведіть рамкою контури, які потрібно зв’язати в один блок.'}</span>}
              {dxfNotice && <span className="dxf-notice" role="status">{dxfNotice}</span>}
            </div>
            <div className="dxf-preview-workspace">
              <aside className="list-box dxf-preview-list">
                {visibleDxfPreview.map((contour) => {
                  const edgeEntry = Object.entries(contour.edgeProfiles).find(([, profile]) => Boolean(profile)) as [string, EdgeProfileType] | undefined;
                  return (
                    <div key={contour.id} className="list-item dxf-preview-row">
                      <div className="dxf-preview-item-head">
                        <DxfPreviewShape contour={contour} />
                        <div className="dxf-preview-meta">
                          <strong>{contour.name}</strong>
                          <span>{contour.width}×{contour.height} мм</span>
                          <span>Слой: {contour.layer}</span>
                        </div>
                      </div>
                      <div className="dxf-preview-controls">
                    <Field label="Назва">
                      <input value={contour.name} onChange={(event) => updateDxfPreviewItem(contour.id, { name: event.target.value })} />
                    </Field>
                    <Field label="Група">
                      <select value={contour.groupId} onChange={(event) => updateDxfPreviewItem(contour.id, { groupId: event.target.value })}>
                        {dxfPreviewGroups.map((group) => <option key={group} value={group}>{group}</option>)}
                      </select>
                    </Field>
                    <Field label="Тип">
                      <select value={contour.type} onChange={(event) => updateDxfPreviewItem(contour.id, { type: event.target.value as DetailType })}>
                        {detailTypes.map((type) => <option key={type} value={type}>{ui(type)}</option>)}
                      </select>
                    </Field>
                    <Field label="Форма">
                      <select value={contour.shape} onChange={(event) => updateDxfPreviewItem(contour.id, { shape: event.target.value as DetailShape })}>
                        {referenceData.detailShapes.map((shape) => <option key={shape} value={shape}>{ui(shape)}</option>)}
                      </select>
                    </Field>
                    <Field label="Роль">
                      <select value={contour.role} onChange={(event) => updateDxfPreviewItem(contour.id, { role: event.target.value as DxfImportRole })}>
                        {(Object.keys(DXF_ROLE_LABELS) as DxfImportRole[]).map((role) => <option key={role} value={role}>{ui(DXF_ROLE_LABELS[role])}</option>)}
                      </select>
                    </Field>
                    <Field label="Сторона кромки">
                      <select
                        value={edgeEntry?.[0] ?? ''}
                        disabled={contour.role !== 'detail'}
                        onChange={(event) => {
                          const side = event.target.value;
                          updateDxfEdgeProfiles(contour.id, {
                            ...(side ? { [side]: edgeEntry?.[1] ?? DEFAULT_EDGE_PROFILE } : {}),
                          });
                        }}
                      >
                        <option value="">Без кромки</option>
                        {allSides.map((side) => <option key={side} value={side}>{side}</option>)}
                      </select>
                    </Field>
                    <Field label="Профіль кромки">
                      <select
                        value={edgeEntry?.[1] ?? DEFAULT_EDGE_PROFILE}
                        disabled={contour.role !== 'detail' || !edgeEntry}
                        onChange={(event) => updateDxfEdgeProfiles(
                          contour.id,
                          edgeEntry ? { [edgeEntry[0]]: event.target.value as EdgeProfileType } : {},
                        )}
                      >
                        {EDGE_PROFILE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </Field>
                    <button type="button" className="danger-button" onClick={() => deleteDxfPreviewItem(contour.id)}>Видалити</button>
                  </div>
                </div>
                  );
                })}
              </aside>
              <section className="dxf-overview-panel">
                <h3>Композиція з файлу</h3>
                <p>{dxfBindingHint ?? (dxfBlockMode ? 'Натисніть у полі та обведіть потрібні контури рамкою.' : 'Контури показані в початковому взаємному положенні. Колесо миші змінює масштаб.')}</p>
                <div ref={dxfOverviewScrollRef} className="dxf-overview-scroll" onWheel={onDxfOverviewWheel}>
                  <DxfOverview
                    contours={visibleDxfPreview}
                    binding={dxfBinding}
                    blockMode={dxfBlockMode}
                    blockDraft={dxfBlockDraft}
                    selectedContourIds={dxfSelectedContourIds}
                    canvasSize={dxfPreviewCanvasSize}
                    dragging={Boolean(dxfPreviewDrag)}
                    zoom={dxfZoom}
                    onContourClick={selectDxfBindingContour}
                    onContourDragStart={beginDxfPreviewDrag}
                    onContourDoubleClick={rotateDxfPreviewSelection}
                    onCanvasDragMove={moveDxfPreviewSelection}
                    onCanvasDragFinish={finishDxfPreviewDrag}
                    onClearSelection={() => setDxfSelectedContourIds([])}
                    onSideClick={selectDxfBindingSide}
                    onAnchorClick={selectDxfBindingAnchor}
                    onBlockStart={(point) => setDxfBlockDraft({
                      startX: point.x,
                      startY: point.y,
                      currentX: point.x,
                      currentY: point.y,
                    })}
                    onBlockMove={(point) => setDxfBlockDraft((current) => current ? {
                      ...current,
                      currentX: point.x,
                      currentY: point.y,
                    } : null)}
                    onBlockFinish={finishDxfBlockSelection}
                  />
                </div>
              </section>
            </div>
            <div className="detail-modal-footer">
              <button type="button" onClick={closeDxfPreview}>Скасувати</button>
              <button type="button" className="primary-action" disabled={!visibleDxfPreview.length} onClick={importDxfPreview}>Імпортувати</button>
            </div>
            <div className="dxf-modal-resize-handle right" aria-hidden="true" onMouseDown={(event) => beginDxfModalResize(event, 'right')} />
            <div className="dxf-modal-resize-handle bottom" aria-hidden="true" onMouseDown={(event) => beginDxfModalResize(event, 'bottom')} />
            <div className="dxf-modal-resize-handle corner" aria-hidden="true" onMouseDown={(event) => beginDxfModalResize(event, 'corner')} />
          </div>
        </div>
      )}
      {dxfPreview && dxfBlockEditorIds && (
        <div className="modal-backdrop dxf-block-editor-backdrop" role="presentation">
          <div className="detail-modal dxf-block-editor-modal" role="dialog" aria-modal="true" aria-label="Редагування прив’язки блоку">
            <div className="detail-modal-header">
              <div>
                <h2>Редагування прив’язки блоку</h2>
                <p>Налаштуйте взаємне положення контурів і точні прив’язки між деталями та елементами.</p>
              </div>
              <button type="button" className="icon-button" aria-label="Закрити" onClick={closeDxfBlockEditor}>×</button>
            </div>
            <div className="dxf-block-editor-workspace">
              <aside className="dxf-block-editor-tools">
                <h3>Інструменти</h3>
                <button
                  type="button"
                  className={dxfBinding ? 'dxf-tool-button active' : 'dxf-tool-button'}
                  aria-pressed={Boolean(dxfBinding)}
                  onClick={() => setDxfBinding((current) => current ? null : { step: 'detail' })}
                >
                  Створити прив’язку
                </button>
                <button
                  type="button"
                  className="dxf-tool-button"
                  disabled={!dxfBlockEditorContours.some((contour) => contour.parentDetailId && dxfSelectedContourIds.includes(contour.id))}
                  onClick={() => {
                    const selected = dxfBlockEditorContours.find((contour) => contour.parentDetailId && dxfSelectedContourIds.includes(contour.id));
                    if (selected) editDxfBinding(selected.id);
                  }}
                >
                  Редагувати прив’язку
                </button>
                <button
                  type="button"
                  className="dxf-tool-button"
                  disabled={!dxfSelectedContourIds.length}
                  onClick={() => {
                    const selected = dxfBlockEditorContours.find((contour) => dxfSelectedContourIds.includes(contour.id));
                    if (selected) rotateDxfPreviewSelection(selected);
                  }}
                >
                  Повернути 90°
                </button>
                <h3>Контури блоку</h3>
                <div className="dxf-block-editor-contours">
                  {dxfBlockEditorContours.map((contour) => (
                    <button
                      key={contour.id}
                      type="button"
                      className={dxfSelectedContourIds.includes(contour.id) ? 'active' : ''}
                      onClick={() => setDxfSelectedContourIds([contour.id])}
                    >
                      <strong>{contour.name}</strong>
                      <span>{ui(DXF_ROLE_LABELS[contour.role])} · {Math.round(contour.width)}×{Math.round(contour.height)} мм</span>
                    </button>
                  ))}
                </div>
                <h3>Створені прив’язки</h3>
                <div className="dxf-block-editor-links">
                  {dxfBlockEditorContours.filter((contour) => contour.parentDetailId).map((contour) => {
                    const parent = dxfPreview.find((item) => item.id === contour.parentDetailId);
                    return (
                      <div key={contour.id}>
                        <span>{parent?.name ?? 'Контур'} → {contour.name}</span>
                        <button type="button" onClick={() => editDxfBinding(contour.id)}>Редагувати</button>
                        <button type="button" className="danger-button" onClick={() => deleteDxfBinding(contour.id)}>Видалити</button>
                      </div>
                    );
                  })}
                  {!dxfBlockEditorContours.some((contour) => contour.parentDetailId) && <p>Прив’язок ще немає.</p>}
                </div>
              </aside>
              <section className="dxf-overview-panel dxf-block-editor-canvas">
                <h3>Розміщення контурів</h3>
                <p>{dxfBindingHint ?? 'Переміщуйте й повертайте контури як у DXF-прев’ю. Для точної прив’язки оберіть інструмент зліва.'}</p>
                <div className="dxf-overview-scroll" onWheel={onDxfOverviewWheel}>
                  <DxfOverview
                    contours={dxfBlockEditorContours}
                    binding={dxfBinding}
                    blockMode={false}
                    blockDraft={null}
                    selectedContourIds={dxfSelectedContourIds}
                    canvasSize={dxfPreviewCanvasSize}
                    viewport={dxfBlockEditorViewport}
                    dragging={Boolean(dxfPreviewDrag)}
                    zoom={dxfZoom}
                    onContourClick={selectDxfBindingContour}
                    onContourDragStart={beginDxfPreviewDrag}
                    onContourDoubleClick={rotateDxfPreviewSelection}
                    onCanvasDragMove={moveDxfPreviewSelection}
                    onCanvasDragFinish={finishDxfPreviewDrag}
                    onClearSelection={() => setDxfSelectedContourIds([])}
                    onSideClick={selectDxfBindingSide}
                    onAnchorClick={selectDxfBindingAnchor}
                    onBlockStart={() => undefined}
                    onBlockMove={() => undefined}
                    onBlockFinish={() => undefined}
                  />
                </div>
                <span className="dxf-zoom-label">Масштаб {Math.round(dxfZoom * 100)}%</span>
              </section>
            </div>
            <div className="detail-modal-footer">
              {dxfNotice && <span className="dxf-notice" role="status">{dxfNotice}</span>}
              <button type="button" className="primary-action" onClick={closeDxfBlockEditor}>Готово</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function DesignerCanvas({ detail, updateDetail, language }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void; language: UiLanguage }) {
  const ui = (value: string) => translateStaticUiText(language, value);
  const activeSides = new Set([...detail.thickening.sides, ...detail.fold.sides]);
  const toggleSide = (side: string) => {
    const nextSides = detail.thickening.sides.includes(side)
      ? detail.thickening.sides.filter((item) => item !== side)
      : [...detail.thickening.sides, side];
    updateDetail({ thickening: { ...detail.thickening, enabled: nextSides.length > 0, sides: nextSides } });
  };

  return (
    <section className="designer-card">
      <h3>{ui('Розмір')}</h3>
      {detail.kind === 'circle' && <CircleDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} />}
      {detail.kind === 'ellipse' && <EllipseDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} />}
      {detail.kind === 'l' && <LDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} language={language} />}
      {detail.kind === 'u' && <UDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} />}
      {detail.kind === 'rect' && <RectangleDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} language={language} />}
      {(detail.kind === 'sink_rect' || detail.kind === 'sink_slot') && <SinkDesigner detail={detail} updateDetail={updateDetail} />}
    </section>
  );
}

function sideClass(side: string, className: string, activeSides: Set<string>) {
  return `${className}${activeSides.has(side) ? ' active' : ''}`;
}

function SvgInput({ x, y, value, onChange, width = 68, height = 38, className = '' }: { x: number; y: number; value: number; onChange: (value: number) => void; width?: number; height?: number; className?: string }) {
  const digits = String(Math.round(Math.abs(value))).length;
  const actualWidth = Math.max(width, Math.min(96, 42 + digits * 10));
  const actualX = x - (actualWidth - width) / 2;
  return (
    <foreignObject x={actualX} y={y} width={actualWidth} height={height}>
      <div className={`scheme-input-wrap ${className}`}>
        <input type="number" value={Math.round(value)} onChange={(event) => onChange(Number(event.target.value))} />
      </div>
    </foreignObject>
  );
}

function SvgSide({ x, y, side, active, onClick }: { x: number; y: number; side: string; active: boolean; onClick: () => void }) {
  return (
    <foreignObject x={x} y={y} width={42} height={42}>
      <div className="scheme-side-wrap">
        <button type="button" className={active ? 'active' : ''} onClick={onClick}>{side}</button>
      </div>
    </foreignObject>
  );
}

function SvgQuantity({ x, y, value, onChange, label = 'Кількість' }: { x: number; y: number; value: number; onChange: (value: number) => void; label?: string }) {
  return (
    <>
      <text className="scheme-caption" x={x} y={y}>{label}</text>
      <SvgInput x={x} y={y + 18} width={72} height={42} value={value} onChange={onChange} />
    </>
  );
}

function SvgCheck({ x, y, label, checked, onChange }: { x: number; y: number; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const actualX = x >= 340 ? x + 78 : x;
  return (
    <foreignObject x={actualX} y={y} width={178} height={28}>
      <label className="scheme-check">
        <span>{label}</span>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      </label>
    </foreignObject>
  );
}

function TemplateInput({ x, y, value, onChange, width = 64 }: { x: number; y: number; value: number; onChange: (value: number) => void; width?: number }) {
  return (
    <input
      className="u-template-input"
      style={{ left: x, top: y, width }}
      type="number"
      value={Math.round(value)}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

function TemplateSide({ x, y, side, active, onClick }: { x: number; y: number; side: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={active ? 'u-template-side active' : 'u-template-side'}
      style={{ left: x, top: y }}
      onClick={onClick}
    >
      {side}
    </button>
  );
}

function TemplateCheck({ x, y, label, checked, onChange }: { x: number; y: number; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="u-template-check" style={{ left: x, top: y }}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function ArrowDefs() {
  return (
    <defs>
      <marker id="arrow-start" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto">
        <path d="M6 0 L0 3 L6 6" />
      </marker>
      <marker id="arrow-end" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0 0 L6 3 L0 6" />
      </marker>
    </defs>
  );
}

function RectangleDesigner({ detail, updateDetail, activeSides, onSideClick, language }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void; activeSides: Set<string>; onSideClick: (side: string) => void; language: UiLanguage }) {
  void activeSides;
  void onSideClick;
  const ui = (value: string) => translateStaticUiText(language, value);

  return (
    <div className="schema reference-schema rect-reference rect-template-shell">
      <div className="rect-template" aria-label="Прямокутна схема розмірів">
        <img className="rect-template-image" src={rectDetailTemplateSrc} alt="" aria-hidden="true" />
        <span className="template-text-label rect-quantity-caption">{ui('Кількість')}</span>
        <TemplateInput x={358} y={54} value={detail.width} onChange={(width) => updateDetail({ width })} />
        <TemplateInput x={219} y={154} value={detail.height} onChange={(height) => updateDetail({ height })} />
        <TemplateInput x={620} y={145} width={58} value={detail.quantity} onChange={(quantity) => updateDetail({ quantity })} />
      </div>
    </div>
  );
}

function CircleDesigner({ detail, updateDetail, activeSides, onSideClick }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void; activeSides: Set<string>; onSideClick: (side: string) => void }) {
  const shownValue = detail.circleSizeMode === 'diameter' ? detail.diameter : detail.diameter / 2;
  return (
    <div className="schema reference-schema circle-reference">
      <svg viewBox="0 0 540 330" className="designer-scheme-svg">
        <ArrowDefs />
        <foreignObject x="10" y="54" width="116" height="94">
          <div className="scheme-radio-box">
            <span>Розмір</span>
            <label><input type="radio" checked={detail.circleSizeMode === 'diameter'} onChange={() => updateDetail({ circleSizeMode: 'diameter' })} /> Діаметр</label>
            <label><input type="radio" checked={detail.circleSizeMode === 'radius'} onChange={() => updateDetail({ circleSizeMode: 'radius' })} /> Радіус</label>
          </div>
        </foreignObject>
        <SvgInput x={18} y={174} value={shownValue} onChange={(value) => updateDetail({ diameter: detail.circleSizeMode === 'diameter' ? value : value * 2 })} />
        <circle className="scheme-part" cx="283" cy="163" r="118" />
        <line className="scheme-dash" x1="165" y1="163" x2="401" y2="163" />
        <line className="scheme-dash" x1="283" y1="45" x2="283" y2="281" />
        <line className="scheme-arrow" x1="199" y1="246" x2="367" y2="80" />
        <text className="scheme-large-text" x="283" y="165" transform="rotate(-45 283 165)">Ø{Math.round(detail.diameter)}</text>
        <SvgSide x={166} y={14} side="A" active={activeSides.has('A')} onClick={() => onSideClick('A')} />
        <SvgSide x={360} y={14} side="B" active={activeSides.has('B')} onClick={() => onSideClick('B')} />
        <SvgSide x={360} y={272} side="C" active={activeSides.has('C')} onClick={() => onSideClick('C')} />
        <SvgSide x={166} y={272} side="D" active={activeSides.has('D')} onClick={() => onSideClick('D')} />
        <SvgQuantity x={430} y={167} value={detail.quantity} onChange={(quantity) => updateDetail({ quantity })} />
      </svg>
    </div>
  );
}

function EllipseDesigner({ detail, updateDetail, activeSides, onSideClick }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void; activeSides: Set<string>; onSideClick: (side: string) => void }) {
  return (
    <div className="schema reference-schema ellipse-reference">
      <svg viewBox="0 0 540 310" className="designer-scheme-svg">
        <ArrowDefs />
        <text className="scheme-caption" x="10" y="48">Розмір</text>
        <text className="scheme-caption" x="10" y="88">Ширина (мм)</text>
        <text className="scheme-caption" x="10" y="166">Висота (мм)</text>
        <SvgInput x={12} y={100} value={detail.ellipseWidth} onChange={(ellipseWidth) => updateDetail({ ellipseWidth })} />
        <SvgInput x={12} y={178} value={detail.ellipseHeight} onChange={(ellipseHeight) => updateDetail({ ellipseHeight })} />
        <ellipse className="scheme-part" cx="284" cy="154" rx="170" ry="85" />
        <line className="scheme-arrow" x1="116" y1="154" x2="452" y2="154" />
        <line className="scheme-arrow" x1="284" y1="71" x2="284" y2="237" />
        <text className="scheme-large-text" x="284" y="153">{detail.ellipseWidth}</text>
        <text className="scheme-large-text" x="300" y="185" transform="rotate(-90 300 185)">{detail.ellipseHeight}</text>
        <SvgSide x={178} y={22} side="A" active={activeSides.has('A')} onClick={() => onSideClick('A')} />
        <SvgSide x={392} y={22} side="B" active={activeSides.has('B')} onClick={() => onSideClick('B')} />
        <SvgSide x={392} y={246} side="C" active={activeSides.has('C')} onClick={() => onSideClick('C')} />
        <SvgSide x={178} y={246} side="D" active={activeSides.has('D')} onClick={() => onSideClick('D')} />
        <SvgQuantity x={452} y={156} value={detail.quantity} onChange={(quantity) => updateDetail({ quantity })} />
      </svg>
    </div>
  );
}

function LDesigner({ detail, updateDetail, activeSides, onSideClick, language }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void; activeSides: Set<string>; onSideClick: (side: string) => void; language: UiLanguage }) {
  const ui = (value: string) => translateStaticUiText(language, value);
  return (
    <div className="schema reference-schema l-reference l-template-shell">
      <div className="l-template" aria-label="Г-подібна схема розмірів">
        <img className="l-template-image" src={lDetailTemplateSrc} alt="" aria-hidden="true" />
        <span className="template-text-label l-quantity-caption">{ui('Кількість')}</span>
        <TemplateInput x={306} y={40} value={detail.outerWidth} onChange={(outerWidth) => updateDetail({ outerWidth })} />
        <TemplateInput x={118} y={206} value={detail.outerHeight} onChange={(outerHeight) => updateDetail({ outerHeight })} />
        <TemplateInput x={492} y={128} value={Math.max(detail.outerHeight - detail.innerVertical, 1)} onChange={(value) => updateDetail({ innerVertical: Math.max(detail.outerHeight - value, 1) })} />
        <TemplateInput x={395} y={206} value={Math.max(detail.outerWidth - detail.innerHorizontal, 1)} onChange={(value) => updateDetail({ innerHorizontal: Math.max(detail.outerWidth - value, 1) })} />
        <TemplateInput x={366} y={254} value={detail.innerVertical} onChange={(innerVertical) => updateDetail({ innerVertical })} />
        <TemplateInput x={244} y={352} value={detail.innerHorizontal} onChange={(innerHorizontal) => updateDetail({ innerHorizontal })} />
        <TemplateInput x={585} y={255} width={58} value={detail.quantity} onChange={(quantity) => updateDetail({ quantity })} />
        <TemplateCheck x={520} y={306} label="Стик вертикальний" checked={detail.jointVertical} onChange={(jointVertical) => updateDetail({ jointVertical })} />
        <TemplateCheck x={520} y={334} label="Стик горизонтальний" checked={detail.jointHorizontal} onChange={(jointHorizontal) => updateDetail({ jointHorizontal })} />
      </div>
    </div>
  );
}

function UDesigner({ detail, updateDetail, activeSides, onSideClick }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void; activeSides: Set<string>; onSideClick: (side: string) => void }) {
  return (
    <div className="schema reference-schema u-reference u-template-shell">
      <div className="u-template" aria-label="П-подібна схема розмірів">
        <svg viewBox="0 0 690 380" className="u-template-bg" aria-hidden="true">
          <defs>
            <linearGradient id="u-template-fill" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#f9fcfe" />
              <stop offset="1" stopColor="#e8f0f6" />
            </linearGradient>
          </defs>
          <text className="u-template-caption" x="10" y="42">Розмір</text>
          <path className="u-template-part" d="M142 64 H423 V320 H355 V190 H224 V320 H142 Z" />
          <text className="u-template-symbol" x="215" y="178">Ω</text>
          <text className="u-template-symbol" x="356" y="178">λ</text>
          <line className="u-template-dash" x1="142" y1="38" x2="423" y2="38" />
          <line className="u-template-dash" x1="142" y1="38" x2="142" y2="64" />
          <line className="u-template-dash" x1="423" y1="38" x2="423" y2="64" />
          <line className="u-template-dash" x1="110" y1="64" x2="110" y2="320" />
          <line className="u-template-dash" x1="110" y1="64" x2="142" y2="64" />
          <line className="u-template-dash" x1="110" y1="320" x2="142" y2="320" />
          <line className="u-template-dash" x1="454" y1="64" x2="454" y2="320" />
          <line className="u-template-dash" x1="423" y1="64" x2="454" y2="64" />
          <line className="u-template-dash" x1="423" y1="320" x2="454" y2="320" />
          <line className="u-template-dash" x1="224" y1="190" x2="355" y2="190" />
          <line className="u-template-dash" x1="289" y1="190" x2="289" y2="320" />
          <line className="u-template-dash" x1="224" y1="320" x2="355" y2="320" />
          <line className="u-template-dash" x1="142" y1="352" x2="224" y2="352" />
          <line className="u-template-dash" x1="142" y1="320" x2="142" y2="352" />
          <line className="u-template-dash" x1="224" y1="320" x2="224" y2="352" />
          <line className="u-template-dash" x1="355" y1="352" x2="423" y2="352" />
          <line className="u-template-dash" x1="355" y1="320" x2="355" y2="352" />
          <line className="u-template-dash" x1="423" y1="320" x2="423" y2="352" />
          <text className="u-template-caption" x="600" y="138">Кількість</text>
          <text className="u-template-caption" x="600" y="156">Деталей</text>
        </svg>

        <TemplateInput x={282} y={38} value={detail.width} onChange={(width) => updateDetail({ width })} />
        <TemplateInput x={110} y={204} value={detail.height} onChange={(height) => updateDetail({ height })} />
        <TemplateInput x={454} y={204} value={detail.height} onChange={(height) => updateDetail({ height })} />
        <TemplateInput x={289} y={254} value={detail.innerCutDepth} onChange={(innerCutDepth) => updateDetail({ innerCutDepth })} />
        <TemplateInput x={289} y={314} value={detail.innerCutWidth} onChange={(innerCutWidth) => updateDetail({ innerCutWidth })} />
        <TemplateInput x={182} y={352} value={detail.innerCutOffset} onChange={(innerCutOffset) => updateDetail({ innerCutOffset })} />
        <TemplateInput x={389} y={352} value={Math.max(detail.width - detail.innerCutOffset - detail.innerCutWidth, 1)} onChange={(value) => updateDetail({ innerCutOffset: Math.max(detail.width - detail.innerCutWidth - value, 0) })} />
        <TemplateInput x={600} y={190} width={58} value={detail.quantity} onChange={(quantity) => updateDetail({ quantity })} />

        <TemplateSide x={86} y={168} side="A" active={activeSides.has('A')} onClick={() => onSideClick('A')} />
        <TemplateSide x={310} y={94} side="B" active={activeSides.has('B')} onClick={() => onSideClick('B')} />
        <TemplateSide x={486} y={168} side="C" active={activeSides.has('C')} onClick={() => onSideClick('C')} />
        <TemplateSide x={388} y={284} side="D" active={activeSides.has('D')} onClick={() => onSideClick('D')} />
        <TemplateSide x={350} y={254} side="E" active={activeSides.has('E')} onClick={() => onSideClick('E')} />
        <TemplateSide x={289} y={352} side="F" active={activeSides.has('F')} onClick={() => onSideClick('F')} />
        <TemplateSide x={224} y={254} side="G" active={activeSides.has('G')} onClick={() => onSideClick('G')} />
        <TemplateSide x={172} y={284} side="H" active={activeSides.has('H')} onClick={() => onSideClick('H')} />

        <TemplateCheck x={520} y={238} label="Стик вертикальний Ω" checked={detail.jointOmegaVertical} onChange={(jointOmegaVertical) => updateDetail({ jointOmegaVertical })} />
        <TemplateCheck x={520} y={266} label="Стик горизонтальний Ω" checked={detail.jointOmegaHorizontal} onChange={(jointOmegaHorizontal) => updateDetail({ jointOmegaHorizontal })} />
        <TemplateCheck x={520} y={294} label="Стик вертикальний λ" checked={detail.jointLambdaVertical} onChange={(jointLambdaVertical) => updateDetail({ jointLambdaVertical })} />
        <TemplateCheck x={520} y={322} label="Стик горизонтальний λ" checked={detail.jointLambdaHorizontal} onChange={(jointLambdaHorizontal) => updateDetail({ jointLambdaHorizontal })} />
      </div>
    </div>
  );
}

function SinkDesigner({ detail, updateDetail }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void }) {
  const slot = detail.kind === 'sink_slot';
  return (
    <div className="schema reference-schema sink-reference">
      <svg viewBox="0 0 690 500" className="designer-scheme-svg">
        <ArrowDefs />
        <text className="scheme-caption centered" x="210" y="34">Вид спереду (розріз)</text>
        <text className="scheme-caption centered" x="514" y="34">Вид збоку (розріз)</text>
        <text className="scheme-caption centered" x="218" y="265">Вид зверху</text>
        <path className="scheme-part sink-section" d={slot ? 'M76 104 H352 L360 111 H69 Z M88 112 H338 V174 H88 Z M88 174 H338 V188 H88 Z' : 'M70 98 H344 L350 105 H64 Z M86 106 H330 V190 H86 Z M86 190 H330 V204 H86 Z'} />
        <path className="scheme-part sink-section" d={slot ? 'M420 104 H644 L650 111 H414 Z M431 112 H631 V174 L455 174 L431 188 Z' : 'M420 98 H640 L646 105 H414 Z M431 106 H629 V190 H431 Z M431 190 H629 V204 H431 Z'} />
        <rect className="scheme-part" x="92" y="315" width={slot ? 280 : 260} height={slot ? 150 : 170} />
        {slot ? <rect className="scheme-part inner" x="112" y="337" width="240" height="34" /> : <><rect className="scheme-part inner" x="104" y="328" width="236" height="144" /><line className="scheme-dim" x1="104" y1="328" x2="340" y2="472" /><line className="scheme-dim" x1="340" y1="328" x2="104" y2="472" /><circle className="scheme-part inner" cx="222" cy="400" r="25" /></>}
        <line className="scheme-arrow" x1="92" y1="78" x2={slot ? 352 : 344} y2="78" />
        <line className="scheme-arrow" x1="420" y1="78" x2={slot ? 644 : 640} y2="78" />
        <line className="scheme-arrow" x1="42" y1="112" x2="42" y2={slot ? 188 : 204} />
        <line className="scheme-arrow" x1="660" y1="112" x2="660" y2={slot ? 188 : 204} />
        <line className="scheme-arrow" x1="92" y1="484" x2={slot ? 372 : 352} y2="484" />
        <line className="scheme-arrow" x1="34" y1="315" x2="34" y2={slot ? 465 : 485} />
        <SvgInput x={slot ? 192 : 188} y={58} value={detail.width} onChange={(width) => updateDetail({ width })} />
        <SvgInput x={slot ? 502 : 492} y={58} value={detail.height} onChange={(height) => updateDetail({ height })} />
        <SvgInput x={slot ? 14 : 8} y={slot ? 128 : 130} value={detail.innerVertical} onChange={(innerVertical) => updateDetail({ innerVertical })} />
        <SvgInput x={slot ? 630 : 626} y={slot ? 128 : 130} value={detail.innerVertical} onChange={(innerVertical) => updateDetail({ innerVertical })} />
        <SvgInput x={slot ? 188 : 188} y={466} value={detail.width} onChange={(width) => updateDetail({ width })} />
        <SvgInput x={slot ? 4 : 0} y={slot ? 378 : 384} value={detail.height} onChange={(height) => updateDetail({ height })} />
        <SvgQuantity x={500} y={350} value={detail.quantity} onChange={(quantity) => updateDetail({ quantity })} />
      </svg>
    </div>
  );
}

function FeatureDesigner({
  title,
  feature,
  linkedSides = [],
  onChange,
  sides,
}: {
  title: string;
  feature: EdgeFeature;
  linkedSides?: string[];
  onChange: (v: EdgeFeature) => void;
  sides: string[];
}) {
  const availableSides = new Set(sides);
  const selectedAvailableSides = feature.sides.filter((side) => availableSides.has(side));
  const linkedSideSet = new Set(linkedSides);
  const allSidesSelected = sides.length > 0 && sides.every((side) => feature.sides.includes(side) || linkedSideSet.has(side));

  const toggleAllSides = (checked: boolean) => {
    const nextSides = checked
      ? [...feature.sides.filter((side) => !availableSides.has(side)), ...sides.filter((side) => !linkedSideSet.has(side))]
      : feature.sides.filter((side) => !availableSides.has(side));
    onChange({ ...feature, enabled: nextSides.length > 0, sides: nextSides });
  };

  const toggleSide = (side: string) => {
    if (linkedSideSet.has(side)) return;
    const nextSides = feature.sides.includes(side)
      ? feature.sides.filter((item) => item !== side)
      : [...feature.sides, side];
    onChange({ ...feature, enabled: nextSides.length > 0, sides: nextSides });
  };

  return (
    <section className="feature-designer">
      <h3>{title}</h3>
      <div className="feature-side-controls">
        <label className="feature-toggle-all">
          <input
            type="checkbox"
            checked={allSidesSelected}
            ref={(input) => {
              if (input) input.indeterminate = (selectedAvailableSides.length > 0 || linkedSides.length > 0) && !allSidesSelected;
            }}
            onChange={(event) => toggleAllSides(event.target.checked)}
          />
          Усі сторони
        </label>
        <div className="side-chip-row">
          {sides.map((side) => (
            <button
              type="button"
              key={side}
              className={linkedSideSet.has(side) ? 'chip active linked' : feature.sides.includes(side) ? 'chip active' : 'chip'}
              title={linkedSideSet.has(side) ? 'Прив’язано з DXF' : undefined}
              onClick={() => toggleSide(side)}
            >
              {side}
            </button>
          ))}
        </div>
      </div>
      <Field label="Розмір"><input type="number" value={feature.size} onChange={(e) => onChange({ ...feature, size: Number(e.target.value), enabled: feature.enabled || feature.sides.length > 0 })} /></Field>
    </section>
  );
}

function EdgeProfileDesigner({
  title,
  profiles,
  onChange,
  sides,
  blockedSides = [],
}: {
  title: string;
  profiles: EdgeProfileSelection;
  onChange: (value: EdgeProfileSelection) => void;
  sides: string[];
  blockedSides?: string[];
}) {
  const blockedSideSet = new Set(blockedSides);
  const selectableSides = sides.filter((side) => !blockedSideSet.has(side));
  const selectedSides = selectableSides.filter((side) => profiles[side]);
  const allSidesSelected = selectableSides.length > 0 && selectableSides.every((side) => Boolean(profiles[side]));

  const toggleAllSides = (checked: boolean) => {
    const next: EdgeProfileSelection = { ...profiles };
    selectableSides.forEach((side) => {
      if (checked) next[side] = next[side] ?? DEFAULT_EDGE_PROFILE;
      else delete next[side];
    });
    onChange(next);
  };

  const setSideProfile = (side: string, profile: EdgeProfileType | '') => {
    if (blockedSideSet.has(side)) return;
    const next: EdgeProfileSelection = { ...profiles };
    if (profile) next[side] = profile;
    else delete next[side];
    onChange(next);
  };

  return (
    <section className="feature-designer edge-profile-designer">
      <h3>{title}</h3>
      <label className="feature-toggle-all">
        <input
          type="checkbox"
          checked={allSidesSelected}
          ref={(input) => {
            if (input) input.indeterminate = selectedSides.length > 0 && !allSidesSelected;
          }}
          onChange={(event) => toggleAllSides(event.target.checked)}
        />
        Усі сторони
      </label>
      <div className="edge-profile-grid">
        {sides.map((side) => {
          const profile = profiles[side];
          return (
            <div key={side} className="edge-profile-row">
              <span className="chip edge-profile-side">{side}</span>
              <EdgeProfileIcon profile={profile} />
              <select disabled={blockedSideSet.has(side)} title={blockedSideSet.has(side) ? 'На стороні вже є прив’язаний елемент DXF' : undefined} value={profile ?? ''} onChange={(event) => setSideProfile(side, event.target.value as EdgeProfileType | '')}>
                <option value="">Без кромки</option>
                {EDGE_PROFILE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EdgeProfileIcon({ profile }: { profile?: EdgeProfileType }) {
  const profileType = profile ?? 'straight_edge';
  return (
    <svg className="edge-profile-icon" viewBox="0 0 54 32" aria-hidden="true">
      <defs>
        <pattern id={`edge-hatch-${profileType}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#9badba" strokeWidth="1" />
        </pattern>
      </defs>
      {profileType === 'sharknose' ? (
        <path d="M6 7 H46 L34 25 H6 Z" fill={`url(#edge-hatch-${profileType})`} />
      ) : profileType === 'full_bullnose' ? (
        <path d="M6 7 H38 Q50 16 38 25 H6 Z" fill={`url(#edge-hatch-${profileType})`} />
      ) : profileType === 'half_bullnose' || profileType === 'r2_top' || profileType === 'r2_top_bottom' ? (
        <path d="M6 7 H39 Q48 7 48 16 V25 H6 Z" fill={`url(#edge-hatch-${profileType})`} />
      ) : profileType.includes('chamfer') || profileType === 'chamfer_45_r2' ? (
        <path d="M6 7 H42 L48 13 V25 H6 Z" fill={`url(#edge-hatch-${profileType})`} />
      ) : (
        <rect x="6" y="7" width="42" height="18" fill={`url(#edge-hatch-${profileType})`} />
      )}
      <path
        d={
          profileType === 'sharknose'
            ? 'M6 7 H46 L34 25 H6 Z'
            : profileType === 'full_bullnose'
              ? 'M6 7 H38 Q50 16 38 25 H6 Z'
              : profileType === 'half_bullnose' || profileType === 'r2_top' || profileType === 'r2_top_bottom'
                ? 'M6 7 H39 Q48 7 48 16 V25 H6 Z'
                : profileType.includes('chamfer') || profileType === 'chamfer_45_r2'
                  ? 'M6 7 H42 L48 13 V25 H6 Z'
                  : 'M6 7 H48 V25 H6 Z'
        }
        fill="none"
        stroke="#2d4f6c"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function DimInput({ value, onChange, className = '' }: { value: number; onChange: (value: number) => void; className?: string }) {
  return <input className={`schema-input ${className}`} type="number" value={Math.round(value)} onChange={(e) => onChange(Number(e.target.value))} />;
}

function QuantityInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="quantity-input">
      <label>Кількість</label>
      <input type="number" min={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function ShapeIcon({ kind }: { kind: ShapeKind }) {
  return (
    <svg viewBox="0 0 80 52" aria-hidden="true">
      {kind === 'rect' && <rect x="17" y="17" width="46" height="24" rx="2" />}
      {kind === 'circle' && <circle cx="40" cy="28" r="14" />}
      {kind === 'ellipse' && <ellipse cx="40" cy="28" rx="20" ry="12" />}
      {kind === 'l' && <path d="M18 14 H56 V26 H42 V39 H18 Z" />}
      {kind === 'u' && <path d="M17 14 H63 V39 H50 V25 H30 V39 H17 Z" />}
      {kind === 'sink_rect' && <><rect x="16" y="13" width="48" height="30" rx="3" /><circle cx="40" cy="28" r="5" /></>}
      {kind === 'sink_slot' && <><rect x="15" y="15" width="50" height="26" rx="3" /><rect x="25" y="24" width="30" height="8" rx="2" /></>}
    </svg>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><label>{label}</label>{children}</div>;
}

