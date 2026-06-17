import { referenceData } from '../../../domain/defaults';
import type { Detail, DetailShape, DetailType, EdgeFeature, EdgeProfileSelection, Point } from '../../../domain/types';

export type ShapeKind = 'rect' | 'circle' | 'ellipse' | 'l' | 'u' | 'sink_rect' | 'sink_slot';
export type CircleSizeMode = 'diameter' | 'radius';

export type DetailDraft = {
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

export const detailTypes = referenceData.detailTypes as DetailType[];
export const TYPE_COUNTERTOP = referenceData.detailTypes[0] as DetailType;
export const TYPE_WALL_PANEL = referenceData.detailTypes[1] as DetailType;
export const TYPE_SINK = referenceData.detailTypes[2] as DetailType;
export const TYPE_SUPPORT = referenceData.detailTypes[4] as DetailType;
export const SHAPE_RECT = referenceData.detailShapes[0] as DetailShape;
export const SHAPE_L = referenceData.detailShapes[1] as DetailShape;
export const SHAPE_U = referenceData.detailShapes[2] as DetailShape;
export const SHAPE_CIRCLE = referenceData.detailShapes[3] as DetailShape;
export const SHAPE_ELLIPSE = referenceData.detailShapes[4] as DetailShape;
export const baseDesigns: Array<{ kind: ShapeKind; label: string; shape: DetailShape }> = [
  { kind: 'rect', label: 'Прямокутна', shape: SHAPE_RECT },
  { kind: 'circle', label: 'Коло', shape: SHAPE_CIRCLE },
  { kind: 'ellipse', label: 'Еліпс', shape: SHAPE_ELLIPSE },
  { kind: 'l', label: 'Г-подібна', shape: SHAPE_L },
  { kind: 'u', label: 'П-подібна', shape: SHAPE_U },
];
export const sinkDesigns: Array<{ kind: ShapeKind; label: string; shape: DetailShape }> = [
  { kind: 'sink_rect', label: 'Мийка прямокутна', shape: SHAPE_RECT },
  { kind: 'sink_slot', label: 'Мийка щілинна', shape: SHAPE_RECT },
];
export const allSides = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const curveSides = ['A', 'B', 'C', 'D'];

export function feature(size: number): EdgeFeature {
  return { enabled: false, size, sides: [] };
}

export function createDraft(): DetailDraft {
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

export function defaultsForKind(kind: ShapeKind, previousKind?: ShapeKind): Partial<DetailDraft> {
  if (kind === previousKind) return {};
  if (kind === 'l') return { outerWidth: 1200, outerHeight: 1200, innerHorizontal: 600, innerVertical: 600 };
  if (kind === 'u') return { width: 2400, height: 1200, innerCutWidth: 1200, innerCutDepth: 600, innerCutOffset: 600 };
  if (kind === 'sink_slot') return { width: 600, height: 400, innerVertical: 150 };
  if (kind === 'sink_rect') return { width: 500, height: 400, innerVertical: 200 };
  return {};
}

export function cloneFeature(value: EdgeFeature | undefined, fallbackSize = 40): EdgeFeature {
  return value ? { enabled: value.enabled, size: value.size, sides: [...value.sides] } : feature(fallbackSize);
}

export function cloneEdgeProfiles(value: EdgeProfileSelection | undefined): EdgeProfileSelection {
  return value ? { ...value } : {};
}

export function draftFromDetail(source: Detail): DetailDraft {
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
