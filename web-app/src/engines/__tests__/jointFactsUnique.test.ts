// =====================================================================
//  Сторож: стики РІЗНИХ виробів не склеюються в один факт.
//
//  Знайдено 03.09.2026 на реальному кейсі 81-1750325: два вироби, у
//  кожного стінова панель на стороні A. Редактор давав обом стикам ім'я
//  від слота — `joint_wall_panel_A`, — а `extractProductionFacts`
//  дедуплікував факти за цим іменем глобально. Другий стик мовчки зникав:
//  цех клеїв 1.821 м і різав шов, компанія їх не виставляла.
//
//  Тест перевіряє саме цю ситуацію — однакові імена стиків у різних
//  виробах, — і що фактів усе одно два, із сумарною довжиною обох.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { extractProductionFacts } from '../productionFacts';
import { createEmptyProject } from '../../domain/defaults';
import type { Project, Product } from '../../domain/types';

const productWithPanelJoint = (productId: string, contactMm: number): Product => ({
  id: productId,
  name: `Виріб ${productId}`,
  material: 'Керамограніт',
  elements: [
    {
      id: `prod_${productId}/element:main`,
      type: 'Стільниця',
      baseDefinition: { type: 'Стільниця', kind: 'rect', width: 2000, height: 600, thickness: 12 } as never,
      additions: [],
      joints: [{
        // САМЕ ТУТ була пастка: ім'я від слота, однакове в обох виробах.
        id: 'joint_wall_panel_A',
        origin: 'authored',
        a: { elementPath: `prod_${productId}/element:main`, sideId: 'A', from: 0, to: contactMm },
        b: { elementPath: `prod_${productId}/element:wall_panel_A`, sideId: 'C', from: 0, to: contactMm },
        type: 'butt',
        dominant: 'a',
        textureContinuous: false,
      } as never],
    },
    {
      id: `prod_${productId}/element:wall_panel_A`,
      type: 'Стінова панель',
      baseDefinition: { type: 'Стінова панель', kind: 'rect', width: contactMm, height: 600, thickness: 5 } as never,
      additions: [],
      joints: [],
    },
  ],
} as unknown as Product);

describe('стики різних виробів з однаковим ім\'ям', () => {
  const project: Project = {
    ...createEmptyProject(),
    products: [productWithPanelJoint('st2', 1240), productWithPanelJoint('st3', 1821)],
  } as Project;

  const facts = extractProductionFacts(project, [], { details: [] });
  const lengths = facts.filter((f) => f.kind === 'joint_length');
  const counts = facts.filter((f) => f.kind === 'joint_count');

  it('обидва стики дають факт довжини', () => {
    expect(lengths.length).toBe(2);
  });

  it('сумарна довжина — обох стиків, а не одного', () => {
    const total = lengths.reduce((sum, f) => sum + f.qty, 0);
    // 1.240 + 1.821 = 3.061 м. До виправлення тут було 1.24 — другий стик
    // випадав, бо мав те саме ім'я.
    expect(Number(total.toFixed(3))).toBe(3.061);
  });

  it('стиків порахувалось два', () => {
    expect(counts.reduce((sum, f) => sum + f.qty, 0)).toBe(2);
  });

  it('той самий стик двічі в обході — усе одно один факт', () => {
    // Дедуплікація має лишитись робочою: ключ тепер адресний, але для
    // одного й того самого стику на тому самому елементі він однаковий.
    const single: Project = {
      ...createEmptyProject(),
      products: [productWithPanelJoint('st2', 1240)],
    } as Project;
    const f = extractProductionFacts(single, [], { details: [] })
      .filter((x) => x.kind === 'joint_length');
    expect(f.length).toBe(1);
  });
});
