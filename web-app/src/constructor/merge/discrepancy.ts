/**
 * ЛИСТ РОЗБІЖНОСТЕЙ — 04.09.2026.
 *
 * §9 «Першої версії конструктора»: один механізм на три сценарії
 * (проєкт ↔ замір, проєкт ↔ креслення, креслення ↔ замір). Тут — перший:
 * контур виробу в координатах заміру проти стін заміру.
 *
 * Для кожної сторони виробу шукаємо найближчий відрізок заміру
 * (стіну), рахуємо: відхилення по кінцях сторони від стіни (мм), кут між
 * стороною і стіною (градуси), і чи в допуску. Рекламація 81-1750325:
 * +36 мм між заміром і кресленням — саме те, що цей лист має ловити до
 * цеху, а не після монтажу.
 *
 * Що це НЕ робить: не вирішує, яку сторону підганяти. Показує — рішення
 * приймає конструктор-технолог (НЕ-3, §10).
 */
import type { MeasureModel, MeasureSegment, MPoint } from '../measure/leicaDxf';
import { distanceToSegment, lineIntersection, type OutlineSide, type ProductOutline, sidesOf } from '../geometry';
import type { Point } from '../../domain/types';

export interface SideDiff {
  productId: string;
  productName: string;
  detailId: string;
  side: OutlineSide;
  /** Найближча стіна заміру (відрізок), якщо є в радіусі пошуку. */
  wall?: MeasureSegment;
  /** Відхилення кінців сторони від прямої стіни, мм (знак: + = назовні від стіни). */
  gapA?: number;
  gapB?: number;
  /** Кут між стороною і стіною, градуси (0 = паралельні). */
  angleDeg?: number;
  /** Кут стіни з сусідньою стіною у заміру, якщо стіна знайдена (КС-14: 89–91 — норма життя). */
  status: 'ok' | 'off' | 'nowall';
}

/** Радіус, у якому шукаємо стіну для сторони: далі — «не по стіні, сторона вільна». */
const SEARCH_RADIUS_MM = 120;

export function discrepancySheet(
  outlines: ProductOutline[],
  measure: MeasureModel | null,
  toleranceMm: number,
): SideDiff[] {
  const out: SideDiff[] = [];
  const walls = measure?.segments ?? [];
  for (const o of outlines) {
    for (const side of sidesOf(o.world, o.sideNames)) {
      if (side.lengthMm < 30) continue;
      let best: { seg: MeasureSegment; score: number } | null = null;
      for (const seg of walls) {
        if (seg.arc) continue;
        const da = distanceToSegment(side.a, seg.a, seg.b).d;
        const db = distanceToSegment(side.b, seg.a, seg.b).d;
        const score = Math.max(da, db);
        if (score <= SEARCH_RADIUS_MM && (!best || score < best.score)) best = { seg, score };
      }
      if (!best) {
        out.push({ productId: o.productId, productName: o.productName, detailId: o.detail.id, side, status: 'nowall' });
        continue;
      }
      const seg = best.seg;
      const gapA = signedDistance(side.a, seg.a, seg.b);
      const gapB = signedDistance(side.b, seg.a, seg.b);
      const angleDeg = angleBetween(side.a, side.b, seg.a, seg.b);
      const off = Math.abs(gapA) > toleranceMm || Math.abs(gapB) > toleranceMm;
      out.push({
        productId: o.productId, productName: o.productName, detailId: o.detail.id, side, wall: seg,
        gapA, gapB, angleDeg, status: off ? 'off' : 'ok',
      });
    }
  }
  return out;
}

/** Знакова відстань точки до прямої (a→b); знак — з якого боку. */
export function signedDistance(p: MPoint, a: MPoint, b: MPoint): number {
  const vx = b.x - a.x; const vy = b.y - a.y;
  const len = Math.hypot(vx, vy);
  if (len < 1e-9) return 0;
  return ((p.x - a.x) * vy - (p.y - a.y) * vx) / len;
}

/** Гострий кут між напрямками двох відрізків, градуси (0…90). */
export function angleBetween(a1: MPoint, a2: MPoint, b1: MPoint, b2: MPoint): number {
  const ax = a2.x - a1.x; const ay = a2.y - a1.y;
  const bx = b2.x - b1.x; const by = b2.y - b1.y;
  const la = Math.hypot(ax, ay); const lb = Math.hypot(bx, by);
  if (la < 1e-9 || lb < 1e-9) return 0;
  const cos = Math.abs((ax * bx + ay * by) / (la * lb));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/**
 * ПІДІГНАТИ СТОРОНУ ДО СТІНИ.
 *
 * Кінці сторони переносимо на пряму стіни, а сусідні сторони — на
 * перетин своїх прямих з прямою стіни. Так виріб дістає кут стіни
 * (89,14–90,64° — КС-14) замість номінальних 90°, а решта контуру
 * лишається як була. Повертає новий контур у СВІТОВИХ координатах або
 * null, якщо перетинів немає (стіна паралельна сусідній стороні).
 */
export function fitSideToWall(world: MPoint[], sideIndex: number, wall: MeasureSegment): MPoint[] | null {
  const n = world.length;
  const iB = sideIndex;               // кінцева точка сторони
  const iA = (sideIndex - 1 + n) % n; // початкова точка сторони
  const iPrev = (iA - 1 + n) % n;
  const iNext = (iB + 1) % n;
  const newA = lineIntersection(world[iPrev], world[iA], wall.a, wall.b);
  const newB = lineIntersection(world[iB], world[iNext], wall.a, wall.b);
  if (!newA || !newB) return null;
  const next = world.slice();
  next[iA] = newA;
  next[iB] = newB;
  return next;
}

/** Світовий контур → customPoints деталі, зберігаючи id сторін і bulge. */
export function worldToCustomPoints(local: Point[], world: MPoint[], toLocalFn: (p: MPoint) => Point): Point[] {
  return world.map((w, i) => {
    const l = toLocalFn(w);
    const src = local[i];
    return { ...src, x: round1(l.x), y: round1(l.y) };
  });
}

function round1(v: number) { return Math.round(v * 10) / 10; }
