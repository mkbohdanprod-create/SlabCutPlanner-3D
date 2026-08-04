import { describe, it, expect } from 'vitest';
import { getDetailPointsAndBounds, buildDetailShape } from '../shapeBuilder';


// Регресія на реальний баг: на Г-подібній стільниці нога і стінова панель
// були в дереві навігації, але у 3D не з'являлись зовсім.
//
// Причина була не в рендері, а в іменах: доповнення зберігаються під
// ключами `leg_A`, `wall_panel_F` — тобто по буквах сторін, — а генератор
// точок Г-подібної повертав стару нотацію `AB / inner / inner_corner /
// CD / DA`. Пошук ребра не знаходив нічого і мовчки повертав null.

const edgeIds = (detail: any) => {
  const { points, bounds } = getDetailPointsAndBounds(detail);
  const { edgeMap } = buildDetailShape(detail, points, bounds);
  return Object.values(edgeMap);
};

describe('Г-подібна деталь', () => {
  const lShape = {
    kind: 'l',
    outerWidth: 1200,
    outerHeight: 1200,
    innerHorizontal: 600,
    innerVertical: 600,
    thickness: 20,
  } as unknown as any;

  it('сторони названі буквами, а не старою нотацією', () => {
    const ids = edgeIds(lShape);
    expect(ids).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('старі імена зникли — саме вони ламали пошук ребра', () => {
    const ids = edgeIds(lShape);
    ['AB', 'inner', 'inner_corner', 'CD', 'DA'].forEach((legacy) => {
      expect(ids, `лишилось старе ім'я ${legacy}`).not.toContain(legacy);
    });
  });

  it('сторони A і F, на яких висять нога і стінова панель, існують', () => {
    const ids = edgeIds(lShape);
    expect(ids).toContain('A');
    expect(ids).toContain('F');
  });

  it('точок шість, як і сторін', () => {
    const { points } = getDetailPointsAndBounds(lShape);
    expect(points).toHaveLength(6);
    expect(points[0].id).toBe('start');
    expect(points[0].closeId).toBe('F');
  });

  it('габарити рахуються з зовнішніх розмірів', () => {
    const { bounds } = getDetailPointsAndBounds(lShape);
    expect(bounds.maxX - bounds.minX).toBe(1200);
    expect(bounds.maxY - bounds.minY).toBe(1200);
  });

  it('радіус в увігнутому куті не з’їдає імена сусідніх сторін', () => {
    const withRadius = {
      ...lShape,
      corners: { C: { type: 'radius', radius: 100 } },
    } as unknown as any;
    const ids = edgeIds(withRadius);
    expect(ids).toContain('A');
    expect(ids).toContain('F');
    expect(ids.some((id) => id.includes('radius'))).toBe(true);
  });
});

describe('прямокутна і П-подібна не зачеплені', () => {
  it('прямокутна лишається A B C D', () => {
    const rect = { kind: 'rect', width: 1000, height: 600, thickness: 20 } as unknown as any;
    expect(edgeIds(rect)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('П-подібна лишається з буквами', () => {
    const uShape = {
      kind: 'u',
      width: 2400,
      height: 1200,
      innerCutWidth: 1200,
      innerCutDepth: 600,
      innerCutOffset: 600,
      thickness: 20,
    } as unknown as any;
    const ids = edgeIds(uShape);
    expect(ids.every((id) => /^[A-H](_|$)/.test(id)), `нелітерні id: ${ids.join(',')}`).toBe(true);
    expect(ids).toContain('A');
  });
});
