/**
 * FG-10 — «не дає зберегти вузьку деталь: вимагає мінімум 150 мм».
 *
 * Хвороба була не в числі, а в тому, що число заборонялó. Смуга 2800×32
 * не заводилась узагалі, хоча цех такі ріже. Тести пиляють дві обіцянки:
 * поріг береться з налаштувань окремо під матеріал, і нуль означає
 * «не попереджати», а не «попереджати завжди».
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_MIN_SIDE_MM, minSideMmFor } from '../manufacturability';

describe('FG-10 · поріг короткої сторони', () => {
  it('без налаштувань поводиться як раніше — 150 мм', () => {
    expect(DEFAULT_MIN_SIDE_MM).toBe(150);
    expect(minSideMmFor('Керамограніт')).toBe(150);
    expect(minSideMmFor('Керамограніт', {})).toBe(150);
    expect(minSideMmFor(undefined, { 'Керамограніт': 40 })).toBe(150);
  });

  it('поріг задається окремо під кожен матеріал', () => {
    const book = { 'Керамограніт': 200, 'Акрил': 40 };
    expect(minSideMmFor('Керамограніт', book)).toBe(200);
    expect(minSideMmFor('Акрил', book)).toBe(40);
    // Матеріал, якого в налаштуваннях немає, лишається на замовчуванні.
    expect(minSideMmFor('Кварцит', book)).toBe(150);
  });

  it('нуль — це «не попереджати», а не «попереджати завжди»', () => {
    expect(minSideMmFor('Акрил', { 'Акрил': 0 })).toBe(0);
  });

  it('сміття в налаштуваннях не ламає перевірку', () => {
    expect(minSideMmFor('Акрил', { 'Акрил': Number.NaN })).toBe(150);
    expect(minSideMmFor('Акрил', { 'Акрил': Infinity })).toBe(150);
  });
});
