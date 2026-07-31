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

  describe('isCurved logic (Whitelist)', () => {
    it('does not apply curved logic to customContour even with >8 points', () => {
      const parts = explodeDetails([{
        id: 'det-custom',
        type: 'Стільниця',
        shape: 'customContour', // NOT in whitelist
        quantity: 1,
        geometry: {}, // No specific geometry needed
        thickness: 20,
        points: Array.from({length: 20}).map((_, i) => ({x: i*10, y: i%2*10})), // 20 points!
        fold: { sides: ['A'], size: 50, enabled: true }
      }], mockAllowances);
      
      // curved parts are generated as sectors (many points), whereas straight parts are rectangles (4 points)
      const hasCurvedParts = parts.some(p => p.edgeKind === 'fold' && p.points.length > 4);
      expect(hasCurvedParts).toBe(false);
    });

    it('applies curved logic to Кругла', () => {
      const parts = explodeDetails([{
        id: 'det-round',
        type: 'Стільниця',
        shape: 'Кругла', // In whitelist
        quantity: 1,
        geometry: { diameter: 1000 },
        thickness: 20,
        fold: { sides: ['A'], size: 50, enabled: true }
      }], mockAllowances);
      
      const hasCurvedParts = parts.some(p => p.edgeKind === 'fold' && p.points.length > 4);
      expect(hasCurvedParts).toBe(true);
    });

    it('does not apply curved logic to Прямокутна even with >8 points', () => {
      const parts = explodeDetails([{
        id: 'det-rect',
        type: 'Стільниця',
        shape: 'Прямокутна', // NOT in whitelist
        quantity: 1,
        geometry: { width: 1000, height: 600 },
        thickness: 20,
        points: Array.from({length: 12}).map((_, i) => ({x: i*10, y: i%2*10})), // 12 points!
        fold: { sides: ['A'], size: 50, enabled: true }
      }], mockAllowances);
      
      const hasCurvedParts = parts.some(p => p.edgeKind === 'fold' && p.points.length > 4);
      expect(hasCurvedParts).toBe(false);
    });
  });
});
