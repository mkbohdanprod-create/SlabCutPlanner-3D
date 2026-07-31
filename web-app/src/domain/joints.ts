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

/** Увігнуті (270°) кути форми — там скруглення додає матеріал, а не зрізає. */
export function reflexCornerIds(shape: string | undefined): string[] {
  if (shape === 'П-подібна') return ['D', 'E'];
  if (shape === 'Г-подібна') return ['C'];
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
  anchorCorner?: string;
};

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
  const requested = base + joint.offset;
  return { requested, snapped: snapJointPosition(anchors, corners, joint.axis, requested) };
}
