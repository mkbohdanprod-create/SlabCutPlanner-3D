import { describe, it, expect } from 'vitest';
import {
  normalizeEdgeTreatment,
  topProfileId,
  edgeTreatmentProfiles,
  edgeTreatmentProfileKinds,
  edgeTreatmentSpan,
  edgeTreatmentLengthMm,
  slicePolylineByLength,
} from '../edgeTreatment';

/**
 * Крайка живе у двох форматах, і головна небезпека — не «не прочитається»,
 * а «прочитається інакше»: старий рядок раптом почне рахуватись двома
 * проходами, або обробка на 300 мм піде в кошторис як повне ребро.
 */

describe('нормалізація крайки', () => {
  it('рядок — це ОДНЕ лицьове ребро, не два', () => {
    expect(normalizeEdgeTreatment('r2_top')).toEqual({ top: { profileId: 'r2_top' }, isFullLength: true });
    expect(edgeTreatmentProfiles('r2_top')).toEqual(['r2_top']);
  });

  it('порожнє значення не дає обробки', () => {
    expect(normalizeEdgeTreatment(undefined)).toBeUndefined();
    expect(edgeTreatmentProfiles(undefined)).toEqual([]);
    expect(edgeTreatmentProfiles({ isFullLength: true })).toEqual([]);
  });

  it('лицьове й тильне ребро — два проходи, навіть однаковим профілем', () => {
    const both = { top: { profileId: 'r2_top' }, bottom: { profileId: 'r2_top' }, linked: true };
    expect(edgeTreatmentProfiles(both)).toEqual(['r2_top', 'r2_top']);
    // Для позначки на кресленні важливий вид, а не кількість проходів
    expect(edgeTreatmentProfileKinds(both)).toEqual(['r2_top']);
  });

  it('linked без записаного bottom не вигадує другий прохід', () => {
    // `linked` — зручність редактора: він САМ пише bottom. Виводити тильне
    // ребро з прапорця означало б рахувати одне поле двома способами.
    expect(edgeTreatmentProfiles({ top: { profileId: 'r2_top' }, linked: true })).toEqual(['r2_top']);
  });

  it('topProfileId дістає профіль з обох форматів', () => {
    expect(topProfileId('h40')).toBe('h40');
    expect(topProfileId({ top: { profileId: 'h40' } })).toBe('h40');
    expect(topProfileId(undefined)).toBeUndefined();
  });
});

describe('ділянка обробки вздовж сторони', () => {
  it('за замовчуванням — уся сторона', () => {
    expect(edgeTreatmentSpan('r2_top', 1000)).toEqual({ from: 0, to: 1000 });
    expect(edgeTreatmentLengthMm({ top: { profileId: 'r2_top' }, isFullLength: true }, 1000)).toBe(1000);
  });

  it('довільна ділянка від лівого краю з відступом', () => {
    const t = { top: { profileId: 'r2_top' }, isFullLength: false, size: 300, offset: 100, align: 'left' as const };
    expect(edgeTreatmentSpan(t, 1000)).toEqual({ from: 100, to: 400 });
    expect(edgeTreatmentLengthMm(t, 1000)).toBe(300);
  });

  it('прив\'язка праворуч рахує відступ від дальнього краю', () => {
    const t = { top: { profileId: 'r2_top' }, isFullLength: false, size: 300, offset: 100, align: 'right' as const };
    expect(edgeTreatmentSpan(t, 1000)).toEqual({ from: 600, to: 900 });
  });

  it('прив\'язка по центру', () => {
    const t = { top: { profileId: 'r2_top' }, isFullLength: false, size: 400, align: 'center' as const };
    expect(edgeTreatmentSpan(t, 1000)).toEqual({ from: 300, to: 700 });
  });

  it('ділянка не вилазить за сторону — цех не отримає метрів, яких немає', () => {
    const tooLong = { top: { profileId: 'r2_top' }, isFullLength: false, size: 5000 };
    expect(edgeTreatmentLengthMm(tooLong, 800)).toBe(800);

    const pushedOut = { top: { profileId: 'r2_top' }, isFullLength: false, size: 300, offset: 900 };
    const span = edgeTreatmentSpan(pushedOut, 1000);
    expect(span.from).toBe(700);
    expect(span.to).toBe(1000);
  });

  it('нульовий розмір довільної ділянки — нуль роботи, а не вся сторона', () => {
    expect(edgeTreatmentLengthMm({ top: { profileId: 'r2_top' }, isFullLength: false, size: 0 }, 1000)).toBe(0);
  });
});

describe('обрізання ламаної під ділянку', () => {
  const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];

  it('повна ділянка повертає ламану як є', () => {
    expect(slicePolylineByLength(line, 0, 200)).toEqual(line);
  });

  it('серединна ділянка починається і закінчується на точних координатах', () => {
    const out = slicePolylineByLength(line, 50, 150);
    expect(out[0]).toEqual({ x: 50, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 150, y: 0 });
    // Проміжна вершина ламаної збережена
    expect(out).toContainEqual({ x: 100, y: 0 });
  });

  it('вироджені випадки не ламають виклик', () => {
    expect(slicePolylineByLength([{ x: 0, y: 0 }], 0, 10)).toHaveLength(1);
    const zero = slicePolylineByLength(line, 80, 80);
    expect(zero[0]).toEqual({ x: 80, y: 0 });
  });
});
