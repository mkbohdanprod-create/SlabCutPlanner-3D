import { referenceData } from '../../../domain/defaults';
import type { Detail, DetailShape, DetailType, EdgeFeature, EdgeProfileSelection, MaterialType, Point, ShapeKind } from '../../../domain/types';
import { legacyJointsToManual, SHAPE_JOINT_ID } from '../../../domain/joints';
import { contourEdges } from '../../../domain/baseContour';
import type { ContourEdge, EdgeNamedPoint } from '../../../domain/baseContour';
import { groupMembers, groupOfSide, sideGroupsFor, solveGroupEdit, WIDTH_SIDE } from '../../../domain/sideLocks';

export type { ShapeKind, CircleSizeMode } from '../../../domain/types';
export type DetailDraft = import('../../../domain/types').ElementDefinition;

export interface ProductEditorSession {
  mainDetail?: DetailDraft;
  subDetails: Record<string, DetailDraft>;
  activeDetailId: 'main' | string | null;
  editingProductId?: string;
  /**
   * Матеріал виробу (01.09): обраний у модалці «Новий виріб» або взятий
   * з `Product.material` при редагуванні. Порожньо — старий виріб без
   * матеріалу, тоді редактор бере матеріал проєкту.
   */
  material?: MaterialType;
  /**
   * Місце виробу в приміщенні (01.09): мм по підлозі + поворот. Береться з
   * `Product.scenePlacement` при редагуванні, змінюється кнопкою «Поставити
   * на площину» в 3D-прев'ю і повертається у виріб при збереженні — інакше
   * кожне редагування скидало б виріб із його місця в кімнаті.
   */
  scenePlacement?: { x: number; z: number; rotationYDeg: number };
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
  { kind: 'circle', label: 'Кругла', shape: SHAPE_CIRCLE },
  { kind: 'ellipse', label: 'Овальна', shape: SHAPE_ELLIPSE },
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

/**
 * Форми, які показуємо лише супер-адміну.
 *
 * 10.08 тут були коло й еліпс («цех поки не бере в роботу»). 01.09
 * власник повернув їх усім: «Добав круглу та овальну стільницю». Список
 * лишено порожнім, а не видалено — механізм ще знадобиться.
 */
const ADMIN_ONLY_KINDS: ShapeKind[] = [];

/**
 * Базові форми, видимі користувачу. Якщо деталь УЖЕ адмінської форми
 * (створена адміном чи прийшла зі старого проєкту), опція лишається,
 * інакше редагування такої деталі скидало б її форму на прямокутник.
 */
export function visibleBaseDesigns(isAdminUnlocked: boolean, current?: ShapeKind) {
  return baseDesigns.filter((design) => (
    !ADMIN_ONLY_KINDS.includes(design.kind) || isAdminUnlocked || design.kind === current
  ));
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
  /* П-подібна, 04.09.2026: симетрична 2400 × 1200 з вирізом 1200 × 600 по
     центру — A 2400 · B 1200 · C 600 · D 600 · E 1200 · F 600 · G 600 · H 1200.
     Було 2600 × 1600 з ногами різної висоти: деталь виходила кособокою, а
     головне — ці дефолти застосовувались лише в одному місці, тож П,
     створена через модалку виробу, лишалась із розмірами прямокутника
     (1200 × 600) і сторона C виходила 1 мм. */
  if (kind === 'u') return { width: 2400, height: 1200, innerCutWidth: 1200, innerCutDepth: 600, innerCutOffset: 600, leftLegHeight: 1200, rightLegHeight: 1200 };
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
    mirrorL: geometry.cornerOrientation === 'BL' || draft.mirrorL,
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
    /* МІГРАЦІЯ СТИКІВ (03.09.2026). Старі поля більше не переносимо в
       чернетку: замість них деталь отримує звичайні довільні стики з тими
       самими позиціями. Так виріб, зроблений до зведення, відкривається в
       редакторі вже з видимими стиками — їх видно в панелі «Стики» і можна
       прибрати. Рушій розуміє й старі поля (`legacyJointsToManual`), тож
       проєкти, які редактор не відкривав, рахуються так само. */
    jointDirection: undefined,
    jointOmegaDirection: undefined,
    jointLambdaDirection: undefined,
    manualJoints: [
      ...legacyJointsToManual(source.shape, geometry).map((joint) => ({
        ...joint,
        id: joint.id === 'legacy-corner' ? SHAPE_JOINT_ID.corner
          : joint.id === 'legacy-omega' ? SHAPE_JOINT_ID.omega
          : SHAPE_JOINT_ID.lambda,
      })),
      ...(geometry.manualJoints ?? []),
    ],
    thickening: cloneFeature(source.thickening),
    fold: cloneFeature(source.fold, 100),
    edgeProfiles: cloneEdgeProfiles(source.edgeProfiles),
  };
}
/**
 * ЗАПИС РОЗМІРУ СТОРОНИ — дзеркало `getSideSize`, і живе поруч із ним
 * навмисно: читання і запис однієї угоди мусять бути в одному файлі,
 * інакше вони розходяться (так уже сталося з B/D на Г-формі, журнал №14).
 *
 * ЯК ЦЕ ПРАЦЮЄ (з 04.09.2026). У Г- і П-подібної сторони зв'язані
 * рівняннями — габарит дорівнює сумі часток:
 *
 *     Г:  A = C + E        F = B + D            (дзеркальна: B = F + D)
 *     П:  A = G + E + C    H = F + Ширина       B = D + Ширина
 *
 * Тому змінити один розмір «просто так» не можна: хтось мусить поступитись.
 * Хто саме — вирішують ЗАМКИ (`domain/sideLocks.ts`): зміну поглинає перший
 * НЕзамкнений розмір рівняння, у порядку `SideGroup.priority`. Без замків
 * цей порядок дає рівно ту поведінку, що була до появи замків, — старий
 * зашитий switch перенесено в списки пріоритету і видалено, щоб математика
 * сторін лишалась в одному місці.
 *
 * Цехове правило (від власника 10.08) нікуди не поділось, воно тепер
 * записане саме цим порядком: **глибина стільниці не пливе**. Міняють
 * габарит — рухається виріз, а не глибина; глибина змінюється лише прямим
 * редагуванням своєї сторони.
 *
 * Повертає ПАТЧ (лише змінені поля), а не мутує чернетку. Порожній патч —
 * правка неможлива (замкнене поле або нема кому поступитись).
 */
const NO_LOCKS: ReadonlySet<string> = new Set<string>();

export function applySideEdit(
  draft: DetailDraft,
  side: string,
  rawValue: number,
  locked: ReadonlySet<string> = NO_LOCKS,
): Partial<DetailDraft> {
  const val = Math.max(1, Math.round(rawValue));

  // Довільний контур задано точками — сторону з поля не перебудувати,
  // редагується сам контур (таблиця показує розмір лише для читання).
  if ((draft as { customPoints?: Point[] }).customPoints?.length) return {};

  if (draft.kind === 'rect' || draft.kind === 'sink_rect' || draft.kind === 'sink_slot') {
    if (side === 'A' || side === 'C') return { width: val };
    if (side === 'B' || side === 'D') return { height: val };
    return {};
  }

  if (draft.kind === 'l') return applyLSideEdit(draft, side, val, locked);
  if (draft.kind === 'u') return applyUSideEdit(draft, side, val, locked);

  return {};
}

/** Г-подібна: дві незалежні пари рівнянь, спільних розмірів між ними немає. */
function applyLSideEdit(draft: DetailDraft, side: string, val: number, locked: ReadonlySet<string>): Partial<DetailDraft> {
  const group = groupOfSide(draft, side);
  if (!group) return {};

  const { outerWidth = 1200, outerHeight = 1200, innerHorizontal = 600, innerVertical = 600 } = draft;
  const values: Record<string, number> = {
    A: outerWidth,
    E: innerHorizontal,
    C: Math.max(1, outerWidth - innerHorizontal),
    D: innerVertical,
    // Дзеркальна Г: повна вертикаль — B, коротка — F (див. getSideSize).
    ...(draft.mirrorL
      ? { B: outerHeight, F: Math.max(1, outerHeight - innerVertical) }
      : { F: outerHeight, B: Math.max(1, outerHeight - innerVertical) }),
  };

  const next = solveGroupEdit(group, values, side, val, locked);
  if (!next) return {};

  if (group.total === 'A') return { outerWidth: next.A, innerHorizontal: next.E };
  return { outerHeight: draft.mirrorL ? next.B : next.F, innerVertical: next.D };
}

/**
 * П-подібна: три рівняння, причому «Ширина» (глибина верхньої перекладини)
 * стоїть одразу в двох — вона в деталі одна на обидві ноги. Тому, якщо вона
 * поїхала, друга вертикаль мусить домовитись зі своїми замками; якщо там
 * поступитись нікому — скасовуємо правку цілком, бо двох різних «Ширин»
 * у деталі не буває.
 */
function applyUSideEdit(draft: DetailDraft, side: string, val: number, locked: ReadonlySet<string>): Partial<DetailDraft> {
  const w = draft.width || 2400;
  const leftH = draft.leftLegHeight ?? (draft.height || 1200);
  const rightH = draft.rightLegHeight ?? (draft.height || 1200);
  const cutW = draft.innerCutWidth || 1200;
  const cutD = draft.innerCutDepth || 600;
  const cutOff = draft.innerCutOffset || 600;
  const topBar = Math.max(1, Math.max(leftH, rightH) - cutD);

  const values: Record<string, number> = {
    A: w,
    G: cutOff,
    E: cutW,
    C: Math.max(1, w - cutOff - cutW),
    H: leftH,
    F: Math.max(1, leftH - topBar),
    B: rightH,
    D: Math.max(1, rightH - topBar),
    [WIDTH_SIDE]: topBar,
  };

  const groups = sideGroupsFor(draft);
  const group = groups.find((g) => groupMembers(g).includes(side));
  if (!group) return {};

  const solved = solveGroupEdit(group, values, side, val, locked);
  if (!solved) return {};
  const next = { ...values, ...solved };

  if (next[WIDTH_SIDE] !== values[WIDTH_SIDE]) {
    const other = groups.find((g) => g !== group && groupMembers(g).includes(WIDTH_SIDE));
    if (other) {
      const echo = solveGroupEdit(other, values, WIDTH_SIDE, next[WIDTH_SIDE], locked);
      if (!echo || echo[WIDTH_SIDE] !== next[WIDTH_SIDE]) return {};
      Object.assign(next, echo);
    }
  }

  const nextLeft = Math.max(1, next.H);
  const nextRight = Math.max(1, next.B);
  const maxH = Math.max(nextLeft, nextRight);
  return {
    width: Math.max(1, next.A),
    height: maxH,
    leftLegHeight: nextLeft,
    rightLegHeight: nextRight,
    innerCutWidth: Math.max(1, next.E),
    innerCutOffset: Math.max(0, next.G),
    innerCutDepth: Math.max(0, maxH - Math.max(1, next[WIDTH_SIDE])),
  };
}

/**
 * Ребро іменованого довільного контуру за ім'ям сторони (03.09.2026).
 * Порожньо, якщо контуру немає або його точки без імен.
 */
export function customContourEdge(draft: { customPoints?: Point[] }, side: string): ContourEdge | undefined {
  const points = draft.customPoints;
  if (!points?.length) return undefined;
  return contourEdges(points as EdgeNamedPoint[]).find((edge) => edge.name === side);
}

export function getSideSize(draft: DetailDraft, side: string): number {
  // Довільний контур: розмір сторони — довжина її ребра, а не габарит.
  const customEdge = customContourEdge(draft as { customPoints?: Point[] }, side);
  if (customEdge) return Math.round(customEdge.lengthMm);

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
    /* ЛІВА Г (mirrorL): літери йдуть за обходом контуру, тому при
       дзеркаленні B і F міняються ролями — B стає повною правою стороною,
       F — короткою лівою. Решта сторін симетрична. */
    if (draft.mirrorL) {
      switch (side) {
        case 'A': return outerWidth;
        case 'B': return outerHeight;
        case 'C': return Math.max(1, outerWidth - innerHorizontal);
        case 'D': return innerVertical;
        case 'E': return innerHorizontal;
        case 'F': return Math.max(1, outerHeight - innerVertical);
      }
    }
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
      // «Ширина» — глибина верхньої перекладини. Літери не має, але в
      // рівняннях висот стоїть нарівні зі сторонами, тому читається тим
      // самим getSideSize (модалка мала свою копію цієї формули — і та
      // рахувала від лівої ноги, а не від найвищої).
      case WIDTH_SIDE: return Math.max(1, topBarHeight);
    }
  }

  // Коло й овал (01.09): сторона — квадрант, її «розмір» — довжина дуги
  // чверті. Овал — за наближенням Рамануджана для периметра еліпса
  // (похибка < 0.05 % для наших пропорцій), як і метраж крайки в розкрої.
  if (draft.kind === 'circle') {
    const d = Math.max(1, draft.diameter || 800);
    return Math.round((Math.PI * d) / 4);
  }
  if (draft.kind === 'ellipse') {
    const a = Math.max(1, draft.ellipseWidth || 1200) / 2;
    const b = Math.max(1, draft.ellipseHeight || 600) / 2;
    const h = ((a - b) ** 2) / ((a + b) ** 2);
    const perimeter = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    return Math.round(perimeter / 4);
  }
  return 0;
}
