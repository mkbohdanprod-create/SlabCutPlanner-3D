// =====================================================================
//  Сторожі за скаргами фокус-групи 03.09.2026.
//
//  Три речі, які ламались тихо і по-різному в різних місцях застосунку:
//    1. дзеркало Г-подібної не доїжджало з редактора в розкрій;
//    2. увігнутий кут лівої Г вважався тим самим, що в правої;
//    3. підпис кромки лягав на лінію різу, бо сторону, якої на шматку
//       немає, рендерер відновлював «за порядковим номером ребра».
//
//  Усе це не помилки обчислення — це втрачені або підмінені ІМЕНА. Тому
//  тести перевіряють саме імена й наявність, а не числа.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { buildGeometry } from '../elementToDetail';
import { edgeNamedContour } from '../baseContour';
import { reflexCornerIds } from '../joints';
import { sideVertexIndices } from '../../engines/geometryUtils';
import type { DetailPart } from '../types';

const lDraft = (mirrorL: boolean) => ({
  kind: 'l',
  mirrorL,
  outerWidth: 2000,
  outerHeight: 1200,
  innerHorizontal: 900,
  innerVertical: 500,
  width: 2000,
  quantity: 1,
  thickness: 20,
  type: 'Стільниця',
} as never);

describe('дзеркало Г-подібної доїжджає до розкрою', () => {
  it('mirrorL: true → cornerOrientation BL', () => {
    expect(buildGeometry(lDraft(true)).cornerOrientation).toBe('BL');
  });

  it('mirrorL: false → cornerOrientation BR', () => {
    expect(buildGeometry(lDraft(false)).cornerOrientation).toBe('BR');
  });

  it('не Г-подібна орієнтації не отримує', () => {
    const rect = { kind: 'rect', width: 1000, height: 600, quantity: 1, thickness: 20, type: 'Стільниця' } as never;
    expect(buildGeometry(rect).cornerOrientation).toBeUndefined();
  });

  it('базовий контур лівої Г — дзеркальний до правої, а не той самий', () => {
    const right = edgeNamedContour({ kind: 'l', outerWidth: 2000, outerHeight: 1200, innerHorizontal: 900, innerVertical: 500 })!;
    const left = edgeNamedContour({ kind: 'l', outerWidth: 2000, outerHeight: 1200, innerHorizontal: 900, innerVertical: 500, mirrorL: true })!;
    // Імена сторін ті самі — інакше доповнення (leg_A, wall_panel_F) не
    // знайшли б свого ребра; відрізнятись мають координати.
    expect(left.map((p) => p.id)).toEqual(right.map((p) => p.id));
    // Вершина B: у правої вона на y = height − innerVertical (700),
    // у лівої — на повній висоті (1200). Це і є дзеркало.
    expect(right.find((p) => p.id === 'B')!.y).toBe(700);
    expect(left.find((p) => p.id === 'B')!.y).toBe(1200);
  });
});

describe('увігнутий кут залежить від дзеркала', () => {
  it('права Г — C, ліва Г — D', () => {
    expect(reflexCornerIds('Г-подібна')).toEqual(['C']);
    expect(reflexCornerIds('Г-подібна', true)).toEqual(['D']);
  });

  it('П-подібна від дзеркала не залежить', () => {
    expect(reflexCornerIds('П-подібна')).toEqual(['D', 'E']);
    expect(reflexCornerIds('П-подібна', true)).toEqual(['D', 'E']);
  });
});

describe('кромка не лягає на лінію різу', () => {
  // Шматок 1000×600 після різу: з оригіналу на ньому вціліли сторони A і D,
  // B і C — це лінії стику, імен вони не мають.
  const piece = {
    id: 'p1',
    points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }],
    sideSegments: {
      A: { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } },
      D: { start: { x: 0, y: 600 }, end: { x: 0, y: 0 } },
    },
  } as unknown as DetailPart;

  it('сторона, що вціліла, знаходиться', () => {
    expect(sideVertexIndices(piece, 'A')).toEqual({ startIdx: 0, endIdx: 1 });
  });

  it('сторони, зрізаної стиком, НЕ вигадуємо', () => {
    // Саме тут раніше спрацьовував позиційний фолбек і повертав ребро 1
    // (праве) — тобто підпис кромки ставав рівно на лінію різу.
    expect(sideVertexIndices(piece, 'B')).toBeUndefined();
    expect(sideVertexIndices(piece, 'C')).toBeUndefined();
  });

  it('сторони Г-подібної, якої немає в таблиці чотирикутника, теж немає', () => {
    expect(sideVertexIndices(piece, 'F')).toBeUndefined();
  });

  it('ціла проста деталь без мапи сторін працює як раніше', () => {
    const whole = {
      id: 'p2',
      points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }],
    } as unknown as DetailPart;
    expect(sideVertexIndices(whole, 'A')).toEqual({ startIdx: 0, endIdx: 1 });
    expect(sideVertexIndices(whole, 'B')).toEqual({ startIdx: 1, endIdx: 2 });
  });
});
