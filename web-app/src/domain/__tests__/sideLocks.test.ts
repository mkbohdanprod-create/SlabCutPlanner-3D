import { describe, it, expect } from 'vitest';
import { applySideEdit, getSideSize } from '../../components/forms/utils/draftHelpers';
import type { DetailDraft } from '../../components/forms/utils/draftHelpers';
import { donorForSide, sideEditable, WIDTH_SIDE } from '../sideLocks';

/**
 * ЗАМКИ НА СТОРОНАХ (04.09.2026).
 *
 * Задача власника дослівно: «замочки, як вони працюють: коли ми закрили
 * замком G і С, то при зміні розмірів А міняється сторона Е. Якщо замочок
 * закритий на Е і G, то змінюється С».
 *
 * Друга половина тестів не менш важлива: БЕЗ замків поведінка мусить
 * лишитись рівно такою, як була до 04.09 — старий switch перенесено в
 * списки пріоритету, а не переписано.
 */

const U: DetailDraft = {
  id: 'u1', name: 'П', kind: 'u', quantity: 1, thickness: 20,
  width: 2400, height: 1200,
  leftLegHeight: 1200, rightLegHeight: 1200,
  innerCutWidth: 1200, innerCutDepth: 600, innerCutOffset: 600,
  thickening: { enabled: false, sides: [], height: 0 },
  fold: { enabled: false, sides: [], height: 0 },
  edgeProfiles: {},
} as unknown as DetailDraft;

const L: DetailDraft = {
  id: 'l1', name: 'Г', kind: 'l', quantity: 1, thickness: 20,
  outerWidth: 1200, outerHeight: 1200, innerHorizontal: 600, innerVertical: 600,
  thickening: { enabled: false, sides: [], height: 0 },
  fold: { enabled: false, sides: [], height: 0 },
  edgeProfiles: {},
} as unknown as DetailDraft;

const sides = (draft: DetailDraft, names: string[]) =>
  Object.fromEntries(names.map((s) => [s, getSideSize(draft, s)]));

const lock = (...names: string[]) => new Set(names) as ReadonlySet<string>;

describe('замки: сценарії власника на П-подібній', () => {
  it('замкнені G і C — зміна A їде у виріз E', () => {
    const next = { ...U, ...applySideEdit(U, 'A', 3000, lock('G', 'C')) };
    expect(sides(next, ['A', 'G', 'E', 'C'])).toEqual({ A: 3000, G: 600, E: 1800, C: 600 });
  });

  it('замкнені E і G — зміна A їде в праву ногу C', () => {
    const next = { ...U, ...applySideEdit(U, 'A', 3000, lock('E', 'G')) };
    expect(sides(next, ['A', 'G', 'E', 'C'])).toEqual({ A: 3000, G: 600, E: 1200, C: 1200 });
  });

  it('замкнені C і E — зміна A їде в ліву ногу G', () => {
    const next = { ...U, ...applySideEdit(U, 'A', 3000, lock('C', 'E')) };
    expect(sides(next, ['A', 'G', 'E', 'C'])).toEqual({ A: 3000, G: 1200, E: 1200, C: 600 });
  });

  it('замкнені всі три частки — габарит не редагується', () => {
    expect(applySideEdit(U, 'A', 3000, lock('G', 'E', 'C'))).toEqual({});
    expect(sideEditable(U, 'A', lock('G', 'E', 'C'))).toBe(false);
  });

  it('замкнене поле не змінюється навіть прямим введенням', () => {
    expect(applySideEdit(U, 'E', 900, lock('E'))).toEqual({});
    expect(sideEditable(U, 'E', lock('E'))).toBe(false);
  });

  it('видно наперед, хто поступиться', () => {
    expect(donorForSide(U, 'A', lock('G', 'C'))).toBe('E');
    expect(donorForSide(U, 'A', lock('E', 'G'))).toBe('C');
    expect(donorForSide(U, 'A', new Set())).toBe('C');
  });
});

describe('замки: «Ширина» П-подібної', () => {
  it('без замків зміна висоти H тримає перекладину і рухає ногу F', () => {
    const next = { ...U, ...applySideEdit(U, 'H', 1400) };
    expect(sides(next, ['H', 'F', WIDTH_SIDE])).toEqual({ H: 1400, F: 800, [WIDTH_SIDE]: 600 });
  });

  it('замкнена нога F — зміна H їде в «Ширину», і друга нога D підлаштовується', () => {
    const next = { ...U, ...applySideEdit(U, 'H', 1400, lock('F')) };
    expect(sides(next, ['H', 'F', WIDTH_SIDE])).toEqual({ H: 1400, F: 600, [WIDTH_SIDE]: 800 });
    // Права нога: висота B не змінилась, D став коротшим на ту саму різницю
    expect(sides(next, ['B', 'D'])).toEqual({ B: 1200, D: 400 });
  });

  it('замкнена «Ширина» — зміна H їде в ногу F (перекладина стоїть)', () => {
    const next = { ...U, ...applySideEdit(U, 'H', 1400, lock(WIDTH_SIDE)) };
    expect(sides(next, ['H', 'F', WIDTH_SIDE])).toEqual({ H: 1400, F: 800, [WIDTH_SIDE]: 600 });
  });

  it('замкнені F і вся права вертикаль — «Ширині» рухатись нікуди, правка скасовується', () => {
    expect(applySideEdit(U, 'H', 1400, lock('F', 'B', 'D'))).toEqual({});
  });

  it('пряма зміна «Ширини» тримає висоти ніг і рухає обидва вирізи', () => {
    const next = { ...U, ...applySideEdit(U, WIDTH_SIDE, 800) };
    expect(sides(next, ['H', 'B', 'F', 'D', WIDTH_SIDE]))
      .toEqual({ H: 1200, B: 1200, F: 400, D: 400, [WIDTH_SIDE]: 800 });
  });
});

describe('без замків поведінка не змінилась (сторожі старих формул)', () => {
  it('П: A рухає праву ногу C', () => {
    const next = { ...U, ...applySideEdit(U, 'A', 3000) };
    expect(sides(next, ['A', 'G', 'E', 'C'])).toEqual({ A: 3000, G: 600, E: 1200, C: 1200 });
  });

  it('П: E рухає габарит A, ноги стоять', () => {
    const next = { ...U, ...applySideEdit(U, 'E', 1400) };
    expect(sides(next, ['A', 'G', 'E', 'C'])).toEqual({ A: 2600, G: 600, E: 1400, C: 600 });
  });

  it('П: G рухає габарит A, виріз і права нога стоять', () => {
    const next = { ...U, ...applySideEdit(U, 'G', 800) };
    expect(sides(next, ['A', 'G', 'E', 'C'])).toEqual({ A: 2600, G: 800, E: 1200, C: 600 });
  });

  it('Г: A рухає плече C, глибина E стоїть', () => {
    const next = { ...L, ...applySideEdit(L, 'A', 1500) };
    expect(sides(next, ['A', 'C', 'E'])).toEqual({ A: 1500, C: 900, E: 600 });
  });

  it('Г: E (глибина) рухає габарит A? ні — габарит стоїть, їде C', () => {
    const next = { ...L, ...applySideEdit(L, 'E', 700) };
    expect(sides(next, ['A', 'C', 'E'])).toEqual({ A: 1200, C: 500, E: 700 });
  });

  it('Г: F (габарит по вертикалі) рухає виріз D, глибина B стоїть', () => {
    const next = { ...L, ...applySideEdit(L, 'F', 1500) };
    expect(sides(next, ['F', 'B', 'D'])).toEqual({ F: 1500, B: 600, D: 900 });
  });

  it('Г: замкнений виріз D — тепер F рухає глибину B', () => {
    const next = { ...L, ...applySideEdit(L, 'F', 1500, lock('D')) };
    expect(sides(next, ['F', 'B', 'D'])).toEqual({ F: 1500, B: 900, D: 600 });
  });

  it('прямокутник рівнянь не має — замикати нічого, редагується завжди', () => {
    const rect = { ...U, kind: 'rect', width: 1000, height: 600 } as unknown as DetailDraft;
    expect(sideEditable(rect, 'A', lock('C'))).toBe(true);
    expect(applySideEdit(rect, 'A', 1200, lock('C'))).toEqual({ width: 1200 });
  });
});

describe('мінімуми', () => {
  it('донор не падає нижче 1 мм — замість цього клацає сама сторона', () => {
    // A=2400, замки на G(600) і C(600): E не може стати меншим за 1
    const next = { ...U, ...applySideEdit(U, 'A', 900, lock('G', 'C')) };
    expect(sides(next, ['A', 'G', 'E', 'C'])).toEqual({ A: 1201, G: 600, E: 1, C: 600 });
  });
});
