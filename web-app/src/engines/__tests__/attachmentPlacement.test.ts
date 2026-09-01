import { describe, it, expect } from 'vitest';
import { attachmentPlacement } from '../transform3d';

// Розміщення доповнення на ребрі батька. Раніше доповнення вміло лише
// «на всю сторону, на самому ребрі», і формули жили двома копіями —
// в редакторі виробу і в Підборі. Тут тримаємо контракт спільної
// математики: зсув уздовж ребра і зсув углиб деталі.

const BOUNDS = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
// Контур прямокутника у нормалізованих координатах (shapeBuilder):
// A: (0,0)→(1,0) · B: (1,0)→(1,1) · C: (1,1)→(0,1) · D: (0,1)→(0,0)
const A = { v1: { x: 0, y: 0 }, v2: { x: 1, y: 0 } };
const B = { v1: { x: 1, y: 0 }, v2: { x: 1, y: 1 } };
const C = { v1: { x: 1, y: 1 }, v2: { x: 0, y: 1 } };
const D = { v1: { x: 0, y: 1 }, v2: { x: 0, y: 0 } };

describe('attachmentPlacement', () => {
  it('без зсувів поводиться як раніше: доповнення по центру ребра', () => {
    const p = attachmentPlacement(A.v1, A.v2, BOUNDS, undefined, 0, 0);
    expect(p.posX).toBeCloseTo(0, 9);
    expect(p.insetZ).toBe(0);
    expect(p.edgeLength).toBeCloseTo(1, 9); // 1000 мм × 0.001
  });

  it('вужче доповнення без зсуву притиснуте до початку ребра', () => {
    const p = attachmentPlacement(A.v1, A.v2, BOUNDS, 400, 0, 0);
    // лівий край ділянки = початок ребра
    expect(p.posX - p.attachWidth / 2).toBeCloseTo(-p.edgeLength / 2, 9);
  });

  it('зсув уздовж ребра рухає доповнення на задану відстань', () => {
    const base = attachmentPlacement(A.v1, A.v2, BOUNDS, 400, 0, 0);
    const moved = attachmentPlacement(A.v1, A.v2, BOUNDS, 400, 300, 0);
    expect(moved.posX - base.posX).toBeCloseTo(0.3, 9); // 300 мм
  });

  it('центрування: однаковий відступ з обох боків ребра', () => {
    const p = attachmentPlacement(A.v1, A.v2, BOUNDS, 400, 300, 0);
    expect(p.posX).toBeCloseTo(0, 9); // (1000−400)/2 = 300 → рівно по центру
  });

  it('зсув углиб іде ДО ЦЕНТРУ деталі з кожного з чотирьох ребер', () => {
    // Знак «углиб» рахується з геометрії, а не з припущення про обхід:
    // на всіх зовнішніх ребрах прямокутника він мусить бути однаковий.
    [A, B, C, D].forEach((edge, i) => {
      const p = attachmentPlacement(edge.v1, edge.v2, BOUNDS, 100, 0, 50);
      expect(p.inward, `ребро ${i}`).toBe(1);
      expect(p.insetZ).toBeCloseTo(0.05, 9);
    });
  });

  it('на увігнутому ребрі «углиб» перевертається — саме для цього рахуємо знак', () => {
    // Ребро, що дивиться назовні від центру (обхід локально вивернутий):
    // v1→v2 у зворотному напрямку відносно зовнішнього ребра A.
    const reversedA = attachmentPlacement({ x: 1, y: 0 }, { x: 0, y: 0 }, BOUNDS, 100, 0, 50);
    expect(reversedA.inward).toBe(-1);
    expect(reversedA.insetZ).toBeCloseTo(-0.05, 9);
  });

  it('нульова довжина ребра не дає NaN', () => {
    const p = attachmentPlacement({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, BOUNDS, 100, 0, 50);
    expect(Number.isFinite(p.posX)).toBe(true);
    expect(Number.isFinite(p.insetZ)).toBe(true);
  });
});
