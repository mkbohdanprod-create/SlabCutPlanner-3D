/**
 * ГЕОМЕТРІЯ КОНСТРУКТОРА — 04.09.2026.
 *
 * Тонкий шар над ядром: бере контур деталі з тієї самої функції, що й
 * розкрій (`contourForDetail`), і кладе його в координати заміру через
 * зсув/поворот виробу. Другої математики деталі тут немає.
 *
 * Координати: у заміру Y вгору (DXF), у деталі Y вниз (екран). Тому при
 * накладанні перевертаємо Y деталі: точка (x, y) → (x, −y).
 */
import type { Detail, Point, Product, Project } from '../domain/types';
import { contourWithSidesForDetail } from '../engines/geometry';
import { flattenProductToDetails } from '../store/projectHelpers';
import type { Placement } from './store';
import type { MPoint } from './measure/leicaDxf';

export interface ProductOutline {
  productId: string;
  productName: string;
  detail: Detail;
  /** Контур деталі у власних координатах (Y вниз). */
  local: Point[];
  /** Ім'я сторони для ребра i→i+1 (A, B, C… за угодою деталі). */
  sideNames: string[];
  /** Контур у координатах заміру (Y вгору) після зсуву/повороту. */
  world: MPoint[];
}

/** Головні деталі кожного виробу (стільниці, стінові панелі) з контурами. */
export function productOutlines(project: Project, placements: Record<string, Placement>): ProductOutline[] {
  const out: ProductOutline[] = [];
  for (const product of project.products ?? []) {
    const details = flattenProductToDetails(product);
    const placement = placements[product.id] ?? { dx: 0, dy: 0, rotDeg: 0 };
    for (const detail of details) {
      if (detail.type === 'Потовщення' || detail.type === 'Підворот' || detail.type === 'Опора') continue;
      if (detail.parentDetailId) continue;
      const built = contourWithSidesForDetail(detail);
      const local = built?.points;
      if (!local || local.length < 3) continue;
      out.push({
        productId: product.id,
        productName: product.name,
        detail,
        local,
        sideNames: sideNamesOf(local, built?.sideSegments),
        world: toWorld(local, placement),
      });
    }
  }
  return out;
}

/**
 * Ім'я сторони для кожного ребра контуру — звіркою кінців ребра з
 * `sideSegments` рушія (допуск 0,5 мм). Ребро без збігу (зріз кута,
 * фаска) лишається без імені.
 */
export function sideNamesOf(points: Point[], sideSegments?: Record<string, { start: Point; end: Point }>): string[] {
  const n = points.length;
  const close = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
  return points.map((p, i) => {
    const q = points[(i + 1) % n];
    if (sideSegments) {
      for (const [name, seg] of Object.entries(sideSegments)) {
        if ((close(seg.start, p) && close(seg.end, q)) || (close(seg.start, q) && close(seg.end, p))) return name;
      }
    }
    // customPoints: id точки = ім'я ребра, що в ній закінчується
    return (q as { id?: string }).id ?? '';
  });
}

export function toWorld(local: Point[], p: Placement): MPoint[] {
  const rad = (p.rotDeg * Math.PI) / 180;
  const c = Math.cos(rad); const s = Math.sin(rad);
  return local.map((pt) => {
    const x = pt.x; const y = -pt.y;
    return { x: x * c - y * s + p.dx, y: x * s + y * c + p.dy };
  });
}

export function toLocal(world: MPoint, p: Placement): Point {
  const rad = (-p.rotDeg * Math.PI) / 180;
  const c = Math.cos(rad); const s = Math.sin(rad);
  const x = world.x - p.dx; const y = world.y - p.dy;
  return { x: x * c - y * s, y: -(x * s + y * c) };
}

/** Сторони контуру: ребро від точки i до i+1, ім'я — id кінцевої точки (угода customPoints). */
export interface OutlineSide {
  name: string;
  a: MPoint;
  b: MPoint;
  index: number; // індекс кінцевої точки
  lengthMm: number;
}

export function sidesOf(world: MPoint[], sideNames: string[]): OutlineSide[] {
  const n = world.length;
  return world.map((a, i) => {
    const j = (i + 1) % n;
    const b = world[j];
    return { name: sideNames[i] || String(j), a, b, index: j, lengthMm: Math.hypot(b.x - a.x, b.y - a.y) };
  });
}

export function bboxOfPoints(pts: MPoint[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/**
 * Точки контуру головної деталі виробу після заміни — назад у продукт.
 * Угода customPoints: id точки = ім'я ребра, що в ній ЗАКІНЧУЄТЬСЯ, тому
 * імена сторін (ребро i→i+1) записуємо в точку i+1; замикаюче ребро — у
 * `closeId` першої точки.
 */
export function withCustomPoints(product: Product, detailId: string, points: Point[], sideNames?: string[]): Product {
  if (sideNames) {
    const n = points.length;
    points = points.map((p, i) => {
      const prev = (i - 1 + n) % n;
      const id = sideNames[prev] || (p as { id?: string }).id;
      return i === 0 ? { ...p, id, closeId: sideNames[n - 1] || undefined } as Point : { ...p, id } as Point;
    });
  }
  // id деталі = `${element.id}/detail:main` (domain/ids.buildDetailPath)
  const elements = product.elements.map((el) => {
    if (detailId !== `${el.id}/detail:main`) return el;
    return { ...el, baseDefinition: { ...el.baseDefinition, customPoints: points } };
  });
  return { ...product, elements };
}

/** Найкоротша відстань від точки до відрізка та проєкція. */
export function distanceToSegment(p: MPoint, a: MPoint, b: MPoint): { d: number; t: number; foot: MPoint } {
  const vx = b.x - a.x; const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  const foot = { x: a.x + t * vx, y: a.y + t * vy };
  return { d: Math.hypot(p.x - foot.x, p.y - foot.y), t, foot };
}

/** Перетин двох нескінченних прямих (a1→a2) і (b1→b2). */
export function lineIntersection(a1: MPoint, a2: MPoint, b1: MPoint, b2: MPoint): MPoint | null {
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / d;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}
