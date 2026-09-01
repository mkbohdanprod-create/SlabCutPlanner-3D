/**
 * ХВИЛЯ 3 · крок 3.3 — позначка тримається за РЕБРО, а не за букву.
 *
 * Раніше сторони прямокутних деталей відновлювались із габаритного боксу,
 * а поворот компенсувався окремою математикою «зсунь букву на чверть».
 * Це знало рівно про чотири кути кратні 90° і нічого — про радіуси, фаски
 * й дзеркало. Тепер сторона це індекси вершин контуру, а точки читаються
 * з уже трансформованого контуру.
 *
 * Головний інваріант, який тут прибитий: ІНДЕКСИ НЕ ЗАЛЕЖАТЬ ВІД
 * ТРАНСФОРМАЦІЇ. Тому та сама сторона на всіх поворотах — це та сама
 * фізична сторона тієї самої довжини.
 */
import { describe, expect, it } from 'vitest';
import { explodeDetails } from '../../engines/geometry';
import { sideVertexIndices } from '../../engines/geometryUtils';
import { logicalSegmentForSide, edgeMarkersForPart } from '../edgeProfiles';
import type { Detail, DetailPart } from '../../domain/types';

const zeroAllowances = {
  detailLength: 0, detailWidth: 0, elementLength: 0, elementWidth: 0,
  interPartSpacing: 0, detailSmallCutout: 0, detailLargeCutout: 0,
  elementSmallCutout: 0, elementLargeCutout: 0, show: false, applyToImports: false,
} as never;

function mainPart(geometry: Record<string, unknown>): DetailPart {
  const detail = {
    id: 'ct', type: 'Стільниця', shape: 'Прямокутна', quantity: 1, thickness: 20,
    label: 'Стільниця', geometry,
    edgeProfiles: { A: 'polished_straight' },
  } as unknown as Detail;
  return explodeDetails([detail], zeroAllowances).find((part) => part.isMain)!;
}

const plain = () => mainPart({ width: 2000, height: 600 });
const rounded = () => mainPart({ width: 2000, height: 600, corners: { AB: { type: 'radius', radius: 150 } } });

const segLength = (part: DetailPart, side: string, rotation: number) => {
  const seg = logicalSegmentForSide(part, side, rotation)!;
  return Math.hypot(seg.end.x - seg.start.x, seg.end.y - seg.start.y);
};

describe('сторона — це індекси вершин контуру', () => {
  it('проста деталь: A це перше ребро', () => {
    expect(sideVertexIndices(plain(), 'A')).toEqual({ startIdx: 0, endIdx: 1 });
    expect(sideVertexIndices(plain(), 'B')).toEqual({ startIdx: 1, endIdx: 2 });
  });

  it('деталь зі скругленим кутом: індекси беруться з реального контуру', () => {
    const part = rounded();
    expect(part.points.length).toBeGreaterThan(4);
    const indices = sideVertexIndices(part, 'A')!;
    expect(indices).toBeDefined();
    // Вершини існують і не збігаються — це справжнє ребро, а не точка.
    expect(part.points[indices.startIdx]).toBeDefined();
    expect(indices.startIdx).not.toBe(indices.endIdx);
  });

  it('індекси однакові незалежно від того, як деталь ляже на сляб', () => {
    // Функція взагалі не приймає поворот — і це головна її властивість.
    const part = rounded();
    const once = sideVertexIndices(part, 'A');
    const twice = sideVertexIndices(part, 'A');
    expect(once).toEqual(twice);
  });
});

describe('позначка їде за деталлю на будь-якому повороті', () => {
  it('проста деталь: довжина сторони A стала однакова на всіх чвертях', () => {
    const part = plain();
    const lengths = [0, 90, 180, 270].map((r) => segLength(part, 'A', r));
    for (const length of lengths) expect(length).toBeCloseTo(2000, 3);
  });

  it('коротка сторона лишається короткою на всіх чвертях', () => {
    const part = plain();
    for (const rotation of [0, 90, 180, 270]) {
      expect(segLength(part, 'B', rotation)).toBeCloseTo(600, 3);
    }
  });

  it('деталь зі скругленим кутом теж не плутає сторони при повороті', () => {
    const part = rounded();
    const base = segLength(part, 'A', 0);
    // Радіус з'їдає частину сторони — важливо, що це та сама частина завжди.
    expect(base).toBeGreaterThan(1500);
    for (const rotation of [90, 180, 270]) {
      expect(segLength(part, 'A', rotation)).toBeCloseTo(base, 3);
    }
  });

  it('маркер профілю лишається на своєму ребрі й після 180°', () => {
    const part = plain();
    const at = (rotation: number) => {
      const marker = edgeMarkersForPart(part, { A: 'polished_straight' } as never, rotation)[0];
      return Math.hypot(marker.end.x - marker.start.x, marker.end.y - marker.start.y);
    };
    expect(at(180)).toBeCloseTo(at(0), 3);
  });
});

describe('трансформація, якої ще немає в розкрої', () => {
  it('дзеркальний контур несе позначку з собою — без правок у edgeProfiles', () => {
    // Дзеркалення поки не вміє пакер (крок 3.4), але позначка вже готова:
    // вона тримається за індекси, а дзеркало нумерацію вершин не міняє.
    const part = plain();
    const mirrored: DetailPart = {
      ...part,
      points: part.points.map((point) => ({ x: part.width - point.x, y: point.y })),
    };
    const indices = sideVertexIndices(mirrored, 'A')!;
    const start = mirrored.points[indices.startIdx];
    const end = mirrored.points[indices.endIdx];
    // Та сама сторона A, та сама довжина 2000 — просто з іншого боку слябу.
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(2000, 3);
  });
});
