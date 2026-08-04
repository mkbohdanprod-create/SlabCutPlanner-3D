import type { BindingAnchor, DetailShape, DetailType, EdgeProfileSelection, EdgeProfileType } from '../../domain/types';

export type DxfPoint = { x: number; y: number; bulge?: number };
export type DxfContour = { points: DxfPoint[]; width: number; height: number; area: number; center: DxfPoint; layer: string };
export type DxfTextLabel = { text: string; point: DxfPoint; layer: string };
export type DxfImportRole = 'detail' | 'thickening' | 'fold';
export type DxfBindingStep = 'detail' | 'element' | 'detailSide' | 'elementSide' | 'detailAnchor' | 'elementAnchor';
export type DxfPreviewContour = {
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
export type DxfBindingSession = {
  step: DxfBindingStep;
  parentDetailId?: string;
  elementId?: string;
  parentDetailSide?: string;
  elementSide?: string;
  parentAnchor?: BindingAnchor;
};
export type DxfBlockDraft = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};
export type DxfModalResize = {
  edge: 'right' | 'bottom' | 'corner';
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
};
export type DxfPreviewDrag = {
  startX: number;
  startY: number;
  contourIds: string[];
  origins: Record<string, { x: number; y: number }>;
};
export type ParsedDxfContour = Pick<DxfPreviewContour, 'width' | 'height' | 'points' | 'holes' | 'sourceX' | 'sourceY' | 'groupId' | 'layer'> & {
  suggestedName?: string;
  suggestedEdgeProfile?: EdgeProfileType;
  suggestedEdgeSide?: string;
};
export type ParsedDxfFile = { contours: ParsedDxfContour[]; layers: string[] };
