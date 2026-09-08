import { describe, it, expect } from 'vitest';
import { lcutEdgeLabels } from '../sideNaming';

/**
 * Б-002 (07.09.2026): ребра Г-зарізу — повноцінні сторони з власними
 * показуваними іменами. Ключ у даних (`CD_lcut1`) не перейменовується;
 * підпис — літера ПАРАЛЕЛЬНОЇ сторони + наскрізний номер по деталі.
 * Геометрія обох будівників контуру: lcut1 ∥ наступній стороні кута,
 * lcut2 ∥ попередній.
 */
describe('lcutEdgeLabels', () => {
  it('прямокутник, Г-заріз на CD: вертикальне ребро — D1, горизонтальне — C1', () => {
    const labels = lcutEdgeLabels({ CD: { type: 'l-cut' } }, 'rect');
    expect(labels).toEqual({ CD_lcut1: 'D1', CD_lcut2: 'C1' });
  });

  it('два зарізи на одній стороні: C дістає C1 (від BC) і C2 (від CD)', () => {
    const labels = lcutEdgeLabels(
      { BC: { type: 'l-cut' }, CD: { type: 'l-cut' } },
      'Прямокутна',
    );
    expect(labels).toEqual({
      BC_lcut1: 'C1',
      BC_lcut2: 'B1',
      CD_lcut1: 'D1',
      CD_lcut2: 'C2',
    });
  });

  it('нумерація йде канонічним порядком кутів, а не порядком у записі', () => {
    // Той самий набір кутів, але записаний навпаки — імена ті самі.
    const labels = lcutEdgeLabels(
      { CD: { type: 'l-cut' }, BC: { type: 'l-cut' } },
      'rect',
    );
    expect(labels.BC_lcut1).toBe('C1');
    expect(labels.CD_lcut2).toBe('C2');
  });

  it('Г-подібна, кут однією літерою: кут C лежить між сторонами C і D', () => {
    const labels = lcutEdgeLabels({ C: { type: 'l-cut' } }, 'Г-подібна');
    expect(labels).toEqual({ C_lcut1: 'D1', C_lcut2: 'C1' });
  });

  it('радіуси і фаски імен не отримують; без кутів — порожньо', () => {
    expect(lcutEdgeLabels({ CD: { type: 'radius' }, AB: { type: 'chamfer' } }, 'rect')).toEqual({});
    expect(lcutEdgeLabels(undefined, 'rect')).toEqual({});
  });
});
