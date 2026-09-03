import type { Point } from './types';

/**
 * БАЗОВИЙ КОНТУР ДЕТАЛІ В ІМЕНОВАНИХ РЕБРАХ — хвиля 4, ремонт ніші.
 *
 * Ніша (П-виріз) спершу вміла тільки прямокутник: контур виводився з
 * `width × height`, і на Г-подібній деталі це ПІДМІНЯЛО форму — виріб
 * перетворювався на прямокутну стільницю з нішею. Правильна модель:
 * ніша вставляється в РЕАЛЬНИЙ контур деталі, хоч якою була б форма.
 * Для цього потрібен базовий контур у мм із іменами ребер — він тут.
 *
 * УГОДА ІМЕН (та сама, що в `customPoints`, domain/types):
 *   id точки — ім'я ребра, що в ній ЗАКІНЧУЄТЬСЯ;
 *   замикальне ребро (від останньої точки до першої) зветься
 *   `points[0].closeId ?? points[0].id`.
 *
 * Розкладки точок для Г- і П-форми — ті самі, що в 3D
 * (`shapeBuilder.getDetailPointsAndBounds`); прямокутник переписано в
 * реброві імена, бо його рідна розкладка несе імена КУТІВ (DA/AB/…), а
 * ребра йому називає окрема гілка будівника.
 */

export type EdgeNamedPoint = Point & { closeId?: string };

export interface ContourEdge {
  /** Ім'я ребра. */
  name: string;
  start: Point;
  end: Point;
  /** Це замикальне ребро (останнє → перше). */
  closing: boolean;
  lengthMm: number;
}

type BaseDims = {
  kind?: string;
  /** Ліва Г-подібна: виріз ліворуч-унизу (див. domain/types, mirrorL). */
  mirrorL?: boolean;
  width?: number;
  height?: number;
  outerWidth?: number;
  outerHeight?: number;
  innerHorizontal?: number;
  innerVertical?: number;
  leftLegHeight?: number;
  rightLegHeight?: number;
  innerCutWidth?: number;
  innerCutDepth?: number;
  innerCutOffset?: number;
};

/**
 * Базовий контур форми в мм, у реброві іменах. Порожньо — форма не
 * полігональна (коло, овал, мийка) і ніша в ній не має сенсу.
 */
export function edgeNamedContour(detail: BaseDims): EdgeNamedPoint[] | undefined {
  const kind = detail.kind ?? 'rect';

  if (kind === 'l') {
    const width = detail.outerWidth || 1200;
    const height = detail.outerHeight || 1200;
    const iw = detail.innerHorizontal || 600;
    const ih = detail.innerVertical || 600;
    /* ЛІВА Г (03.09.2026): виріз ліворуч-унизу. Обхід той самий, що в
       `shapeBuilder.getDetailPointsAndBounds`, `joints.jointAnchorPoints`
       і `geometry.lShapePoints('BL')` — усі копії контуру мають лежати
       однаково, інакше стик, кут і кромка стають на дзеркально не те
       ребро. У лівої Г увігнута вершина — D, а не C. */
    if (detail.mirrorL) {
      return [
        { id: 'start', closeId: 'F', x: 0, y: 0 } as EdgeNamedPoint,
        { id: 'A', x: width, y: 0 } as EdgeNamedPoint,
        { id: 'B', x: width, y: height } as EdgeNamedPoint,
        { id: 'C', x: iw, y: height } as EdgeNamedPoint,
        { id: 'D', x: iw, y: height - ih } as EdgeNamedPoint,
        { id: 'E', x: 0, y: height - ih } as EdgeNamedPoint,
      ];
    }
    return [
      { id: 'start', closeId: 'F', x: 0, y: 0 } as EdgeNamedPoint,
      { id: 'A', x: width, y: 0 } as EdgeNamedPoint,
      { id: 'B', x: width, y: height - ih } as EdgeNamedPoint,
      { id: 'C', x: iw, y: height - ih } as EdgeNamedPoint,
      { id: 'D', x: iw, y: height } as EdgeNamedPoint,
      { id: 'E', x: 0, y: height } as EdgeNamedPoint,
    ];
  }

  if (kind === 'u') {
    const width = detail.width || 2400;
    const height = detail.height || 1200;
    const leftH = detail.leftLegHeight ?? height;
    const rightH = detail.rightLegHeight ?? height;
    const cutW = detail.innerCutWidth || 1200;
    const cutD = detail.innerCutDepth || 600;
    const cutOff = detail.innerCutOffset || 600;
    const topBarHeight = Math.max(0, height - cutD);
    return [
      { id: 'start', closeId: 'H', x: 0, y: 0 } as EdgeNamedPoint,
      { id: 'A', x: width, y: 0 } as EdgeNamedPoint,
      { id: 'B', x: width, y: rightH } as EdgeNamedPoint,
      { id: 'C', x: cutOff + cutW, y: rightH } as EdgeNamedPoint,
      { id: 'D', x: cutOff + cutW, y: topBarHeight } as EdgeNamedPoint,
      { id: 'E', x: cutOff, y: topBarHeight } as EdgeNamedPoint,
      { id: 'F', x: cutOff, y: leftH } as EdgeNamedPoint,
      { id: 'G', x: 0, y: leftH } as EdgeNamedPoint,
    ];
  }

  if (kind === 'rect' || !kind) {
    const width = detail.width || 1000;
    const height = detail.height || 600;
    return [
      { id: 'D', x: 0, y: 0 } as EdgeNamedPoint,
      { id: 'A', x: width, y: 0 } as EdgeNamedPoint,
      { id: 'B', x: width, y: height } as EdgeNamedPoint,
      { id: 'C', x: 0, y: height } as EdgeNamedPoint,
    ];
  }

  return undefined;
}

/** Ребра контуру з іменами й довжинами — у порядку обходу. */
export function contourEdges(points: EdgeNamedPoint[]): ContourEdge[] {
  const n = points.length;
  if (n < 3) return [];
  const edges: ContourEdge[] = [];
  for (let i = 0; i < n; i += 1) {
    const start = points[i];
    const end = points[(i + 1) % n];
    const closing = i === n - 1;
    const name = closing
      ? (points[0].closeId ?? points[0].id ?? 'close')
      : (end.id ?? `edge-${i + 1}`);
    edges.push({
      name: String(name),
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      closing,
      lengthMm: Math.hypot(end.x - start.x, end.y - start.y),
    });
  }
  return edges;
}

/** Знак площі: >0 — обхід проти годинникової (у координатах x→право, y→вниз це «за»). */
export function contourSignedArea(points: Point[]): number {
  return points.reduce(
    (sum, p, i) => sum + (p.x * points[(i + 1) % points.length].y - points[(i + 1) % points.length].x * p.y),
    0,
  ) / 2;
}

/* ═══════════════════════════════════════════════════════════════════
   КРУГЛА Й ОВАЛЬНА (01.09.2026, власник повернув їх усім).

   Розкрій давно вміє коло й овал (engines/geometry: circlePoints,
   ellipsePoints, торцеві смуги по квадрантах A–D). Редактор виробу — ні:
   усі його копії «точок деталі» для kind circle/ellipse падали в гілку
   прямокутника, і в 3D та на кресленні кругла стільниця була прямокутною.
   Тепер контур кривої форми народжується тут, у тій самій угоді імен, що
   й решта: id точки — ім'я ребра, що в ній закінчується.

   СТОРОНИ — квадранти, як у розкрої (sideAngles у geometry.ts):
     A: π…1.5π   (ліво → верх)      B: 1.5π…2π  (верх → право)
     C: 2π…2.5π  (право → низ)      D: 2.5π…3π  (низ → ліво)
   Обхід за годинниковою на екрані (y вниз) — як у прямокутника.
   ═══════════════════════════════════════════════════════════════════ */

/** Скільки хорд на повне коло в редакторі (розкрій бере 36/42). */
export const CURVE_CONTOUR_SEGMENTS = 64;

type CurveDims = {
  kind?: string;
  diameter?: number;
  ellipseWidth?: number;
  ellipseHeight?: number;
};

/** Квадрант-сторона для кута (радіани, від π до 3π). */
function quadrantFor(angle: number): string {
  const a = ((angle - Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); // 0..2π від «ліво»
  if (a < Math.PI / 2) return 'A';
  if (a < Math.PI) return 'B';
  if (a < Math.PI * 1.5) return 'C';
  return 'D';
}

/**
 * Контур кола/овалу в мм (0..w × 0..h), у реброві іменах A–D за
 * квадрантами. Порожньо для інших форм.
 */
export function curvedContour(detail: CurveDims, segments = CURVE_CONTOUR_SEGMENTS): EdgeNamedPoint[] | undefined {
  let w: number;
  let h: number;
  if (detail.kind === 'circle') {
    const d = Math.max(1, detail.diameter || 800);
    w = d; h = d;
  } else if (detail.kind === 'ellipse') {
    w = Math.max(1, detail.ellipseWidth || 1200);
    h = Math.max(1, detail.ellipseHeight || 600);
  } else {
    return undefined;
  }
  const rx = w / 2;
  const ry = h / 2;
  const out: EdgeNamedPoint[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = Math.PI + (Math.PI * 2 * i) / segments;
    // Хорда, що ЗАКІНЧУЄТЬСЯ в цій точці, лежить між попереднім і цим кутом.
    const chordMid = angle - Math.PI / segments;
    const point: EdgeNamedPoint = {
      id: quadrantFor(chordMid),
      x: rx + Math.cos(angle) * rx,
      y: ry + Math.sin(angle) * ry,
    };
    if (i === 0) point.closeId = 'D'; // замикальна хорда (остання → перша) — низ→ліво
    out.push(point);
  }
  return out;
}

/** Чи форма крива (коло/овал) — сторони в неї квадранти, а не ребра. */
export function isCurvedKind(kind?: string): boolean {
  return kind === 'circle' || kind === 'ellipse';
}
