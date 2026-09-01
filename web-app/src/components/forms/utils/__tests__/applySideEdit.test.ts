/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { applySideEdit, getSideSize, createDraft } from '../draftHelpers';
import type { DetailDraft } from '../draftHelpers';

/**
 * ПРАВИЛО ГЛИБИНИ (цехове, від власника 10.08): глибина стільниці не пливе
 * від зміни інших розмірів. У Г-подібної глибини — E (плече вздовж F) і
 * B (плече вздовж A); вони змінюються тільки прямим редагуванням.
 *
 * Тест міряє результат ТИМ САМИМ getSideSize, яким користувач бачить числа
 * в таблиці, — щоб перевірялася угода, а не внутрішні поля.
 */

const lDraft = (patch: Partial<DetailDraft> = {}): DetailDraft => ({
  ...createDraft(),
  kind: 'l',
  outerWidth: 3300,      // A
  outerHeight: 1800,     // F
  innerHorizontal: 600,  // E
  innerVertical: 400,    // D  → B = 1800 − 400 = 1400
  ...patch,
});

const edit = (draft: DetailDraft, side: string, value: number): DetailDraft =>
  ({ ...draft, ...applySideEdit(draft, side, value) });

const sides = (d: DetailDraft) =>
  Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F'].map((s) => [s, getSideSize(d, s)]));

describe('Г-подібна: глибина не пливе', () => {
  it('вихідні числа збігаються з таблицею', () => {
    expect(sides(lDraft())).toEqual({ A: 3300, B: 1400, C: 2700, D: 400, E: 600, F: 1800 });
  });

  it('зміна габариту F рухає виріз D, глибина B стоїть', () => {
    const after = sides(edit(lDraft(), 'F', 2000));
    expect(after.F).toBe(2000);
    expect(after.B).toBe(1400);      // ← головне: глибина не зрушила
    expect(after.D).toBe(600);       // виріз узяв різницю
  });

  it('зміна габариту A рухає плече C, глибина E стоїть', () => {
    const after = sides(edit(lDraft(), 'A', 3000));
    expect(after.A).toBe(3000);
    expect(after.E).toBe(600);
    expect(after.C).toBe(2400);
  });

  it('зміна плеча C тягне габарит A, глибина E стоїть', () => {
    const after = sides(edit(lDraft(), 'C', 2500));
    expect(after.C).toBe(2500);
    expect(after.E).toBe(600);
    expect(after.A).toBe(3100);
  });

  it('зміна вирізу D тягне габарит F, глибина B стоїть', () => {
    const after = sides(edit(lDraft(), 'D', 500));
    expect(after.D).toBe(500);
    expect(after.B).toBe(1400);
    expect(after.F).toBe(1900);
  });

  it('пряма зміна глибини B тримає габарит F', () => {
    const after = sides(edit(lDraft(), 'B', 1200));
    expect(after.B).toBe(1200);
    expect(after.F).toBe(1800);      // кімната не гумова — габарит лишається
    expect(after.D).toBe(600);
  });

  it('пряма зміна глибини E тримає габарит A', () => {
    const after = sides(edit(lDraft(), 'E', 700));
    expect(after.E).toBe(700);
    expect(after.A).toBe(3300);
    expect(after.C).toBe(2600);
  });

  it('габарит менший за глибину не дає нуля і не ламає контур', () => {
    // F = 1000 при глибині B = 1400 фізично неможливий: глибина мусить
    // поступитись, але жодна сторона не має стати нулем чи від'ємною.
    const after = sides(edit(lDraft(), 'F', 1000));
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach((s) => {
      expect(after[s], `сторона ${s}`).toBeGreaterThan(0);
    });
    expect(after.F).toBeGreaterThanOrEqual(after.D);
  });

  it('нуль і від\'ємне значення затискаються до 1 мм', () => {
    expect(getSideSize(edit(lDraft(), 'E', 0), 'E')).toBe(1);
    expect(getSideSize(edit(lDraft(), 'D', -50), 'D')).toBe(1);
  });
});

describe('Прямокутна і П-подібна: угода не змінилась', () => {
  it('прямокутник: A/C — довжина, B/D — глибина', () => {
    const rect = { ...createDraft(), kind: 'rect' as const, width: 1200, height: 600 };
    expect(applySideEdit(rect, 'A', 1500)).toEqual({ width: 1500 });
    expect(applySideEdit(rect, 'C', 1500)).toEqual({ width: 1500 });
    expect(applySideEdit(rect, 'B', 700)).toEqual({ height: 700 });
    expect(applySideEdit(rect, 'D', 700)).toEqual({ height: 700 });
  });

  it('П-подібна: зміна висоти тримає глибину верхньої перекладини', () => {
    const u: DetailDraft = {
      ...createDraft(), kind: 'u',
      width: 2600, height: 1600, leftLegHeight: 1600, rightLegHeight: 1600,
      innerCutWidth: 1200, innerCutDepth: 1000, innerCutOffset: 600,
    };
    const before = getSideSize(u, 'B') - getSideSize(u, 'D'); // глибина перекладини
    const after = { ...u, ...applySideEdit(u, 'B', 1800) };
    expect(getSideSize(after, 'B')).toBe(1800);
    expect(getSideSize(after, 'B') - getSideSize(after, 'D')).toBe(before);
  });
});
