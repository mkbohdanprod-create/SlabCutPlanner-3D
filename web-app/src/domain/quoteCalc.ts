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

/**
 * Базова поверхня акрилу — такою плита ПРИХОДИТЬ від виробника (FG-33).
 *
 * Правило Богдана (19.08): послуга «обробка поверхні» нараховується ТІЛЬКИ
 * коли цільова поверхня інша за базову — тоді цех реально матує або
 * доводить до глянцю. Решта матеріалів іде «як купується», тому для них
 * ані бази, ані послуги не існує.
 */
export const ACRYLIC_BASE_SURFACE = 'Напівглянець';

// ── Способи виготовлення (ТЗ §4) ────────────────────────────────────

export const QUOTE_METHODS = [
  { id: 'drawing', label: 'За кресленням замовника' },
  { id: 'measure_install', label: 'З заміром та монтажем' },
  { id: 'sink_only', label: 'Окрема мийка' },
] as const;
export type QuoteMethodId = (typeof QUOTE_METHODS)[number]['id'];

// ── Метод оплати (для рахунку в Orders-ERP) ─────────────────────────

/**
 * Види оплати, які приймає ERP: `id` — це рівно те слово, яким вид
 * оплати зветься в 1С, і саме воно їде в `payment_type` замовлення.
 * Підпис поруч — щоб менеджер читав поле людською мовою, а не
 * «ОплатаЧастямиПлатиПозже».
 *
 * Перелік — дані, не код: новий банк розстрочки додається рядком тут.
 */
export const QUOTE_PAYMENT_TYPES = [
  { id: 'Готівка', label: 'Готівка' },
  { id: 'ПокупецьБезПДВ', label: 'Покупець без ПДВ' },
  { id: 'ОплатаВОфісі', label: 'Оплата в офісі' },
  { id: 'ОнлайнОплата', label: 'Онлайн-оплата' },
  { id: 'ОплатаЧастямиПриватБанк', label: 'Оплата частинами (ПриватБанк)' },
  { id: 'ОплатаЧастямиПлатиПозже', label: 'Оплата частинами (Плати пізніше)' },
  { id: 'ОплатаЧастямиМоноБанк', label: 'Оплата частинами (monobank)' },
  { id: 'ОплатаЧастямиПУМББанк', label: 'Оплата частинами (ПУМБ)' },
] as const;
export type QuotePaymentTypeId = (typeof QUOTE_PAYMENT_TYPES)[number]['id'];

export const quotePaymentLabel = (id: string) =>
  QUOTE_PAYMENT_TYPES.find((type) => type.id === id)?.label ?? id;

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
  /*
   * Радіусні (гнуті) елементи — ТЗ 19.08. Кількості рахує autoQuoteServices
   * з позначок на деталях розкрою; категорію (стільниця/опора, розмір,
   * складний) визначає domain/radiusElement. Камінь — сегментація,
   * акрил — гнуття + матриця за унікальними геометріями.
   */
  { id: 'radius_ct80', label: 'Радіусний кут стільниці до 80 мм', unit: 'pcs' },
  { id: 'radius_ct200', label: 'Радіусний кут стільниці 80–200 мм', unit: 'pcs' },
  { id: 'radius_leg900', label: 'Радіусна опора до 900 мм', unit: 'pcs' },
  { id: 'radius_leg_tall', label: 'Радіусна опора від 900 мм', unit: 'pcs' },
  { id: 'radius_complex', label: 'Складний радіусний елемент', unit: 'pcs' },
  { id: 'radius_bend', label: 'Гнуття деталей (акрил)', unit: 'pcs' },
  { id: 'radius_matrix', label: 'Матриця для термоформінгу (акрил)', unit: 'pcs' },
];

/** Категорія послуги радіуса → id рядка Прорахунку. */
export const RADIUS_QUOTE_SERVICE_ID: Record<string, string> = {
  countertop_le80: 'radius_ct80',
  countertop_80_200: 'radius_ct200',
  leg_le900: 'radius_leg900',
  leg_gt900: 'radius_leg_tall',
  complex: 'radius_complex',
  bend_le600: 'radius_bend',
  bend_gt600: 'radius_bend',
};

// ── Пакування (Логіка §1) ───────────────────────────────────────────

export const PYRAMID_LENGTHS = [1200, 1600, 2000, 2400, 2800, 3200] as const;

// ── Виїзд (Логіка §2) ───────────────────────────────────────────────

/** Зона 0 — біля філії, без доплати; далі 5 рівнів за відстанню */
export const DELIVERY_ZONES = [0, 1, 2, 3, 4, 5] as const;

// ── Прайс ───────────────────────────────────────────────────────────

/**
 * Ціни за замовчуванням — нулі: рядки тарифікує 1С за кодами
 * номенклатур (див. engines/quoteCalc.ts). Цей прайс лишається фолбеком —
 * його наповнюють старші менеджери в налаштуваннях прорахунку (шестерня у
 * вкладці) для рядків без коду 1С і на випадок, коли сервіс недоступний.
 * Ручного вводу ціни в рядку немає: сума рахується сама.
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
  services: {
    /*
     * Порожньо свідомо. Ціни в прорахунку більше не заводяться руками —
     * єдине джерело ціни це 1С за кодом номенклатури (рішення 25.08.2026).
     * Раніше тут лежали сім роздрібних цін на радіусні елементи з ТЗ 19.08;
     * прибрані, щоб застарілий прайс не поїхав у продакшн і щоб відсутня
     * відповідь 1С не маскувалась «правдоподібним» числом.
     * Коди 1С лишаються в codes1c — саме за ними питається ціна.
     */
  },
  sheet: 0,
  codes1c: {
    /* Коди 1С радіусних послуг. Номенклатура подвоєна за матеріалом, а
       Прорахунок веде один рядок на категорію — тому тут коди керамограніту
       як найчастішого; точний код за матеріалом підставляє кошторис (BOM). */
    'svc:radius_ct80': '298634',
    'svc:radius_ct200': '298635',
    'svc:radius_leg900': '298636',
    'svc:radius_leg_tall': '298637',
    'svc:radius_complex': '298638',
    'svc:radius_bend': '200433',
    'svc:radius_matrix': '229536',
  },
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

/**
 * Обнуляє всі ручні ціни прайсу прорахунку, лишаючи коди 1С.
 *
 * Потрібна тому, що прайс персиститься в localStorage: прибрати ціни з
 * дефолтів недостатньо — у того, хто вже відкривав додаток, збережена
 * копія лишиться і мовчки перекриє відповідь 1С. Викликається в
 * міграції сховища (v6) і при імпорті налаштувань зі старого файлу.
 *
 * Структуру не ламаємо: поля лишаються на місці з нулями, щоб старий
 * імпорт/експорт і тести читались без спецвипадків.
 */
export function stripQuotePrices(book: QuotePriceBook): QuotePriceBook {
  const zero = <T extends Record<string, number>>(source: T): T =>
    Object.fromEntries(Object.keys(source).map((key) => [key, 0])) as T;
  return {
    ...book,
    fabrication: zero(book.fabrication),
    fabricationByManufacturer: Object.fromEntries(
      Object.entries(book.fabricationByManufacturer).map(([id, pairs]) => [id, zero(pairs)]),
    ),
    measure: zero(book.measure),
    montage: zero(book.montage),
    deliveryZones: book.deliveryZones.map(() => 0),
    pyramid: zero(book.pyramid),
    boxPerM2: 0,
    services: zero(book.services),
    sheet: 0,
    codes1c: { ...book.codes1c },
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

/**
 * Замовлення, створене з цього прорахунку (be-orders-service).
 *
 * Живе в документі, а не в стані панелі: номер має пережити перезавантаження
 * і поїхати разом із проєктом. Наявність поля — це і є ознака «прорахунок
 * підтверджено»: другий раз замовлення з нього не створюється.
 *
 * `total` тут — сума, на яку замовлення виписане. Прорахунок після цього
 * можна правити далі, і саме розбіжність із поточним підсумком показує, що
 * замовлення вже не відповідає документу.
 */
export interface QuoteOrderRef {
  /** Номер замовлення від сервісу, PREFIX-YY-NNNNNN */
  externalId: string;
  /** Ідентифікатори документів у сервісі — за ними шукають замовлення */
  orderId: string;
  orderDetailsId: string;
  /** ISO-час створення */
  createdAt: string;
  /** Хто підтвердив (пошта/ім'я менеджера) */
  createdBy: string;
  total: number;
}

export interface QuoteCalcDoc {
  method: QuoteMethodId;
  branch: string;
  /**
   * id філії з Locations Service — порожньо, якщо вписали руками.
   * Той самий бекенд цін, що бере contragentId, приймає й
   * shipment_branch, тому в майбутньому саме звідси братиметься доплата
   * за виїзд і тарифікація «Замір і монтаж» за філією.
   */
  branchId: string;
  contragent: string;
  /**
   * id організації в Customers Service — порожньо, якщо контрагента
   * вписали руками. Ним 1С вмикає знижку клієнта,
   * тому при ручному редагуванні назви id обов'язково скидається: інакше
   * ціни рахувались би для контрагента, якого в полі вже немає.
   */
  contragentId: string;
  contactName: string;
  contactPhone: string;
  /** Лише для «З заміром та монтажем» */
  address: string;
  deliveryZone: number;
  materialType: QuoteMaterialType;
  manufacturer: string;
  /**
   * Код декору, введений руками. Поле прибране з інтерфейсу 25.08.2026 —
   * декор приходить зі слеба. Лишається в типі, щоб раніше збережені
   * документи читались і показували те, що в них уже записано.
   */
  decorCode: string;
  /** Лише акрил, і не для «Окрема мийка» */
  surfaceType: string;
  /**
   * Вид оплати з довідника ERP (QUOTE_PAYMENT_TYPES) — без нього в 1С не
   * виписати рахунок. Порожньо у прорахунках, збережених до появи поля:
   * тоді замовлення їде зі значенням зі змінної оточення або без нього.
   */
  paymentType?: QuotePaymentTypeId | '';
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
  /** Останнє замовлення в Orders Service — з'являється при підтвердженні прорахунку */
  order?: QuoteOrderRef;
  /**
   * Раніше створені з цього ж прорахунку замовлення.
   *
   * Друге замовлення — свідома дія (перше зіпсували, прорахунок доробили),
   * і попередній номер при цьому не має зникати: в ERP те замовлення
   * лишається живим, поки його там не скасують.
   */
  orderHistory?: QuoteOrderRef[];
  /**
   * Матеріал зі СЛЕБІВ проєкту — по рядку на артикул (рішення 25.08.2026).
   *
   * Слеб береться з каталогу разом з артикулом, тож у прорахунку матеріал
   * не треба заводити вдруге: кількість — це скільки листів цього артикулу
   * додано, а ціну за артикулом дає 1С, точно як за послуги.
   *
   * Поле НЕ зберігається в документі: воно щоразу виводиться зі слебів
   * (див. QuotePanel), бо джерело істини — список слебів, а не копія в
   * прорахунку. Порожньо або відсутнє — працює старий ручний
   * `materialSheets`, щоб проєкти без слебів рахувались як раніше.
   */
  materials?: QuoteMaterialLine[];
}

/**
 * Матеріал слеба → матеріал прорахунку.
 *
 * У програмі ДВА словники матеріалів, і вони не збігаються: слеб знає
 * «Кварцит» і «Акрил», прорахунок — «Штучний кварцит» і «Акриловий
 * камінь». Поки слеб і прорахунок жили окремо, це нікому не заважало;
 * тепер матеріал прорахунку береться зі слеба, і без цієї таблиці він
 * мовчки лишався б старим.
 *
 * `Компакт-плита` пари в прорахунку НЕ МАЄ — повертаємо undefined, і
 * викликач лишає те, що було. Це відкрите питання, не рішення:
 * див. «Введення слебів — розбір», Частина 2.
 */
export function quoteMaterialFromSlab(material: string): QuoteMaterialType | undefined {
  const map: Record<string, QuoteMaterialType> = {
    'Керамограніт': 'Керамограніт',
    'Кварцит': 'Штучний кварцит',
    'Штучний кварцит': 'Штучний кварцит',
    'Натуральний камінь': 'Натуральний камінь',
    'Акрил': 'Акриловий камінь',
    'Акриловий камінь': 'Акриловий камінь',
  };
  return map[material];
}

/**
 * Декор документа. Береться зі слебів, а окреме поле «Декор (код з сайту)»
 * прибране 25.08.2026: декор приходить разом зі слебом і дублювати його
 * руками не треба. `decorCode` лишився в типі тільки заради документів,
 * збережених раніше.
 */
export function quoteDecorLabel(doc: Pick<QuoteCalcDoc, 'materials' | 'decorCode'>): string {
  const fromSlabs = [...new Set((doc.materials ?? []).map((line) => line.decor).filter(Boolean))];
  if (fromSlabs.length) return fromSlabs.join(', ');
  return doc.decorCode || '';
}

/** Один артикул матеріалу і скільки його листів у проєкті */
export interface QuoteMaterialLine {
  /** Артикул 1С слебу. Порожньо — слеб доданий до появи каталогу */
  article: string;
  /** Стабільний ключ рядка, коли артикула немає */
  key: string;
  material: string;
  decor: string;
  thickness: number;
  /** Скільки листів цього артикулу */
  qty: number;
}
// Документи, збережені до переходу на ціни з 1С, ще носять у собі
// priceOverrides (ручні ціни рядків). Поле навмисно прибрано з типу —
// воно більше не читається, ціну визначає сервіс, а не менеджер.

export function createQuoteCalcDoc(): QuoteCalcDoc {
  return {
    method: 'drawing',
    branch: '',
    branchId: '',
    contragent: '',
    contragentId: '',
    contactName: '',
    contactPhone: '',
    address: '',
    deliveryZone: 0,
    materialType: 'Керамограніт',
    manufacturer: '',
    decorCode: '',
    surfaceType: '',
    paymentType: '',
    comment: '',
    items: [],
    services: {},
    packaging: { pyramidLength: 0, pyramidQty: 1, boxM2: 0 },
    materialSheets: 0,
  };
}
