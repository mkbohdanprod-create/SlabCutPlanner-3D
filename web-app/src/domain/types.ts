export type CalculationStatus = 'success' | 'partial' | 'failed' | 'manual_conflict' | 'out_of_bounds' | 'error' | 'packing';
export type MaterialType = 'Керамограніт' | 'Кварцит' | 'Натуральний камінь' | 'Акрил' | 'Компакт-плита';
export type DetailType = 'Стільниця' | 'Стінова панель' | 'Мийка' | 'Фасад' | 'Опора' | 'Довільний елемент' | 'Потовщення' | 'Підворот';
export type DetailShape = 'Прямокутна' | 'Г-подібна' | 'П-подібна' | 'Кругла' | 'Овальна';
export type ViewMode = 'technical' | 'photo' | 'texture';
export type PackingMode = 'economy' | 'optimal' | 'full_texture';
export type UiLanguage = 'uk' | 'en' | 'pl';
export type Rotation = number;
export type DefectShapeType = 'rect' | 'circle' | 'triangle' | 'polygon';

export type ShapeKind = 'rect' | 'circle' | 'ellipse' | 'l' | 'u' | 'sink_rect' | 'sink_slot' | 'metal_profile';
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
  /**
   * Дзеркало Г-подібної (26.08, прохання продажів: «Г має бути ліва і
   * права»). false/порожньо — ПРАВА, як завжди (виріз праворуч,
   * cornerOrientation 'BR'); true — ЛІВА ('BL').
   *
   * Рушій розкрою всі чотири орієнтації вмів давно (lShapePoints) —
   * прапорець лише відкриває це користувачу. Літери сторін ідуть за
   * обходом контуру, тому в лівої B і F міняються ролями: B стає повною
   * правою стороною, F — короткою лівою.
   */
  mirrorL?: boolean;
  jointOmegaDirection?: 'vertical' | 'horizontal';
  jointLambdaDirection?: 'vertical' | 'horizontal';
  /** Кому дістається дуга скруглення, коли стик стоїть у куті з радіусом. Див. `DetailGeometry`. */
  jointOmegaRadiusSide?: 'first' | 'second';
  jointLambdaRadiusSide?: 'first' | 'second';
  /** Стики на довільній відстані — коли деталь більша за сляб або ріжемо із залишку. */
  manualJoints?: ManualJoint[];
  /** Це доповнення — гнутий елемент на дузі кута батька (FG-27). */
  radiusElement?: RadiusElementMark;
  thickening: EdgeFeature;
  fold: EdgeFeature;
  edgeProfiles: EdgeProfileSelection;
  corners: Record<string, CornerProcessing>;
  cutouts: Record<string, SurfaceCutout>;
  /** Фрезерування площини не на всю товщину — проточки для води, декор */
  surfaceGrooves?: SurfaceGrooveGroup[];
  /** Решітка зливу в дні мийки — водоструменевий різ наскрізь */
  drainGrate?: DrainGrate;
  // [LEGACY] skirtings, wallPanels, legs below are ONLY for backward compatibility with old Detail array.
  // In V3 architecture (Product/Element), these MUST BE EMPTY.
  // The single source of truth for additions is the `additions` array in ProductElement.
  skirtings: Record<string, Skirting>;
  wallPanels: Record<string, WallPanel>;
  legs: Record<string, Leg>;
  customServices?: CustomService[];
  /**
   * ПОЗИЦІЯ ДОПОВНЕННЯ НА БАТЬКІВСЬКІЙ ДЕТАЛІ (панель, нога, бортик).
   *
   * Доти доповнення вміло тільки одне: стояти на всю довжину ребра, до якого
   * прив'язане. Через це виріб на кшталт каміна (подіум ширший і глибший за
   * короб) зібрати було неможливо — короб завжди виходив урівень із плитою.
   *
   *   attachOffset — зсув УЗДОВЖ ребра, мм від його початку. Початок ребра
   *                  диктує обхід контуру (shapeBuilder), а не інтуїція:
   *                  у прямокутника A йде зліва направо, B — від A до C,
   *                  C — справа наліво, D — від C до A.
   *   attachInset  — зсув УГЛИБ батьківської деталі, мм від ребра. Напрямок
   *                  «углиб» рахується з геометрії (`attachmentPlacement`),
   *                  тому працює і на увігнутих ребрах Г/П-форм.
   *
   * Обидва за замовчуванням 0 — тобто стара поведінка лишається дефолтом.
   * Порожній `attachInset` означає «стоїть на ребрі», як і було.
   */
  attachOffset?: number;
  attachInset?: number;
  /**
   * Відступ від ребра в напрямку, куди деталь росте: нога починається на
   * стільки нижче плити, панель — на стільки вище. Потрібен, коли
   * доповнення не торкається ребра: стінки ніші під дрова стоять на підлозі
   * і мають висоту самої ніші, а не всього подіуму.
   */
  attachGap?: number;
  /**
   * Довільний контур деталі (мм, обхід за годинниковою). Задається замість
   * `kind`-форми, коли потрібна форма, якої немає в списку: наприклад
   * П-подібна лицьова панель подіуму з нішею до підлоги — там виріз
   * НЕ отвір, а розрив контуру, і цех має різати саме контур.
   *
   * `id` точки — ім'я ребра, що в ній ЗАКІНЧУЄТЬСЯ (та сама угода, що в
   * `jointAnchorPoints`), інакше сторони деталі лишаться без імен.
   */
  customPoints?: Point[];
  /**
   * П-подібна ніша в краї деталі (ХВИЛЯ 4, крок 4.4 — FG-34).
   *
   * Зберігаємо ПАРАМЕТРИ, а не готові точки: контур із них виводить
   * `elementToDetail`. Тому ніша переживає зміну габариту деталі, її
   * можна відредагувати й прибрати — а `customPoints` лишається тим, чим
   * і був, «сирою» формою з імпорту чи шаблону.
   *
   * Задані напряму `customPoints` мають пріоритет: імпортована деталь
   * своєї форми не втрачає.
   */
  uCutout?: import('./uCutout').UCutoutSpec;
  /** Металопрокат (MVP Viyar Metal): id профілю з сортаменту. Довжина відрізка — width. */
  metalProfileId?: string;
  /**
   * Ланцюг профілів «від торця»: сегменти, що продовжують базовий відрізок
   * (прямо / вгору / вниз / вліво / вправо, кут 90°/45°). Джерело істини —
   * тут; деталі розкрою (mseg_*) і 3D-ланцюг — похідні. Див. domain/metalChain.
   */
  metalSegments?: Array<{
    id: string;
    length: number;
    turn: 'straight' | 'up' | 'down' | 'left' | 'right';
    angle: number;
    profileId?: string;
    /**
     * Переміщення «пером угору»: черепашка повертає і йде, але матеріалу
     * немає — ні деталі розкрою, ні маси, ні меша в 3D. Так шаблони
     * (рама, ферма, опора) описують РОЗІРВАНІ конструкції одним ланцюгом,
     * не заводячи другого джерела істини.
     */
    gap?: boolean;
  }>;
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
  /**
   * Кут деталі, від якого міряється чаша ('AB', 'BC', …).
   * Порожньо або відсутнє — від лівого верхнього кута.
   */
  bindCorner?: string;
  /** Відступ від прив'язаного кута деталі до КУТА чаші, мм (як у вирізів) */
  x: number;
  /** Відступ по другій осі, мм */
  y: number;
  /** Внутрішня довжина чаші, мм */
  width: number;
  /** Внутрішня ширина чаші, мм */
  height: number;
  /** Глибина чаші, мм */
  depth: number;
  /**
   * Решітка зливу в дні цієї чаші — водоструменевий різ (28.08).
   * Живе САМЕ на записі мийки: мийка, встановлена у виріб, не має
   * власної панелі властивостей (нею керують зі стільниці), тому
   * зберігати решітку на «деталі мийки» ніде.
   */
  drainGrate?: DrainGrate;
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
  /**
   * МАТЕРІАЛ ВИРОБУ (01.09.2026, рішення власника). Обирається обов'язково
   * при створенні; від нього залежать дозволені товщини деталей
   * (domain/materialThickness) і далі — окрема логіка обробки під кожен
   * матеріал. Необов'язкове поле лише заради старих файлів: там виріб
   * бере `project.projectMaterial` (матеріал першого слеба).
   */
  material?: MaterialType;
  elements: ProductElement[];
  /**
   * Місце виробу на 3D-сцені (хвиля 5, крок 5.1): мм по підлозі від центру
   * сцени + поворот навколо вертикалі, за годинниковою в градусах.
   *
   * ЖИВЕ НА ВИРОБІ, а не на розкладці: placement.transform3d губився при
   * кожному автоматичному розкрої, бо розкладка перебудовується з нуля, —
   * саме тому «вироби злипаються в центрі, їх не розставити». Порожньо —
   * виріб стоїть у детермінованому дефолтному ряду (engines/sceneLayout).
   */
  scenePlacement?: { x: number; z: number; rotationYDeg: number };
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
  /**
   * Артикул номенклатури 1С — те, за чим питається ціна слебу.
   *
   * Окреме поле, а не рядок у comment (де він жив до 25.08.2026):
   * comment — вільна нотатка менеджера, і варто було раз його
   * переписати, як зв'язок слебу з номенклатурою зникав мовчки.
   * Порожньо буває тільки в проєктах, збережених до появи каталогу.
   */
  article?: string;
  /** Виробник із картки каталогу — довідково, у ціні не бере участі */
  manufacturer?: string;
  /** Покриття (полірування, матова тощо) з картки каталогу */
  finish?: string;
  /**
   * Половина листа (рішення 26.08.2026).
   *
   * Артикула на півлиста в 1С НЕ ІСНУЄ — є тільки цілий лист. Тому:
   * у нашій математиці такий слеб важить 0.5 листа, а ціну ми питаємо
   * за ЦІЛИЙ лист (кількість 1) і множимо на 0.5 самі. Інакше в запит
   * пішло б «3.5 листа», чого база не зрозуміє.
   */
  halfSheet?: boolean;
  /**
   * Матеріал замовника — прийшов не з нашого складу (залишок клієнта,
   * чужий виробник). Артикула не має, ціну за нього не питаємо.
   */
  customerOwn?: boolean;
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
  /**
   * Розмір окремо по сторонах (мм). `size` — спільний дефолт, `sideSizes[X]`
   * його перекриває. Поле давно писалось і читалось кодом (редактор обробок,
   * збірка виробу, бланк погодження), але в типі його не було — звідси купа
   * `sideSizes does not exist` у тайпчеку.
   */
  sideSizes?: Record<string, number>;
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
  | 'edge_45' | 'antik'
  // ── каталог «Все кромки» від цеху, 17.09.25 ──
  // технічна фаска <1×1 — існує на керамограніті і кварциті
  | 'tech_chamfer'
  // керамограніт: ZR12 = R2 верх (канонічне ім'я серії 12)
  | 'zr_12'
  // кварцит: серії 20 і 40
  | 'l_20' | 'lv_40' | 'lv_40_inv' | 'o_40' | 'u_40'
  // акрил: радіуси верх
  | 'acr_r3' | 'acr_r6' | 'acr_r8' | 'acr_r10' | 'acr_r12' | 'acr_r20'
  // акрил: радіуси верх+низ (парні); R10/R12 парні = BullNose
  | 'acr_r3_3' | 'acr_r6_6' | 'acr_r8_8' | 'acr_bullnose_r10' | 'acr_bullnose_r12'
  // акрил: фаски і парні фаски
  | 'acr_ch_5x5' | 'acr_ch_10x10' | 'acr_ch_5x5_5x5' | 'acr_ch_10x10_10x10'
  // акрил: увігнутий профіль і галтель плінтуса
  | 'acr_cove_r6' | 'acr_cove_r6_6' | 'acr_fillet_r10r12'
  // акрил: SharkNose (зріз під кутом + мікрорадіус зверху)
  | 'acr_shark45_r0' | 'acr_shark45_r3' | 'acr_shark45_r6'
  | 'acr_shark55_r0' | 'acr_shark55_r2' | 'acr_shark55_r3' | 'acr_shark55_r6'
  | 'acr_shark225_r0' | 'acr_shark225_r3' | 'acr_shark225_r6'
  // акрил: фірмові профілі
  | 'acr_modern' | 'acr_spill_stop' | 'acr_classic1' | 'acr_classic2';

/**
 * Крайки по сторонах деталі.
 *
 * Значення — або сам профіль (старий короткий запис: імпорт бланка, DXF,
 * швидкий вибір у меню ребра), або повна `EdgeTreatment` з лицьовим і
 * тильним ребром, довжиною, прив'язкою і ручною доводкою. Обидва види
 * читаються ТІЛЬКИ через `domain/edgeTreatment` — не розбирай union на
 * місці, інакше повернемось до трьох різних уявлень про одну крайку.
 */
export type EdgeProfileSelection = Record<string, EdgeProfileType | EdgeTreatment | undefined>;

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
   * «Складний радіус» — вибір користувача (ТЗ 19.08, п. 4.8).
   *
   * Нестандартна геометрія, яку прайс не описує стандартними категоріями.
   * Вибір людини сильніший за автомат: якщо позначено, послуга йде окремою
   * позицією «складний радіусний елемент», а для акрилу — окрема матриця.
   */
  complexRadius?: boolean;
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
  /**
   * Відступ від прив'язаного кута деталі, мм: для прямокутника — до найближчого
   * КУТА вирізу, для кола — до ЦЕНТРУ отвору (у кола кута немає).
   * Переведення в центр, з яким працює рушій, — тільки через
   * `domain/cutoutAnchor.ts`.
   */
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
  /** Зсув уздовж ребра, мм від початку сторони */
  offset: number;
  /**
   * Зсув УГЛИБ стільниці, мм від ребра (26.08, прохання продажів).
   * 0 або порожньо — нога стоїть на ребрі, як завжди. Живиться тим самим
   * attachInset, який уже розуміє вся 3D-математика (getEdgeTransform).
   */
  inset?: number;
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
  /** Металопрокат: id профілю з сортаменту (вмикає гілку металу в розкрої та 3D) */
  metalProfileId?: string;
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
  /** Ця деталь — гнутий елемент (прямокутник під дугу). Див. RadiusElementMark. */
  radiusElement?: RadiusElementMark;
  customPoints?: Point[];
  customHoles?: Point[][];
  sideSegments?: Record<string, { start: Point; end: Point }>;
  corners?: Record<string, CornerProcessing>;
  cutouts?: Record<string, SurfaceCutout>;
  /** Фрезерування площини НЕ на всю товщину — проточки для води, декор */
  surfaceGrooves?: SurfaceGrooveGroup[];
  /** Решітка зливу в дні мийки — водоструменевий різ наскрізь */
  drainGrate?: DrainGrate;
}

/**
 * ФРЕЗЕРУВАННЯ ПЛОЩИНИ (28.08.2026, задача власника).
 *
 * Група паралельних канавок, знятих пальчиковою фрезою НЕ на всю
 * товщину. Класика — проточки для стікання води біля врізної мийки;
 * та сама механіка знадобиться для фрезерованого декору фасадів.
 *
 * Група, а не окрема канавка: у житті їх завжди роблять пачкою з
 * однаковим кроком, і менеджер думає саме так — «шість штук через 50».
 *
 * Прив'язка проста і зрозуміла цеху: `x`/`y` — початок ПЕРШОЇ канавки
 * від лівого-верхнього кута деталі; далі група множиться з кроком
 * `pitch` перпендикулярно напрямку `direction`.
 */
export interface SurfaceGrooveGroup {
  id: string;
  /** Початок першої канавки від лівого краю деталі, мм */
  x: number;
  /** Початок першої канавки від верхнього краю деталі, мм */
  y: number;
  /** Напрямок канавок */
  direction: 'horizontal' | 'vertical';
  /** Скільки канавок у групі */
  count: number;
  /** Крок між канавками (від осі до осі), мм */
  pitch: number;
  /** Довжина однієї канавки, мм */
  length: number;
  /**
   * Ширина канавки, мм. НЕ довільна: це слід радіусної фрези, тобто
   * похідна від `cutterRadius` і `depth` (див. domain/grooveCatalog,
   * grooveWidthFor). Зберігається, щоб старі проєкти читались, але
   * джерело істини — радіус фрези.
   */
  width: number;
  /** Радіус фрези, мм. Кварцит — R7, кераміка — R8 (креслення цеху 12.03.25) */
  cutterRadius?: number;
  /** Глибина БІЛЯ МИЙКИ, мм. МЕНША за товщину плити — інакше це наскрізний різ */
  depth: number;
  /**
   * Глибина на ДАЛЬНЬОМУ краю, мм — задає УХИЛ проточки.
   * У цеху канавка завжди з ухилом: 0.5 мм на краю і 3 мм біля мийки,
   * щоб вода текла в чашу, а не стояла. Порожньо — канавка стала.
   */
  depthFar?: number;
  /** Код пресета з каталогу цеху (QGR01-350 тощо), якщо взято з нього */
  presetId?: string;
  /** Форма дна — залежить від фрези */
  profile: 'round' | 'vee' | 'flat';
  /** З якого боку плити фрезерують. Верх — типово для проточок */
  face?: 'top' | 'bottom';
  /** Підпис для бланка і кошторису */
  label?: string;
}

/**
 * РЕШІТКА ЗЛИВУ в дні мийки — водоструменевий різ наскрізь (28.08.2026).
 *
 * Концентричні кільця, розрізані на сегменти з перемичками. Перемички
 * від кільця до кільця повертаються на `twistDeg` — від цього малюнок
 * закручується спіраллю, як на живому виробі, а не виглядає мішенню.
 */
export interface DrainGrate {
  id: string;
  /** Зсув центру від центру дна, мм */
  offsetX: number;
  offsetY: number;
  /** Зовнішній діаметр решітки, мм */
  outerDiameter: number;
  /** Скільки концентричних кілець */
  rings: number;
  /** Ширина прорізу = діаметр струменя води, мм */
  slotWidth: number;
  /** Крок між кільцями (від осі до осі), мм */
  ringGap: number;
  /** На скільки дуг розрізане одне кільце */
  segmentsPerRing: number;
  /** Кутова ширина перемички між дугами, градуси */
  bridgeDeg: number;
  /** Поворот розривів від кільця до кільця, градуси */
  twistDeg: number;
  label?: string;
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
  /**
   * Товщина деталі, мм — успадкована від Detail при explodeDetails.
   * Потрібна розкрою для заборони класти деталь на сляб іншої товщини
   * (рішення 25.08, зроблено 26.08). Опційна заради старих збережених
   * проєктів: без значення заборона не діє.
   */
  thickness?: number;
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
  /**
   * Шви, якими цю деталь розрізали стики (SC-02).
   *
   * Джерело істини — сам різ: довжина шва береться з хорди, по якій рушій
   * фактично розділив контур. Раніше стик існував як картинка й як розріз, але
   * не як гроші: склейка і пропил у кошторис не потрапляли, бо факти читались
   * лише з дерева виробу, а різ живе в геометрії. Список кладеться на ПЕРШИЙ
   * парт розрізаної деталі — щоб один шов не порахувався двічі, по разу з
   * кожного боку.
   */
  jointSeams?: Array<{ lengthMm: number; jointType?: string }>;
  /**
   * Гнутий (радіусний) елемент — смуга, яка обходить скруглений кут (FG-27).
   *
   * Модель Богдана (19.08), свідомо спрощена: у 3D цю ділянку малюємо
   * радіусною, а в розкрій віддаємо ПРЯМОКУТНИК довжиною в зовнішню дугу
   * плюс 30% запасу. Матеріал списується по прямокутнику, як і в будь-якої
   * іншої деталі, а робота цеху — окремою послугою: за штуку і за
   * квадратуру. До цього гнута ділянка йшла в кошторис прямою смугою, тобто
   * найдорожча операція не виставлялась клієнту взагалі.
   */
  radiusElement?: RadiusElementMark;
}

/**
 * Позначка гнутого (радіусного) елемента — FG-27.
 * Їде з чернетки редактора через Detail аж до парта в розкрої, щоб
 * кошторис нарахував виготовлення гнутого елемента (за шт + за м²).
 */
export interface RadiusElementMark {
  radiusMm: number;
  arcLengthMm: number;
  cornerId: string;
  /** Кут розкриття дуги, градуси — частина ключа унікальності матриці */
  arcAngleDeg?: number;
  /** Виліт смуги, мм: товщина краю стільниці або висота опори */
  bandSizeMm?: number;
  /** 'segments' — камінь ріжуть і клеять, 'bending' — акрил гнуть на матриці */
  method?: 'segments' | 'bending';
  /** Роль для прайсу: край стільниці, опора чи нестандарт */
  role?: 'countertop' | 'leg' | 'other';
  /** Кут позначений користувачем як складний */
  complex?: boolean;
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
  /**
   * Деталь покладена ДЗЕРКАЛЬНО (хвиля 3, крок 3.4).
   *
   * Пакер уміє класти деталь у чотирьох поворотах; для несиметричних форм
   * (Г, П, довільний контур) дзеркальний варіант часто лягає щільніше і
   * економить сляб. Відсутнє поле = false, тобто стара поведінка.
   *
   * ОБЕРЕЖНО з текстурою: дзеркалення міняє напрямок малюнку каменю, тому
   * пакер сам його не застосовує, поки проєкт цього не дозволив
   * (`Project.allowMirroring`) — див. engines/packing.
   */
  mirror?: boolean;
  manualLocked: boolean;
  pinnedToSlab?: boolean;
  pinnedSlabId?: string | null;
  pinMode?: 'single' | 'detailSet' | 'textureSet';
  conflict?: boolean;
  outOfBounds?: boolean;
  /**
   * Товщина деталі не збігається з товщиною слеба — текст із числами
   * («товщина деталі 12 мм ≠ товщині слеба 20 мм»). ПОПЕРЕДЖЕННЯ, не
   * конфлікт: деталь лишається на слебі (рішення власника 26.08), але
   * розбіжність видно на дошці. Проставляється в detectConflicts.
   */
  thicknessWarning?: string;
  transform3d?: { x: number; y: number; z: number; rx: number; ry: number; rz: number; };
  /**
   * Деталь поставлена РУКАМИ (перетягнули, повернули, дістали з буфера) —
   * хвиля 5, крок 5.2.
   *
   * Це не замок (`manualLocked`), а факт: тут працювала людина. Правка
   * виробу більше не перескладає такі деталі з нуля — саме через це
   * «найдорожча робота користувача не зберігалась» (П-3): достатньо було
   * додати виріз, і вручну зібраний малюнок каменю зникав.
   *
   * Свідоме перескладання (кнопки «Економний»/«Оптимальний», з
   * підтвердженням) прапорець ігнорує — там людина сама просить заново.
   */
  manualPlaced?: boolean;
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
  /**
   * Версія ФОРМАТУ файла (28.08.2026). Відсутнє поле = 1 — усе, що
   * створено раніше. Читається і мігрується ТІЛЬКИ через
   * domain/projectMigrations.ts — не порівнюй і не проставляй на місці.
   */
  formatVersion?: number;
  orderNumber: string;
  customer: string;
  /** id організації в Customers Service — порожньо, якщо контрагента вписали руками */
  customerId?: string;
  /** Код/ЄДРПОУ контрагента з довідника — їдуть у документи разом із назвою */
  customerCode?: string;
  customerEdrpou?: string;
  /** Контактна особа контрагента (Customer у довіднику) та її телефон */
  customerContactName?: string;
  customerContactPhone?: string;
  customerContactEmail?: string;
  uiLanguage: UiLanguage;
  textureSelectionEnabled: boolean;
  slabTypes: SlabType[];
  slabs: SlabInstance[];
  projectMaterial?: MaterialType;
  projectThickness?: number;
  /**
   * ПРИМІЩЕННЯ (база) — 01.09.2026, рішення власника. Не елемент і не
   * деталь: у розкрій не йде, у гроші не потрапляє; опційний шар у 3D
   * Підборі. Необов'язкове поле — старі файли без нього. Модель і
   * математика — domain/room.ts.
   */
  room?: import('./room').RoomModel;
  products?: Product[];
  details: Detail[];
  placements: Placement[];
  textureLayouts: TextureLayout[];
  textureFrames: TextureFrame[];
  manualDimensions: ManualDimension[];
  calculationStatus: CalculationStatus;
  unplacedPartIds: string[];
  unplacedReasons?: Record<string, string>;
  /**
   * FG-32 — «Заблокувати розкрій».
   *
   * Поки увімкнено, жодна правка виробу не перескладає розкладку: уже
   * розміщені деталі лишаються там, де їх поклали, разом із підбором
   * текстури. Деталі, яких у розкладці ще немає (нові або ті, що змінили
   * розмір), падають у буфер нерозміщених — менеджер кладе їх сам.
   */
  nestingLocked?: boolean;
  /**
   * Дозволити пакеру класти деталі дзеркально (хвиля 3, крок 3.4).
   *
   * За замовчуванням ВИМКНЕНО і це свідомо: дзеркалення розвертає малюнок
   * каменю, а на декорах із напрямком (прожилки, «дерево») перевернута
   * деталь помітна в готовому виробі. Вмикається на проєкт, коли декор
   * дозволяє — тоді нестинг отримує вдвічі більше варіантів укладання.
   */
  allowMirroring?: boolean;
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

