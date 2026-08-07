import { createDraft } from './draftHelpers';
import type { DetailDraft, ProductEditorSession } from './draftHelpers';

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
 *   · потовщення НЕ кладемо в субдеталі — це EdgeFeature головної деталі,
 *     buildProductFromSession сам породить елементи «Потовщення» (§2.4).
 * Сторони звіряй із контуром рушія (getSideSize + sideNames.test.ts):
 * прямокутник A верх / B права / C низ / D ліва; Г-форма A і F — до стін,
 * B, C, D, E — відкриті торці.
 *
 * Плінтус (Бортик) у шаблони свідомо не входить: тип «Бортик» відсутній у
 * DetailType і в наявному коді проставляється через as any — множити це
 * заборонено (маніфест §7). Плінтус додається як і раніше, з меню сторони.
 */

export type TemplateValues = Record<string, number | string>;

export interface TemplateNumberParam {
  kind: 'number';
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  unit: string;
}

export interface TemplateChoiceParam {
  kind: 'choice';
  key: string;
  label: string;
  default: string;
  options: Array<{ value: string; label: string }>;
}

export type TemplateParam = TemplateNumberParam | TemplateChoiceParam;

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
  fireWidth: { kind: 'number', key: 'width', label: 'Ширина', default: 1600, min: 800, max: 2500, unit: 'мм' },
  fireDepth: { kind: 'number', key: 'depth', label: 'Глибина полиці', default: 350, min: 150, max: 600, unit: 'мм' },
  fireLegH: { kind: 'number', key: 'legHeight', label: 'Висота стійок', default: 1100, min: 500, max: 1600, unit: 'мм' },
  fireFriezeH: { kind: 'number', key: 'friezeHeight', label: 'Висота фриза', default: 200, min: 80, max: 500, unit: 'мм' },
  sillLen: { kind: 'number', key: 'length', label: 'Довжина', default: 1500, min: 300, max: 3200, unit: 'мм' },
  sillDepth: { kind: 'number', key: 'depth', label: 'Глибина', default: 250, min: 100, max: 800, unit: 'мм' },
} satisfies Record<string, TemplateParam>;

// ── Шаблони ──────────────────────────────────────────────────────────────────

export const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    id: 'straight_top',
    name: 'Пряма стільниця',
    description: 'Плита з потовщенням переднього краю (сторона C).',
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
    description: 'Кутова стільниця; стіни — сторони A і F, відкриті торці з потовщенням.',
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
    description: '«Водоспад»: нога-панель під 45° праворуч або ліворуч, потовщення по периметру.',
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
