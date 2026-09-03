import { referenceData } from '../../../domain/defaults';
import type { Detail, DetailShape, DetailType, EdgeFeature, EdgeProfileSelection, MaterialType, Point, ShapeKind } from '../../../domain/types';
import { legacyJointsToManual, SHAPE_JOINT_ID } from '../../../domain/joints';

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
 * ГОЛОВНЕ ПРАВИЛО (цехове, від власника 10.08): **глибина стільниці не
 * пливе**. У Г-подібної глибини — це E (плече вздовж F) і B (плече вздовж A);
 * вони змінюються ТІЛЬКИ прямим редагуванням. Коли міняють габарит, поїхати
 * має внутрішній розмір вирізу, а не глибина:
 *
 *     A = C + E   (по горизонталі)      F = B + D   (по вертикалі)
 *
 *   · міняють A або C → рухається інший з пари, E стоїть;
 *   · міняють F       → рухається D, B стоїть  ← було навпаки, це й муляло;
 *   · міняють D       → рухається F, B стоїть;
 *   · міняють B або E → це і є зміна глибини, рухається D або C відповідно,
 *                       габарит (F / A) лишається — кімната ж не гумова.
 *
 * П-подібна цього правила вже дотримується: там усі зміни висот тримають
 * глибину верхньої перекладини (`topBarHeight`) і рухають виріз.
 *
 * Повертає ПАТЧ (лише змінені поля), а не мутує чернетку.
 */
export function applySideEdit(draft: DetailDraft, side: string, rawValue: number): Partial<DetailDraft> {
  const val = Math.max(1, Math.round(rawValue));

  if (draft.kind === 'rect' || draft.kind === 'sink_rect' || draft.kind === 'sink_slot') {
    if (side === 'A' || side === 'C') return { width: val };
    if (side === 'B' || side === 'D') return { height: val };
    return {};
  }

  if (draft.kind === 'l') {
    const { outerWidth = 1200, outerHeight = 1200, innerHorizontal = 600, innerVertical = 600 } = draft;
    // Поточні глибини, які треба зберегти
    const depthB = Math.max(1, outerHeight - innerVertical);

    switch (side) {
      case 'A':
        // Габарит по X: глибина E стоїть, плече C стає коротшим/довшим
        return { outerWidth: Math.max(innerHorizontal + 1, val) };
      case 'C':
        return { outerWidth: val + innerHorizontal };
      case 'E':
        // Пряма зміна глибини: габарит A лишається, C їде
        return { innerHorizontal: Math.min(val, outerWidth - 1) };
      case 'F': {
        // ЛІВА Г: F — коротка сторона (глибина), редагується як B у правої
        if (draft.mirrorL) return { innerVertical: Math.max(1, outerHeight - val) };
        // Габарит по Y: глибина B стоїть, виріз D підлаштовується.
        // Якщо новий габарит менший за саму глибину — фізично неможливо,
        // тому лишаємо мінімальний виріз 1 мм (глибина мусить поступитись).
        const nextInner = Math.max(1, val - depthB);
        return { outerHeight: Math.max(nextInner + 1, val), innerVertical: nextInner };
      }
      case 'D':
        // Внутрішня вертикаль: глибина B стоїть, габарит F росте/меншає
        return { innerVertical: val, outerHeight: depthB + val };
      case 'B': {
        // ЛІВА Г: B — повна висота (як F у правої)
        if (draft.mirrorL) {
          const nextInner = Math.max(1, val - depthB);
          return { outerHeight: Math.max(nextInner + 1, val), innerVertical: nextInner };
        }
        // Пряма зміна глибини: габарит F лишається, виріз D підлаштовується
        return { innerVertical: Math.max(1, outerHeight - val) };
      }
      default:
        return {};
    }
  }

  if (draft.kind === 'u') {
    let w = draft.width || 2400;
    let leftH = draft.leftLegHeight ?? (draft.height || 1200);
    let rightH = draft.rightLegHeight ?? (draft.height || 1200);
    let maxH = Math.max(leftH, rightH);
    let cutW = draft.innerCutWidth || 1200;
    let cutD = draft.innerCutDepth || 600;
    let cutOff = draft.innerCutOffset || 600;
    // Глибина верхньої перекладини — те, що тут не має пливти
    const topBarHeight = Math.max(0, maxH - cutD);

    const setHeights = (nextLeft: number, nextRight: number) => {
      leftH = Math.max(1, nextLeft);
      rightH = Math.max(1, nextRight);
      maxH = Math.max(leftH, rightH);
      cutD = Math.max(0, maxH - topBarHeight);
    };
    const setWidths = (nextOff: number, nextCut: number, nextC: number) => {
      cutOff = Math.max(0, nextOff);
      cutW = Math.max(1, nextCut);
      w = cutOff + cutW + Math.max(0, nextC);
    };
    const c = w - cutOff - cutW;

    switch (side) {
      case 'A': w = val; break;
      case 'B': setHeights(leftH, val); break;
      case 'C': setWidths(cutOff, cutW, val); break;
      case 'D': setHeights(leftH, topBarHeight + val); break;
      case 'E': setWidths(cutOff, val, c); break;
      case 'F': setHeights(topBarHeight + val, rightH); break;
      case 'G': setWidths(val, cutW, c); break;
      case 'H': setHeights(val, rightH); break;
      default: return {};
    }
    return {
      width: w, height: maxH, leftLegHeight: leftH, rightLegHeight: rightH,
      innerCutWidth: cutW, innerCutDepth: cutD, innerCutOffset: cutOff,
    };
  }

  return {};
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
