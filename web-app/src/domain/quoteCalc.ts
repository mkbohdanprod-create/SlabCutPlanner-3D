/**
 * Прорахунок для клієнта — довідники й типи документа.
 *
 * Це ОКРЕМА математика від виробничого BOM: тут вартість формується від
 * площі/довжини/штук виробів за номенклатурами «Виготовлення …», а не від
 * порізки й кромок (ТЗ «Логіка калькуляції» §11: модель обробки торця на
 * вартість не впливає — обробки лишаються інформацією для креслень).
 *
 * Усі переліки — дані, не код: виробники, типи виробів, послуги й зони
 * виїзду редагуватимуться старшими менеджерами, тому жодне правило не
 * зашите у switch-и движка.
 */

// ── Матеріали і виробники (ТЗ §1–2) ─────────────────────────────────

export const QUOTE_MATERIAL_TYPES = [
  'Керамограніт',
  'Штучний кварцит',
  'Натуральний камінь',
  'Акриловий камінь',
] as const;
export type QuoteMaterialType = (typeof QUOTE_MATERIAL_TYPES)[number];

/**
 * Виробники за номенклатурами 1С «Виготовлення …». «Під проект» —
 * офіційний фолбек кожного матеріалу: на нього лягає все, чого в
 * переліку немає (див. domain/quote1cCatalog.ts).
 */
export const DEFAULT_MANUFACTURERS: Record<QuoteMaterialType, string[]> = {
  'Керамограніт': ['Laminam', 'Supernova', 'Inalco', 'Marazzi', 'Під проект'],
  'Штучний кварцит': ['Avant', 'Caesarstone', 'TermopalStone', 'Під проект'],
  'Натуральний камінь': ['Antolini', 'Під проект'],
  'Акриловий камінь': ['Getacore', 'Grandex', 'Під проект'],
};

/** Тип поверхні — лише для акрилового каменю (ТЗ §8) */
export const ACRYLIC_SURFACE_TYPES = ['Мат', 'Напівглянець', 'Глянець'] as const;

// ── Способи виготовлення (ТЗ §4) ────────────────────────────────────

export const QUOTE_METHODS = [
  { id: 'drawing', label: 'За кресленням замовника' },
  { id: 'measure_install', label: 'З заміром та монтажем' },
  { id: 'sink_only', label: 'Окрема мийка' },
] as const;
export type QuoteMethodId = (typeof QUOTE_METHODS)[number]['id'];

// ── Вироби (ТЗ §5–7) ────────────────────────────────────────────────

export type QuoteUnit = 'm2' | 'mp' | 'pcs' | 'sheet' | 'service';

export const QUOTE_UNIT_LABELS: Record<QuoteUnit, string> = {
  m2: 'м²',
  mp: 'м.п.',
  pcs: 'шт',
  sheet: 'лист',
  service: 'послуга',
};

/** Категорії монтажу — окремі номенклатури (Логіка §10) */
export type MontageCategory =
  | 'countertop_plain'
  | 'countertop_thick'
  | 'wall_panel'
  | 'windowsill'
  | 'stairs';

export interface QuoteProductType {
  id: string;
  label: string;
  /** Одиниця тарифікації виготовлення (ТЗ §7) */
  unit: QuoteUnit;
  /** Основний виріб чи додатковий (ТЗ §5 проти §6) */
  kind: 'main' | 'additional';
  /**
   * Куди йде монтаж. null — не монтується: мийка в площу монтажу не йде,
   * фасади не монтуємо (Логіка §2, §6).
   */
  montage: MontageCategory | null;
  /**
   * Нога та опуски не мають власної номенклатури виготовлення — їхня
   * площа вливається в площу стільниці (Логіка §3–4). foldInto вказує,
   * у які номенклатури (в порядку пріоритету) вливати площу.
   */
  foldInto?: string[];
  /** Доступний у способі «Окрема мийка» */
  sinkFlow?: boolean;
}

export const QUOTE_PRODUCT_TYPES: QuoteProductType[] = [
  { id: 'countertop_plain', label: 'Стільниця без потовщень', unit: 'm2', kind: 'main', montage: 'countertop_plain' },
  { id: 'countertop_thick', label: 'Стільниця з потовщенням', unit: 'm2', kind: 'main', montage: 'countertop_thick' },
  { id: 'wall_panel_ge12', label: 'Стінова панель від 12 мм', unit: 'm2', kind: 'main', montage: 'wall_panel' },
  { id: 'wall_panel_lt12', label: 'Стінова панель до 12 мм', unit: 'm2', kind: 'main', montage: 'wall_panel' },
  { id: 'sink', label: 'Мийка', unit: 'pcs', kind: 'main', montage: null, sinkFlow: true },
  { id: 'washbasin', label: 'Раковина', unit: 'pcs', kind: 'main', montage: null, sinkFlow: true },
  { id: 'windowsill', label: 'Підвіконня', unit: 'mp', kind: 'main', montage: 'windowsill' },
  { id: 'stairs', label: 'Сходи', unit: 'mp', kind: 'main', montage: 'stairs' },
  { id: 'facade', label: 'Меблевий фасад', unit: 'm2', kind: 'main', montage: null },
  { id: 'skirting', label: 'Плінтус', unit: 'mp', kind: 'additional', montage: null },
  {
    id: 'leg', label: 'Нога', unit: 'm2', kind: 'additional', montage: null,
    foldInto: ['countertop_thick', 'countertop_plain'],
  },
  { id: 'overlay', label: 'Декоративна накладка', unit: 'm2', kind: 'additional', montage: null },
];

export const quoteProductType = (id: string) =>
  QUOTE_PRODUCT_TYPES.find((item) => item.id === id);

/** Форми виробу — впливають лише на обчислення площі */
export const QUOTE_SHAPES = ['Пряма', 'Г-подібна', 'П-подібна'] as const;
export type QuoteShape = (typeof QUOTE_SHAPES)[number];

/** Стик Г-П-подібних стільниць (ТЗ §11) — інформація для креслень і цеху */
export const QUOTE_JOINT_ORIENTATIONS = ['Вертикальний', 'Горизонтальний', 'Діагональний'] as const;

// ── Додаткові послуги (ТЗ §10 + стики з Логіки §2) ──────────────────

export interface QuoteServiceDef {
  id: string;
  label: string;
  unit: QuoteUnit;
}

export const QUOTE_SERVICES: QuoteServiceDef[] = [
  { id: 'quarter_pick', label: 'Вибірка чверті', unit: 'mp' },
  { id: 'texture_match', label: 'Підбір текстури', unit: 'service' },
  { id: 'calibration', label: 'Калібрування поверхні', unit: 'm2' },
  { id: 'base_paint', label: 'Фарбування основи', unit: 'm2' },
  { id: 'customer_sink_install', label: 'Монтаж мийки замовника', unit: 'pcs' },
  { id: 'metal_frame', label: 'Розробка металокаркасу', unit: 'service' },
  { id: 'hob_cutout', label: 'Виріз під варильну поверхню', unit: 'pcs' },
  { id: 'sink_cutout', label: 'Виріз під мийку', unit: 'pcs' },
  { id: 'customer_socket_clad', label: 'Облицювання розетки замовника', unit: 'pcs' },
  { id: 'drain_button_clad', label: 'Облицювання кнопки зливу', unit: 'pcs' },
  { id: 'radiator_grooves', label: 'Проточки для батареї', unit: 'mp' },
  { id: 'water_grooves', label: 'Проточки для стоку води', unit: 'pcs' },
  { id: 'stone_socket', label: 'Розетка з каменю', unit: 'pcs' },
  { id: 'stone_switch', label: 'Вимикач з каменю', unit: 'pcs' },
  { id: 'joint_flat', label: 'Стикування деталей в площині', unit: 'pcs' },
  { id: 'joint_leg', label: 'Стикування «Ноги» з виробом', unit: 'mp' },
];

// ── Пакування (Логіка §1) ───────────────────────────────────────────

export const PYRAMID_LENGTHS = [1200, 1600, 2000, 2400, 2800, 3200] as const;

// ── Виїзд (Логіка §2) ───────────────────────────────────────────────

/** Зона 0 — біля філії, без доплати; далі 5 рівнів за відстанню */
export const DELIVERY_ZONES = [0, 1, 2, 3, 4, 5] as const;

// ── Прайс ───────────────────────────────────────────────────────────

/**
 * Ціни за замовчуванням — нулі: реальний прайс наповнюють старші
 * менеджери в налаштуваннях прорахунку (шестерня у вкладці). Менеджер
 * на місці може вписати ціну прямо в рядок розрахунку — вона
 * зберігається в документі як priceOverrides і має пріоритет над прайсом.
 */
export interface QuotePriceBook {
  /** Виготовлення: тип виробу → базова ціна за одиницю (ТЗ: своя номенклатура на виробника) */
  fabrication: Record<string, number>;
  /** Виготовлення з уточненням виробника: тип виробу → виробник → ціна */
  fabricationByManufacturer: Record<string, Record<string, number>>;
  /** Замір — своя номенклатура на кожен тип матеріалу (Логіка §9) */
  measure: Record<string, number>;
  /** Монтаж за категоріями (Логіка §10) */
  montage: Record<MontageCategory, number>;
  /** Доплата за виїзд по зонах, індекс = зона (Логіка §2) */
  deliveryZones: number[];
  /** Дерев'яна піраміда за довжиною, грн/шт */
  pyramid: Record<number, number>;
  /** Пакування в короб, грн/м² */
  boxPerM2: number;
  /** Додаткові послуги */
  services: Record<string, number>;
  /** Матеріал, грн/лист */
  sheet: number;
  /**
   * РУЧНІ коди номенклатур 1С — перекривають вбудований довідник
   * (domain/quote1cCatalog.ts, 70 позицій «Виготовлення …»).
   *
   * Ключі:
   *   fab:{тип}:{матеріал}:{виробник} — точна номенклатура
   *     («Під проект» повторюється в усіх матеріалах, тому матеріал
   *      у ключі обов'язковий для розрізнення)
   *   fab:{тип}:{виробник} і fab:{тип} — спрощені фолбеки
   *   measure:{тип матеріалу} · montage:{категорія} · delivery:{зона}
   *   pyramid:{довжина} · box · sheet · svc:{послуга}
   */
  codes1c: Record<string, string>;
}

export const DEFAULT_QUOTE_PRICE_BOOK: QuotePriceBook = {
  fabrication: {},
  fabricationByManufacturer: {},
  measure: {},
  montage: {
    countertop_plain: 0,
    countertop_thick: 0,
    wall_panel: 0,
    windowsill: 0,
    stairs: 0,
  },
  deliveryZones: [0, 0, 0, 0, 0, 0],
  pyramid: { 1200: 0, 1600: 0, 2000: 0, 2400: 0, 2800: 0, 3200: 0 },
  boxPerM2: 0,
  services: {},
  sheet: 0,
  codes1c: {},
};

export const QUOTE_MONTAGE_LABELS: Record<MontageCategory, string> = {
  countertop_plain: 'Монтаж стільниць без потовщень',
  countertop_thick: 'Монтаж стільниць з потовщенням',
  wall_panel: 'Монтаж стінових панелей',
  windowsill: 'Монтаж підвіконь',
  stairs: 'Монтаж сходів',
};

/** Усі відомі виробники — для редактора цін по виробниках */
export const ALL_MANUFACTURERS: string[] = Array.from(new Set(
  Object.values(DEFAULT_MANUFACTURERS).flat(),
));

/**
 * Злиття збереженого прайсу з вбудованими замовчуваннями: нові поля
 * (нова категорія монтажу, нова послуга) доїжджають до тих, хто вже
 * щось зберіг, а виставлені ціни й коди — не перетираються.
 */
export function mergeQuotePriceBook(saved?: Partial<QuotePriceBook> | null): QuotePriceBook {
  const base = DEFAULT_QUOTE_PRICE_BOOK;
  return {
    fabrication: { ...base.fabrication, ...(saved?.fabrication ?? {}) },
    fabricationByManufacturer: { ...base.fabricationByManufacturer, ...(saved?.fabricationByManufacturer ?? {}) },
    measure: { ...base.measure, ...(saved?.measure ?? {}) },
    montage: { ...base.montage, ...(saved?.montage ?? {}) },
    deliveryZones: base.deliveryZones.map((value, zone) => saved?.deliveryZones?.[zone] ?? value),
    pyramid: { ...base.pyramid, ...(saved?.pyramid ?? {}) },
    boxPerM2: saved?.boxPerM2 ?? base.boxPerM2,
    services: { ...base.services, ...(saved?.services ?? {}) },
    sheet: saved?.sheet ?? base.sheet,
    codes1c: { ...base.codes1c, ...(saved?.codes1c ?? {}) },
  };
}

// ── Документ прорахунку ─────────────────────────────────────────────

export interface QuoteItemDims {
  /** Основне плече, мм */
  w?: number;
  h?: number;
  /** Друге плече Г/П-подібної, мм */
  w2?: number;
  h2?: number;
  /** Третє плече П-подібної, мм */
  w3?: number;
  h3?: number;
  /** Довжина для м.п.-виробів, мм */
  l?: number;
}

export interface QuoteItem {
  id: string;
  productTypeId: string;
  /** Кількість однотипних виробів (бланк §7) */
  count: number;
  shape: QuoteShape;
  thicknessMm?: number;
  dims: QuoteItemDims;
  /** Модель — для мийки/раковини (впливає лише на розкрій) */
  model?: string;
  /** Обробки торців/вирізи — інформація для креслень, на ціну не впливає */
  processingNote?: string;
  /** Орієнтація стику Г/П-подібної (ТЗ §11) */
  jointOrientation?: string;
  /**
   * ФАКТИЧНА площа одного виробу з розкрою, м² (з радіусами, вирізами
   * й опусками). Коли задана — має пріоритет над обчисленням із dims:
   * ТЗ вимагає тарифікувати фактичну площу, а не габарит.
   */
  areaM2?: number;
  /** Фактична довжина одного виробу з розкрою, м.п. — аналогічно */
  lengthM?: number;
  /** Звідки виріб підтягнуто (id деталі проєкту). Порожньо — введений вручну */
  sourceRef?: string;
  /** Назва з проєкту для показу в списку */
  sourceLabel?: string;
}

export interface QuoteCalcDoc {
  method: QuoteMethodId;
  branch: string;
  contragent: string;
  contactName: string;
  contactPhone: string;
  /** Лише для «З заміром та монтажем» */
  address: string;
  deliveryZone: number;
  materialType: QuoteMaterialType;
  manufacturer: string;
  decorCode: string;
  /** Лише акрил, і не для «Окрема мийка» */
  surfaceType: string;
  comment: string;
  items: QuoteItem[];
  /** id послуги → кількість в її одиницях */
  services: Record<string, number>;
  packaging: {
    pyramidLength: number;
    pyramidQty: number;
    boxM2: number;
  };
  /** Листів матеріалу, крок 0.5 (лист/півлиста) */
  materialSheets: number;
  /** Ручні ціни за рядками розрахунку: id рядка → грн за одиницю */
  priceOverrides: Record<string, number>;
}

export function createQuoteCalcDoc(): QuoteCalcDoc {
  return {
    method: 'drawing',
    branch: '',
    contragent: '',
    contactName: '',
    contactPhone: '',
    address: '',
    deliveryZone: 0,
    materialType: 'Керамограніт',
    manufacturer: '',
    decorCode: '',
    surfaceType: '',
    comment: '',
    items: [],
    services: {},
    packaging: { pyramidLength: 0, pyramidQty: 1, boxM2: 0 },
    materialSheets: 0,
    priceOverrides: {},
  };
}
