import { describe, it, expect } from 'vitest';
import { buildDetailPath, buildElementPath, toSlot, findDetailByPathOrSlot } from '../ids';

// Ідентифікатор деталі існує у двох формах, і саме на цьому місці
// ламалось вікно «Параметри та список обробок»: меню в 3D віддавало
// слот, а деталі приходили повними шляхами.

describe('toSlot', () => {
  it('витягує слот із повного шляху', () => {
    expect(toSlot('prod_1/element:skirting_A/detail:main')).toBe('skirting_A');
    expect(toSlot(buildDetailPath('7', 'wall_panel_B', 'main'))).toBe('wall_panel_B');
  });

  it('головна деталь завжди main', () => {
    expect(toSlot('prod_1/element:main/detail:main')).toBe('main');
    expect(toSlot('main')).toBe('main');
    expect(toSlot(undefined)).toBe('main');
    expect(toSlot(null)).toBe('main');
  });

  it('короткий слот лишається собою', () => {
    expect(toSlot('skirting_A')).toBe('skirting_A');
  });

  it('шлях елемента теж дає слот', () => {
    expect(toSlot(buildElementPath('7', 'leg_C'))).toBe('leg_C');
  });
});

describe('findDetailByPathOrSlot', () => {
  const details = [
    { id: 'prod_1/element:main/detail:main', label: 'Стільниця' },
    { id: 'prod_1/element:skirting_A/detail:main', label: 'Підворот A' },
    { id: 'prod_1/element:wall_panel_B/detail:main', label: 'Стінова панель B' },
  ];

  it('знаходить за повним шляхом', () => {
    expect(findDetailByPathOrSlot(details, 'prod_1/element:skirting_A/detail:main')?.label).toBe('Підворот A');
  });

  it('знаходить за коротким слотом — саме через це не відкривалось вікно', () => {
    expect(findDetailByPathOrSlot(details, 'skirting_A')?.label).toBe('Підворот A');
    expect(findDetailByPathOrSlot(details, 'wall_panel_B')?.label).toBe('Стінова панель B');
  });

  it('main знаходить головну деталь', () => {
    expect(findDetailByPathOrSlot(details, 'main')?.label).toBe('Стільниця');
  });

  it('точний збіг має пріоритет над збігом за слотом', () => {
    const mixed = [
      { id: 'skirting_A', label: 'Коротка форма' },
      { id: 'prod_1/element:skirting_A/detail:main', label: 'Повна форма' },
    ];
    expect(findDetailByPathOrSlot(mixed, 'skirting_A')?.label).toBe('Коротка форма');
  });

  it('нічого не знайшлось — undefined, а не виняток', () => {
    expect(findDetailByPathOrSlot(details, 'leg_Z')).toBeUndefined();
    expect(findDetailByPathOrSlot([], 'main')).toBeUndefined();
    expect(findDetailByPathOrSlot(undefined, 'main')).toBeUndefined();
    expect(findDetailByPathOrSlot(details, '')).toBeUndefined();
  });
});
