import { describe, it, expect } from 'vitest';
import { normalizeProject } from '../projectHelpers';
import type { Project } from '../../domain/types';

// Нога (опора) клеїться під 45° — «водоспад». Старі проєкти несуть на
// стику ноги type:'butt' зі старого дефолту редактора; інтерфейс вибору
// типу стику не мав, тож міграція не може перетерти свідомий вибір.

const joint = (id: string, type: string) => ({
  id,
  origin: 'authored',
  a: { elementPath: 'prod_1/element:main', sideId: 'A', from: 0, to: 900 },
  b: { elementPath: `prod_1/element:${id.replace('joint_', '')}`, sideId: 'A', from: 0, to: 900 },
  type,
  dominant: 'a',
  textureContinuity: false,
});

const projectWith = (joints: unknown[], nestedJoints: unknown[] = []): Project => ({
  id: 'proj',
  orderNumber: 'test',
  details: [],
  slabs: [],
  placements: [],
  products: [{
    id: 'prod_1',
    name: 'Виріб',
    elements: [{
      id: 'prod_1/element:main',
      type: 'Стільниця',
      additions: [{
        id: 'prod_1/element:sub',
        type: 'Підворот',
        additions: [],
        joints: nestedJoints,
      }],
      joints,
    }],
  }],
} as unknown as Project);

describe('міграція стиків ноги', () => {
  it('стик ноги butt стає miter45', () => {
    const next = normalizeProject(projectWith([joint('joint_leg_A', 'butt')]));
    expect((next.products[0].elements[0].joints[0] as { type: string }).type).toBe('miter45');
  });

  it('стики панелі, бортика і підворотів не чіпаються', () => {
    const next = normalizeProject(projectWith([
      joint('joint_wall_panel_F', 'butt'),
      joint('joint_skirting_B', 'glued'),
      joint('joint_fold_C', 'miter45'),
    ]));
    const types = next.products[0].elements[0].joints.map((item) => (item as { type: string }).type);
    expect(types).toEqual(['butt', 'glued', 'miter45']);
  });

  it('міграція заходить і у вкладені доповнення', () => {
    const next = normalizeProject(projectWith([], [joint('joint_leg_B', 'butt')]));
    const nested = (next.products[0].elements[0] as unknown as {
      additions: { joints: { type: string }[] }[];
    }).additions[0].joints[0];
    expect(nested.type).toBe('miter45');
  });

  it('повторна нормалізація нічого не змінює', () => {
    const once = normalizeProject(projectWith([joint('joint_leg_A', 'butt')]));
    const twice = normalizeProject(once);
    expect(twice.products[0].elements[0].joints[0]).toEqual(once.products[0].elements[0].joints[0]);
  });
});
