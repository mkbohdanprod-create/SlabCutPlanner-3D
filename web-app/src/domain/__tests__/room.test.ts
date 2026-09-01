import { describe, expect, it } from 'vitest';
import {
  emptyRoom, rectPoints, signedArea, offsetPolygon, wallsFromContour, snapPoint,
  pointAtLength, pushPull, solidsOverlap, pointInPolygon, addSolid, removeSolid, updateSolid,
  worldFromLocal, localFromWorld, axisFromNormal, wallOnEdge, nearestContourEdge, kindAfterPull,
  moveContourEdge, solidAabb,
} from '../room';

const rect = rectPoints({ x: 0, y: 0 }, { x: 4000, y: 3000 });

describe('приміщення: контур і стіни', () => {
  it('прямокутник за двома кутами — 4 точки, площа додатна (за годинниковою на екрані)', () => {
    expect(rect.length).toBe(4);
    expect(signedArea(rect)).toBeGreaterThan(0);
    expect(signedArea(rect)).toBe(4000 * 3000);
  });

  it('зміщення назовні збільшує габарит рівно на товщину з кожного боку', () => {
    const outer = offsetPolygon(rect, 150);
    const xs = outer.map((p) => p.x); const ys = outer.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(-150, 6);
    expect(Math.max(...xs)).toBeCloseTo(4150, 6);
    expect(Math.min(...ys)).toBeCloseTo(-150, 6);
    expect(Math.max(...ys)).toBeCloseTo(3150, 6);
    // і навпаки для зворотного обходу — «назовні» не залежить від напрямку
    const outer2 = offsetPolygon([...rect].reverse(), 150);
    expect(Math.max(...outer2.map((p) => p.x))).toBeCloseTo(4150, 6);
  });

  it('стіни з контуру: 4 стіни назовні + підлога всередині, кімната в світлі лишається 4000×3000', () => {
    const solids = wallsFromContour(rect, 150, 2700);
    const walls = solids.filter((s) => s.role === 'wall');
    const floor = solids.find((s) => s.role === 'floor');
    expect(walls.length).toBe(4);
    expect(floor).toBeDefined();
    for (const w of walls) {
      expect(w.kind).toBe('add');
      expect(w.heightMm).toBe(2700);
      expect(w.points.length).toBe(4);
      // жодна точка стіни не всередині кімнати
      for (const p of w.points) {
        const strictlyInside = p.x > 0 && p.x < 4000 && p.y > 0 && p.y < 3000;
        expect(strictlyInside).toBe(false);
      }
    }
    expect(floor!.points).toEqual(rect);
    expect(floor!.baseMm).toBeLessThan(0);
  });
});

describe('приміщення: прив\'язки і ввід', () => {
  it('сітка 10 мм за замовчуванням', () => {
    expect(snapPoint({ x: 1234, y: 567 }).point).toEqual({ x: 1230, y: 570 });
  });

  it('якір сильніший за сітку в межах радіуса', () => {
    const r = snapPoint({ x: 1010, y: 1030 }, { anchors: [{ x: 1000, y: 1000 }] });
    expect(r.kind).toBe('anchor');
    expect(r.point).toEqual({ x: 1000, y: 1000 });
    expect(snapPoint({ x: 1300, y: 1000 }, { anchors: [{ x: 1000, y: 1000 }] }).kind).toBe('grid');
  });

  it('ортогональ тримає вісь від попередньої точки', () => {
    const r = snapPoint({ x: 2003, y: 48 }, { orthoFrom: { x: 0, y: 0 } });
    expect(r.kind).toBe('ortho');
    expect(r.point).toEqual({ x: 2000, y: 0 });
  });

  it('довжина з клавіатури: 3200 уздовж напрямку', () => {
    const p = pointAtLength({ x: 0, y: 0 }, { x: 10, y: 0 }, 3200);
    expect(p).toEqual({ x: 3200, y: 0 });
  });
});

describe('приміщення: push/pull і модель', () => {
  const face = { id: 'a', kind: 'add' as const, points: rect, baseMm: 0, heightMm: 0 };

  it('витягнути вгору — росте висота; вдавити нижче низу — низ опускається', () => {
    expect(pushPull(face, 900).heightMm).toBe(900);
    const pushed = pushPull({ ...face, heightMm: 300 }, -500);
    expect(pushed.baseMm).toBe(-200);
    expect(pushed.heightMm).toBe(200);
  });

  it('перетин тіл — і в плані, і по висоті', () => {
    const wall = { id: 'w', kind: 'add' as const, points: rectPoints({ x: 0, y: -150 }, { x: 4000, y: 0 }), baseMm: 0, heightMm: 2700 };
    const niche = { id: 'n', kind: 'cut' as const, points: rectPoints({ x: 1000, y: -200 }, { x: 1600, y: 50 }), baseMm: 900, heightMm: 600 };
    const high = { ...niche, baseMm: 3000 };
    expect(solidsOverlap(wall, niche)).toBe(true);
    expect(solidsOverlap(wall, high)).toBe(false);
  });

  it('операції не мутують модель', () => {
    const room = emptyRoom();
    const r1 = addSolid(room, face);
    expect(room.solids.length).toBe(0);
    expect(r1.solids.length).toBe(1);
    const r2 = updateSolid(r1, 'a', { color: '#fff' });
    expect(r1.solids[0].color).toBeUndefined();
    expect(r2.solids[0].color).toBe('#fff');
    expect(removeSolid(r2, 'a').solids.length).toBe(0);
  });

  it('точка в контурі', () => {
    expect(pointInPolygon({ x: 100, y: 100 }, rect)).toBe(true);
    expect(pointInPolygon({ x: -1, y: 100 }, rect)).toBe(false);
  });
});

describe('приміщення: осі, грані, push/pull по нормалі', () => {
  it('локальні ↔ світ для трьох осей — взаємно обернені', () => {
    for (const axis of ['up', 'z', 'x'] as const) {
      const w = worldFromLocal(axis, 123, 456, 789);
      const l = localFromWorld(axis, w);
      expect([l.u, l.v, l.along]).toEqual([123, 456, 789]);
    }
    expect(worldFromLocal('up', 1, 2, 3)).toEqual({ x: 1, y: 3, z: 2 });
    expect(worldFromLocal('z', 1, 2, 3)).toEqual({ x: 1, y: 2, z: 3 });
    expect(worldFromLocal('x', 1, 2, 3)).toEqual({ x: 3, y: 2, z: 1 });
  });

  it('вісь за нормаллю грані', () => {
    expect(axisFromNormal({ x: 0, y: 1, z: 0 })).toEqual({ axis: 'up', sign: 1 });
    expect(axisFromNormal({ x: 0, y: 0, z: -1 })).toEqual({ axis: 'z', sign: -1 });
    expect(axisFromNormal({ x: 0.7, y: 0.7, z: 0 })).toBeUndefined();
  });

  it('стіна по ребру росте назовні від підлоги і перекриває кут на товщину', () => {
    const wall = wallOnEdge(rect, 0, 150, 2700)!;
    expect(wall.role).toBe('wall');
    // ребро 0: (0,0)→(4000,0); назовні — у −y; подовжена на 150 з обох кінців
    const ys = wall.points.map((p) => p.y); const xs = wall.points.map((p) => p.x);
    expect(Math.min(...ys)).toBe(-150); expect(Math.max(...ys)).toBe(0);
    expect(Math.min(...xs)).toBe(-150); expect(Math.max(...xs)).toBe(4150);
    expect(nearestContourEdge(rect, { x: 2000, y: 40 }, 250)?.index).toBe(0);
    expect(nearestContourEdge(rect, { x: 2000, y: 1500 }, 250)).toBeUndefined();
  });

  it('грань на стіні: усередину — вибірка, назовні — тіло', () => {
    // Грань-господар дивиться в +Z (кімната у +Z), faceNormal +1
    const face = { id: 'f', kind: 'add' as const, axis: 'z' as const, faceNormal: 1 as const, points: rect, baseMm: 0, heightMm: 0 };
    expect(kindAfterPull(face, -300)).toBe('cut');
    expect(kindAfterPull(face, 300)).toBe('add');
    expect(kindAfterPull(face, 300, true)).toBe('cut');
    const pushed = pushPull(face, -300);
    expect([pushed.baseMm, pushed.heightMm]).toEqual([-300, 300]);
    const pulled = pushPull(face, 300);
    expect([pulled.baseMm, pulled.heightMm]).toEqual([0, 300]);
  });

  it('push/pull за ближній торець зсуває початок; перетягнув — вивернулось', () => {
    const solid = { id: 's', kind: 'add' as const, points: rect, baseMm: 0, heightMm: 900 };
    expect(pushPull(solid, -200, 'base')).toMatchObject({ baseMm: -200, heightMm: 1100 });
    expect(pushPull(solid, 1200, 'base')).toMatchObject({ baseMm: 900, heightMm: 300 });
  });

  it('потягнути бік прямокутного блока — рухається лише те ребро, не вивертаючи контур', () => {
    const moved = moveContourEdge(rect, { u: 1, v: 0 }, 4000, 500);
    expect(moved.filter((p) => p.x === 4500).length).toBe(2);
    expect(moved.filter((p) => p.x === 0).length).toBe(2);
    const squeezed = moveContourEdge(rect, { u: 1, v: 0 }, 4000, -5000);
    expect(Math.max(...squeezed.map((p) => p.x))).toBe(10); // не менше 10 мм від протилежного краю
  });

  it('габарит у світі враховує вісь', () => {
    const onWall = { id: 'w', kind: 'cut' as const, axis: 'z' as const, points: rectPoints({ x: 600, y: 0 }, { x: 1500, y: 2000 }), baseMm: -300, heightMm: 300 };
    const box = solidAabb(onWall);
    expect(box.min).toEqual({ x: 600, y: 0, z: -300 });
    expect(box.max).toEqual({ x: 1500, y: 2000, z: 0 });
  });
});
