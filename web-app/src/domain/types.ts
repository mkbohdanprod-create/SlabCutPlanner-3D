export type CalculationStatus = 'success' | 'partial' | 'failed' | 'manual_conflict' | 'out_of_bounds' | 'error' | 'packing';
export type MaterialType = 'Керамограніт' | 'Кварцит' | 'Натуральний камінь' | 'Акрил' | 'Компакт-плита';
export type DetailType = 'Стільниця' | 'Стінова панель' | 'Мийка' | 'Фасад' | 'Опора' | 'Довільний елемент' | 'Потовщення' | 'Підворот';
export type DetailShape = 'Прямокутна' | 'Г-подібна' | 'П-подібна' | 'Кругла' | 'Овальна';
export type ViewMode = 'technical' | 'photo' | 'texture';
export type PackingMode = 'economy' | 'optimal' | 'full_texture';
export type UiLanguage = 'uk' | 'en' | 'pl';
export type Rotation = number;
export type DefectShapeType = 'rect' | 'circle' | 'triangle' | 'polygon';

export type ShapeKind = 'rect' | 'circle' | 'ellipse' | 'l' | 'u' | 'sink_rect' | 'sink_slot';
export type CircleSizeMode = 'diameter' | 'radius';

export interface ElementDefinition {
  label?: string;
  type: DetailType;
  kind: ShapeKind;
  quantity: number;
  thickness: number;
  /** Висота встановлення від підлоги, мм (низ деталі). Дефолт 900. Впливає лише на 3D-позицію, не на розкрій. */
  elevation?: number;
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
  leftLegHeight: number;
  rightLegHeight: number;
  diameter: number;
  circleSizeMode: CircleSizeMode;
  ellipseWidth: number;
  ellipseHeight: number;
  jointDirection?: 'vertical' | 'horizontal';
  jointOmegaDirection?: 'vertical' | 'horizontal';
  jointLambdaDirection?: 'vertical' | 'horizontal';
  /** Кому дістається дуга скруглення, коли стик стоїть у куті з радіусом. Див. `DetailGeometry`. */
  jointOmegaRadiusSide?: 'first' | 'second';
  jointLambdaRadiusSide?: 'first' | 'second';
  /** Стики на довільній відстані — коли деталь більша за сляб або ріжемо із залишку. */
  manualJoints?: ManualJoint[];
  thickening: EdgeFeature;
  fold: EdgeFeature;
  edgeProfiles: EdgeProfileSelection;
  corners: Record<string, CornerProcessing>;
  cutouts: Record<string, SurfaceCutout>;
  // [LEGACY] skirtings, wallPanels, legs below are ONLY for backward compatibility with old Detail array.
  // In V3 architecture (Product/Element), these MUST BE EMPTY.
  // The single source of truth for additions is the `additions` array in ProductElement.
  skirtings: Record<string, Skirting>;
  wallPanels: Record<string, WallPanel>;
  legs: Record<string, Leg>;
  customServices?: CustomService[];
  /**
   * Мийки, встановлені У виріб (нижній монтаж). Живуть на стільниці:
   * позиціонуються як виріз (центр чаші в координатах деталі), а далі з них
   * ПОХІДНО народжуються і виріз у стільниці, і елемент-мийка з комплектом
   * деталей у розкрої. Самі вирізи в `cutouts` не зберігаються — інакше
   * після кожного перерахунку вони б дублювались.
   */
  sinks?: Record<string, ProductSinkDef>;
}

/** Мийка нижнього монтажу, встановлена в стільницю */
export interface ProductSinkDef {
  id: string;
  /** Прямокутна чи щілинна — той самий поділ, що й в окремої мийки */
  kind: 'rect' | 'slot';
  /** Центр чаші від лівого краю деталі, мм */
  x: number;
  /** Центр чаші від верхнього краю деталі, мм */
  y: number;
  /** Внутрішня довжина чаші, мм */
  width: number;
  /** Внутрішня ширина чаші, мм */
  height: number;
  /** Глибина чаші, мм */
  depth: number;
}

export interface AnchorRef {
  elementPath: string; // e.g., "prod_17123/element:leg_A/detail:main"
  sideId: string;
  from: number; // in mm
  to: number;   // in mm
}

export interface Joint {
  id: string;
  origin: 'authored' | 'derived';
  a: AnchorRef;
  b: AnchorRef;
  type: 'butt' | 'miter45' | 'glued' | 'tie';
  dominant: 'a' | 'b';
  textureContinuity: boolean;
}

export interface ProductElement {
  id: string;
  type: DetailType;
  baseDefinition: ElementDefinition;
  // Fractal additions: nesting is practically 1 level deep for most cases, but ProductElement[] allows deeper nesting if needed (e.g., a leg with its own thickening).
  additions: ProductElement[];
  joints: Joint[];
  position3D?: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
}

export interface Product {
  id: string;
  name: string;
  elements: ProductElement[];
}

export interface EdgeProfileOperation {
  serviceId: string;
  multiplier: number;
}

export interface EdgeProfileDef {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  allowance: number;
  /**
   * Матеріальна група профілю. Серія 12 існує лише на керамограніті,
   * серія 20 — на кварциті (AR20/ZS20 — виняток, є на обох). Порожньо =
   * профіль доступний на будь-якому матеріалі.
   */
  materialGroup?: string;
  operations?: EdgeProfileOperation[];
}

export interface ReferenceData {
  materials: MaterialType[];
  detailTypes: DetailType[];
  detailShapes: DetailShape[];
  slabSizes: Array<{ width: number; height: number }>;
  thicknesses: number[];
  serviceParams: { defaultMinMargin: number; roundingDecimals: number; sawOvercut?: number };
  edgeProfiles?: EdgeProfileDef[];
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
  bulge?: number;
  /**
   * Ім'я кута контуру (`start`, `A`, `B`, … або `DA`, `AB`, … для прямокутника).
   * Заповнює побудова контуру; використовується прив'язкою вирізів до кута.
   */
  id?: string;
  /**
   * Ім'я сторони (`A`, `B`, …), яка ПОЧИНАЄТЬСЯ в цій точці.
   * Потрібне, щоб після розрізу виробу стиками шматки не втратили кромки:
   * ребро успадковує сторону оригіналу, а ребро самого стику лишається без імені.
   */
  sideId?: string;
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
  /**
   * Друге фото того самого слябу — знято З ПІДСВІТКОЮ (для просвітних каменів: онікс тощо).
   * Кадр мусить бути ІДЕНТИЧНИЙ основному фото (та сама рамка й ракурс), бо UV-матриця
   * не змінюється — інакше при перемиканні малюнок «стрибне».
   * Використовується режимом «Підсвітка» у 3D Підборі.
   */
  photoBacklit?: string;
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
  | 'straight_edge'
  // ── виробничі профілі з прайсу ВіярПро ──
  // серія 12 — керамограніт
  | 'd_12' | 'ar_12' | 't_12' | 'z_12' | 'zs_12'
  // тонкий керамограніт (PANDA)
  | 'zs_4' | 'zs_6_15' | 'zs_6_3'
  // серія 20 — кварцит (AR20/ZS20 існують і на керамограніті)
  | 'ar_20' | 'd_20' | 'h_40' | 'r_10' | 'r_3' | 'r_5'
  | 't_20' | 'xd_20' | 'z_20' | 'zs_20'
  // спільне
  | 'edge_45' | 'antik';

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
  /**
   * Ціна за один отвір до 100 мм. Такі отвори рахуються штуками, а не
   * метрами (прайс 195310), тому в метри водяної різки не входять і
   * потребують власного рядка — інакше вони мовчки зникають із КП.
   */
  holePricePerPcs: number;
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

export type SideId = string;
export type SlotId = 'main' | `wall_panel_${string}` | `leg_${string}`;
export type CornerProcessingType = 'radius' | 'chamfer' | 'l-cut';

export interface CornerProcessing {
  type: CornerProcessingType;
  radius?: number;
  sizeB?: number;
  sizeC?: number;
  edgeProcessing?: string;
  /**
   * Службовий прапорець, що проставляється рушієм розкрою (не автором деталі).
   * Кут увігнутий (270°) — це внутрішній кут вирізу складної форми.
   * Скруглення там НЕ зрізає ріг, а ДОДАЄ матеріал (округла викружка).
   * Потрібен лише прямокутній побудові контуру, яка не бачить сусідніх сторін;
   * побудова довільного полігона визначає це сама з напрямків сусідів.
   */
  reflex?: boolean;
}

export interface SurfaceCutout {
  id: string;
  shape: 'circle' | 'rect';
  type: 'custom' | 'socket' | 'faucet';
  bindCorner: string;
  x: number;
  y: number;
  radius?: number;
  width?: number;
  height?: number;
  cornerRadius?: number;
  edgeProcessing?: string;
}

export interface Skirting {
  edgeId: string;
  form: string;
  height: number;
  width: number;
  offset: number;
  type: string;
}

export interface WallPanel {
  edgeId: string;
  material: string;
  width: number;
  height: number;
  offset: number;
  thickness: number;
}

export interface Leg {
  edgeId: string;
  width: number;
  offset: number;
  size: string;
  height: number;
  jointType: string;
}

/**
 * Стик, поставлений користувачем на довільній відстані.
 *
 * Позиція задається як «від кута X на N мм». Якщо лінія потрапляє на дугу
 * скруглення, рушій відсуває її до межі дуги і повідомляє про це: різати по дузі
 * не можна, деталь звузилась би там у нуль і вістря лопнуло б на верстаті.
 */
export interface ManualJoint {
  id: string;
  /** Напрямок лінії різу: вертикальна ріже по ширині, горизонтальна — по висоті. */
  axis: 'vertical' | 'horizontal';
  /** Кут, від якого рахуємо. Порожньо — від початку координат деталі. */
  anchorCorner?: string;
  /** Відстань від точки відліку, мм. */
  offset: number;
  /** Тип з'єднання — той самий словник, що й для стиків на кутах. */
  jointType?: string;
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
  leftLegHeight?: number;
  rightLegHeight?: number;
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
  /**
   * Кому дістається дуга внутрішнього скруглення, коли стик стоїть у куті з радіусом.
   * Лінія стику не має права перетинати дугу: деталь звузилась би в нуль і вістря
   * лопнуло б при різі. Тому стик відсувається на радіус — лишається питання, в який бік.
   *
   * `first`  — дуга лишається деталі з меншою координатою (лівій / верхній).
   * `second` — переходить сусідній. Так за замовчуванням.
   */
  jointOmegaRadiusSide?: 'first' | 'second';
  jointLambdaRadiusSide?: 'first' | 'second';
  /**
   * Довільні стики — не прив'язані до увігнутих кутів.
   * Потрібні, коли деталь більша за сляб або коли ріжемо із залишку.
   */
  manualJoints?: ManualJoint[];
  customPoints?: Point[];
  customHoles?: Point[][];
  sideSegments?: Record<string, { start: Point; end: Point }>;
  corners?: Record<string, CornerProcessing>;
  cutouts?: Record<string, SurfaceCutout>;
}

export type BindingAnchor = 'start' | 'center' | 'end';

export interface CustomService {
  serviceId: string;
  name?: string;
  quantity: number;
  unit?: string;
  metadata?: any;
}

export interface Detail {
  id: string;
  slot?: SlotId;
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
  customServices?: CustomService[];
  parentDetailSide?: string;
  elementSide?: string;
  parentAnchor?: BindingAnchor;
  elementAnchor?: BindingAnchor;
  importGroupId?: string;
  importOffsetX?: number;
  importOffsetY?: number;
  isProduct?: boolean;
  skirtings?: Record<string, Skirting>;
  /**
   * Текстурний кластер (§7.1): деталі одного виробу, з'єднані стиками з
   * `textureContinuity: true`, дістають спільну мітку і мусять лягти в розкрій
   * разом. Проставляє `flattenProductToDetails`; у деталей з DXF і бланку
   * погодження її немає — там свій шлях через `import:`.
   */
  textureGroupLabel?: string;
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
  sideSegments?: Record<string, { start: Point; end: Point }>;
  isMain: boolean;
  parentDetailId?: string; // Reference to parent detail (e.g. for skirting)
  parentLabel: string;
  dimsLabel: string;
  edgeKind?: 'thickening' | 'fold';
  edgeSide?: string;
  /**
   * Сторона БАТЬКІВСЬКОЇ деталі, до якої кріпиться це доповнення.
   *
   * У legacy-шляху підворот/потовщення генеруються з властивостей деталі й
   * несуть `edgeSide`. У виробі підворот — окремий Елемент, тобто головний парт
   * СВОЄЇ деталі, і `edgeSide` у нього порожній. Прив'язка живе в
   * `Detail.parentDetailSide`; сюди вона переноситься, щоб розкрій міг покласти
   * доповнення до потрібної сторони, а не просто десь поруч.
   */
  parentDetailSide?: string;
  elementSide?: string;
  parentAnchor?: BindingAnchor;
  elementAnchor?: BindingAnchor;
  textureGroupLabel?: string;
  textureGroupKind?: 'rectSink' | 'slotSink';
  textureOffsetX?: number;
  textureOffsetY?: number;
  textureGroupAnchor?: boolean;
  sideAliases?: Record<string, 'A' | 'B' | 'C' | 'D'>;
  textureIrrelevant?: boolean;
}

export interface EdgeProcessing {
  profileId: string;
}

export interface EdgeTreatment {
  top?: EdgeProcessing;
  bottom?: EdgeProcessing;
  linked?: boolean;
  isFullLength?: boolean;
  align?: 'left' | 'right' | 'center';
  offset?: number;
  size?: number;
  manualFinish?: boolean;
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
  edgeProfiles?: Record<string, EdgeTreatment>;
  computedAllowances?: { top?: number; bottom?: number; left?: number; right?: number; };
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

export interface AssemblyConnection {
  id: string;
  part1Id: string;
  part2Id: string;
  part1Side: string;
  part2Side: string;
  connectionType: 'straight' | 'miter_45' | 'glue_only' | 'custom';
  length?: number;
}

export interface AssemblyState {
  connections: AssemblyConnection[];
  partTransforms: Record<string, { x: number; y: number; z: number; rx: number; ry: number; rz: number }>;
}

export interface Project {
  id: string;
  orderNumber: string;
  customer: string;
  uiLanguage: UiLanguage;
  textureSelectionEnabled: boolean;
  slabTypes: SlabType[];
  slabs: SlabInstance[];
  projectMaterial?: MaterialType;
  projectThickness?: number;
  products?: Product[];
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
  assembly?: AssemblyState;
  /** Прорахунок для клієнта (вкладка «Прорахунок») — окремий документ зі своєю математикою */
  quoteCalc?: import('./quoteCalc').QuoteCalcDoc;
}

