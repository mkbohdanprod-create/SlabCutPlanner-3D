/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { sideOptionsFor, supportsEdges } from '../FormsPanel';
import type { DetailType } from '../../../domain/types';

// Редактор сторін мусить показувати рівно ті сторони, які є у форми,
// і давати редагувати розміри всім плоским деталям — інакше стінову
// панель неможливо змінити (саме так вона й «застрягала» на 1200×600).

describe('sideOptionsFor', () => {
  it('прямокутник — чотири сторони, а не вісім', () => {
    expect(sideOptionsFor('rect')).toEqual(['A', 'B', 'C', 'D']);
  });

  it('Г-подібна — шість, П-подібна — вісім', () => {
    expect(sideOptionsFor('l')).toHaveLength(6);
    expect(sideOptionsFor('u')).toHaveLength(8);
  });
});

describe('supportsEdges', () => {
  it('стінова панель, фасад і довільний елемент мають таблицю розмірів', () => {
    (['Стінова панель', 'Фасад', 'Довільний елемент'] as DetailType[]).forEach((type) => {
      expect(supportsEdges(type), type).toBe(true);
    });
  });

  it('стільниця й опора — як і раніше', () => {
    expect(supportsEdges('Стільниця' as DetailType)).toBe(true);
    expect(supportsEdges('Опора' as DetailType)).toBe(true);
  });

  it('мийка має власний конструктор — таблиці сторін не показуємо', () => {
    expect(supportsEdges('Мийка' as DetailType)).toBe(false);
  });
});
