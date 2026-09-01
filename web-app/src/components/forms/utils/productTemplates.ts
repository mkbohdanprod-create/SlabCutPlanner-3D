import { createDraft } from './draftHelpers';
import type { DetailDraft, ProductEditorSession } from './draftHelpers';
import type { SurfaceCutout, Point } from '../../../domain/types';

/**
 * Шаблони виробів (адмін-фіча, на релізі схована за щитом).
 *
 * Ідея: менеджер не збирає типовий виріб по деталі, а бере заготовку —
 * «Г-подібна стільниця», «Острів з ногою», «Портал», — підправляє два-три
 * розміри і одразу бачить зібраний виріб у 3D.
 *
 * Кожен шаблон повертає ГОТОВУ сесію редактора виробу (ProductEditorSession):
 * головна деталь + суб-деталі за слотами. Контракти слотів диктує
 * buildProductFromSession (ProductEditorWorkspace.tsx):
 *   · ключ суб-деталі = слот: `leg_<сторона>` → Опора (стик «водоспад», 45°),
 *     `wall_panel_<сторона>` → Стінова панель (стик встик);
 *   · ширина суб-деталі = довжина сторони кріплення, висота = вертикальний
 *     розмір панелі; товщина і кількість — від головної деталі;
 *   · EdgeFeature `thickening` НЕ кладемо в субдеталі — це поле головної
 *     деталі, buildProductFromSession сам породить доповнення, які цех
 *     називає «Підворот» (§2.4; назви виправлені 10.08, коди — ні).
 * Сторони звіряй із контуром рушія (getSideSize + sideNames.test.ts):
 * прямокутник A верх / B права / C низ / D ліва; Г-форма A і F — до стін,
 * B, C, D, E — відкриті торці.
 *
 * Плінтус (Бортик) у шаблони свідомо не входить: тип «Бортик» відсутній у
 * DetailType і в наявному коді проставляється через as any — множити це
 * заборонено (маніфест §7). Плінтус додається як і раніше, з меню сторони.
 */

export type TemplateValues = Record<string, number | string | boolean>;

/**
 * Куди параметр іде у вікні шаблонів:
 *   'sketch'  — розмір, редагується прямо на схемі (дефолт);
 *   'options' — опція збоку (вмикачі решіток, їхні налаштування).
 */
export type TemplateParamGroup = 'sketch' | 'options';

export interface TemplateNumberParam {
  kind: 'number';
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  unit: string;
  group?: TemplateParamGroup;
  /** Ключ зони, якщо параметр належить конкретній деталі виробу */
  zone?: string;
}

export interface TemplateChoiceParam {
  kind: 'choice';
  key: string;
  label: string;
  default: string;
  options: Array<{ value: string; label: string }>;
  group?: TemplateParamGroup;
  zone?: string;
}

export interface TemplateToggleParam {
  kind: 'toggle';
  key: string;
  label: string;
  default: boolean;
  group?: TemplateParamGroup;
  zone?: string;
}

export type TemplateParam = TemplateNumberParam | TemplateChoiceParam | TemplateToggleParam;

export interface ProductTemplate {
  id: string;
  name: string;
  description: string;
  params: TemplateParam[];
  build: (values: TemplateValues) => ProductEditorSession;
}

/** Число з форми: нечисле або порожнє → дефолт; завжди в межах min..max. */
function num(p: TemplateNumberParam, values: TemplateValues): number {
  const raw = values[p.key];
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : p.default;
  return Math.min(p.max, Math.max(p.min, n));
}

/** Вибір з форми: незнайоме значення → дефолт (щоб зіпсований стан не зламав build). */
function choice(p: TemplateChoiceParam, values: TemplateValues): string {
  const raw = values[p.key];
  return p.options.some((o) => o.value === raw) ? (raw as string) : p.default;
}

/** Вмикач: усе, що не булеве, — дефолт. */
function flag(p: TemplateToggleParam, values: TemplateValues): boolean {
  const raw = values[p.key];
  return typeof raw === 'boolean' ? raw : p.default;
}

function mainDraft(patch: Partial<DetailDraft>): DetailDraft {
  return { ...createDraft(), ...patch };
}

/**
 * Суб-деталь для слота leg_* / wall_panel_*.
 * width = довжина сторони кріплення — інакше стик у buildProductFromSession
 * поїде на номінал і панель не зійдеться з ребром.
 */
function legDraft(main: DetailDraft, sideLength: number, height: number, label: string): DetailDraft {
  return {
    ...createDraft(),
    type: 'Опора',
    thickness: main.thickness,
    quantity: main.quantity,
    width: sideLength,
    height,
    label,
  };
}

/**
 * Ряд вентиляційних щілин у панелі: прямий проріз із півкруглими кінцями.
 *
 * Форма — прямокутник із радіусом кутів, рівним половині ширини: капсула.
 * Гострого внутрішнього кута в камені бути не повинно (на гідроабразиві
 * від нього йде тріщина), а радіус 6 мм проходить мінімум і для кварциту,
 * і для керамограніту (CUTOUT_CORNER_RADIUS_MIN).
 *
 * Прив'язка — кут CD (низ панелі в її площині, див. інваріант 2.24 і
 * журнал №19), тож `y` рахується від низу вгору.
 *
 * УВАГА для розкрою: `buildHolesFromCutouts` будує прямокутний отвір без
 * скруглень — у карті крою щілина буде з гострими кутами, у 3D і в
 * перевірці виробничості радіус враховується. Розбіжність наявна, не нова.
 */
function ventSlots(opts: {
  idPrefix: string;
  count: number;
  /** Довжина деталі вздовж щілини, мм */
  panelWidth: number;
  /** Висота деталі, мм */
  panelHeight: number;
  /** Центр групи по висоті деталі, мм ВІД НИЗУ */
  positionMm: number;
  slotWidth?: number;
  /** Просвіт між щілинами, мм. За замовчуванням — як ширина щілини. */
  gap?: number;
  /** Відступи від країв деталі, мм — окремо ліворуч і праворуч */
  marginLeft?: number;
  marginRight?: number;
  /**
   * Кут, від якого міряється «від низу». У деталей, що РОСТУТЬ УГОРУ
   * (стінові панелі), низ у 3D — ребро C, кут CD. У деталей, що ЗВИСАЮТЬ
   * УНИЗ (ноги, обшивка подіуму), низ — ребро A, кут DA. Це дзеркальні
   * повороти рендера (±90° навколо X), і плутанина між ними — вже третій
   * баг однієї родини (журнал №19, №21).
   */
  floorCorner?: 'CD' | 'DA';
}): Record<string, SurfaceCutout> {
  const out: Record<string, SurfaceCutout> = {};
  const count = Math.max(0, Math.round(opts.count));
  if (count === 0) return out;

  const slotWidth = opts.slotWidth ?? 12;
  const marginLeft = Math.max(5, opts.marginLeft ?? 20);
  const marginRight = Math.max(5, opts.marginRight ?? 20);
  const gap = Math.max(slotWidth, opts.gap ?? slotWidth);
  const length = opts.panelWidth - marginLeft - marginRight;
  const groupHeight = count * slotWidth + (count - 1) * gap;

  // Не ліземо в деталь, куди не влазить: коротка або низька панель просто
  // лишається без вентиляції, а не отримує вирізи за своїм контуром.
  if (length < 50 || groupHeight + 20 > opts.panelHeight) return out;

  const maxBase = opts.panelHeight - 10 - groupHeight;
  const base = Math.min(Math.max(10, opts.positionMm - groupHeight / 2), maxBase);

  for (let i = 0; i < count; i += 1) {
    const id = `${opts.idPrefix}${i + 1}`;
    out[id] = {
      id,
      shape: 'rect',
      type: 'custom',
      bindCorner: opts.floorCorner ?? 'CD',
      x: marginLeft,
      y: Math.round(base + i * (slotWidth + gap)),
      width: length,
      height: slotWidth,
      cornerRadius: slotWidth / 2,
    };
  }
  return out;
}

/**
 * НІША ПІД ДРОВА.
 *
 * Два різні випадки, і плутати їх не можна:
 *
 *  · ніша НА ВСЮ ВИСОТУ деталі (до підлоги) — це не отвір, а **розрив
 *    контуру**: деталь стає П-подібною, і цех ріже саме контур. Тому тут
 *    повертаємо `customPoints`, а не виріз.
 *  · ніша нижча за деталь — звичайний прямокутний отвір зі скругленими
 *    кутами (гострий внутрішній кут у камені дає тріщину).
 *
 * Висота рахується ВІД НИЗУ деталі: ніша під дрова стоїть на підлозі, а не
 * висить посеред панелі. Відступи від країв — окремо лівий і правий: у ніші
 * біля стіни вони майже ніколи не однакові.
 */
function nicheGeometry(opts: {
  id: string;
  panelWidth: number;
  panelHeight: number;
  height: number;
  marginLeft?: number;
  marginRight?: number;
  /** Деталь стоїть на підлозі (обшивка подіуму) — тоді ніша ріжеться до низу */
  toFloor?: boolean;
}): { cutouts?: Record<string, SurfaceCutout>; points?: Point[]; height?: number; width?: number; left?: number } {
  /**
   * Ширину ніші НЕ задають окремо: вона — це те, що лишилось між відступами.
   * Так неможливо ввести суперечливу трійку «відступи + ширина», яка не
   * сходиться з деталлю, і не треба вирішувати, що з них головніше.
   */
  const marginLeft = Math.max(5, opts.marginLeft ?? 20);
  const marginRight = Math.max(5, opts.marginRight ?? 20);
  const w = opts.panelWidth - marginLeft - marginRight;
  if (w < 50 || opts.height < 50) return {};

  const left = marginLeft;
  const right = left + w;

  if (opts.toFloor) {
    // Дрова кладуть на підлогу, тож ніша ВІДКРИТА знизу: це не отвір, а
    // розрив контуру, і цех ріже саме контур. Зверху лишаємо перемичку
    // мінімум 20 мм, інакше деталь розпадеться на дві.
    //
    // ОРІЄНТАЦІЯ (виміряно на екрані, двічі помилково «виправлено»):
    // у деталей, що звисають униз (ноги, обшивка подіуму), ПІДЛОГА в 3D —
    // це ребро y = 0 (сторона A), а ребро y = panelHeight — верх, біля
    // плити. У стінових панелей — навпаки (там низом є ребро C, звідси
    // прив'язки 'CD' у вікна топки). Тому проріз відкривається в бік
    // y = 0, і його глибина — САМЕ висота ніші h, а не залишок H − h:
    // перша ітерація різала залишок (те саме «висоту взяло від верху»),
    // друга — відкривала проріз у бік плити.
    const h = Math.min(opts.height, opts.panelHeight - 20);
    return {
      height: h,
      width: w,
      left,
      points: [
        { x: 0, y: 0, id: 'A' } as Point,
        { x: left, y: 0, id: 'B' } as Point,
        { x: left, y: h, id: 'C' } as Point,
        { x: right, y: h, id: 'D' } as Point,
        { x: right, y: 0, id: 'E' } as Point,
        { x: opts.panelWidth, y: 0, id: 'F' } as Point,
        { x: opts.panelWidth, y: opts.panelHeight, id: 'G' } as Point,
        { x: 0, y: opts.panelHeight, id: 'H' } as Point,
      ],
    };
  }

  // Деталь висить (панель коробу) — там ніша може бути тільки отвором.
  const h = Math.min(opts.height, opts.panelHeight - 40);
  return {
    height: h,
    width: w,
    left,
    cutouts: {
      [opts.id]: {
        id: opts.id,
        shape: 'rect',
        type: 'custom',
        bindCorner: 'CD',
        x: left,
        y: 20,
        width: w,
        height: h,
        cornerRadius: 10,
      },
    },
  };
}

function wallPanelDraft(main: DetailDraft, sideLength: number, height: number, label: string): DetailDraft {
  return {
    ...createDraft(),
    type: 'Стінова панель',
    thickness: main.thickness,
    quantity: main.quantity,
    width: sideLength,
    height,
    label,
  };
}

// ── Параметри ────────────────────────────────────────────────────────────────
// Межі — від типового сляба 3200×1600: довші за сляб деталі шаблон не робить
// (стик додається окремо і свідомо, а не «випадково з шаблону»).

const P = {
  straightLen: { kind: 'number', key: 'length', label: 'Довжина', default: 2400, min: 300, max: 3200, unit: 'мм' },
  straightDepth: { kind: 'number', key: 'depth', label: 'Глибина', default: 600, min: 200, max: 1200, unit: 'мм' },
  lLenA: { kind: 'number', key: 'lengthA', label: 'Довжина по стіні A', default: 2400, min: 600, max: 3200, unit: 'мм' },
  lLenF: { kind: 'number', key: 'lengthF', label: 'Довжина по стіні F', default: 1800, min: 600, max: 3200, unit: 'мм' },
  lDepth: { kind: 'number', key: 'depth', label: 'Глибина', default: 600, min: 200, max: 1200, unit: 'мм' },
  islandLen: { kind: 'number', key: 'length', label: 'Довжина', default: 1800, min: 600, max: 3200, unit: 'мм' },
  islandDepth: { kind: 'number', key: 'depth', label: 'Глибина', default: 900, min: 400, max: 1600, unit: 'мм' },
  islandLegH: { kind: 'number', key: 'legHeight', label: 'Висота ноги', default: 900, min: 100, max: 1200, unit: 'мм' },
  islandLegSide: {
    kind: 'choice', key: 'legSide', label: 'Нога', default: 'right',
    options: [
      { value: 'right', label: 'Права' },
      { value: 'left', label: 'Ліва' },
    ],
  },
  portalWidth: { kind: 'number', key: 'width', label: 'Ширина порталу', default: 1500, min: 800, max: 2500, unit: 'мм' },
  portalDepth: { kind: 'number', key: 'depth', label: 'Глибина полиці', default: 300, min: 150, max: 600, unit: 'мм' },
  portalLegH: { kind: 'number', key: 'legHeight', label: 'Висота стійок', default: 1000, min: 500, max: 1500, unit: 'мм' },
  portalPanelH: { kind: 'number', key: 'panelHeight', label: 'Панель над полицею', default: 600, min: 200, max: 1500, unit: 'мм' },
  // Габарит подіуму НЕ задається напряму: він = короб + виступи. Так думає
  // замовник («короб такий, полиця виступає на стільки»), і так виступ можна
  // зробити різним ліворуч і праворуч — камін у ніші рідко симетричний.
  mBoxW: { kind: 'number', key: 'boxWidth', label: 'Ширина коробу', default: 1200, min: 400, max: 2500, unit: 'мм' },
  mBoxD: { kind: 'number', key: 'boxDepth', label: 'Глибина коробу', default: 450, min: 200, max: 1200, unit: 'мм' },
  mOverL: { kind: 'number', key: 'overhangLeft', label: 'Виступ ліворуч', default: 300, min: 0, max: 1200, unit: 'мм' },
  mOverR: { kind: 'number', key: 'overhangRight', label: 'Виступ праворуч', default: 300, min: 0, max: 1200, unit: 'мм' },
  mOverF: { kind: 'number', key: 'overhangFront', label: 'Виступ уперед', default: 250, min: 0, max: 1200, unit: 'мм' },
  mPodiumH: { kind: 'number', key: 'podiumHeight', label: 'Висота подіуму', default: 450, min: 150, max: 700, unit: 'мм' },
  mBoxH: { kind: 'number', key: 'boxHeight', label: 'Висота коробу', default: 2000, min: 1000, max: 3000, unit: 'мм' },
  mFireboxW: { kind: 'number', key: 'fireboxWidth', label: 'Ширина топки', default: 800, min: 400, max: 1500, unit: 'мм' },
  mFireboxH: { kind: 'number', key: 'fireboxHeight', label: 'Висота топки', default: 600, min: 400, max: 1200, unit: 'мм' },
  mFireboxUp: { kind: 'number', key: 'fireboxUp', label: 'Топка над подіумом', default: 120, min: 0, max: 900, unit: 'мм' },
  fireWidth: { kind: 'number', key: 'width', label: 'Ширина', default: 1600, min: 800, max: 2500, unit: 'мм' },
  fireDepth: { kind: 'number', key: 'depth', label: 'Глибина полиці', default: 350, min: 150, max: 600, unit: 'мм' },
  fireLegH: { kind: 'number', key: 'legHeight', label: 'Висота стійок', default: 1100, min: 500, max: 1600, unit: 'мм' },
  fireFriezeH: { kind: 'number', key: 'friezeHeight', label: 'Висота фриза', default: 200, min: 80, max: 500, unit: 'мм' },
  sillLen: { kind: 'number', key: 'length', label: 'Довжина', default: 1500, min: 300, max: 3200, unit: 'мм' },
  sillDepth: { kind: 'number', key: 'depth', label: 'Глибина', default: 250, min: 100, max: 800, unit: 'мм' },
} satisfies Record<string, TemplateParam>;

/**
 * ЗОНИ КАМІНА — лицьові деталі, у кожній може бути свій отвір.
 *
 * Налаштування НЕ спільні: одна й та сама решітка на подіумі і на боці коробу
 * майже ніколи не однакова (там довжина 1800, тут 450). Тому кожна зона
 * отримує власний набір параметрів, а у вікні вони показуються по одній
 * вибраній деталі — інакше в панелі було б шість десятків полів одразу.
 */
export interface FireplaceZone {
  key: string;
  label: string;
  /** Що стоїть у зоні за замовчуванням */
  kind: 'none' | 'vent' | 'niche';
  /** Типова висота центру решітки в цій деталі, мм від низу */
  ventPos: number;
  /** Типова висота ніші в цій деталі, мм (на всю висоту подіуму — П-подібна деталь) */
  nicheHeight: number;
}

export const FIREPLACE_ZONES: FireplaceZone[] = [
  { key: 'podiumFront', label: 'Фронт подіуму', kind: 'vent', ventPos: 220, nicheHeight: 450 },
  { key: 'podiumRight', label: 'Подіум праворуч', kind: 'none', ventPos: 220, nicheHeight: 450 },
  { key: 'podiumLeft', label: 'Подіум ліворуч', kind: 'none', ventPos: 220, nicheHeight: 450 },
  { key: 'boxRight', label: 'Короб праворуч', kind: 'vent', ventPos: 1560, nicheHeight: 400 },
  { key: 'boxLeft', label: 'Короб ліворуч', kind: 'vent', ventPos: 1560, nicheHeight: 400 },
  { key: 'boxFront', label: 'Фронт коробу (над топкою)', kind: 'none', ventPos: 1700, nicheHeight: 400 },
];

const ZONE_KIND_OPTIONS = [
  { value: 'none', label: 'Немає' },
  { value: 'vent', label: 'Решітка' },
  { value: 'niche', label: 'Ніша' },
];

function zoneParams(zone: FireplaceZone): TemplateParam[] {
  const base = { group: 'options' as const, zone: zone.key };
  return [
    { kind: 'choice', key: `${zone.key}_kind`, label: 'Що в деталі', default: zone.kind, options: ZONE_KIND_OPTIONS, ...base },
    { kind: 'number', key: `${zone.key}_count`, label: 'Прорізів у решітці', default: 8, min: 1, max: 24, unit: 'шт', ...base },
    { kind: 'number', key: `${zone.key}_slot`, label: 'Ширина прорізу', default: 12, min: 6, max: 40, unit: 'мм', ...base },
    { kind: 'number', key: `${zone.key}_gap`, label: 'Просвіт між прорізами', default: 12, min: 6, max: 80, unit: 'мм', ...base },
    { kind: 'number', key: `${zone.key}_marginL`, label: 'Відступ ліворуч', default: 20, min: 5, max: 900, unit: 'мм', ...base },
    { kind: 'number', key: `${zone.key}_marginR`, label: 'Відступ праворуч', default: 20, min: 5, max: 900, unit: 'мм', ...base },
    { kind: 'number', key: `${zone.key}_pos`, label: 'Висота від низу', default: zone.ventPos, min: 0, max: 3000, unit: 'мм', ...base },
    { kind: 'number', key: `${zone.key}_nicheH`, label: 'Ніша: висота', default: zone.nicheHeight, min: 100, max: 2000, unit: 'мм', ...base },
    { kind: 'number', key: `${zone.key}_nicheD`, label: 'Ніша: глибина коробу', default: 300, min: 100, max: 1200, unit: 'мм', ...base },
  ];
}

const FIREPLACE_ZONE_PARAMS: TemplateParam[] = FIREPLACE_ZONES.flatMap(zoneParams);
const ZONE_PARAM_BY_KEY = new Map(FIREPLACE_ZONE_PARAMS.map((p) => [p.key, p]));

/** Читання параметра зони: `podiumFront` + `count` → `podiumFront_count`. */
function zoneNum(zoneKey: string, suffix: string, values: TemplateValues): number {
  const p = ZONE_PARAM_BY_KEY.get(`${zoneKey}_${suffix}`) as TemplateNumberParam | undefined;
  return p ? num(p, values) : 0;
}
function zoneKind(zoneKey: string, values: TemplateValues): string {
  const p = ZONE_PARAM_BY_KEY.get(`${zoneKey}_kind`) as TemplateChoiceParam | undefined;
  return p ? choice(p, values) : 'none';
}

// ── Шаблони ──────────────────────────────────────────────────────────────────

export const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    id: 'straight_top',
    name: 'Пряма стільниця',
    description: 'Плита з підворотом переднього краю (сторона C).',
    params: [P.straightLen, P.straightDepth],
    build: (values) => {
      const length = num(P.straightLen, values);
      const depth = num(P.straightDepth, values);
      const mainDetail = mainDraft({
        kind: 'rect',
        width: length,
        height: depth,
        thickness: 20,
        label: 'Пряма стільниця',
        thickening: { enabled: true, size: 40, sides: ['C'] },
      });
      return { mainDetail, subDetails: {}, activeDetailId: 'main' };
    },
  },
  {
    id: 'l_top',
    name: 'Г-подібна стільниця',
    description: 'Кутова стільниця; стіни — сторони A і F, відкриті торці з підворотом.',
    params: [P.lLenA, P.lLenF, P.lDepth],
    build: (values) => {
      const lengthA = num(P.lLenA, values);
      const lengthF = num(P.lLenF, values);
      const depth = num(P.lDepth, values);
      // Контур 'BR' (lShapePoints): плече вздовж стіни A має глибину
      // outerHeight − innerVertical, плече вздовж стіни F — ширину
      // innerHorizontal. Щоб обидва плеча мали глибину `depth`:
      //   innerVertical  = lengthF − depth,
      //   innerHorizontal = depth.
      // Затискачі не дають виродити контур, коли глибина ≥ довжини плеча.
      const innerHorizontal = Math.min(depth, lengthA - 100);
      const innerVertical = Math.max(100, lengthF - depth);
      const mainDetail = mainDraft({
        kind: 'l',
        outerWidth: lengthA,
        outerHeight: lengthF,
        innerHorizontal,
        innerVertical,
        thickness: 20,
        label: 'Г-подібна стільниця',
        thickening: { enabled: true, size: 40, sides: ['B', 'C', 'D', 'E'] },
      });
      return { mainDetail, subDetails: {}, activeDetailId: 'main' };
    },
  },
  {
    id: 'island_leg',
    name: 'Острів з ногою',
    description: '«Водоспад»: нога-панель під 45° праворуч або ліворуч, підворот по периметру.',
    params: [P.islandLen, P.islandDepth, P.islandLegH, P.islandLegSide],
    build: (values) => {
      const length = num(P.islandLen, values);
      const depth = num(P.islandDepth, values);
      const legHeight = num(P.islandLegH, values);
      const legSide = choice(P.islandLegSide, values);
      const mainDetail = mainDraft({
        kind: 'rect',
        width: length,
        height: depth,
        thickness: 20,
        elevation: 900,
        label: 'Острів з ногою',
        thickening: { enabled: true, size: 40, sides: ['A', 'B', 'C', 'D'] },
      });
      // B — права сторона прямокутника, D — ліва (getSideSize).
      const slot = legSide === 'left' ? 'leg_D' : 'leg_B';
      const label = legSide === 'left' ? 'Нога ліва' : 'Нога права';
      return {
        mainDetail,
        subDetails: { [slot]: legDraft(mainDetail, depth, legHeight, label) },
        activeDetailId: 'main',
      };
    },
  },
  {
    id: 'portal_panels',
    name: 'Портал зі стінпанелями',
    description: 'Полиця на двох стійках, над полицею — стінова панель.',
    params: [P.portalWidth, P.portalDepth, P.portalLegH, P.portalPanelH],
    build: (values) => {
      const width = num(P.portalWidth, values);
      const depth = num(P.portalDepth, values);
      const legHeight = num(P.portalLegH, values);
      const panelHeight = num(P.portalPanelH, values);
      const mainDetail = mainDraft({
        kind: 'rect',
        width,
        height: depth,
        thickness: 30,
        // Низ полиці = верх стійок: стійки йдуть від полиці до підлоги.
        elevation: legHeight,
        label: 'Портал (полиця)',
      });
      return {
        mainDetail,
        subDetails: {
          leg_B: legDraft(mainDetail, depth, legHeight, 'Стійка права'),
          leg_D: legDraft(mainDetail, depth, legHeight, 'Стійка ліва'),
          wall_panel_A: wallPanelDraft(mainDetail, width, panelHeight, 'Панель над полицею'),
        },
        activeDetailId: 'main',
      };
    },
  },
  {
    id: 'fireplace_surround',
    name: 'Обшивка каміну',
    description: 'Полиця, бокові стійки до підлоги і фриз по фронту.',
    params: [P.fireWidth, P.fireDepth, P.fireLegH, P.fireFriezeH],
    build: (values) => {
      const width = num(P.fireWidth, values);
      const depth = num(P.fireDepth, values);
      const legHeight = num(P.fireLegH, values);
      const friezeHeight = num(P.fireFriezeH, values);
      const mainDetail = mainDraft({
        kind: 'rect',
        width,
        height: depth,
        thickness: 30,
        elevation: legHeight,
        label: 'Обшивка каміну (полиця)',
      });
      return {
        mainDetail,
        subDetails: {
          leg_B: legDraft(mainDetail, depth, legHeight, 'Стійка права'),
          leg_D: legDraft(mainDetail, depth, legHeight, 'Стійка ліва'),
          // Фриз — «нога» на передній стороні C: панель повної ширини,
          // що звисає під полицею над топкою.
          leg_C: legDraft(mainDetail, width, friezeHeight, 'Фриз'),
        },
        activeDetailId: 'main',
      };
    },
  },
  {
    id: 'fireplace_modern',
    name: 'Камін сучасний',
    description: 'Подіум-основа з окремими виступами ліворуч, праворуч і вперед; короб до стелі, вікно топки — виріз у фронті. У кожній лицьовій деталі можна поставити решітку або нішу під дрова.',
    params: [
      P.mBoxW, P.mBoxD, P.mBoxH, P.mOverL, P.mOverR, P.mOverF, P.mPodiumH,
      P.mFireboxW, P.mFireboxH, P.mFireboxUp,
      ...FIREPLACE_ZONE_PARAMS,
    ],
    build: (values) => {
      const boxWidth = num(P.mBoxW, values);
      const boxDepth = num(P.mBoxD, values);
      const boxHeight = num(P.mBoxH, values);
      const podiumHeight = num(P.mPodiumH, values);
      // Виступи задаються окремо ліворуч/праворуч/уперед — габарит подіуму
      // з них і складається. Асиметрія тут норма: камін біля стіни або в
      // ніші часто має полицю-лаву тільки з одного боку.
      const overLeft = num(P.mOverL, values);
      const overRight = num(P.mOverR, values);
      const overFront = num(P.mOverF, values);
      const width = boxWidth + overLeft + overRight;
      const depth = boxDepth + overFront;

      // Вікно топки: ширина, висота і поріг над подіумом. Отвір не може
      // торкатись контуру панелі — лишаємо поле по 50 мм з боків і зверху.
      const fireboxWidth = Math.min(num(P.mFireboxW, values), boxWidth - 100);
      const fireboxUp = Math.min(num(P.mFireboxUp, values), Math.max(0, boxHeight - 200));
      const fireboxHeight = Math.min(num(P.mFireboxH, values), boxHeight - fireboxUp - 100);

      const mainDetail = mainDraft({
        kind: 'rect',
        width,
        height: depth,
        thickness: 20,
        // Плита подіуму зверху; ноги-обшивка йдуть від неї до підлоги.
        elevation: podiumHeight,
        label: 'Камін сучасний (подіум)',
      });

      // Фронт коробу — стінова панель, що росте ВГОРУ. Стоїть вона не на
      // ребрі подіуму, а вглиб від задньої сторони A на глибину коробу:
      // саме це і дає виступ подіуму вперед (attachInset).
      //
      // Прив'язка отворів — до кута CD (низ панелі), і це НЕ випадковість:
      // у 3D панель стоїть на подіумі саме нижнім ребром своєї площини
      // (див. getEdgeTransform, attachmentKind 'up'). Прив'язка до DA
      // (верх) заганяла топку під стелю коробу — перевірено на екрані.
      const frontPanel = wallPanelDraft(mainDetail, boxWidth, boxHeight, 'Короб (фронт)');
      frontPanel.attachOffset = overLeft;
      frontPanel.attachInset = boxDepth;
      const firebox: SurfaceCutout = {
        id: 'tpl_firebox',
        shape: 'rect',
        type: 'custom',
        bindCorner: 'CD',
        x: Math.max(0, Math.round((boxWidth - fireboxWidth) / 2)),
        y: fireboxUp,
        width: fireboxWidth,
        height: fireboxHeight,
      };
      frontPanel.cutouts = { tpl_firebox: firebox };

      // Бокові стінки коробу — на ребрах B і D, зсунуті всередину на свій
      // виступ. Зсув УЗДОВЖ ребра різний, бо обхід контуру різний:
      // ребро B іде від сторони A до C (задня частина — на початку),
      // ребро D — навпаки, від C до A (задня частина — у кінці).
      const rightSide = wallPanelDraft(mainDetail, boxDepth, boxHeight, 'Короб (бік правий)');
      rightSide.attachOffset = 0;
      rightSide.attachInset = overRight;
      const leftSide = wallPanelDraft(mainDetail, boxDepth, boxHeight, 'Короб (бік лівий)');
      leftSide.attachOffset = overFront;
      leftSide.attachInset = overLeft;

      const podiumFront = legDraft(mainDetail, width, podiumHeight, 'Подіум (фронт)');
      const podiumRight = legDraft(mainDetail, depth, podiumHeight, 'Подіум (бік правий)');
      const podiumLeft = legDraft(mainDetail, depth, podiumHeight, 'Подіум (бік лівий)');

      const subDetails: Record<string, DetailDraft> = {
        leg_C: podiumFront,
        leg_B: podiumRight,
        leg_D: podiumLeft,
        wall_panel_A: frontPanel,
        wall_panel_B: rightSide,
        wall_panel_D: leftSide,
      };

      /**
       * Отвори по зонах: у кожній лицьовій деталі своя решітка або своя ніша,
       * зі своїми числами. Ніша у ФРОНТІ ПОДІУМУ додатково отримує короб —
       * дві бокові стінки і задню; стелею їй служить сама плита подіуму, а
       * дном — підлога. Це і є «ніша в підлогу з коробом усередині».
       */
      const zonePanels: Record<string, { panel: DetailDraft; width: number; height: number }> = {
        podiumFront: { panel: podiumFront, width, height: podiumHeight },
        podiumRight: { panel: podiumRight, width: depth, height: podiumHeight },
        podiumLeft: { panel: podiumLeft, width: depth, height: podiumHeight },
        boxRight: { panel: rightSide, width: boxDepth, height: boxHeight },
        boxLeft: { panel: leftSide, width: boxDepth, height: boxHeight },
        boxFront: { panel: frontPanel, width: boxWidth, height: boxHeight },
      };

      FIREPLACE_ZONES.forEach((zone) => {
        const target = zonePanels[zone.key];
        if (!target) return;
        const kind = zoneKind(zone.key, values);
        if (kind === 'none') return;

        const marginLeft = zoneNum(zone.key, 'marginL', values);
        const marginRight = zoneNum(zone.key, 'marginR', values);
        let positionMm = zoneNum(zone.key, 'pos', values);
        // На фронті коробу отвір мусить стати ВИЩЕ топки, інакше вони наклались би.
        if (zone.key === 'boxFront') {
          positionMm = Math.max(positionMm, fireboxUp + fireboxHeight + 120);
        }

        if (kind === 'vent') {
          target.panel.cutouts = {
            ...target.panel.cutouts,
            ...ventSlots({
              idPrefix: `tpl_vent_${zone.key}_`,
              count: zoneNum(zone.key, 'count', values),
              slotWidth: zoneNum(zone.key, 'slot', values),
              gap: zoneNum(zone.key, 'gap', values),
              marginLeft,
              marginRight,
              panelWidth: target.width,
              panelHeight: target.height,
              positionMm,
              // Обшивка подіуму — ноги, їхня підлога = ребро A (кут DA);
              // панелі коробу ростуть угору, там низ = ребро C (кут CD).
              floorCorner: zone.key.startsWith('podium') ? 'DA' : 'CD',
            }),
          };
          return;
        }

        // ── Ніша ──
        const nicheHeight = zoneNum(zone.key, 'nicheH', values);
        const nicheDepth = zoneNum(zone.key, 'nicheD', values);
        // Деталі подіуму стоять на підлозі — у них ніша ріжеться до низу.
        const standsOnFloor = zone.key.startsWith('podium');
        const geom = nicheGeometry({
          id: `tpl_niche_${zone.key}`,
          panelWidth: target.width,
          panelHeight: target.height,
          height: nicheHeight,
          marginLeft,
          marginRight,
          toFloor: standsOnFloor,
        });
        if (geom.cutouts) {
          target.panel.cutouts = { ...target.panel.cutouts, ...geom.cutouts };
        }
        if (geom.points) {
          // Ніша до підлоги — деталь стає П-подібною; форму задаємо контуром,
          // бо готова 'u' будує виріз з протилежного боку.
          target.panel.customPoints = geom.points;
        }
        if (!geom.cutouts && !geom.points) return;

        // Короб ніші робимо там, де він має сенс і куди його є на що
        // повісити, — у фронті подіуму. Стінки живуть на ТИХ САМИХ ребрах,
        // що й обшивка, тому слоти з суфіксом `#2` (див. parseAdditionSlot).
        if (zone.key !== 'podiumFront') return;
        // Короб ніші стає рівно під вирізом: беремо ті самі ширину і лівий
        // край, які порахувала nicheGeometry, — щоб стінки не розійшлися
        // з отвором, коли відступи різні.
        const realNicheW = geom.width ?? 0;
        const realNicheD = Math.min(nicheDepth, depth - 20);
        if (realNicheW < 50 || realNicheD < 50) return;
        const nicheLeftEdge = geom.left ?? marginLeft;
        const nicheRightEdge = width - (nicheLeftEdge + realNicheW);

        // Короб ніші — заввишки рівно як сам виріз, і стоїть на підлозі:
        // від плити подіуму його відсуває attachGap. Інакше стінки йшли б
        // від плити вниз і були б вищі за отвір, у який на них дивляться.
        const wallHeight = Math.min(geom.height ?? nicheHeight, podiumHeight);
        const wallGap = Math.max(0, podiumHeight - wallHeight);

        // Права стінка: ребро B іде від задньої сторони до передньої,
        // тож передня ділянка — у кінці ребра. Ліва (ребро D) — навпаки.
        const nicheRight = legDraft(mainDetail, realNicheD, wallHeight, 'Ніша (стінка права)');
        nicheRight.attachOffset = Math.max(0, depth - realNicheD);
        nicheRight.attachInset = nicheRightEdge;
        nicheRight.attachGap = wallGap;
        const nicheLeft = legDraft(mainDetail, realNicheD, wallHeight, 'Ніша (стінка ліва)');
        nicheLeft.attachOffset = 0;
        nicheLeft.attachInset = nicheLeftEdge;
        nicheLeft.attachGap = wallGap;
        // Задня стінка ніші — на передньому ребрі, але зсунута вглиб рівно
        // на глибину ніші. Відступ уздовж ребра беремо ПРАВИЙ: ребро C
        // обходиться справа наліво (shapeBuilder), тож його початок — правий
        // край деталі. З лівим відступом стінка розходилася з вирізом рівно
        // на різницю відступів.
        const nicheBack = legDraft(mainDetail, realNicheW, wallHeight, 'Ніша (задня стінка)');
        nicheBack.attachOffset = nicheRightEdge;
        nicheBack.attachInset = realNicheD;
        nicheBack.attachGap = wallGap;

        subDetails['leg_B#2'] = nicheRight;
        subDetails['leg_D#2'] = nicheLeft;
        subDetails['leg_C#2'] = nicheBack;
      });

      return { mainDetail, subDetails, activeDetailId: 'main' };
    },
  },
  {
    id: 'window_sill',
    name: 'Підвіконня',
    description: 'Проста плита за розмірами прорізу.',
    params: [P.sillLen, P.sillDepth],
    build: (values) => {
      const length = num(P.sillLen, values);
      const depth = num(P.sillDepth, values);
      const mainDetail = mainDraft({
        kind: 'rect',
        width: length,
        height: depth,
        thickness: 20,
        elevation: 850,
        label: 'Підвіконня',
      });
      return { mainDetail, subDetails: {}, activeDetailId: 'main' };
    },
  },
];
