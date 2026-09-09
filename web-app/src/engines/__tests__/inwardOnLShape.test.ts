import { describe, it, expect } from 'vitest';
import { attachmentPlacement, outlineFromCurves } from '../transform3d';

/**
 * Б-169 — «ВГЛИБ» НА Г-ПОДІБНІЙ ДЕТАЛІ.
 *
 * Власник 09.09, скрін панелі зі зсувом: «зміщення відбулось не вглиб
 * стільниці». Напрямок брався як вектор до центру ГАБАРИТУ — а в Г-подібної
 * деталі центр габариту лежить у виїмці, поза каменем. На стороні C він
 * вказував назовні, і панель зі зсувом їхала не в той бік.
 *
 * Стало: напрямок береться по самому контуру — з якого боку ребра камінь.
 */

const W = 2000, H = 1600, IW = 1200, IH = 1000;
const bounds = { minX: 0, minY: 0, maxX: W, maxY: H };

/** Г-подібний контур у нормалізованих координатах, сторони A…F. */
const pts = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: (H - IH) / H },
  { x: IW / W, y: (H - IH) / H },
  { x: IW / W, y: 1 },
  { x: 0, y: 1 },
];
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Точка на волосину від середини ребра вздовж нормалі — чи вона в контурі? */
function stoneIsAtPlusNormal(i: number) {
  const v1 = pts[i], v2 = pts[(i + 1) % pts.length];
  const mx = (v1.x + v2.x) / 2, my = (v1.y + v2.y) / 2;
  const dx = v2.x - v1.x, dy = v2.y - v1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const step = 0.01;
  let inside = false;
  const test = (px: number, py: number) => {
    let r = false;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a, a += 1) {
      const xi = pts[a].x, yi = pts[a].y, xj = pts[b].x, yj = pts[b].y;
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-12) + xi) r = !r;
    }
    return r;
  };
  inside = test(mx + nx * step, my + ny * step);
  return inside ? 1 : -1;
}

const curves = pts.map((p, i) => {
  const q = pts[(i + 1) % pts.length];
  return { type: 'LineCurve', getPoint: (t: number) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }) };
});

describe('Б-169 · напрямок «вглиб» на Г-подібній деталі', () => {
  it('із контуром збігається з правдою на всіх шести сторонах', () => {
    const outline = outlineFromCurves(curves as never);
    expect(outline).toBeTruthy();
    for (let i = 0; i < pts.length; i += 1) {
      const { inward } = attachmentPlacement(
        pts[i] as never, pts[(i + 1) % pts.length] as never, bounds, undefined, 0, 100, outline,
      );
      expect(`${NAMES[i]}:${inward}`).toBe(`${NAMES[i]}:${stoneIsAtPlusNormal(i)}`);
    }
  });

  it('без контуру стара формула помиляється саме на стороні C — це і був баг', () => {
    const { inward } = attachmentPlacement(pts[2] as never, pts[3] as never, bounds, undefined, 0, 100);
    expect(inward).toBe(-1);              // старий шлях
    expect(stoneIsAtPlusNormal(2)).toBe(1); // а камінь з іншого боку
  });

  it('на звичайному прямокутнику контур нічого не міняє', () => {
    const rect = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const rc = rect.map((p, i) => {
      const q = rect[(i + 1) % rect.length];
      return { type: 'LineCurve', getPoint: (t: number) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }) };
    });
    const outline = outlineFromCurves(rc as never);
    const b = { minX: 0, minY: 0, maxX: 2000, maxY: 600 };
    for (let i = 0; i < rect.length; i += 1) {
      const withOutline = attachmentPlacement(rect[i] as never, rect[(i + 1) % rect.length] as never, b, undefined, 0, 100, outline).inward;
      const without = attachmentPlacement(rect[i] as never, rect[(i + 1) % rect.length] as never, b, undefined, 0, 100).inward;
      expect(withOutline).toBe(without);
    }
  });
});
