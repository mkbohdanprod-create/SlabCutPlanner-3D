import { referenceData } from '../../../domain/defaults';
import type { Detail, DetailShape, DetailType, EdgeFeature, EdgeProfileSelection, Point } from '../../../domain/types';

export type { ShapeKind, CircleSizeMode } from '../../../domain/types';
export type DetailDraft = import('../../../domain/types').ElementDefinition;

export interface ProductEditorSession {
  mainDetail?: DetailDraft;
  subDetails: Record<string, DetailDraft>;
  activeDetailId: 'main' | string | null;
  editingProductId?: string;
}

export const detailTypes = referenceData.detailTypes as DetailType[];
export const TYPE_COUNTERTOP = referenceData.detailTypes[0] as DetailType;
export const TYPE_WALL_PANEL = referenceData.detailTypes[1] as DetailType;
export const TYPE_SINK = referenceData.detailTypes[2] as DetailType;
export const TYPE_SUPPORT = referenceData.detailTypes[4] as DetailType;
export const TYPE_CUSTOM = referenceData.detailTypes[5] as DetailType;
export const TYPE_METAL = referenceData.detailTypes[6] as DetailType;
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
/** Металопрокат (MVP Viyar Metal): одна «форма» — відрізок профілю; типорозмір обирається в панелі */
export const metalDesigns: Array<{ kind: ShapeKind; label: string; shape: DetailShape }> = [
  { kind: 'metal_profile', label: 'Відрізок профілю', shape: SHAPE_RECT },
];
/**
 * Типи деталей, видимі користувачу в випадачках.
 * «Металопрокат» (метал-вертикаль, MVP) прихований від менеджера —
 * показується лише супер-адміну (щит у шапці, PIN). Якщо деталь уже
 * має цей тип (створена адміном), опція лишається, щоб не ламати
 * редагування наявних виробів.
 */
export function visibleDetailTypes(isAdminUnlocked: boolean, current?: DetailType): DetailType[] {
  return detailTypes.filter((type) => type !== TYPE_METAL || isAdminUnlocked || type === current);
}

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
    elevation: 900,
    width: 1200,
    height: 600,
    outerWidth: 1200,
    outerHeight: 900,
    innerHorizontal: 500,
    innerVertical: 400,
    wholeDetail: true,
    innerCutWidth: 1200,
    innerCutDepth: 600,
    innerCutOffset: 600,
    innerCutSide: 'top',
    leftLegHeight: 1200,
    rightLegHeight: 1200,
    diameter: 800,
    circleSizeMode: 'diameter',
    ellipseWidth: 1200,
    ellipseHeight: 600,
    jointDirection: undefined,
    jointOmegaDirection: undefined,
    jointLambdaDirection: undefined,
    thickening: feature(40),
    fold: feature(100),
    edgeProfiles: {},
    corners: {},
    cutouts: {},
    skirtings: {},
    wallPanels: {},
    legs: {},
  };
}

export function defaultsForKind(kind: ShapeKind, previousKind?: ShapeKind): Partial<DetailDraft> {
  if (kind === previousKind) return {};
  if (kind === 'l') return { outerWidth: 1200, outerHeight: 1200, innerHorizontal: 600, innerVertical: 600 };
  if (kind === 'u') return { width: 2600, height: 1600, innerCutWidth: 1200, innerCutDepth: 1000, innerCutOffset: 600, leftLegHeight: 1600, rightLegHeight: 1200 };
  if (kind === 'sink_slot') return { width: 600, height: 400, innerVertical: 150 };
  if (kind === 'sink_rect') return { width: 500, height: 400, innerVertical: 200 };
  // Металопрокат: width = довжина відрізка; height ставиться з профілю в панелі
  if (kind === 'metal_profile') return { width: 2000, height: 40, metalProfileId: 'kv40' } as Partial<DetailDraft>;
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
    leftLegHeight: geometry.leftLegHeight ?? draft.leftLegHeight,
    rightLegHeight: geometry.rightLegHeight ?? draft.rightLegHeight,
    diameter: geometry.diameter ?? draft.diameter,
    ellipseWidth: geometry.ellipseWidth ?? draft.ellipseWidth,
    ellipseHeight: geometry.ellipseHeight ?? draft.ellipseHeight,
    jointDirection: geometry.jointDirection ?? draft.jointDirection,
    jointOmegaDirection: geometry.jointOmegaDirection ?? draft.jointOmegaDirection,
    jointLambdaDirection: geometry.jointLambdaDirection ?? draft.jointLambdaDirection,
    thickening: cloneFeature(source.thickening),
    fold: cloneFeature(source.fold, 100),
    edgeProfiles: cloneEdgeProfiles(source.edgeProfiles),
  };
}

export function getSideSize(draft: DetailDraft, side: string): number {
  if (draft.kind === 'rect' || draft.kind === 'sink_rect' || draft.kind === 'sink_slot') {
    if (side === 'A' || side === 'C') return draft.width;
    if (side === 'B' || side === 'D') return draft.height;
  }
  
  if (draft.kind === 'l') {
    // Порядок сторін диктує КОНТУР РУШІЯ (lShapePoints + L_SIDE_IDS в
    // engines/geometry.ts): обхід від (0,0) за годинниковою, сторона X
    // закінчується в куті X. Тому B — коротка права сторона (від A вниз до
    // внутрішнього кута), а D — внутрішня вертикаль вирізу. Тут вони були
    // переплутані місцями, і таблиця сторін показувала числа навхрест із
    // кресленням, розкроєм і 3D. Не «виправляй» назад за інтуїцією —
    // звіряй із контуром; тест sideNames.test.ts тримає відповідність.
    const { outerWidth = 1200, outerHeight = 1200, innerHorizontal = 600, innerVertical = 600 } = draft;
    switch (side) {
      case 'A': return outerWidth;
      case 'B': return Math.max(1, outerHeight - innerVertical);
      case 'C': return Math.max(1, outerWidth - innerHorizontal);
      case 'D': return innerVertical;
      case 'E': return innerHorizontal;
      case 'F': return outerHeight;
    }
  }
  
  if (draft.kind === 'u') {
    const w = draft.width || 1200;
    const maxH = draft.height || 600;
    const leftH = draft.leftLegHeight ?? maxH;
    const rightH = draft.rightLegHeight ?? maxH;
    const cutW = draft.innerCutWidth || 600;
    const cutD = draft.innerCutDepth || 300;
    const cutOff = draft.innerCutOffset || 300;
    const topBarHeight = Math.max(0, maxH - cutD);
    
    switch (side) {
      case 'A': return w;
      case 'B': return rightH;
      case 'C': return Math.max(1, w - cutOff - cutW);
      case 'D': return Math.max(1, rightH - topBarHeight);
      case 'E': return cutW;
      case 'F': return Math.max(1, leftH - topBarHeight);
      case 'G': return cutOff;
      case 'H': return leftH;
    }
  }
  return 0;
}
