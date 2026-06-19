export type CalculationStatus = 'success' | 'partial' | 'failed' | 'manual_conflict' | 'out_of_bounds';
export type MaterialType = 'Керамограніт' | 'Кварцит' | 'Натуральний камінь' | 'Акрил' | 'Компакт-плита';
export type DetailType = 'Стільниця' | 'Стінова панель' | 'Мийка' | 'Фасад' | 'Опора';
export type DetailShape = 'Прямокутна' | 'Г-подібна' | 'П-подібна' | 'Кругла' | 'Овальна';
export type ViewMode = 'technical' | 'photo' | 'texture';
export type PackingMode = 'economy' | 'optimal' | 'full_texture';
export type UiLanguage = 'uk' | 'en' | 'pl';
export type Rotation = number;
export type DefectShapeType = 'rect' | 'circle' | 'triangle' | 'polygon';

export interface ReferenceData {
  materials: MaterialType[];
  detailTypes: DetailType[];
  detailShapes: DetailShape[];
  slabSizes: Array<{ width: number; height: number }>;
  thicknesses: number[];
  serviceParams: { defaultMinMargin: number; roundingDecimals: number };
}

export interface TextureTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: Rotation;
  opacity: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface DefectZone {
  id: string;
  shapeType: DefectShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  points?: Point[];
  comment?: string;
}

export interface SlabType {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface SlabInstance {
  id: string;
  slabTypeId?: string;
  width: number;
  height: number;
  thickness: number;
  material: MaterialType;
  decor: string;
  comment: string;
  minMargin: number;
  photo?: string;
  textureTransform: TextureTransform;
  defects: DefectZone[];
  serialNumber: string;
}

export interface EdgeFeature {
  enabled: boolean;
  size: number;
  sides: string[];
}

export type EdgeProfileType =
  | 'polished_straight'
  | 'chamfer_2x2'
  | 'chamfer_2x2_top_bottom'
  | 'r2_top'
  | 'r2_top_bottom'
  | 'chamfer_45_r2'
  | 'chamfered_edge'
  | 'half_bullnose'
  | 'full_bullnose'
  | 'sharknose'
  | 'straight_edge';

export type EdgeProfileSelection = Record<string, EdgeProfileType | undefined>;

export type CommercialMaterialMode = 'slab' | 'area';
export type CommercialGluePricingMode = 'linear' | 'element';

export interface CommercialManualLine {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  visible: boolean;
}

export interface CommercialLineOverride {
  quantity?: number;
  unitPrice?: number;
  visible?: boolean;
}

export interface CommercialQuoteSettings {
  materialMode: CommercialMaterialMode;
  currency: string;
  slabPrice: number;
  squareMeterPrice: number;
  sawCutPricePerM: number;
  waterjetCutPricePerM: number;
  edgePrices: Partial<Record<EdgeProfileType, number>>;
  gluePricingMode: CommercialGluePricingMode;
  gluePricePerM: number;
  gluePricePerElement: number;
  manualLines: CommercialManualLine[];
  lineOverrides: Record<string, CommercialLineOverride>;
  adjustmentType: 'discount' | 'markup';
  adjustmentPercent: number;
  includeInCuttingPdf: boolean;
}

export interface CutAllowances {
  detailLength: number;
  detailWidth: number;
  detailSmallCutout: number;
  detailLargeCutout: number;
  elementLength: number;
  elementWidth: number;
  elementSmallCutout: number;
  elementLargeCutout: number;
  interPartSpacing: number;
  show: boolean;
  applyToImports: boolean;
}

export interface DetailGeometry {
  width?: number;
  height?: number;
  outerWidth?: number;
  outerHeight?: number;
  innerHorizontal?: number;
  innerVertical?: number;
  cornerOrientation?: 'TL' | 'TR' | 'BL' | 'BR';
  innerCutWidth?: number;
  innerCutDepth?: number;
  innerCutSide?: 'top' | 'bottom' | 'left' | 'right';
  innerCutOffset?: number;
  diameter?: number;
  ellipseWidth?: number;
  ellipseHeight?: number;
  sinkKind?: 'rect' | 'slot';
  wholeDetail?: boolean;
  jointDirection?: 'horizontal' | 'vertical';
  jointBaseEdge?: 'A' | 'B' | 'C' | 'D';
  jointOffset?: number;
  jointOmegaDirection?: 'horizontal' | 'vertical';
  jointLambdaDirection?: 'horizontal' | 'vertical';
  customPoints?: Point[];
  customHoles?: Point[][];
  sideSegments?: Record<string, { start: Point; end: Point }>;
}

export type BindingAnchor = 'start' | 'center' | 'end';

export interface Detail {
  id: string;
  type: DetailType;
  shape: DetailShape;
  quantity: number;
  geometry: DetailGeometry;
  thickness: number;
  label?: string;
  thickening?: EdgeFeature;
  fold?: EdgeFeature;
  edgeProfiles?: EdgeProfileSelection;
  importRole?: 'detail' | 'thickening' | 'fold';
  parentDetailId?: string;
  parentDetailSide?: string;
  elementSide?: string;
  parentAnchor?: BindingAnchor;
  elementAnchor?: BindingAnchor;
  importGroupId?: string;
  importOffsetX?: number;
  importOffsetY?: number;
}

export interface DetailPart {
  id: string;
  detailId: string;
  name: string;
  type: DetailType;
  shape: DetailShape;
  width: number;
  height: number;
  rotation: Rotation;
  area: number;
  points: Point[];
  holes?: Point[][];
  nominalPoints?: Point[];
  nominalHoles?: Point[][];
  isMain: boolean;
  parentLabel: string;
  dimsLabel: string;
  edgeKind?: 'thickening' | 'fold';
  edgeSide?: string;
  elementSide?: string;
  parentAnchor?: BindingAnchor;
  elementAnchor?: BindingAnchor;
  textureGroupLabel?: string;
  textureGroupKind?: 'rectSink' | 'slotSink';
  textureOffsetX?: number;
  textureOffsetY?: number;
  textureGroupAnchor?: boolean;
  sideAliases?: Record<string, 'A' | 'B' | 'C' | 'D'>;
  sideSegments?: Record<string, { start: Point; end: Point }>;
  textureIrrelevant?: boolean;
}

export interface Placement {
  id: string;
  slabId: string;
  partId: string;
  x: number;
  y: number;
  rotation: Rotation;
  manualLocked: boolean;
  pinnedToSlab?: boolean;
  pinnedSlabId?: string | null;
  pinMode?: 'single' | 'detailSet' | 'textureSet';
  conflict?: boolean;
  outOfBounds?: boolean;
  transform3d?: { x: number; y: number; z: number; rx: number; ry: number; rz: number; };
}

export interface TextureLayout {
  id: string;
  slabId: string;
  partId: string;
  x: number;
  y: number;
  rotation: Rotation;
  sourceX?: number;
  sourceY?: number;
  sourceRotation?: Rotation;
}

export interface TextureFrame {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManualDimension {
  id: string;
  slabId: string;
  start: Point;
  end: Point;
}

export interface ExportSnapshot {
  exportedAt: string;
  status: CalculationStatus;
  unplacedPartIds: string[];
  totalArea: number;
}

export interface VersionEntry {
  id: string;
  timestamp: string;
  note: string;
}

export interface Project {
  id: string;
  orderNumber: string;
  customer: string;
  uiLanguage: UiLanguage;
  textureSelectionEnabled: boolean;
  slabTypes: SlabType[];
  slabs: SlabInstance[];
  details: Detail[];
  placements: Placement[];
  textureLayouts: TextureLayout[];
  textureFrames: TextureFrame[];
  manualDimensions: ManualDimension[];
  calculationStatus: CalculationStatus;
  unplacedPartIds: string[];
  unplacedReasons?: Record<string, string>;
  exportSnapshot?: ExportSnapshot;
  referenceData: ReferenceData;
  versions: VersionEntry[];
  updatedAt: string;
  allowances: CutAllowances;
  commercialQuote: CommercialQuoteSettings;
}
