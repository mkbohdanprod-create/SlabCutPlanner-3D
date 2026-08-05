import { describe, it, expect } from 'vitest';
import { explodeDetails } from '../geometry';
import { getSinkPartTransform, isSinkDetail } from '../sinkAssembly';
import type { Detail } from '../../domain/types';

// Мийка збирається з РЕАЛЬНИХ деталей розкрою. Тест ловить дві біди:
// деталь без місця у збірці (випаде з 3D) і зсунуту чашу (стінки не
// сходяться з площиною стільниці).

const noAllowances = {
  detailLength: 0, detailWidth: 0, elementLength: 0, elementWidth: 0,
  interPartSpacing: 0, detailSmallCutout: 0, detailLargeCutout: 0,
  elementSmallCutout: 0, elementLargeCutout: 0, show: false, applyToImports: false,
} as never;

const sink = (kind: 'rect' | 'slot', width = 1200, height = 600, depth = 400): Detail => ({
  id: 'sink', type: 'Мийка', shape: 'Прямокутна', quantity: 1, thickness: 20,
  geometry: { width, height, innerVertical: depth, sinkKind: kind },
} as unknown as Detail);

describe('збірка мийки', () => {
  it('кожна деталь має місце: або трансформацію, або позначку службової', () => {
    const detail = sink('rect');
    const parts = explodeDetails([detail], noAllowances);
    expect(parts).toHaveLength(14);

    const orphans = parts.filter((part) => getSinkPartTransform(part, detail, 0.02) === null);
    expect(orphans.map((part) => part.name)).toEqual([]);
  });

  it('підклейки — службові: у збірці приховані, у розкрої лишаються', () => {
    const detail = sink('rect');
    const parts = explodeDetails([detail], noAllowances);
    const hidden = parts.filter((part) => getSinkPartTransform(part, detail, 0.02)?.hidden);
    expect(hidden.length).toBeGreaterThan(0);
    hidden.forEach((part) => expect(part.name.toLowerCase()).toContain('підклейка'));
  });

  it('стінки стоять на всю глибину: від дна до площини стільниці', () => {
    const detail = sink('rect', 1200, 600, 400);
    const parts = explodeDetails([detail], noAllowances);
    const back = parts.find((part) => part.name.includes('задня стінка'))!;
    const transform = getSinkPartTransform(back, detail, 0.02)!;
    // центр стінки — на половині глибини (0.4 / 2 = 0.2 нижче площини)
    expect(transform.pos![1]).toBeCloseTo(-0.2, 3);
    // задня стінка відсунута назад на пів ширини + пів товщини
    expect(transform.pos![2]).toBeCloseTo(-0.31, 3);
  });

  it('бокові стінки розходяться на довжину чаші', () => {
    const detail = sink('rect', 1200, 600, 400);
    const parts = explodeDetails([detail], noAllowances);
    const left = parts.find((part) => part.name.includes('ліва бокова'))!;
    const right = parts.find((part) => part.name.includes('права бокова'))!;
    expect(getSinkPartTransform(left, detail, 0.02)!.pos![0]).toBeCloseTo(-0.61, 3);
    expect(getSinkPartTransform(right, detail, 0.02)!.pos![0]).toBeCloseTo(0.61, 3);
  });

  it('чотири трикутники дна лежать на дні чаші', () => {
    const detail = sink('rect', 1200, 600, 400);
    const parts = explodeDetails([detail], noAllowances);
    const triangles = parts.filter((part) => part.name.includes('трикутник'));
    expect(triangles).toHaveLength(4);
    triangles.forEach((part) => {
      // дно на глибині 0.4, центр деталі — на пів товщини вище
      expect(getSinkPartTransform(part, detail, 0.02)!.pos![1]).toBeCloseTo(-0.39, 3);
    });
  });

  it('щілинна мийка теж збирається повністю', () => {
    const detail = sink('slot', 600, 400, 150);
    const parts = explodeDetails([detail], noAllowances);
    const orphans = parts.filter((part) => getSinkPartTransform(part, detail, 0.02) === null);
    expect(orphans.map((part) => part.name)).toEqual([]);
  });

  it('розміри чаші керують збіркою: більша мийка — ширша розстановка', () => {
    const small = sink('rect', 500, 400, 200);
    const large = sink('rect', 1200, 600, 400);
    const leftOf = (detail: Detail) => {
      const parts = explodeDetails([detail], noAllowances);
      const left = parts.find((part) => part.name.includes('ліва бокова'))!;
      return getSinkPartTransform(left, detail, 0.02)!.pos![0];
    };
    expect(leftOf(small)).toBeCloseTo(-0.26, 3);
    expect(leftOf(large)).toBeCloseTo(-0.61, 3);
  });

  it('isSinkDetail впізнає мийку за геометрією', () => {
    expect(isSinkDetail(sink('rect'))).toBe(true);
    expect(isSinkDetail(sink('slot'))).toBe(true);
    expect(isSinkDetail({ geometry: {} } as Detail)).toBe(false);
    expect(isSinkDetail(undefined)).toBe(false);
  });
});
