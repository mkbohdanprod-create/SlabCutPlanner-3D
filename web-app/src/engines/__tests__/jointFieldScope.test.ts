/**
 * №141 — стик ріже СВОЄ поле, а не всю деталь.
 *
 * Власник спіймав це на 3D: у редакторі стик показаний у лівому виступі
 * П-подібної, а розкрій різав заодно й праву ногу — «по факту ріже всю
 * стільницю навпіл». Наскрізна пряма різала кожен шматок, крізь який
 * проходила. Тепер стик знає пару сторін, між якими стоїть, і різ адресний.
 */
import { describe, it, expect } from 'vitest';
import { explodeDetails } from '../geometry';
import type { Detail } from '../../domain/types';

const base = { type: 'Стільниця', quantity: 1, thickness: 20 } as const;

/** П 2400×1200, виріз 1200×600 знизу по центру: ноги 600 завширшки. */
const uGeometry = {
  width: 2400,
  height: 1200,
  leftLegHeight: 1200,
  rightLegHeight: 1200,
  innerCutWidth: 1200,
  innerCutDepth: 600,
  innerCutOffset: 600,
  innerCutSide: 'bottom' as const,
  wholeDetail: false,
};

const mainParts = (details: Detail[]) => explodeDetails(details).filter((part) => part.isMain);

describe('стик ріже лише поле своєї пари', () => {
  it('горизонтальний стик між H і F ділить ЛИШЕ ліву ногу → 2 деталі', () => {
    const detail: Detail = {
      ...base, id: 'u-field', shape: 'П-подібна', label: 'Виріб',
      geometry: {
        ...uGeometry,
        manualJoints: [{
          id: 'j1', axis: 'horizontal', anchorCorner: 'G', offset: 300,
          sideId: 'H', oppositeSideId: 'F',
        }],
      },
    } as Detail;

    expect(mainParts([detail])).toHaveLength(2);
  });

  it('той самий стик БЕЗ пари поводиться як раніше (стара поведінка не зрушена)', () => {
    const detail: Detail = {
      ...base, id: 'u-through', shape: 'П-подібна', label: 'Виріб',
      geometry: {
        ...uGeometry,
        manualJoints: [{ id: 'j1', axis: 'horizontal', anchorCorner: 'G', offset: 300 }],
      },
    } as Detail;

    expect(mainParts([detail])).toHaveLength(2);
  });

  it('два стики на одній висоті в різних ногах — два різи, не один', () => {
    const detail: Detail = {
      ...base, id: 'u-two', shape: 'П-подібна', label: 'Виріб',
      geometry: {
        ...uGeometry,
        manualJoints: [
          { id: 'j1', axis: 'horizontal', anchorCorner: 'G', offset: 300, sideId: 'H', oppositeSideId: 'F' },
          { id: 'j2', axis: 'horizontal', anchorCorner: 'C', offset: 300, sideId: 'D', oppositeSideId: 'B' },
        ],
      },
    } as Detail;

    expect(mainParts([detail])).toHaveLength(3);
  });

  it('стик між H і B ріже верхню смугу наскрізь → 2 деталі', () => {
    const detail: Detail = {
      ...base, id: 'u-bar', shape: 'П-подібна', label: 'Виріб',
      geometry: {
        ...uGeometry,
        manualJoints: [{
          id: 'j1', axis: 'horizontal', anchorCorner: 'start', offset: 300,
          sideId: 'H', oppositeSideId: 'B',
        }],
      },
    } as Detail;

    expect(mainParts([detail])).toHaveLength(2);
  });
});
