import { describe, it, expect, vi, beforeEach } from 'vitest';
import { explodeDetails } from '../geometry';
import type { Detail } from '../../domain/types';

let idCounter = 0;

vi.mock('../../domain/defaults', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domain/defaults')>();
  return {
    ...actual,
    uid: () => `test-id-${++idCounter}`,
  };
});

const mockDetails: Detail[] = [
  {
    id: 'det-1',
    type: 'Стільниця',
    shape: 'Прямокутна',
    quantity: 1,
    geometry: { width: 1000, height: 600 },
    thickness: 20
  },
  {
    id: 'det-2',
    type: 'Стільниця',
    shape: 'Г-подібна',
    quantity: 1,
    geometry: { width: 1500, height: 1500, innerHorizontal: 600, innerVertical: 600 },
    thickness: 20
  }
];

const mockAllowances = {
  detailLength: 10,
  detailWidth: 10,
  elementLength: 5,
  elementWidth: 5,
  interPartSpacing: 10,
  detailSmallCutout: 5,
  detailLargeCutout: 5,
  elementSmallCutout: 5,
  elementLargeCutout: 5,
  show: true,
  applyToImports: true
};

describe('geometry.ts (Safety Net)', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it('should correctly explode details into parts with allowances', () => {
    const parts = explodeDetails(mockDetails, mockAllowances);

    // Normalize coordinates
    const normalizedParts = parts.map(p => ({
      ...p,
      width: Math.round(p.width * 100) / 100 + 0,
      height: Math.round(p.height * 100) / 100 + 0,
      area: Math.round(p.area * 100) / 100 + 0,
      points: p.points.map(pt => ({
        x: Math.round(pt.x * 100) / 100 + 0,
        y: Math.round(pt.y * 100) / 100 + 0,
      })),
    }));

    expect(normalizedParts).toMatchSnapshot('exploded-parts');
  });
});
