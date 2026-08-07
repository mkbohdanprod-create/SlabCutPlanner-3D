import { describe, it, expect } from 'vitest';
import { referenceSideForJoint, jointAxisForSide, type JointSideSegment } from '../joints';

/**
 * Від чого користувач міряє відступ стику.
 *
 * Рушій рахує від опорного КУТА (точки), а менеджер кладе рулетку на КРАЙ
 * плити. Числа однакові, бо кут лежить на тій самій стороні, але в підписі
 * має стояти сторона — інакше «відступ від кута AB» для горизонтального різу
 * читається як діагональ.
 */

// Прямокутник 2000×600: A — верх, B — право, C — низ, D — ліво
const rectSides: JointSideSegment[] = [
  { id: 'A', v1: { x: 0, y: 0 }, v2: { x: 2000, y: 0 } },
  { id: 'B', v1: { x: 2000, y: 0 }, v2: { x: 2000, y: 600 } },
  { id: 'C', v1: { x: 2000, y: 600 }, v2: { x: 0, y: 600 } },
  { id: 'D', v1: { x: 0, y: 600 }, v2: { x: 0, y: 0 } },
];

describe('jointAxisForSide — вісь різу від сторони', () => {
  it('вертикальна сторона дає горизонтальний різ', () => {
    expect(jointAxisForSide(rectSides[1])).toBe('horizontal'); // B
  });

  it('горизонтальна сторона дає вертикальний різ', () => {
    expect(jointAxisForSide(rectSides[0])).toBe('vertical'); // A
  });
});

describe('referenceSideForJoint', () => {
  it('горизонтальний різ з опорою у верхньому куті міряється від сторони A', () => {
    expect(referenceSideForJoint(rectSides, 'horizontal', { x: 2000, y: 0 })).toBe('A');
  });

  it('горизонтальний різ з опорою в нижньому куті міряється від сторони C', () => {
    expect(referenceSideForJoint(rectSides, 'horizontal', { x: 2000, y: 600 })).toBe('C');
  });

  it('вертикальний різ з опорою в лівому куті міряється від сторони D', () => {
    expect(referenceSideForJoint(rectSides, 'vertical', { x: 0, y: 0 })).toBe('D');
  });

  it('вертикальний різ з опорою в правому куті міряється від сторони B', () => {
    expect(referenceSideForJoint(rectSides, 'vertical', { x: 2000, y: 0 })).toBe('B');
  });

  it('без опорної точки нічого не вигадуємо', () => {
    expect(referenceSideForJoint(rectSides, 'horizontal', undefined)).toBeUndefined();
  });

  it('обрана сторона завжди паралельна лінії різу', () => {
    const side = rectSides.find((s) => s.id === referenceSideForJoint(rectSides, 'horizontal', { x: 0, y: 0 }))!;
    // паралельна горизонтальному різу = з неї вийшов би ВЕРТИКАЛЬНИЙ стик
    expect(jointAxisForSide(side)).toBe('vertical');
  });
});
