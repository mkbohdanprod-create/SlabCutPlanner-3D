import { describe, expect, it } from 'vitest';
import type { DetailPart } from '../../domain/types';
import { buildEdgeCutters, profileCutsMaterial } from '../edgeCutters';

/**
 * Прямокутна деталь 1000×600 без sideSegments — сторони йдуть за
 * загальною угодою імен (CONTOUR_SIDE_INDEX): контур за годинниковою
 * A(верх) B(право) C(низ) D(ліво) у системі y-вниз.
 */
function rectPart(width = 1000, height = 600): DetailPart {
  return {
    id: 'part_1',
    detailId: 'det_1',
    name: 'Тест',
    isMain: true,
    width,
    height,
    points: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    dimsLabel: `${width}×${height}`,
  } as unknown as DetailPart;
}

/** Габарити геометрії в мм відносно центру деталі (сцена: X, Y-товщина, Z). */
function boundsMm(geometry: import('three').BufferGeometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  return {
    minX: box.min.x * 1000, maxX: box.max.x * 1000,
    minY: box.min.y * 1000, maxY: box.max.y * 1000,
    minZ: box.min.z * 1000, maxZ: box.max.z * 1000,
  };
}

describe('різаки торців (edgeCutters)', () => {
  it('без профілів — різаків немає', () => {
    expect(buildEdgeCutters(rectPart(), undefined, 20)).toEqual([]);
    expect(buildEdgeCutters(rectPart(), {}, 20)).toEqual([]);
  });

  it('полірування і «Антик» форму не міняють — різака немає', () => {
    expect(buildEdgeCutters(rectPart(), { A: 'polished_straight' }, 20)).toEqual([]);
    expect(profileCutsMaterial('antik')).toBe(false);
    expect(profileCutsMaterial('chamfer_2x2')).toBe(true);
  });

  it('невідомий профіль чесно ігнорується, а не вигадується', () => {
    expect(buildEdgeCutters(rectPart(), { A: 'ne_isnuye_v_cehu' as never }, 20)).toEqual([]);
  });

  it('фаска 2×2 на стороні A: різак сидить на верхньому ребрі і знімає 2 мм', () => {
    const t = 20;
    const cutters = buildEdgeCutters(rectPart(), { A: 'chamfer_2x2' }, t);
    expect(cutters.length).toBe(1);
    const b = boundsMm(cutters[0]);
    // Верх плити Y=+10: різак накриває верх і врізається рівно на 2 мм
    expect(b.maxY).toBeGreaterThan(t / 2);
    expect(b.minY).toBeCloseTo(t / 2 - 2, 1);
    // Сторона A — верхнє ребро контуру (py=0 → Z=−300): різак біля нього
    expect(b.minZ).toBeLessThan(-300 + 0.5);
    expect(b.maxZ).toBeLessThan(-300 + 5);
    // Обидва кути прямокутника опуклі — різак продовжений за обидва краї
    expect(b.minX).toBeLessThan(-500);
    expect(b.maxX).toBeGreaterThan(500);
  });

  it('парний профіль (в/н) дає ДВА різаки: другий — дзеркальний по товщині', () => {
    const t = 20;
    const cutters = buildEdgeCutters(rectPart(), { A: 'chamfer_2x2_top_bottom' }, t);
    expect(cutters.length).toBe(2);
    const top = boundsMm(cutters[0]);
    const bottom = boundsMm(cutters[1]);
    expect(top.minY).toBeCloseTo(t / 2 - 2, 1);
    expect(bottom.maxY).toBeCloseTo(-(t / 2) + 2, 1);
  });

  it('фаска глибша за плиту зрізається до 90% товщини, не зжирає деталь', () => {
    const t = 4; // тонкий керамограніт
    const cutters = buildEdgeCutters(rectPart(), { A: 'acr_ch_10x10' }, t);
    const b = boundsMm(cutters[0]);
    // 10 мм у плиту 4 мм не влазить: ріжемо максимум 3.6 мм
    expect(b.minY).toBeGreaterThanOrEqual(-(t / 2) + t * 0.1 - 0.11);
  });

  it('повний бульноз накриває всю товщину торця', () => {
    const t = 20;
    const cutters = buildEdgeCutters(rectPart(), { B: 'full_bullnose' }, t);
    expect(cutters.length).toBe(1);
    const b = boundsMm(cutters[0]);
    expect(b.maxY).toBeGreaterThan(t / 2);
    expect(b.minY).toBeLessThan(-t / 2);
    // Сторона B — праве ребро (px=w → X=+500)
    expect(b.maxX).toBeGreaterThan(500 - 11);
  });

  it('внутрішній кут Г-подібної деталі: різак НЕ продовжується за вершину', () => {
    // Г-контур за годинниковою; внутрішня вершина — (600, 300)
    const part = {
      ...rectPart(),
      points: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 300 },
        { x: 600, y: 300 },
        { x: 600, y: 600 },
        { x: 0, y: 600 },
      ],
      // Сторона з профілем: ребро (1000,300)→(600,300) — верх «полички»
      sideSegments: {
        P: { start: { x: 1000, y: 300 }, end: { x: 600, y: 300 } },
      },
    } as unknown as DetailPart;

    const cutters = buildEdgeCutters(part, { P: 'chamfer_2x2' }, 20);
    expect(cutters.length).toBe(1);
    const b = boundsMm(cutters[0]);
    // Початок ребра (x=1000) — опуклий кут: продовжуємо за плиту.
    expect(b.maxX).toBeGreaterThan(500);
    // Кінець (x=600) — ВНУТРІШНІЙ кут: різак упирається, X не менше 600−ε
    // (у центрованих координатах 600 мм → +100)
    expect(b.minX).toBeGreaterThanOrEqual(100 - 0.5);
  });

  it('крайка «не на всю довжину» ріже рівно свою ділянку', () => {
    const t = 20;
    const cutters = buildEdgeCutters(rectPart(), {
      A: { top: { profileId: 'chamfer_2x2' }, isFullLength: false, size: 300, align: 'left', offset: 100 },
    }, t);
    expect(cutters.length).toBe(1);
    const b = boundsMm(cutters[0]);
    // Сторона A йде від (0,0) до (1000,0): ділянка 100..400 мм → X −400..−100.
    // Кінці в повітрі — подовжень за опуклі кути немає.
    expect(b.minX).toBeCloseTo(-400, 0);
    expect(b.maxX).toBeCloseTo(-100, 0);
  });
});
