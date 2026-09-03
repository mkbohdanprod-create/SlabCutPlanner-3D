import type { CornerProcessing, Point } from './types';

/**
 * Спільна математика стиків — одна на рушій розкрою і на інтерфейс.
 *
 * Раніше подібні речі дублювалися і розходились (див. маніфест, правило №2).
 * Тому попередження, яке бачить користувач у панелі, і зсув, який робить рушій,
 * рахує буквально та сама функція.
 */

/** Поля форми, однакові в чернетці елемента і в геометрії готової деталі. */
export type JointShapeFields = {
  width?: number;
  height?: number;
  leftLegHeight?: number;
  rightLegHeight?: number;
  innerCutWidth?: number;
  innerCutDepth?: number;
  innerCutOffset?: number;
  outerWidth?: number;
  cornerOrientation?: 'TL' | 'TR' | 'BL' | 'BR';
  outerHeight?: number;
  innerHorizontal?: number;
  innerVertical?: number;
};

/**
 * Опорні точки кутів форми з іменами, під якими їх знає редактор.
 * Це те, від чого користувач відміряє стик («від кута B на 400 мм»).
 */
export function jointAnchorPoints(shape: string | undefined, g: JointShapeFields | undefined): Record<string, Point> | undefined {
  if (!g) return undefined;

  if (shape === 'П-подібна') {
    const width = g.width || 1200;
    const height = g.height || 600;
    const leftH = g.leftLegHeight ?? height;
    const rightH = g.rightLegHeight ?? height;
    const cutW = g.innerCutWidth || 600;
    const cutD = g.innerCutDepth || 300;
    const cutOff = g.innerCutOffset || 300;
    const topBarHeight = Math.max(0, height - cutD);
    return {
      start: { x: 0, y: 0 }, A: { x: width, y: 0 }, B: { x: width, y: rightH }, C: { x: cutOff + cutW, y: rightH },
      D: { x: cutOff + cutW, y: topBarHeight }, E: { x: cutOff, y: topBarHeight }, F: { x: cutOff, y: leftH }, G: { x: 0, y: leftH },
    };
  }

  if (shape === 'Г-подібна') {
    const width = g.outerWidth || 1200;
    const height = g.outerHeight || 1200;
    const iw = g.innerHorizontal || 600;
    const ih = g.innerVertical || 600;
    // ЛІВА Г ('BL', 26.08) — обхід той самий, що в lShapePoints рушія.
    // Тримати всі три копії контуру (тут, рушій, прев'ю) однаковими —
    // інакше стик стане на дзеркально не те ребро.
    if (g.cornerOrientation === 'BL') {
      return {
        start: { x: 0, y: 0 }, A: { x: width, y: 0 }, B: { x: width, y: height }, C: { x: iw, y: height },
        D: { x: iw, y: height - ih }, E: { x: 0, y: height - ih },
      };
    }
    return {
      start: { x: 0, y: 0 }, A: { x: width, y: 0 }, B: { x: width, y: height - ih }, C: { x: iw, y: height - ih },
      D: { x: iw, y: height }, E: { x: 0, y: height },
    };
  }

  if (shape === 'Прямокутна') {
    const width = g.width || 600;
    const height = g.height || 600;
    return {
      DA: { x: 0, y: 0 }, AB: { x: width, y: 0 }, BC: { x: width, y: height }, CD: { x: 0, y: height },
    };
  }

  return undefined;
}

/**
 * Увігнуті (270°) кути форми — там скруглення додає матеріал, а не зрізає.
 *
 * У ЛІВОЇ Г-подібної увігнута вершина — `D`, а не `C` (03.09.2026): обхід
 * дзеркальний, і рушій це вже знає (`geometry.ts`, гілка `BL`, `reflexIds:
 * ['D']`). Доти ця функція завжди віддавала `C`, тому в редакторі маркер
 * стику на лівій Г з'являвся на опуклому куті, а на справжньому увігнутому
 * його не було. Другий аргумент — та сама ознака дзеркала, що й усюди:
 * `mirrorL` чернетки або `cornerOrientation === 'BL'` деталі.
 */
export function reflexCornerIds(shape: string | undefined, mirrored = false): string[] {
  if (shape === 'П-подібна') return ['D', 'E'];
  if (shape === 'Г-подібна') return mirrored ? ['D'] : ['C'];
  return [];
}

/**
 * Сторона контуру: ім'я та два кінці відрізка.
 *
 * Свідомо без залежності від THREE — сюди однаково лягає і `LineCurve` з 3D
 * (у нього є `v1`/`v2` з полями `x`/`y`), і будь-яка пара точок із рушія.
 * Координати очікуються в **міліметрах**: у нормалізованих 0…1 непрямокутна
 * деталь спотворює кути, і перевірка на паралельність почала б брехати.
 */
export type JointSideSegment = {
  id: string;
  v1: { x: number; y: number };
  v2: { x: number; y: number };
};

/**
 * Опис майбутнього стику, зібраний із геометрії сторони.
 * Це те, що інтерфейс передає далі в `manualJoints` — без власних обчислень.
 */
export type JointSideSelection = {
  sideId: string;
  oppositeSideId: string;
  axis: 'vertical' | 'horizontal';
  /** Опорний кут, від якого рушій рахує позицію (у координатах контуру) */
  anchorCorner?: string;
  /**
   * Сторона, від якої користувач фактично міряє відступ.
   *
   * Рушієві потрібен КУТ (він точка, від неї рахується координата), а людина
   * міряє від СТОРОНИ — рулетка кладеться на край плити, а не в ріг. Числа при
   * цьому однакові, бо кут лежить на цій же стороні; різниця тільки в тому,
   * що написано в підписі. Тому кут лишається в даних, а сторона — в інтерфейсі.
   */
  referenceSideId?: string;
};

/**
 * Сторона, від якої міряється відступ стику.
 *
 * Це та сторона, що ПАРАЛЕЛЬНА майбутній лінії різу і найближча до опорного
 * кута. Для горизонтального стику між B і D з опорою в куті AB це сторона A:
 * різ іде горизонтально, значить його позиція — це відстань від верхнього
 * краю, а верхній край і є сторона A.
 */
export function referenceSideForJoint(
  sides: JointSideSegment[],
  axis: 'vertical' | 'horizontal',
  anchorPoint: Point | undefined,
): string | undefined {
  if (!anchorPoint) return undefined;

  let best: { id: string; distance: number } | undefined;
  for (const side of sides) {
    // Сторона, паралельна лінії різу: з неї вийшов би стик іншої осі.
    if (jointAxisForSide(side) === axis) continue;

    const mid = { x: (side.v1.x + side.v2.x) / 2, y: (side.v1.y + side.v2.y) / 2 };
    // Міряємо вздовж осі різу: горизонтальний різ рухається по Y, вертикальний — по X.
    const distance = axis === 'horizontal'
      ? Math.abs(mid.y - anchorPoint.y)
      : Math.abs(mid.x - anchorPoint.x);

    if (!best || distance < best.distance) best = { id: side.id, distance };
  }
  return best?.id;
}

/**
 * Сторона навпроти заданої — та, між якою і заданою піде лінія різу.
 *
 * Береться найдальша з паралельних: саме вона задає наскрізний розріз.
 * Дотична сторона (відстань нуль) не рахується — це та сама пряма, різу немає.
 */
export function oppositeSideId(sides: JointSideSegment[], sideId: string): string | undefined {
  const self = sides.find((side) => side.id === sideId);
  if (!self) return undefined;

  const dx = self.v2.x - self.v1.x;
  const dy = self.v2.y - self.v1.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return undefined;

  const dir = { x: dx / length, y: dy / length };
  const normal = { x: -dir.y, y: dir.x };
  const mid = { x: (self.v1.x + self.v2.x) / 2, y: (self.v1.y + self.v2.y) / 2 };

  let best: { id: string; distance: number } | undefined;

  for (const other of sides) {
    if (other.id === sideId) continue;

    const odx = other.v2.x - other.v1.x;
    const ody = other.v2.y - other.v1.y;
    const olength = Math.hypot(odx, ody);
    if (olength < 1e-6) continue;

    const odir = { x: odx / olength, y: ody / olength };
    if (Math.abs(dir.x * odir.y - dir.y * odir.x) >= 0.05) continue; // не паралельна

    const omid = { x: (other.v1.x + other.v2.x) / 2, y: (other.v1.y + other.v2.y) / 2 };
    const distance = Math.abs((omid.x - mid.x) * normal.x + (omid.y - mid.y) * normal.y);
    if (!best || distance > best.distance) best = { id: other.id, distance };
  }

  return best && best.distance > 1e-6 ? best.id : undefined;
}

/**
 * Напрямок різу виводиться зі сторони, користувач його не вводить:
 * горизонтальна сторона ріжеться вертикальною лінією, і навпаки.
 */
export function jointAxisForSide(side: JointSideSegment): 'vertical' | 'horizontal' {
  const dx = Math.abs(side.v2.x - side.v1.x);
  const dy = Math.abs(side.v2.y - side.v1.y);
  return dy < dx ? 'vertical' : 'horizontal';
}

/**
 * Ім'я найближчого опорного кута до заданої точки.
 *
 * Рушій (`manualJointCuts`) шукає опору стику саме за іменем із
 * `jointAnchorPoints`. Тому інтерфейс не вигадує імена сам, а знаходить
 * найближче з того самого словника — інакше стик мовчки поїхав би від нуля.
 */
export function nearestAnchorId(
  anchors: Record<string, Point> | undefined,
  point: Point,
): string | undefined {
  if (!anchors) return undefined;

  let best: { id: string; distance: number } | undefined;
  for (const [id, anchor] of Object.entries(anchors)) {
    const distance = Math.hypot(anchor.x - point.x, anchor.y - point.y);
    if (!best || distance < best.distance) best = { id, distance };
  }
  return best?.id;
}

/**
 * Відсуває лінію стику з дуги скруглення до її межі.
 *
 * Різати по дузі не можна: у точці дотику деталь має нульову товщину, і вістря
 * лопне при різі. Повертає позицію — ту саму, якщо зсув не потрібен.
 */
export function snapJointPosition(
  anchors: Record<string, Point> | undefined,
  corners: Record<string, CornerProcessing> | undefined,
  axis: 'vertical' | 'horizontal',
  position: number,
): number {
  if (!anchors || !corners) return position;

  let result = position;

  for (const [id, point] of Object.entries(anchors)) {
    const corner = corners[id];
    if (!corner || corner.type !== 'radius') continue;
    const radius = Math.max(0, corner.radius ?? 0);
    if (radius <= 0) continue;

    const coord = axis === 'vertical' ? point.x : point.y;
    // Лінія всередині дуги — відсуваємо до найближчого її краю.
    if (Math.abs(result - coord) < radius - 0.01) {
      result = result < coord ? coord - radius : coord + radius;
    }
  }

  return result;
}

/**
 * Наскільки зсунути лінію стику, що стоїть в увігнутому куті зі скругленням.
 *
 * Вести стик по дузі не можна: у точці дотику деталь звужується в нуль і вістря
 * лопне при різі. Тому лінія відсувається рівно на радіус — а в який бік,
 * вирішує користувач: `first` лишає дугу деталі з МЕНШОЮ координатою
 * (ліворуч / знизу), `second` (за замовчуванням) віддає її сусідній.
 *
 * Радіус обмежується розмірами вирізу, інакше стик перескочив би за його
 * протилежний край.
 *
 * Ця функція — єдине джерело зсуву: за нею і ріже рушій, і малює 3D. Поки
 * формула жила тільки в рушії, модель показувала стик у номінальному куті,
 * а різ ішов на радіус убік — користувач бачив не те, що отримував.
 */
export function reflexJointShift(
  corners: Record<string, CornerProcessing> | undefined,
  cornerId: string,
  limits: number[],
  radiusSide: 'first' | 'second' | undefined,
): number {
  const corner = corners?.[cornerId];
  if (!corner || corner.type !== 'radius') return 0;
  const radius = Math.max(0, Math.min(corner.radius ?? 0, ...limits));
  return radiusSide === 'first' ? radius : -radius;
}

/**
 * Куди фактично стане довільний стик: від опорного кута на `offset`,
 * з поправкою на дугу скруглення.
 *
 * Складання «опора + відступ» жило окремо в панелі стиків і в рушії. Тепер
 * воно тут, щоб число в попередженні й число в розкрої не могли розійтись —
 * рівно та причина, з якої тут же живе `snapJointPosition`.
 */
export function manualJointPosition(
  anchors: Record<string, Point> | undefined,
  corners: Record<string, CornerProcessing> | undefined,
  joint: { axis: 'vertical' | 'horizontal'; anchorCorner?: string; offset: number },
): { requested: number; snapped: number } {
  const anchor = joint.anchorCorner ? anchors?.[joint.anchorCorner] : undefined;
  const base = anchor ? (joint.axis === 'vertical' ? anchor.x : anchor.y) : 0;
  /**
   * Відступ відкладається ВСЕРЕДИНУ деталі, а не завжди в бік зростання
   * координати. Формула була `base + offset`, і це працювало лише коли
   * опорний кут лежав на початку осі. Кут на протилежному краю (наприклад E
   * унизу Г-форми) виносив стик ЗА контур: у 3D лінія зникала — на хорду
   * не лишалось матеріалу, — а рушій діставав позицію поза деталлю.
   *
   * Куди «всередину», визначаємо з самих кутів: рухаємось у той бік, де від
   * опори більше матеріалу. Той самий прийом, що й у прив'язці вирізів
   * (`domain/cutoutAnchor`) — знак рахуємо з геометрії, а не припускаємо.
   */
  const along = Object.values(anchors ?? {}).map((p) => (joint.axis === 'vertical' ? p.x : p.y));
  const lo = along.length ? Math.min(...along) : 0;
  const hi = along.length ? Math.max(...along) : 0;
  const inward = hi - base >= base - lo ? 1 : -1;
  // `offset` — ВІДСТАНЬ від опори, а не координата зі знаком: поле в інтерфейсі
  // дає завжди додатне число. Модуль тут для сумісності зі старими виробами,
  // де від'ємним відступом позначали «в інший бік».
  const requested = base + inward * Math.abs(joint.offset);
  return { requested, snapped: snapJointPosition(anchors, corners, joint.axis, requested) };
}

/* ═══════════════════════════════════════════════════════════════════
   ОДИН ВИД СТИКУ (03.09.2026, рішення власника за розбором «Одна
   математика деталі»).

   Було три сутності, що описували те саме — лінію різу на деталі:
     • `jointDirection`          — кутовий стик Г-подібної;
     • `jointOmega/LambdaDirection` — стики П-подібної;
     • `manualJoints`            — довільні стики на будь-якій формі.
   Кожна мала свій шлях у рушії, свою математику позиції і свою (або
   жодну) перевірку на радіус. Наслідки бачила фокус-група: на Г стик
   лягав точно по дотичній дуги, кутовий стик мовчки зникав, якщо на
   деталі був ще й довільний, а шматки після старого різу не мали імен
   сторін — тому кромки на них малювались навмання.

   Рішення власника: **лишаються тільки довільні стики**, з перевіркою,
   щоб різ не потрапляв на радіус. Ця функція перекладає старі описи в
   довільні — щоб і збережені проєкти, і чужий імпорт поводились так
   само, як щойно намальована деталь.

   Позиції взяті з тих самих формул, за якими різав старий код, тому на
   деталі без радіусів результат збігається до міліметра. Там, де радіус
   є, спільна перевірка `snapJointPosition` відсуне стик із дуги — саме
   те, чого раніше не робила гілка Г.
   ═══════════════════════════════════════════════════════════════════ */

/** Опис стику у вигляді, який розуміє рушій: вісь і відступ від початку. */
export interface LegacyJointSource {
  jointDirection?: 'vertical' | 'horizontal';
  jointOmegaDirection?: 'vertical' | 'horizontal';
  jointLambdaDirection?: 'vertical' | 'horizontal';
  outerWidth?: number;
  outerHeight?: number;
  innerHorizontal?: number;
  innerVertical?: number;
  width?: number;
  height?: number;
  innerCutWidth?: number;
  innerCutDepth?: number;
  innerCutOffset?: number;
  leftLegHeight?: number;
  rightLegHeight?: number;
}

export interface ManualJointLike {
  id: string;
  axis: 'vertical' | 'horizontal';
  anchorCorner?: string;
  offset: number;
  jointType?: string;
}

export function legacyJointsToManual(
  shape: string | undefined,
  g: LegacyJointSource | undefined,
): ManualJointLike[] {
  if (!g) return [];
  const out: ManualJointLike[] = [];

  if (shape === 'Г-подібна' && g.jointDirection) {
    const outerHeight = g.outerHeight ?? 1200;
    const innerHorizontal = g.innerHorizontal ?? 900;
    const innerVertical = g.innerVertical ?? 500;
    // Ті самі формули, що в старій гілці «два прямокутники»:
    // вертикальний різ по внутрішньому ребру, горизонтальний — по лінії,
    // що відділяє смугу вирізу.
    out.push({
      id: 'legacy-corner',
      axis: g.jointDirection,
      offset: g.jointDirection === 'vertical' ? innerHorizontal : outerHeight - innerVertical,
    });
  }

  if (shape === 'П-подібна') {
    const height = g.height ?? 1200;
    const leftH = g.leftLegHeight ?? height;
    const rightH = g.rightLegHeight ?? height;
    const cutW = g.innerCutWidth ?? 600;
    const cutD = g.innerCutDepth ?? 300;
    const cutOff = g.innerCutOffset ?? 300;
    const topBarHeight = Math.max(0, Math.max(leftH, rightH) - cutD);
    if (g.jointOmegaDirection) {
      out.push({
        id: 'legacy-omega',
        axis: g.jointOmegaDirection,
        offset: g.jointOmegaDirection === 'vertical' ? cutOff : topBarHeight,
      });
    }
    if (g.jointLambdaDirection) {
      out.push({
        id: 'legacy-lambda',
        axis: g.jointLambdaDirection,
        offset: g.jointLambdaDirection === 'vertical' ? cutOff + cutW : topBarHeight,
      });
    }
  }

  return out;
}

/**
 * Усі стики деталі одним списком: спершу перекладені старі, потім довільні.
 *
 * Дублі рушій знімає сам (`manualJointCuts`), тому якщо той самий різ
 * описаний і старим полем, і довільним стиком — він лишиться один.
 */
export function allJointsOf(
  shape: string | undefined,
  g: (LegacyJointSource & { manualJoints?: ManualJointLike[] }) | undefined,
): ManualJointLike[] {
  if (!g) return [];
  return [...legacyJointsToManual(shape, g), ...(g.manualJoints ?? [])];
}

/**
 * Стабільні id для стиків, які ставляться «формою» — прапорцями Г і
 * кутовим меню П. Раніше вони жили окремими полями (`jointDirection`,
 * `jointOmega/LambdaDirection`) і були невидимі в панелі «Стики»: саме
 * тому фокус-група бачила дві лінії й не могла прибрати зайву. Тепер це
 * звичайні довільні стики — просто з упізнаваними id, щоб прапорець умів
 * себе зняти.
 */
export const SHAPE_JOINT_ID = {
  corner: 'shape-corner',
  omega: 'shape-omega',
  lambda: 'shape-lambda',
} as const;

export type ShapeJointKind = keyof typeof SHAPE_JOINT_ID;

/** Позиція «формового» стику за тими самими формулами, що й у старому коді. */
function shapeJointOffset(
  kind: ShapeJointKind,
  axis: 'vertical' | 'horizontal',
  g: LegacyJointSource,
): number {
  if (kind === 'corner') {
    const outerHeight = g.outerHeight ?? 1200;
    const innerHorizontal = g.innerHorizontal ?? 900;
    const innerVertical = g.innerVertical ?? 500;
    return axis === 'vertical' ? innerHorizontal : outerHeight - innerVertical;
  }
  const height = g.height ?? 1200;
  const leftH = g.leftLegHeight ?? height;
  const rightH = g.rightLegHeight ?? height;
  const cutW = g.innerCutWidth ?? 600;
  const cutD = g.innerCutDepth ?? 300;
  const cutOff = g.innerCutOffset ?? 300;
  const topBarHeight = Math.max(0, Math.max(leftH, rightH) - cutD);
  if (axis === 'horizontal') return topBarHeight;
  return kind === 'omega' ? cutOff : cutOff + cutW;
}

/**
 * Поставити або зняти «формовий» стик, повернувши новий список довільних.
 * `direction: undefined` — зняти.
 */
export function setShapeJoint(
  current: ManualJointLike[] | undefined,
  kind: ShapeJointKind,
  direction: 'vertical' | 'horizontal' | undefined,
  g: LegacyJointSource,
): ManualJointLike[] {
  const id = SHAPE_JOINT_ID[kind];
  const rest = (current ?? []).filter((joint) => joint.id !== id);
  if (!direction) return rest;
  return [...rest, { id, axis: direction, offset: shapeJointOffset(kind, direction, g) }];
}

/** Напрямок «формового» стику, якщо він стоїть. */
export function shapeJointDirection(
  current: ManualJointLike[] | undefined,
  kind: ShapeJointKind,
): 'vertical' | 'horizontal' | undefined {
  return (current ?? []).find((joint) => joint.id === SHAPE_JOINT_ID[kind])?.axis;
}
