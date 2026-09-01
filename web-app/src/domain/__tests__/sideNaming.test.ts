/**
 * Хвиля 3, крок 3.1 — фіксація іменування сторін.
 *
 * Тест НЕ виправляє розбіжність двох угод — він її ПРИБИВАЄ. Поки
 * `SEGMENT_SIDE_INDEX` і `CONTOUR_SIDE_INDEX` живуть паралельно, будь-яка
 * зміна однієї без іншої мовчки зсуне позначку обробки на сусіднє ребро:
 * саме так і виникав FG-28. Тут воно впаде голосно.
 *
 * Коли крок 3.2 зведе угоди в одну, впаде розділ «розбіжність» — і це
 * буде правильно: його треба буде переписати на рівність.
 */
import { describe, it, expect } from 'vitest';
import {
  CONTOUR_SIDE_INDEX,
  SEGMENT_SIDE_INDEX,
  cornerSides,
  rotatedBoxEdgeIndex,
  rotationQuarter,
  sideIndexesAgree,
} from '../sideNaming';
import { SIDE_SEGMENT_INDEXES } from '../constants';

describe('джерело імен збігається зі старими місцями', () => {
  it('сегментна угода — точна копія domain/constants', () => {
    expect(SEGMENT_SIDE_INDEX).toEqual(SIDE_SEGMENT_INDEXES);
  });

  it('контурна угода покриває всі три форми', () => {
    expect(Object.keys(CONTOUR_SIDE_INDEX)).toEqual(['4', '6', '8']);
    expect(CONTOUR_SIDE_INDEX[4]).toEqual({ A: 0, B: 1, C: 2, D: 3 });
  });
});

describe('єдина угода — обидві таблиці згодні', () => {
  it('прямокутник: усі чотири сторони дають той самий індекс', () => {
    for (const side of ['A', 'B', 'C', 'D']) {
      expect(sideIndexesAgree('Прямокутна', 4, side)).toBe(true);
      expect(SEGMENT_SIDE_INDEX['Прямокутна'][side]).toBe(CONTOUR_SIDE_INDEX[4][side]);
    }
  });

  it('Г- і П-форма — так само', () => {
    for (const [shape, count, sides] of [
      ['Г-подібна', 6, ['A', 'B', 'C', 'D', 'E', 'F']],
      ['П-подібна', 8, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']],
    ] as const) {
      for (const side of sides) {
        expect(sideIndexesAgree(shape, count, side)).toBe(true);
      }
    }
  });

  it('A — перше ребро контуру, як і в 2D-кресленні', () => {
    expect(SEGMENT_SIDE_INDEX['Прямокутна'].A).toBe(0);
    expect(CONTOUR_SIDE_INDEX[4].A).toBe(0);
  });
});

describe('поворот', () => {
  it('чверті рахуються з округленням — дрібний кут це шум, а не втрата', () => {
    expect(rotationQuarter(0)).toBe(0);
    expect(rotationQuarter(90)).toBe(1);
    expect(rotationQuarter(180)).toBe(2);
    expect(rotationQuarter(270)).toBe(3);
    expect(rotationQuarter(360)).toBe(0);
    expect(rotationQuarter(-90)).toBe(3);
    expect(rotationQuarter(89.6)).toBe(1);
  });

  it('сторона їде разом із деталлю по колу боксу', () => {
    // Бокс: [left, top, right, bottom]. A при 0° — top(1), бо модельне
    // ребро 0 (сторона A) йде вздовж minY.
    expect(rotatedBoxEdgeIndex('A', 0)).toBe(1);
    expect(rotatedBoxEdgeIndex('A', 90)).toBe(2);
    expect(rotatedBoxEdgeIndex('A', 180)).toBe(3);
    expect(rotatedBoxEdgeIndex('A', 270)).toBe(0);
    // D замикає коло: при 0° це ліве ребро.
    expect(rotatedBoxEdgeIndex('D', 0)).toBe(0);
  });

  it('повний оберт повертає сторону на місце — для всіх сторін', () => {
    for (const side of ['A', 'B', 'C', 'D']) {
      expect(rotatedBoxEdgeIndex(side, 360)).toBe(rotatedBoxEdgeIndex(side, 0));
    }
  });

  it('невідома сторона не вигадує ребра', () => {
    expect(rotatedBoxEdgeIndex('E', 90)).toBeUndefined();
  });
});

describe('пари кутів', () => {
  it('прямокутник називає кут парою літер', () => {
    expect(cornerSides('DA')).toEqual(['D', 'A']);
    expect(cornerSides('BC')).toEqual(['B', 'C']);
  });

  it('складна форма: кут між своєю стороною і наступною', () => {
    expect(cornerSides('B', 'П-подібна')).toEqual(['B', 'C']);
  });

  it('кут start замикає контур: у Г-форми F↔A, у П-форми H↔A', () => {
    expect(cornerSides('start', 'Г-подібна')).toEqual(['F', 'A']);
    expect(cornerSides('start', 'П-подібна')).toEqual(['H', 'A']);
    expect(cornerSides('start', 'Прямокутна')).toBeUndefined();
  });
});
