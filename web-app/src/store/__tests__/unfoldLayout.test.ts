import { describe, it, expect } from 'vitest';
import { flattenProductToDetails } from '../projectHelpers';
import { explodeDetails } from '../../engines/geometry';
import { autoPack } from '../../engines/packing';
import type { Product, Project, SlabInstance } from '../../domain/types';

/**
 * Розгортка доповнень у розкрої.
 *
 * Питання власника: чи знає розкрій, якою стороною деталь стикується з іншою.
 * Підворот у виробі — окремий Елемент, отже головний парт СВОЄЇ деталі, і
 * пакувальник довго не мав за що його зачепити: клав купкою збоку. Прив'язка
 * живе в `parentDetailId` + `parentDetailSide`; ці тести пильнують, щоб вона
 * доїжджала до партів і реально керувала розміщенням.
 */

const SLAB: SlabInstance = {
  id: 'slab-1',
  width: 3000,
  height: 2000,
  thickness: 20,
  material: 'Керамограніт',
  decor: 'White',
  comment: '',
  minMargin: 10,
  textureTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, opacity: 1 },
  defects: [],
  serialNumber: 'SN-1',
} as SlabInstance;

/** Стільниця 1200×600 з підворотами на всіх чотирьох сторонах. */
function tableWithFolds(): Product {
  const fold = (side: string, width: number) => ({
    id: `prod_x/element:fold_${side}`,
    type: 'Потовщення' as const,
    baseDefinition: { type: 'Потовщення', kind: 'rect', quantity: 1, thickness: 20, width, height: 100 } as any,
    joints: [],
    additions: [],
  });

  return {
    id: 'prod_x',
    name: 'Виріб',
    elements: [{
      id: 'prod_x/element:main',
      type: 'Стільниця',
      baseDefinition: { type: 'Стільниця', kind: 'rect', quantity: 1, thickness: 20, width: 1200, height: 600 } as any,
      joints: ['A', 'B', 'C', 'D'].map((side, index) => ({
        id: `j${index}`,
        origin: 'authored' as const,
        dominant: 'a' as const,
        type: 'miter45' as const,
        a: { elementPath: 'prod_x/element:main', sideId: side, from: 0, to: 100 },
        b: { elementPath: `prod_x/element:fold_${side}`, sideId: 'A', from: 0, to: 100 },
        textureContinuity: true,
      })),
      additions: [fold('A', 1200), fold('B', 600), fold('C', 1200), fold('D', 600)],
    }],
  };
}

describe('Розгортка доповнень у розкрої', () => {
  it('прив\'язка до сторони батька доїжджає до партів', () => {
    const parts = explodeDetails(flattenProductToDetails(tableWithFolds()));

    const main = parts.find((p) => p.type === 'Стільниця')!;
    expect(main.parentDetailSide).toBeUndefined();

    ['A', 'B', 'C', 'D'].forEach((side) => {
      const fold = parts.find((p) => p.name.includes(`(${side})`))!;
      expect(fold, `немає парта підвороту ${side}`).toBeDefined();
      expect(fold.parentDetailSide).toBe(side);
      expect(fold.parentDetailId).toBe(main.detailId);
      // Усі в одному текстурному кластері — інакше нестинг їх розведе.
      expect(fold.textureGroupLabel).toBe(main.textureGroupLabel);
    });
  });

  it('підворот лягає до СВОЄЇ сторони, а не просто поруч', () => {
    const parts = explodeDetails(flattenProductToDetails(tableWithFolds()));
    const project = {
      slabs: [SLAB], placements: [], details: [], products: [],
      textureLayouts: [], textureFrames: [], manualDimensions: [], unplacedPartIds: [],
    } as unknown as Project;

    const { placements, unplacedPartIds } = autoPack(project, parts, 'full_texture');
    expect(unplacedPartIds).toHaveLength(0);

    const box = (name: string) => {
      const part = parts.find((p) => (name === 'main' ? p.type === 'Стільниця' : p.name.includes(`(${name})`)))!;
      const placement = placements.find((pl) => pl.partId === part.id)!;
      expect(placement, `немає розміщення для ${name}`).toBeDefined();
      const rotated = placement.rotation === 90 || placement.rotation === 270;
      const width = rotated ? part.height : part.width;
      const height = rotated ? part.width : part.height;
      return { x: placement.x, y: placement.y, width, height };
    };

    const main = box('main');
    const a = box('A');
    const b = box('B');
    const c = box('C');
    const d = box('D');

    const overlapsX = (r: ReturnType<typeof box>) =>
      Math.min(r.x + r.width, main.x + main.width) - Math.max(r.x, main.x);
    const overlapsY = (r: ReturnType<typeof box>) =>
      Math.min(r.y + r.height, main.y + main.height) - Math.max(r.y, main.y);

    // A і C — на горизонтальних сторонах: тягнуться вздовж усієї ширини
    // стільниці й лежать по різні боки від неї.
    expect(overlapsX(a)).toBeGreaterThan(main.width * 0.9);
    expect(overlapsX(c)).toBeGreaterThan(main.width * 0.9);
    expect(Math.sign(a.y - main.y)).not.toEqual(Math.sign(c.y - main.y));

    // B і D — на вертикальних: повернені, тягнуться вздовж усієї глибини
    // і лежать по різні боки.
    expect(overlapsY(b)).toBeGreaterThan(main.height * 0.9);
    expect(overlapsY(d)).toBeGreaterThan(main.height * 0.9);
    expect(Math.sign(b.x - main.x)).not.toEqual(Math.sign(d.x - main.x));

    // Жоден підворот не залазить на стільницю.
    [a, b, c, d].forEach((r) => {
      const insideX = Math.min(r.x + r.width, main.x + main.width) - Math.max(r.x, main.x);
      const insideY = Math.min(r.y + r.height, main.y + main.height) - Math.max(r.y, main.y);
      expect(Math.min(insideX, insideY)).toBeLessThanOrEqual(0.01);
    });
  });
});
