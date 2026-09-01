import { describe, expect, it } from 'vitest';
import {
  MATERIAL_THICKNESSES,
  materialsForNewProduct,
  thicknessesFor,
  isThicknessAllowed,
  allowsManualThickness,
  defaultThicknessFor,
  MANUAL_THICKNESS_RANGE,
  thicknessUsageFor,
  usageRangesFor,
  thicknessTypeHint,
} from '../materialThickness';

/** Таблиця товщин за матеріалом — рішення власника 01.09.2026. */
describe('товщини за матеріалом', () => {
  it('перелік точно як у рішенні 01.09', () => {
    expect(MATERIAL_THICKNESSES['Керамограніт']).toEqual([2, 3, 4, 5, 6, 9, 12, 20]);
    expect(MATERIAL_THICKNESSES['Натуральний камінь']).toEqual([20]);
    expect(MATERIAL_THICKNESSES['Кварцит']).toEqual([12, 20, 30]);
    expect(MATERIAL_THICKNESSES['Акрил']).toEqual([12]);
    expect(MATERIAL_THICKNESSES['Компакт-плита']).toEqual([]);
  });

  it('компакт-плита не пропонується при створенні виробу', () => {
    const list = materialsForNewProduct();
    expect(list).not.toContain('Компакт-плита');
    expect(list).toEqual(['Керамограніт', 'Кварцит', 'Натуральний камінь', 'Акрил']);
  });

  it('кварцит 40 — не плита, а 20 + потовщення: у переліку його немає', () => {
    expect(isThicknessAllowed('Кварцит', 40)).toBe(false);
    expect(isThicknessAllowed('Кварцит', 30)).toBe(true);
  });

  it('керамограніт: 2 мм можна, 10 — ні', () => {
    expect(isThicknessAllowed('Керамограніт', 2)).toBe(true);
    expect(isThicknessAllowed('Керамограніт', 10)).toBe(false);
  });

  it('натуральний камінь: 20 з переліку, своя — у межах здорового глузду', () => {
    expect(allowsManualThickness('Натуральний камінь')).toBe(true);
    expect(allowsManualThickness('Керамограніт')).toBe(false);
    expect(isThicknessAllowed('Натуральний камінь', 20)).toBe(true);
    expect(isThicknessAllowed('Натуральний камінь', 27)).toBe(true);
    expect(isThicknessAllowed('Натуральний камінь', MANUAL_THICKNESS_RANGE.min - 1)).toBe(false);
    expect(isThicknessAllowed('Натуральний камінь', MANUAL_THICKNESS_RANGE.max + 1)).toBe(false);
  });

  it('без матеріалу (старий проєкт) — не обмежуємо', () => {
    expect(isThicknessAllowed(undefined, 40)).toBe(true);
    expect(thicknessesFor(undefined)).toEqual([]);
  });

  it('замовчування: 20 де є, інакше перша з переліку', () => {
    expect(defaultThicknessFor('Керамограніт')).toBe(20);
    expect(defaultThicknessFor('Кварцит')).toBe(20);
    expect(defaultThicknessFor('Акрил')).toBe(12);
    expect(defaultThicknessFor(null)).toBe(20);
  });
});

describe('підказки про товщину (керамограніт)', () => {
  it('діапазони — слова власника: 2–3 облицювання, 4–12 панелі, 12–20 стільниці', () => {
    const hints = thicknessUsageFor('Керамограніт');
    expect(hints.map((h) => [h.min, h.max])).toEqual([[2, 3], [4, 12], [12, 20]]);
    expect(thicknessUsageFor('Кварцит')).toEqual([]);
  });

  it('12 мм — і панель, і стільниця (в обох діапазонах)', () => {
    expect(usageRangesFor('Керамограніт', 12).length).toBe(2);
    expect(thicknessTypeHint('Керамограніт', 12, 'Стільниця')).toBeUndefined();
    expect(thicknessTypeHint('Керамограніт', 12, 'Стінова панель')).toBeUndefined();
  });

  it('стільниця на 3 мм — м\'яка підказка з рідним діапазоном', () => {
    const hint = thicknessTypeHint('Керамограніт', 3, 'Стільниця');
    expect(hint).toContain('3 мм');
    expect(hint).toContain('облицювання');
    expect(hint).toContain('12–20 мм');
  });

  it('фасад на 2 мм — рідна товщина, підказки нема; для кварциту підказок нема взагалі', () => {
    expect(thicknessTypeHint('Керамограніт', 2, 'Фасад')).toBeUndefined();
    expect(thicknessTypeHint('Кварцит', 12, 'Фасад')).toBeUndefined();
  });
});
