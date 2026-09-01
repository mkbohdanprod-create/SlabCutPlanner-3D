import type { Point } from './types';
import { contourEdges, contourSignedArea, edgeNamedContour } from './baseContour';
import type { EdgeNamedPoint } from './baseContour';

/**
 * П-ПОДІБНИЙ ВИРІЗ (ніша) — ХВИЛЯ 4, крок 4.4 (FG-34).
 *
 * Це НЕ отвір. Отвір — замкнений контур усередині деталі, і цех вирізає
 * його свердлом та фрезою. Ніша розриває зовнішній контур: до неї є доступ
 * ззовні, її ріжуть із краю, а її стінки — це справжні торці, які треба
 * обробити й порахувати. Саме тому вона задається контуром деталі
 * (`customPoints`), а не записом у `cutouts`.
 *
 * РЕМОНТ 19.08 (баг від Богдана). Перша версія будувала контур ЛИШЕ з
 * прямокутника `width × height`: ніша на Г-подібній стільниці мовчки
 * ПІДМІНЯЛА форму — виріб перетворювався на прямокутник із нішею. Тепер
 * ніша вставляється в РЕАЛЬНИЙ базовий контур деталі (`domain/baseContour`),
 * тож працює на прямокутнику, Г- і П-формі однаково: знаходимо ребро із
 * заданим ім'ям і врізаємо нішу саме в нього, не чіпаючи решту контуру.
 *
 * v1 — ПРЯМОКУТНА ніша. Скруглення внутрішніх кутів роблять окремо, через
 * звичайну обробку кутів — без другої, паралельної реалізації радіусів.
 *
 * ІМЕНА РЕБЕР. Ніша розрізає свою сторону на п'ять ділянок, і кожна дістає
 * власне ім'я (n — niche):
 *
 *              A_n2  (дно ніші)
 *            ┌───────┐
 *      A_n1  │       │  A_n3      ← стінки ніші: на них вішаються панелі
 *  ──────────┘       └──────────
 *      A                   A_n4     ← залишки самої сторони A
 *
 * Кожне ім'я — окреме, і це принципово: два відрізки під одним іменем
 * зробили б довжину сторони неоднозначною, а панель їхала б на випадковий
 * із них. Разом із контуром віддається `sideSegments` — явна таблиця
 * «ім'я → відрізок», щоб рушій не відновлював сторони позиційно.
 */

/** Історично 'A'|'B'|'C'|'D'; тепер будь-яке ім'я прямого ребра контуру. */
export type UCutoutSide = string;

export interface UCutoutSpec {
  /** Ім'я сторони (ребра базового контуру), з якої різати нішу. */
  side: UCutoutSide;
  /** Відступ від ПОЧАТКУ ребра (за обходом контуру) до першої стінки, мм. */
  offsetMm: number;
  /** Ширина ніші вздовж сторони, мм. */
  widthMm: number;
  /** Глибина ніші всередину деталі, мм. */
  depthMm: number;
}

/** Скільки матеріалу мусить лишитись, щоб деталь не розпалась. */
export const U_CUTOUT_MIN_BRIDGE_MM = 20;
/** Менше цього ніша не має сенсу — це вже отвір або брак. */
export const U_CUTOUT_MIN_SIZE_MM = 50;

export type UCutoutProblem =
  | { code: 'too_small'; message: string }
  | { code: 'no_bridge'; message: string }
  | { code: 'out_of_side'; message: string }
  | { code: 'no_side'; message: string };

/** Імена п'яти ділянок, на які ніша ділить свою сторону. */
export function uCutoutEdgeIds(side: UCutoutSide) {
  return {
    before: side,
    left: `${side}_n1`,
    bottom: `${side}_n2`,
    right: `${side}_n3`,
    after: `${side}_n4`,
  };
}

/** Тільки торці самої ніші — те, що цех обробляє як внутрішні краї. */
export function uCutoutWallIds(side: UCutoutSide) {
  const ids = uCutoutEdgeIds(side);
  return [ids.left, ids.bottom, ids.right];
}

/* ── Геометрія на довільному контурі ──────────────────────────────────── */

type Vec = { x: number; y: number };

/**
 * Одиничний напрямок ребра і нормаль УСЕРЕДИНУ деталі.
 *
 * Знак нормалі береться не пробою «чи точка в полігоні» (на увігнутих
 * формах проба біля кута бреше), а з орієнтації всього контуру: для обходу
 * з додатною знаковою площею матеріал лежить ліворуч від напрямку ребра.
 */
function edgeFrame(points: Point[], start: Point, end: Point): { dir: Vec; inward: Vec; length: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const dir = { x: dx / length, y: dy / length };
  const left = { x: -dir.y, y: dir.x };
  const sign = contourSignedArea(points) > 0 ? 1 : -1;
  return { dir, inward: { x: left.x * sign, y: left.y * sign }, length };
}

/**
 * Скільки мм є вглиб деталі з ділянки [offset, offset+width] цього ребра —
 * промінь усередину до першого перетину з рештою контуру. Це чесна
 * «товщина» деталі під нішею: на Г-формі вона різна в різних місцях.
 */
export function uCutoutAvailableDepthMm(
  points: Point[],
  spec: Pick<UCutoutSpec, 'side' | 'offsetMm' | 'widthMm'>,
): number | undefined {
  const edges = contourEdges(points as EdgeNamedPoint[]);
  const host = edges.find((edge) => edge.name === spec.side);
  if (!host) return undefined;
  const { dir, inward } = edgeFrame(points, host.start, host.end);

  const castRay = (origin: Vec): number => {
    let best = Infinity;
    for (const edge of edges) {
      if (edge.name === spec.side) continue;
      // Перетин променя origin + t·inward із відрізком edge.
      const ex = edge.end.x - edge.start.x;
      const ey = edge.end.y - edge.start.y;
      const denom = inward.x * ey - inward.y * ex;
      if (Math.abs(denom) < 1e-9) continue;
      const sx = edge.start.x - origin.x;
      const sy = edge.start.y - origin.y;
      const t = (sx * ey - sy * ex) / denom;
      const u = (sx * inward.y - sy * inward.x) / denom;
      if (t > 0.001 && u >= -0.001 && u <= 1.001) best = Math.min(best, t);
    }
    return best;
  };

  // Три промені: обидві стінки і середина. Мінімум — чесний максимум глибини.
  const at = (mm: number): Vec => ({ x: host.start.x + dir.x * mm, y: host.start.y + dir.y * mm });
  const depth = Math.min(
    castRay(at(spec.offsetMm)),
    castRay(at(spec.offsetMm + spec.widthMm / 2)),
    castRay(at(spec.offsetMm + spec.widthMm)),
  );
  return Number.isFinite(depth) ? depth : undefined;
}

/**
 * Перевірка ніші НА КОНТУРІ. Порожній список — різати можна.
 * Окремо від побудови, щоб модалка показувала причину, а не мовчала.
 */
export function uCutoutProblemsOnContour(points: EdgeNamedPoint[], spec: UCutoutSpec): UCutoutProblem[] {
  const problems: UCutoutProblem[] = [];
  const edges = contourEdges(points);
  const host = edges.find((edge) => edge.name === spec.side);
  if (!host) {
    return [{ code: 'no_side', message: `На контурі деталі немає прямої сторони «${spec.side}».` }];
  }

  if (spec.widthMm < U_CUTOUT_MIN_SIZE_MM || spec.depthMm < U_CUTOUT_MIN_SIZE_MM) {
    problems.push({
      code: 'too_small',
      message: `Ніша менша за ${U_CUTOUT_MIN_SIZE_MM} мм — це вже виріз, а не ніша.`,
    });
  }
  if (spec.offsetMm < U_CUTOUT_MIN_BRIDGE_MM
    || spec.offsetMm + spec.widthMm > host.lengthMm - U_CUTOUT_MIN_BRIDGE_MM) {
    problems.push({
      code: 'out_of_side',
      message: `З кожного боку ніші має лишитись щонайменше ${U_CUTOUT_MIN_BRIDGE_MM} мм деталі (сторона ${Math.round(host.lengthMm)} мм).`,
    });
  }
  const available = uCutoutAvailableDepthMm(points, spec);
  if (available !== undefined && spec.depthMm > available - U_CUTOUT_MIN_BRIDGE_MM) {
    problems.push({
      code: 'no_bridge',
      message: `Тут є лише ${Math.max(0, Math.round(available - U_CUTOUT_MIN_BRIDGE_MM))} мм углиб: далі деталь тонша за перемичку ${U_CUTOUT_MIN_BRIDGE_MM} мм і розпадеться.`,
    });
  }
  return problems;
}

/**
 * Вставити нішу в контур. Повертає НОВИЙ контур або порожньо, якщо
 * специфікація непридатна (див. uCutoutProblemsOnContour).
 *
 * Працює з будь-яким полігональним контуром у ребровій угоді імен —
 * саме це лагодить баг «ніша на Г-формі підмінила виріб прямокутником».
 */
export function applyUCutout(points: EdgeNamedPoint[], spec: UCutoutSpec): EdgeNamedPoint[] | undefined {
  if (uCutoutProblemsOnContour(points, spec).length > 0) return undefined;

  const n = points.length;
  const edges = contourEdges(points);
  const hostIndex = edges.findIndex((edge) => edge.name === spec.side);
  const host = edges[hostIndex];
  const { dir, inward } = edgeFrame(points, host.start, host.end);
  const ids = uCutoutEdgeIds(spec.side);

  const a = spec.offsetMm;
  const b = spec.offsetMm + spec.widthMm;
  const d = spec.depthMm;
  const at = (mm: number, deep = 0): EdgeNamedPoint => ({
    x: host.start.x + dir.x * mm + inward.x * deep,
    y: host.start.y + dir.y * mm + inward.y * deep,
  } as EdgeNamedPoint);

  // П'ять точок ніші. id точки — ім'я ребра, що в ній закінчується.
  const q1 = { ...at(a), id: ids.before };       // кінець першого залишку сторони
  const q2 = { ...at(a, d), id: ids.left };      // низ лівої стінки
  const q3 = { ...at(b, d), id: ids.bottom };    // кінець дна
  const q4 = { ...at(b), id: ids.right };        // вихід правої стінки на контур

  if (host.closing) {
    /*
     * Ніша в ЗАМИКАЛЬНОМУ ребрі (E→start у Г-форми, сторона D прямокутника):
     * нові точки додаються в кінець обходу, а другий залишок — це нове
     * замикальне ребро, тож перейменовується сам закривач у points[0].
     */
    const first = points[0];
    const renamedFirst: EdgeNamedPoint = first.closeId !== undefined
      ? { ...first, closeId: ids.after }
      : { ...first, id: ids.after };
    return [renamedFirst, ...points.slice(1), q1, q2, q3, q4];
  }

  // Звичайне ребро points[i] → points[i+1]: вставляємо після points[i],
  // а точка-кінець ребра віддає своє ім'я другому залишку (side_n4).
  const endIdx = (hostIndex + 1) % n;
  const result: EdgeNamedPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    if (i === endIdx) {
      result.push(q1, q2, q3, q4);
      result.push({ ...points[i], id: ids.after });
    } else {
      result.push(points[i]);
    }
  }
  return result;
}

/* ── Зручні обгортки ──────────────────────────────────────────────────── */

/** Базовий контур ПРЯМОКУТНИКА в ребровій угоді — для тестів і сумісності. */
function rectBase(detail: { width: number; height: number }): EdgeNamedPoint[] {
  return edgeNamedContour({ kind: 'rect', width: detail.width, height: detail.height })!;
}

/**
 * Контур деталі з нішею. Історична сигнатура (прямокутник за габаритом);
 * для довільної форми користуйтесь applyUCutout(edgeNamedContour(draft), spec).
 */
export function buildUCutoutContour(
  spec: UCutoutSpec,
  detail: { width: number; height: number },
): Point[] | undefined {
  return applyUCutout(rectBase(detail), spec);
}

/** Перевірка на прямокутнику — історична сигнатура. */
export function validateUCutout(
  spec: UCutoutSpec,
  detail: { width: number; height: number },
): UCutoutProblem[] {
  return uCutoutProblemsOnContour(rectBase(detail), spec);
}

/**
 * Явна таблиця «ім'я сторони → відрізок» для контуру з нішею.
 * Рушій розкрою бере її як джерело правди і не вгадує сторони позиційно.
 */
export function sideSegmentsOfContour(points: EdgeNamedPoint[]): Record<string, { start: Point; end: Point }> {
  const segments: Record<string, { start: Point; end: Point }> = {};
  contourEdges(points).forEach((edge) => {
    segments[edge.name] = { start: edge.start, end: edge.end };
  });
  return segments;
}

/** Історична обгортка для прямокутника. */
export function uCutoutSideSegments(
  spec: UCutoutSpec,
  detail: { width: number; height: number },
): Record<string, { start: Point; end: Point }> | undefined {
  const points = buildUCutoutContour(spec, detail);
  return points ? sideSegmentsOfContour(points as EdgeNamedPoint[]) : undefined;
}

/** Імена сторін контуру з нішею, в порядку обходу. */
export function uCutoutSideNames(
  spec: UCutoutSpec,
  detail: { width: number; height: number },
): string[] {
  const points = buildUCutoutContour(spec, detail);
  if (!points) return ['A', 'B', 'C', 'D'];
  return contourEdges(points as EdgeNamedPoint[]).map((edge) => edge.name);
}

/**
 * Площа ніші, м² — рівно стільки матеріалу НЕ пішло в деталь. Кошторис
 * бере площу з контуру сам, але для підказки в модалці корисно.
 */
export function uCutoutAreaM2(spec: UCutoutSpec): number {
  return (spec.widthMm * spec.depthMm) / 1_000_000;
}
