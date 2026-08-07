import { describe, it, expect } from 'vitest';
import { metalChainPieces, metalChainWeightKg, metalSegmentElements, nextSegmentId } from '../metalChain';
import { explodeDetails } from '../../engines/geometry';
import { elementToDetail } from '../elementToDetail';
import type { ElementDefinition } from '../types';

// Ланцюг профілів «від торця»: одна математика живить 3D і розкрій.
// Тести ловлять: зсунуту «черепашку» (сегменти не стикуються кінцями),
// втрату сегментів по дорозі в розкрій і хибну сумарну масу.

const def = (overrides: Partial<ElementDefinition> = {}) => ({
  kind: 'metal_profile', width: 2000, metalProfileId: 'kv40', quantity: 1, thickness: 2,
  ...overrides,
} as unknown as ElementDefinition);

describe('ланцюг профілів', () => {
  it('база без сегментів — один відрізок уздовж X', () => {
    const pieces = metalChainPieces(def());
    expect(pieces).toHaveLength(1);
    expect(pieces[0].start).toEqual([0, 0, 0]);
    expect(pieces[0].dir).toEqual([1, 0, 0]);
    expect(pieces[0].lengthMm).toBe(2000);
  });

  it('«вгору 90°» стартує з кінця бази і йде по +Y (рама)', () => {
    const pieces = metalChainPieces(def({
      metalSegments: [{ id: '1', length: 1000, turn: 'up', angle: 90 }],
    }));
    expect(pieces).toHaveLength(2);
    expect(pieces[1].start).toEqual([2000, 0, 0]);
    expect(pieces[1].dir[1]).toBeCloseTo(1, 6);
    expect(Math.abs(pieces[1].dir[0])).toBeLessThan(1e-6);
  });

  it('після «вгору» команда «вліво» працює в локальній системі, а не крутиться намарно', () => {
    const pieces = metalChainPieces(def({
      metalSegments: [
        { id: '1', length: 1000, turn: 'up', angle: 90 },
        { id: '2', length: 500, turn: 'left', angle: 90 },
      ],
    }));
    const third = pieces[2];
    expect(third.start[0]).toBeCloseTo(2000, 3);
    expect(third.start[1]).toBeCloseTo(1000, 3);
    // напрямок змінився (не лишився +Y і не нульовий)
    expect(Math.hypot(third.dir[0], third.dir[1], third.dir[2])).toBeCloseTo(1, 6);
    expect(Math.abs(third.dir[1])).toBeLessThan(1e-6);
  });

  it('45° дає діагональний напрямок', () => {
    const pieces = metalChainPieces(def({
      metalSegments: [{ id: '1', length: 1000, turn: 'up', angle: 45 }],
    }));
    expect(pieces[1].dir[0]).toBeCloseTo(Math.SQRT1_2, 4);
    expect(pieces[1].dir[1]).toBeCloseTo(Math.SQRT1_2, 4);
  });

  it('сумарна маса = сума відрізків (база 2 м + сегмент 1 м труби 40×40×2)', () => {
    const total = metalChainWeightKg(def({
      metalSegments: [{ id: '1', length: 1000, turn: 'up', angle: 90 }],
    }));
    expect(total).toBeCloseTo(2.39 * 3, 1);
  });

  it('кожен сегмент стає похідною деталлю розкрою зі своїм профілем', () => {
    const elements = metalSegmentElements('p1', def({
      metalSegments: [
        { id: '1', length: 1000, turn: 'up', angle: 90 },
        { id: '2', length: 500, turn: 'left', angle: 90, profileId: 'kv20' },
      ],
    }));
    expect(elements).toHaveLength(2);
    expect(elements[0].id).toBe('prod_p1/element:mseg_1');

    const detail = elementToDetail(elements[1], 1, false, 'parent');
    expect(detail.geometry.metalProfileId).toBe('kv20');
    const parts = explodeDetails([detail], {
      detailLength: 0, detailWidth: 0, elementLength: 0, elementWidth: 0,
      interPartSpacing: 0, detailSmallCutout: 0, detailLargeCutout: 0,
      elementSmallCutout: 0, elementLargeCutout: 0, show: false, applyToImports: false,
    } as never);
    expect(parts).toHaveLength(1);
    expect(parts[0].width).toBe(500);
    expect(parts[0].name).toContain('Труба кв. 20×20×2');
  });

  it('nextSegmentId не повторює наявні', () => {
    expect(nextSegmentId({ metalSegments: [] })).toBe('1');
    expect(nextSegmentId({ metalSegments: [{ id: '1', length: 1, turn: 'up', angle: 90 }] })).toBe('2');
  });
});
