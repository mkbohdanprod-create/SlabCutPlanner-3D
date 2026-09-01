import { describe, it, expect } from 'vitest';
import { visibleBaseDesigns, baseDesigns } from '../draftHelpers';

/**
 * Історія: 10.08 коло та еліпс були сховані від менеджера («цех поки не
 * бере в роботу»). 01.09 власник повернув їх усім: «Добав круглу та
 * овальну стільницю». Механізм адмінських форм лишився (список порожній),
 * і його пастка досі актуальна: форма ВЖЕ створеної деталі має лишатись у
 * списку, інакше редагування мовчки скине її на прямокутник.
 */

const kinds = (list: ReturnType<typeof visibleBaseDesigns>) => list.map((d) => d.kind);

describe('видимі базові форми', () => {
  it('менеджер бачить усі п\'ять форм: прямокутна, кругла, овальна, Г, П', () => {
    expect(kinds(visibleBaseDesigns(false))).toEqual(['rect', 'circle', 'ellipse', 'l', 'u']);
  });

  it('супер-адмін бачить те саме', () => {
    expect(kinds(visibleBaseDesigns(true))).toEqual(kinds(baseDesigns));
  });

  it('підписи кола й овалу — як у DetailShape: «Кругла», «Овальна»', () => {
    const byKind = Object.fromEntries(baseDesigns.map((d) => [d.kind, d]));
    expect(byKind.circle.label).toBe('Кругла');
    expect(byKind.circle.shape).toBe('Кругла');
    expect(byKind.ellipse.label).toBe('Овальна');
    expect(byKind.ellipse.shape).toBe('Овальна');
  });

  it('форма наявної деталі лишається в списку завжди', () => {
    expect(kinds(visibleBaseDesigns(false, 'circle'))).toContain('circle');
    expect(kinds(visibleBaseDesigns(false, 'ellipse'))).toContain('ellipse');
  });

  it('прямокутник доступний завжди — з нього починається будь-який виріб', () => {
    [true, false].forEach((admin) => {
      expect(kinds(visibleBaseDesigns(admin))).toContain('rect');
    });
  });
});
