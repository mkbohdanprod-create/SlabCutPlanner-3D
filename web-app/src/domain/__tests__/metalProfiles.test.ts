import { describe, it, expect } from 'vitest';
import { METAL_PROFILES, metalProfileById, kgPerMeter, pieceWeightKg, pieceSurfaceM2 } from '../metalProfiles';
import { explodeDetails } from '../../engines/geometry';
import { buildGeometry, elementToDetail } from '../elementToDetail';
import type { Detail, ProductElement } from '../types';

// MVP Viyar Metal: відрізок профілю — та сама модель «Виріб → Елемент →
// Деталь», що й камінь. Тести ловлять: хибну масу з сортаменту (вона йде
// в КП і в назву деталі) і мовчазну втрату metalProfileId по дорозі в розкрій.

const noAllowances = {
  detailLength: 0, detailWidth: 0, elementLength: 0, elementWidth: 0,
  interPartSpacing: 0, detailSmallCutout: 0, detailLargeCutout: 0,
  elementSmallCutout: 0, elementLargeCutout: 0, show: false, applyToImports: false,
} as never;

describe('сортамент металопрокату', () => {
  it('маса рахується з перерізу: труба 20×20×2 ≈ 1.13 кг/м', () => {
    const kv20 = metalProfileById('kv20')!;
    expect(kgPerMeter(kv20)).toBeCloseTo(1.13, 2);
  });

  it('арматура Ø12 ≈ 0.89 кг/м, штаба 40×4 ≈ 1.26 кг/м', () => {
    expect(kgPerMeter(metalProfileById('arm12')!)).toBeCloseTo(0.89, 2);
    expect(kgPerMeter(metalProfileById('sht40')!)).toBeCloseTo(1.26, 2);
  });

  it('вага і площа фарбування відрізка: 2 м труби 40×40×2', () => {
    const kv40 = metalProfileById('kv40')!;
    expect(pieceWeightKg(kv40, 2000)).toBeCloseTo(4.77, 1);
    expect(pieceSurfaceM2(kv40, 2000)).toBeCloseTo(0.32, 2);
  });

  it('кожен профіль каталогу має додатну масу', () => {
    METAL_PROFILES.forEach((profile) => {
      expect(kgPerMeter(profile)).toBeGreaterThan(0);
    });
  });
});

describe('металопрокат у розкрої', () => {
  it('buildGeometry переносить профіль лише для metal_profile', () => {
    expect(buildGeometry({ kind: 'metal_profile', metalProfileId: 'kv40', width: 2000 } as never).metalProfileId).toBe('kv40');
    expect(buildGeometry({ kind: 'rect', metalProfileId: 'kv40', width: 2000 } as never).metalProfileId).toBeUndefined();
  });

  it('деталь-профіль дає одну смужку «довжина × висота перерізу» з масою в назві', () => {
    const detail = {
      id: 'm1', type: 'Металопрокат', shape: 'Прямокутна', quantity: 1, thickness: 2,
      geometry: { width: 1500, height: 40, metalProfileId: 'kv40' },
    } as unknown as Detail;

    const parts = explodeDetails([detail], noAllowances);
    expect(parts).toHaveLength(1);
    expect(parts[0].width).toBe(1500);
    expect(parts[0].height).toBe(40);
    expect(parts[0].name).toContain('Труба кв. 40×40×2');
    expect(parts[0].name).toContain('1500 мм');
    expect(parts[0].name).toMatch(/кг/);
  });

  it('елемент виробу «Металопрокат» проходить конвеєр цілком', () => {
    const element = {
      id: 'prod_1/element:main', type: 'Металопрокат', additions: [], joints: [],
      baseDefinition: {
        type: 'Металопрокат', kind: 'metal_profile', quantity: 2, thickness: 2,
        width: 3000, height: 40, metalProfileId: 'kv60',
      },
    } as unknown as ProductElement;

    const detail = elementToDetail(element, 1, true, undefined, undefined, 'Каркас');
    expect(detail.geometry.metalProfileId).toBe('kv60');

    const parts = explodeDetails([detail], noAllowances);
    // quantity 2 → два відрізки
    expect(parts).toHaveLength(2);
    expect(parts[0].height).toBe(60);
  });
});
