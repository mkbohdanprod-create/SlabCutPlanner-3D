import { describe, it, expect } from 'vitest';
import { buildAssemblyPlan } from '../assemblyPlan';
import type { Detail, DetailPart, Placement } from '../../domain/types';

/**
 * №178/№179 — карта цехових склейок.
 *
 * Сценарій — контрольний кейс МЕС 81-000002: стільниця розділена стиком
 * на Виріб.1 і Виріб.2; підворот D належить Виріб.1, підворот C — Виріб.2
 * (за сторонами на контурі, не «першій зі списку»); чаша з N деталей
 * стає одним вузлом і вклеюється у стільницю з отвором під неї; опори й
 * панелі їдуть окремо. Очікуваний склад: 4 склейки → 6 елементів.
 */

const rect = (w: number, h: number, sides: string[]) => [
  { x: 0, y: 0, sideId: sides[0] }, { x: w, y: 0, sideId: sides[1] },
  { x: w, y: h, sideId: sides[2] }, { x: 0, y: h, sideId: sides[3] },
];

const part = (id: string, over: Partial<DetailPart> = {}): DetailPart => ({
  id, detailId: `det-${id}`, name: id, type: 'Стільниця', shape: 'Прямокутна',
  width: 600, height: 600, rotation: 0, area: 0.36,
  points: rect(600, 600, ['A', 'B', 'C', 'D']),
  isMain: true, thickness: 20, parentLabel: 'Виріб', dimsLabel: '600×600',
  ...over,
} as unknown as DetailPart);

const detail = (id: string, over: Partial<Detail> = {}): Detail => ({
  id, type: 'Стільниця', shape: 'Прямокутна', quantity: 1, thickness: 20,
  geometry: { width: 600, height: 600 }, ...over,
} as unknown as Detail);

const noPlacements: Placement[] = [];

function referenceCase() {
  const parts: DetailPart[] = [
    // Стільниця, розділена стиком: ліва частина несе D, права — C.
    part('top-1', { name: 'Виріб.1', detailId: 'det-top', points: rect(600, 600, ['A', undefined as never, 'cut', 'D']) }),
    part('top-2', { name: 'Виріб.2', detailId: 'det-top', points: rect(1200, 600, ['A', 'B', 'C', undefined as never]),
      holes: [[{ x: 300, y: 100 }, { x: 800, y: 100 }, { x: 800, y: 500 }, { x: 300, y: 500 }]] }),
    part('fold-C', { name: 'Потовщення (C)', detailId: 'det-fold-C', isMain: false, parentDetailId: 'det-top', parentDetailSide: 'C', edgeKind: 'thickening' } as Partial<DetailPart>),
    part('fold-D', { name: 'Потовщення (D)', detailId: 'det-fold-D', isMain: false, parentDetailId: 'det-top', parentDetailSide: 'D', edgeKind: 'thickening' } as Partial<DetailPart>),
    part('sink-1', { name: 'Мийка 1. задня стінка', detailId: 'det-sink', parentLabel: 'Мийка (1)', width: 500, height: 200 }),
    part('sink-2', { name: 'Мийка 2. дно', detailId: 'det-sink', parentLabel: 'Мийка (1)', width: 500, height: 400, textureGroupAnchor: true,
      points: rect(500, 400, []) } as Partial<DetailPart>),
    part('sink-3', { name: 'Мийка 3. бокова', detailId: 'det-sink', parentLabel: 'Мийка (1)', width: 400, height: 200 }),
    part('leg-B', { name: 'Опора (B)', parentLabel: 'Опора', detailId: 'det-leg-B' }),
    part('leg-E', { name: 'Опора (E)', parentLabel: 'Опора', detailId: 'det-leg-E' }),
    part('wall-A', { name: 'Стінова панель (A)', parentLabel: 'Панель', detailId: 'det-wall-A' }),
    part('wall-F', { name: 'Стінова панель (F)', parentLabel: 'Панель', detailId: 'det-wall-F' }),
  ];
  const details = [
    detail('det-top'), detail('det-sink', { type: 'Мийка' }),
    detail('det-fold-C', { type: 'Потовщення', parentDetailId: 'det-top', parentDetailSide: 'C', importRole: 'thickening' }),
    detail('det-fold-D', { type: 'Потовщення', parentDetailId: 'det-top', parentDetailSide: 'D', importRole: 'thickening' }),
    detail('det-leg-B', { type: 'Опора' }), detail('det-leg-E', { type: 'Опора' }),
    detail('det-wall-A', { type: 'Стінова панель' }), detail('det-wall-F', { type: 'Стінова панель' }),
  ];
  return { parts, details };
}

describe('№179 · карта склейок за контрольним кейсом МЕС', () => {
  it('підворот іде до тієї заготовки, що несе його сторону, а не до першої', () => {
    const { parts, details } = referenceCase();
    const plan = buildAssemblyPlan(parts, noPlacements, details);
    const glueD = plan.joins.find((join) => join.inputs.includes('fold-D'));
    const glueC = plan.joins.find((join) => join.inputs.includes('fold-C'));
    expect(glueD?.output.hostPartId).toBe('top-1');
    expect(glueC?.output.hostPartId).toBe('top-2');
    expect(glueD?.basis).toBe('model');
    expect(plan.unresolved).toHaveLength(0);
  });

  it('чаша — один вузол, вклеєний у стільницю з отвором; разом 4 склейки → 6 елементів', () => {
    const { parts, details } = referenceCase();
    const plan = buildAssemblyPlan(parts, noPlacements, details);

    const sink = plan.joins.find((join) => join.output.kind === 'sink');
    expect(sink?.inputs).toEqual(['sink-1', 'sink-2', 'sink-3']);

    // Вклейка споживає ВЖЕ склеєну «стільницю з підворотом», а не сиру заготовку.
    const install = plan.joins.find((join) => join.id.startsWith('sink-in-top'));
    const glueC = plan.joins.find((join) => join.inputs.includes('fold-C'));
    expect(install?.inputs).toEqual([glueC!.output.id, sink!.output.id]);
    expect(install?.output.hostPartId).toBe('top-2');
    expect(install?.output.holeIndex).toBe(0);

    expect(plan.counts).toMatchObject({ parts: 11, joins: 4, finalUnits: 6, unresolved: 0 });
    // Родовід: у вузлі з мийкою — і стільниця, і підворот, і всі частини чаші.
    expect(install?.output.partIds.sort()).toEqual(['fold-C', 'sink-1', 'sink-2', 'sink-3', 'top-2']);
    // Жодна заготовка не загублена й не подвоєна — notes без «ПОМИЛКА».
    expect(plan.notes.join(' ')).not.toMatch(/ПОМИЛКА/);
    // Комплекти — по одному на склейку, входи не споживаються.
    expect(plan.transportGroups).toHaveLength(4);
    expect(plan.transportGroups[0]).toMatchObject({ waitForAll: true, consumesInputs: false });
  });

  it('неоднозначність не вирішується «першим зі списку» — іде в unresolved', () => {
    const { parts, details } = referenceCase();
    // Обидві половини стільниці отримали отвір під чашу однакового розміру.
    const ambiguous = parts.map((item) => (item.id === 'top-1'
      ? { ...item, holes: [[{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }, { x: 0, y: 400 }]] }
      : item));
    const plan = buildAssemblyPlan(ambiguous as DetailPart[], noPlacements, details);
    expect(plan.joins.find((join) => join.id.startsWith('sink-in-top'))).toBeUndefined();
    expect(plan.unresolved[0]).toMatchObject({ code: 'sink-host-ambiguous', candidates: ['top-1', 'top-2'] });
    // Чаша тоді їде окремим елементом, а не зникає.
    expect(plan.finalUnitIds).toContain(plan.joins.find((join) => join.output.kind === 'sink')!.output.id);
  });

  it('без склейок кожна заготовка — окремий елемент, і це сказано словами', () => {
    const parts = [part('a', { parentLabel: 'A' }), part('b', { parentLabel: 'B' })];
    const plan = buildAssemblyPlan(parts, noPlacements, [detail('det-a'), detail('det-b')]);
    expect(plan.joins).toHaveLength(0);
    expect(plan.finalUnitIds).toEqual(['a', 'b']);
    expect(plan.notes.join(' ')).toMatch(/окремо/);
  });
});
