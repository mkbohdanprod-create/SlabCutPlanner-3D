import { describe, expect, it } from 'vitest';
import { logicalSegmentForSide, edgeMarkersForPart } from '../edgeProfiles';
import type { DetailPart } from '../../domain/types';
import { explodeDetails } from '../../engines/geometry';
import { edgeLengthForSide } from '../../engines/geometryUtils';

/**
 * FG-28: позначки обробки кромки на карті крою мають ЇХАТИ РАЗОМ із деталлю
 * при повороті. Раніше для прямокутних деталей сторони були прибиті до
 * габаритного прямокутника (A завжди зліва, B завжди зверху), тому при
 * повороті 90/180/270 позначка лишалась на місці бокса, а деталь
 * повертилась — цех отримував фрезерування не на тому ребрі.
 *
 * КОНВЕНЦІЯ (єдина, domain/sideNaming; ребро = points[i] → points[i+1]):
 *   A = 0→1 (верх при 0°), B = 1→2 (право), C = 2→3 (низ), D = 3→0 (ліво).
 * Саме так називає сторони 2D-креслення (Detail2DBlueprint: i===0 → 'A').
 * Поворот 90° за годинниковою: (x, y) → (height − y, x).
 *
 * Хвиля 3, крок 3.2: раніше цей файл фіксував ДРУГУ угоду (A=ліво), яка
 * розходилась із кресленням і з рушієм на одне ребро. Очікування оновлені
 * разом із кодом — тепер угода одна.
 */

const rect: DetailPart = {
  id: 'p1',
  isMain: true,
  shape: 'Прямокутна',
  width: 700,
  height: 450,
  points: [
    { x: 0, y: 0 },
    { x: 700, y: 0 },
    { x: 700, y: 450 },
    { x: 0, y: 450 },
  ],
} as unknown as DetailPart;

function edge(seg: { start: { x: number; y: number }; end: { x: number; y: number } }) {
  const { start, end } = seg;
  if (start.x === end.x) return start.x === 0 ? 'left-ish' : 'x=' + start.x;
  if (start.y === end.y) return start.y === 0 ? 'y=0' : 'y=' + start.y;
  return 'diagonal';
}

describe('logicalSegmentForSide: сторони прямокутника їдуть разом із поворотом', () => {
  it('0°: базова конвенція — A верх, B право, C низ, D ліво', () => {
    expect(edge(logicalSegmentForSide(rect, 'A', 0)!)).toBe('y=0');
    expect(edge(logicalSegmentForSide(rect, 'C', 0)!)).toBe('y=450');
    expect(edge(logicalSegmentForSide(rect, 'D', 0)!)).toBe('left-ish');
    expect(edge(logicalSegmentForSide(rect, 'B', 0)!)).toBe('x=700');
  });

  it('90°: A стає правою стороною (x = 450), D — верхньою', () => {
    // Фізика: points[0](0,0)→(450,0); points[1](700,0)→(450,700) ⇒ B = права.
    const b = logicalSegmentForSide(rect, 'A', 90)!;
    expect(edge(b)).toBe('x=450');
    const a = logicalSegmentForSide(rect, 'D', 90)!;
    expect(edge(a)).toBe('y=0');
  });

  it('180°: A стає нижньою (y = 450), C — верхньою', () => {
    expect(edge(logicalSegmentForSide(rect, 'A', 180)!)).toBe('y=450');
    expect(edge(logicalSegmentForSide(rect, 'C', 180)!)).toBe('y=0');
  });

  it('270°: A стає лівою, B — верхньою', () => {
    expect(edge(logicalSegmentForSide(rect, 'A', 270)!)).toBe('left-ish');
    expect(edge(logicalSegmentForSide(rect, 'B', 270)!)).toBe('y=0');
  });

  it('узгодженість: бокс-гілка збігається з обходом по точках для всіх сторін і поворотів', () => {
    // Той самий прямокутник, але БЕЗ мітки форми — піде через byPointCount,
    // який завжди був правильним під поворотом. Обидві гілки мають давати
    // одне й те саме ребро.
    const generic = { ...rect, shape: 'custom' } as unknown as DetailPart;
    for (const rotation of [0, 90, 180, 270]) {
      for (const side of ['D', 'A', 'B', 'C']) {
        const viaBox = logicalSegmentForSide(rect, side, rotation)!;
        const viaPoints = logicalSegmentForSide(generic, side, rotation)!;
        expect(edge(viaBox), `side ${side} @ ${rotation}°`).toBe(edge(viaPoints));
      }
    }
  });
});

describe('edgeMarkersForPart: позначка профілю слідує за деталлю', () => {
  it('профіль на A при 90° малюється на правому ребрі, не на верхньому', () => {
    const markers = edgeMarkersForPart(rect, { A: 'polished_straight' }, 90, 16);
    expect(markers).toHaveLength(1);
    const m = markers[0];
    // Все ребро вертикальне (з відступом усередину від x=450): усі x рівні
    // між собою і менші за 450; жодна точка не «верхня горизонталь».
    const xs = (m.points ?? [m.start, m.end]).map((p) => p.x);
    const ys = (m.points ?? [m.start, m.end]).map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(100);
  });
});

/**
 * ХВИЛЯ 3 · крок 3.2 — гроші за обробку торця.
 *
 * У коді жили ЧОТИРИ місця з іменами сторін, і два з них (позначки на
 * карті крою та `edgeLengthForSide`, з якої рушій фактів бере метри)
 * вважали стороною A не те ребро. На стільниці 2000×600 менеджер продавав
 * обробку сторони A — 2 метри, — а в цех і в кошторис ішло 0.6 м.
 *
 * Тест прибиває саме цифру: сторона A довгої стільниці — це довге ребро.
 */
describe('сторона A — це та сама сторона, що на кресленні', () => {
  const zeroAllowances = {
    detailLength: 0, detailWidth: 0, elementLength: 0, elementWidth: 0,
    interPartSpacing: 0, detailSmallCutout: 0, detailLargeCutout: 0,
    elementSmallCutout: 0, elementLargeCutout: 0, show: false, applyToImports: false,
  } as never;

  const longTop = () => {
    const detail = {
      id: 'ct', type: 'Стільниця', shape: 'Прямокутна', quantity: 1, thickness: 20,
      label: 'Стільниця', geometry: { width: 2000, height: 600 },
      edgeProfiles: { A: 'polished_straight' },
    } as never;
    return explodeDetails([detail], zeroAllowances).find((part) => part.isMain)!;
  };

  it('довжина сторони A — 2000 мм, а не 600', () => {
    expect(edgeLengthForSide(longTop(), 'A')).toBeCloseTo(2000, 0);
    expect(edgeLengthForSide(longTop(), 'B')).toBeCloseTo(600, 0);
  });

  it('позначка обробки лягає на довге ребро', () => {
    const marker = edgeMarkersForPart(longTop(), { A: 'polished_straight' } as never, 0)[0];
    expect(marker).toBeDefined();
    const length = Math.hypot(marker.end.x - marker.start.x, marker.end.y - marker.start.y);
    // Повна довжина мінус відступи по 16 мм з кожного боку.
    expect(length).toBeGreaterThan(1900);
  });

  it('після повороту на 90° сторона A лишається довгою', () => {
    const marker = edgeMarkersForPart(longTop(), { A: 'polished_straight' } as never, 90)[0];
    const length = Math.hypot(marker.end.x - marker.start.x, marker.end.y - marker.start.y);
    expect(length).toBeGreaterThan(1900);
  });
});

/**
 * ПІДПИС УСЕРЕДИНІ ДЕТАЛІ (28.08, задача власника). Раніше кожен
 * споживач зсував текст «на кілька пікселів угору»: на верхньому ребрі
 * це виносило підпис за контур. Тепер напрямок дає геометрія.
 */
describe('labelInward: підпис завжди в тілі деталі', () => {
  const rect = {
    id: 'p', detailId: 'd', name: 'Тест', isMain: true,
    width: 1200, height: 600,
    points: [ { x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 600 }, { x: 0, y: 600 } ],
    dimsLabel: '1200×600',
  } as never;

  it.each([
    ['A', { x: 0, y: 1 }],
    ['B', { x: -1, y: 0 }],
    ['C', { x: 0, y: -1 }],
    ['D', { x: 1, y: 0 }],
  ])('сторона %s дивиться всередину', (side, expected) => {
    const marker = edgeMarkersForPart(rect, { [side]: 'polished_straight' } as never, 0)[0];
    expect(marker).toBeDefined();
    expect(marker.labelInward.x).toBeCloseTo((expected as { x: number }).x, 5);
    expect(marker.labelInward.y).toBeCloseTo((expected as { y: number }).y, 5);
  });

  it('зміщена точка підпису лежить у прямокутнику деталі', () => {
    for (const side of ['A', 'B', 'C', 'D']) {
      const marker = edgeMarkersForPart(rect, { [side]: 'polished_straight' } as never, 0)[0];
      const x = marker.labelPoint.x + marker.labelInward.x * 26;
      const y = marker.labelPoint.y + marker.labelInward.y * 26;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1200);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(600);
    }
  });
});
