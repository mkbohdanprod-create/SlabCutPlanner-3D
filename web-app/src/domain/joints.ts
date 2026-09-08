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
  /**
   * Пара сторін, між якими стоїть стик (№141). Стик, поставлений на
   * кресленні, знає своє поле — і рушій ріже тільки його, а не все, крізь що
   * проходить пряма. Порожньо у «формових» стиків (омега/лямбда, кутовий Г):
   * вони наскрізні за визначенням.
   */
  sideId?: string;
  oppositeSideId?: string;
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

/* ────────────────────────────────────────────────────────────────────────────
   ПОЛЯ СТИКІВ (№142, 08.09.2026)

   Стик іде між сторонами, які стоять НАПРОТИ одна одної. У складної форми в
   однієї сторони таких напроти кілька: у П-подібної верхня A стоїть напроти і
   G, і E, і C — і на кожну пару в редакторі стоїть свій бейдж, бо один бейдж
   не давав зробити другий стик («стик до стика не робиться», №139).

   Пара — це ще не поле. Стик іде наскрізь, тому він можливий лише там, де між
   двома сторонами СУЦІЛЬНИЙ матеріал: пара H↔B у П-подібної перекривається по
   всій висоті, але нижче рівня E — виріз, і лінія там повисне в повітрі
   (правка власника 08.09). Тому діапазон обрізається по контуру.

   Математика лежить тут, а не в компоненті: креслення (2D) і модель (3D)
   мусять показувати ОДНІ І ТІ САМІ поля, інакше стик, поставлений в одному
   місці, з'явиться в іншому. Це те саме правило, що й для позиції різу —
   одна функція на рушій і на інтерфейс.
   ──────────────────────────────────────────────────────────────────────── */

/** Поле, у якому можна поставити стик між двома сторонами. */
export type JointFieldPair = {
  sideId: string;
  otherId: string;
  /** Напрямок лінії різу між цими сторонами. */
  axis: 'vertical' | 'horizontal';
  /** Межі поля вздовж сторони `sideId`, мм від її початку. */
  from: number;
  to: number;
  /** Середина поля вздовж сторони — сюди стає бейдж. */
  mid: number;
  /** Точка на стороні `sideId` посередині поля. */
  at: Point;
  /** Одиничний напрямок сторони `sideId` і її ЗОВНІШНЯ нормаль. */
  dir: Point;
  normal: Point;
  /** Відстань до протилежної сторони. */
  depth: number;
  /** Прямокутник поля — для підсвітки на кресленні. */
  zone: Point[];
  /** Габарит поля — з нього видно, які сторони його обмежують. */
  box: { minX: number; maxX: number; minY: number; maxY: number };
};

/**
 * КОНТУР ІЗ САМИХ СТОРІН (Б-159, скарга власника 08.09: «коли радіус, то
 * пропадає сторона C у стиках»).
 *
 * Раніше виклики збирали контур як `sides.map(s => s.v1)` — по одній точці на
 * сторону. Поки всі сторони стикуються кінець-у-кінець, це те саме кільце. Але
 * щойно кут отримує РАДІУС, між сторонами з'являється дуга: кінець C і початок
 * D розходяться, і кільце з самих `v1` замінює «сторона C + дуга» однією
 * довгою діагоналлю. Ця діагональ накриває шматок порожнечі як «матеріал», і
 * пробна точка біля середини C потрапляє «всередину» — нормаль сторони
 * перевертається, пара C↔A перестає бути парою (нормалі більше не назустріч),
 * і бейдж стику зникає рівно там, де стик фізично можливий.
 *
 * Тому контур будується з ОБОХ кінців кожної сторони: дуга при цьому
 * замінюється хордою між своїми ж кінцями — наближення, яке контур не
 * перекручує. Точки, що збіглися, прибираються, щоб не плодити нулі.
 */
export function outlineFromSides(sides: JointSideSegment[]): Point[] {
  const pts: Point[] = [];
  const push = (p: Point) => {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) return;
    pts.push({ x: p.x, y: p.y });
  };
  sides.forEach((side) => {
    push(side.v1);
    push(side.v2);
  });
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (pts.length > 1 && first && last && Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01) pts.pop();
  return pts;
}

/** Чи лежить точка в контурі (промінь управо, парність перетинів). */
function pointInOutline(outline: Array<{ x: number; y: number }>) {
  return (p: { x: number; y: number }) => {
    let hit = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const yi = outline[i].y;
      const yj = outline[j].y;
      if ((yi > p.y) === (yj > p.y)) continue;
      const x = outline[i].x + ((p.y - yi) / (yj - yi)) * (outline[j].x - outline[i].x);
      if (p.x < x) hit = !hit;
    }
    return hit;
  };
}

/**
 * Усі поля стиків деталі.
 *
 * `sides` — сторони контуру в міліметрах, `outline` — сам контур (для перевірки
 * матеріалу). Пари повертаються в ОБИДВА боки (A↔G і G↔A): бейдж стоїть на
 * кожній стороні пари, і кожному потрібна своя середина поля.
 */
export function jointFieldPairs(
  sides: JointSideSegment[],
  outline: Array<{ x: number; y: number }>,
): JointFieldPair[] {
  const out: JointFieldPair[] = [];
  if (sides.length < 2 || outline.length < 3) return out;
  const inside = pointInOutline(outline);

  const info = sides.map((side) => {
    const dx = side.v2.x - side.v1.x;
    const dy = side.v2.y - side.v1.y;
    const len = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / len, y: dy / len };
    /* Нормаль має дивитись НАЗОВНІ. Знак залежить від напрямку обходу контуру,
       а обхід у 2D і 3D може бути різний — тому перевіряємо пробною точкою, а
       не покладаємось на угоду. */
    let normal = { x: dy / len, y: -dx / len };
    const mid = { x: (side.v1.x + side.v2.x) / 2, y: (side.v1.y + side.v2.y) / 2 };
    const probe = Math.max(1, len * 0.01);
    if (inside({ x: mid.x + normal.x * probe, y: mid.y + normal.y * probe })) {
      normal = { x: -normal.x, y: -normal.y };
    }
    return { side, dir, normal, len, mid };
  });

  for (const a of info) {
    if (a.len < 20) continue;
    for (const b of info) {
      if (b.side.id === a.side.id || b.len < 20) continue;
      // паралельні
      if (Math.abs(a.dir.x * b.dir.y - a.dir.y * b.dir.x) >= 0.05) continue;
      // нормалі назустріч — інакше це «сходинка», а не пара
      if (a.normal.x * b.normal.x + a.normal.y * b.normal.y > -0.9) continue;
      // b має лежати з ВНУТРІШНЬОГО боку a (нормаль дивиться назовні)
      const toB = { x: b.mid.x - a.mid.x, y: b.mid.y - a.mid.y };
      if (toB.x * a.normal.x + toB.y * a.normal.y >= 0) continue;

      // перекриття проекцій на напрямок сторони a
      const t = (p: { x: number; y: number }) =>
        (p.x - a.side.v1.x) * a.dir.x + (p.y - a.side.v1.y) * a.dir.y;
      const b1 = t(b.side.v1);
      const b2 = t(b.side.v2);
      const rawFrom = Math.max(0, Math.min(b1, b2));
      const rawTo = Math.min(a.len, Math.max(b1, b2));
      if (rawTo - rawFrom < Math.max(20, a.len * 0.02)) continue;

      const depth = -((b.mid.x - a.mid.x) * a.normal.x + (b.mid.y - a.mid.y) * a.normal.y);
      if (depth <= 1) continue;

      /* Діапазон по матеріалу: беремо найдовшу неперервну ділянку, де відрізок
         «від сторони до сторони» цілком лежить у контурі. */
      const solidAt = (u: number) => {
        const px = a.side.v1.x + a.dir.x * u;
        const py = a.side.v1.y + a.dir.y * u;
        for (let k = 1; k <= 6; k++) {
          const d = (depth * k) / 7;
          if (!inside({ x: px - a.normal.x * d, y: py - a.normal.y * d })) return false;
        }
        return true;
      };
      const steps = 64;
      let from = NaN;
      let to = NaN;
      let runFrom = NaN;
      let runTo = NaN;
      for (let s = 0; s <= steps; s++) {
        const u = rawFrom + ((rawTo - rawFrom) * s) / steps;
        if (solidAt(u)) {
          if (Number.isNaN(runFrom)) runFrom = u;
          runTo = u;
        } else if (!Number.isNaN(runFrom)) {
          if (Number.isNaN(from) || runTo - runFrom > to - from) { from = runFrom; to = runTo; }
          runFrom = NaN;
          runTo = NaN;
        }
      }
      if (!Number.isNaN(runFrom) && (Number.isNaN(from) || runTo - runFrom > to - from)) {
        from = runFrom;
        to = runTo;
      }
      if (Number.isNaN(from) || to - from < Math.max(20, a.len * 0.02)) continue;

      /* Проби йдуть кроком, тому межа поля знаходиться з точністю кроку —
         на метровій стороні це сантиметр, і поле візуально «не доходить» до
         краю вирізу. Уточнюємо обидві межі діленням навпіл: 24 ітерації дають
         частку мікрона, а коштують нічого — це той самий `solidAt`. */
      const step = (rawTo - rawFrom) / steps;
      const refine = (solid: number, empty: number) => {
        let lo = solid;
        let hi = empty;
        for (let i = 0; i < 24; i++) {
          const m = (lo + hi) / 2;
          if (solidAt(m)) lo = m; else hi = m;
        }
        return lo;
      };
      if (from - step > rawFrom) from = refine(from, from - step);
      else from = rawFrom;
      if (to + step < rawTo) to = refine(to, to + step);
      else to = rawTo;

      const mid = (from + to) / 2;
      const pad = Math.min(a.len * 0.03, (to - from) / 6, depth / 6);
      const q1 = { x: a.side.v1.x + a.dir.x * (from + pad), y: a.side.v1.y + a.dir.y * (from + pad) };
      const q2 = { x: a.side.v1.x + a.dir.x * (to - pad), y: a.side.v1.y + a.dir.y * (to - pad) };
      const near = pad;
      const far = depth - pad;

      out.push({
        sideId: a.side.id,
        otherId: b.side.id,
        axis: jointAxisForSide(a.side),
        from,
        to,
        mid,
        at: { x: a.side.v1.x + a.dir.x * mid, y: a.side.v1.y + a.dir.y * mid },
        dir: a.dir,
        normal: a.normal,
        depth,
        zone: [
          { x: q1.x - a.normal.x * near, y: q1.y - a.normal.y * near },
          { x: q2.x - a.normal.x * near, y: q2.y - a.normal.y * near },
          { x: q2.x - a.normal.x * far, y: q2.y - a.normal.y * far },
          { x: q1.x - a.normal.x * far, y: q1.y - a.normal.y * far },
        ],
        box: (() => {
          const p1 = { x: a.side.v1.x + a.dir.x * from, y: a.side.v1.y + a.dir.y * from };
          const p2 = { x: a.side.v1.x + a.dir.x * to, y: a.side.v1.y + a.dir.y * to };
          const p3 = { x: p2.x - a.normal.x * depth, y: p2.y - a.normal.y * depth };
          const p4 = { x: p1.x - a.normal.x * depth, y: p1.y - a.normal.y * depth };
          const xs = [p1.x, p2.x, p3.x, p4.x];
          const ys = [p1.y, p2.y, p3.y, p4.y];
          return {
            minX: Math.min(...xs), maxX: Math.max(...xs),
            minY: Math.min(...ys), maxY: Math.max(...ys),
          };
        })(),
      });
    }
  }

  return out;
}


/**
 * СТОРОНА-ЛІНІЙКА В МЕЖАХ ПОЛЯ (№143, 08.09.2026).
 *
 * Власник: «не зрозуміло, від якої сторони відступ». Причина була в тому, що
 * `referenceSideForJoint` шукала найближчу паралельну сторону по всій деталі,
 * не дивлячись, чи вона взагалі є в цьому полі. У П-подібної низ лівої ноги
 * (G) і низ правої (C) лежать на одній висоті — і для стику в ЛІВІЙ нозі
 * лінійкою оголошувалась C, сторона з іншого виступа. Число було правильне,
 * а підпис — брехливий.
 *
 * Тут сторона-лінійка шукається ТІЛЬКИ серед тих, що обмежують саме це поле:
 * паралельна лінії різу і перетинається з габаритом поля впоперек.
 */
export function referenceSideInField(
  sides: JointSideSegment[],
  axis: 'vertical' | 'horizontal',
  anchorPoint: Point | undefined,
  box: { minX: number; maxX: number; minY: number; maxY: number },
): { id: string; position: number } | undefined {
  if (!anchorPoint) return undefined;
  const eps = 1;

  let best: { id: string; position: number; distance: number } | undefined;
  for (const side of sides) {
    // Лінійка ПАРАЛЕЛЬНА різу: з неї вийшов би стик іншої осі.
    if (jointAxisForSide(side) === axis) continue;

    const lo = axis === 'horizontal'
      ? Math.min(side.v1.x, side.v2.x)
      : Math.min(side.v1.y, side.v2.y);
    const hi = axis === 'horizontal'
      ? Math.max(side.v1.x, side.v2.x)
      : Math.max(side.v1.y, side.v2.y);
    const fieldLo = axis === 'horizontal' ? box.minX : box.minY;
    const fieldHi = axis === 'horizontal' ? box.maxX : box.maxY;
    // Сторона з іншого виступа поле не обмежує — вона тут не лінійка.
    if (hi < fieldLo - eps || lo > fieldHi + eps) continue;

    const position = axis === 'horizontal'
      ? (side.v1.y + side.v2.y) / 2
      : (side.v1.x + side.v2.x) / 2;
    const distance = axis === 'horizontal'
      ? Math.abs(position - anchorPoint.y)
      : Math.abs(position - anchorPoint.x);
    if (!best || distance < best.distance) best = { id: side.id, position, distance };
  }
  return best ? { id: best.id, position: best.position } : undefined;
}
