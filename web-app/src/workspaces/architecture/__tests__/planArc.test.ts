/**
 * Дуга по трьох точках у обведенні плану (№131). Модель лишається
 * полігоном — дуга це порізана на хорди ділянка контуру.
 */
import { describe, expect, it } from 'vitest';
import { arcThrough } from '../plan/arc';

describe('arcThrough — дуга по трьох точках', () => {
  it('півколо R1800: усі вершини на колі, стрілка прогину ≤ 3 мм', () => {
    const a = { x: -1800, y: 0 }, mid = { x: 0, y: 1800 }, b = { x: 1800, y: 0 };
    const pts = arcThrough(a, mid, b);
    expect(pts.length).toBeGreaterThan(20);
    for (const p of pts) expect(Math.abs(Math.hypot(p.x, p.y) - 1800)).toBeLessThan(2);
    expect(pts[pts.length - 1]).toEqual({ x: 1800, y: 0 });
    const chord = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    expect(1800 - Math.sqrt(1800 ** 2 - (chord / 2) ** 2)).toBeLessThanOrEqual(3.2);
  });

  it('арка як у плані власника: 3605 завширшки, підйом 900 — проходить через середину', () => {
    const a = { x: 0, y: 0 }, mid = { x: 1802, y: 900 }, b = { x: 3605, y: 0 };
    const pts = arcThrough(a, mid, b);
    const near = pts.reduce((best, p) => (Math.abs(p.x - 1802) < Math.abs(best.x - 1802) ? p : best), pts[0]);
    expect(Math.abs(near.y - 900)).toBeLessThan(6);
  });

  it('три точки на прямій — це відрізок, а не коло', () => {
    expect(arcThrough({ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 1000, y: 0 })).toEqual([{ x: 1000, y: 0 }]);
  });

  it('дуга йде в той бік, де лежить середня точка', () => {
    const up = arcThrough({ x: -100, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 0 });
    const down = arcThrough({ x: -100, y: 0 }, { x: 0, y: -100 }, { x: 100, y: 0 });
    expect(up.some((p) => p.y > 50)).toBe(true);
    expect(down.some((p) => p.y < -50)).toBe(true);
  });
});
