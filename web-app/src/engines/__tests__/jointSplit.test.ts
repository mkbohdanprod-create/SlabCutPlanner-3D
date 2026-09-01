/**
 * Хвиля 1 — «стик = розріз».
 *
 * Найдешевший спосіб перевірити найдорожчу обіцянку: якщо на деталі стоїть
 * стик, у карту крою мають поїхати ДВІ деталі, а не одна. Поки цього тесту не
 * було, зламатись міг будь-хто з ланцюга (контур → промінь → різ кільця →
 * парти), і ніхто б не помітив: у 3D пунктир малюється окремим кодом і
 * виглядає правильно навіть тоді, коли розкрій різу не зробив.
 */
import { describe, it, expect } from 'vitest';
import { explodeDetails } from '../geometry';
import type { Detail } from '../../domain/types';

const base = {
  type: 'Стільниця',
  quantity: 1,
  thickness: 20,
} as const;

/** Тільки основні парти виробу — без кромок, підворотів і потовщень. */
const mainParts = (details: Detail[]) => explodeDetails(details).filter((part) => part.isMain);

describe('стик має давати реальний розріз', () => {
  it('Г-подібна 2000×1200 з вертикальним стиком у куті → дві деталі', () => {
    const detail: Detail = {
      ...base,
      id: 'g-1',
      shape: 'Г-подібна',
      label: 'Виріб',
      geometry: {
        outerWidth: 2000,
        outerHeight: 1200,
        innerHorizontal: 900,
        innerVertical: 500,
        jointDirection: 'vertical',
      },
    } as Detail;

    const parts = mainParts([detail]);
    expect(parts).toHaveLength(2);
  });

  it('Г-подібна без стику лишається однією деталлю', () => {
    const detail: Detail = {
      ...base,
      id: 'g-2',
      shape: 'Г-подібна',
      label: 'Виріб',
      geometry: {
        outerWidth: 2000,
        outerHeight: 1200,
        innerHorizontal: 900,
        innerVertical: 500,
        wholeDetail: true,
      },
    } as Detail;

    expect(mainParts([detail])).toHaveLength(1);
  });

  it('прямокутна 3200×600 з довільним вертикальним стиком → дві деталі', () => {
    const detail: Detail = {
      ...base,
      id: 'r-1',
      shape: 'Прямокутна',
      label: 'Стільниця',
      geometry: {
        width: 3200,
        height: 600,
        manualJoints: [{ id: 'mj-1', axis: 'vertical', anchorCorner: 'DA', offset: 1600 }],
      },
    } as Detail;

    const parts = mainParts([detail]);
    expect(parts).toHaveLength(2);
  });

  it('розріз ділить площу, а не додає її', () => {
    const detail: Detail = {
      ...base,
      id: 'r-2',
      shape: 'Прямокутна',
      label: 'Стільниця',
      geometry: {
        width: 3200,
        height: 600,
        manualJoints: [{ id: 'mj-1', axis: 'vertical', anchorCorner: 'DA', offset: 1600 }],
      },
    } as Detail;

    const parts = mainParts([detail]);
    const widths = parts.map((part) => part.width).sort((a, b) => a - b);
    // Припуск на різ додає кілька міліметрів, тому не рівність, а околиця.
    expect(widths.reduce((sum, w) => sum + w, 0)).toBeGreaterThan(3190);
    expect(widths.reduce((sum, w) => sum + w, 0)).toBeLessThan(3260);
  });
});

/**
 * Другий контур перевірки — від редактора, а не від готової деталі.
 *
 * Саме тут FG-20: користувач ставить стик у куті Г-форми, у 3D зʼявляється
 * пунктир, а в карту крою деталь їде цілою. Різ у рушії робочий (тести вище),
 * тож ламатись могло тільки по дорозі «чернетка → елемент → деталь».
 */
describe('стик доживає від редактора до розкрою', () => {
  it('Г-форма з кутовим стиком: чернетка → елемент → деталь → два парти', async () => {
    const { createDraft } = await import('../../components/forms/utils/draftHelpers');
    const { elementToDetail } = await import('../../domain/elementToDetail');

    const draft = {
      ...createDraft(),
      kind: 'l' as const,
      outerWidth: 2000,
      outerHeight: 1200,
      innerHorizontal: 900,
      innerVertical: 500,
      jointDirection: 'vertical' as const,
    };

    const element = {
      id: 'prod_1:main',
      type: draft.type,
      baseDefinition: draft,
      additions: [],
      joints: [],
    } as never;

    const detail = elementToDetail(element, 1, true);
    expect(detail.shape).toBe('Г-подібна');
    expect(detail.geometry.jointDirection).toBe('vertical');
    expect(detail.geometry.wholeDetail).toBeFalsy();

    expect(mainParts([detail])).toHaveLength(2);
  });

  it('прямокутна з довільним стиком: чернетка → елемент → деталь → два парти', async () => {
    const { createDraft } = await import('../../components/forms/utils/draftHelpers');
    const { elementToDetail } = await import('../../domain/elementToDetail');

    const draft = {
      ...createDraft(),
      kind: 'rect' as const,
      width: 3200,
      height: 600,
      manualJoints: [{ id: 'mj-1', axis: 'vertical' as const, anchorCorner: 'DA', offset: 1600 }],
    };

    const element = {
      id: 'prod_1:main',
      type: draft.type,
      baseDefinition: draft,
      additions: [],
      joints: [],
    } as never;

    const detail = elementToDetail(element, 1, true);
    expect(detail.geometry.manualJoints).toHaveLength(1);
    expect(detail.geometry.wholeDetail).toBeFalsy();

    expect(mainParts([detail])).toHaveLength(2);
  });
});

/**
 * FG-17 і FG-07 — кілька стиків на одній деталі.
 *
 * Обидва зауваження фокус-групи виявились однією поламаною ланкою:
 * `splitContourByJoints` застосовував кожен різ рівно до ОДНОГО шматка і
 * зупинявся. Для одного стику це непомітно, для двох — хрест давав три
 * деталі замість чотирьох.
 */
describe('кілька стиків на одній деталі', () => {
  const rect = (id: string, width: number, height: number, joints: unknown[]): Detail => ({
    ...base,
    id,
    shape: 'Прямокутна',
    label: 'Стільниця',
    geometry: { width, height, manualJoints: joints },
  } as unknown as Detail);

  it('FG-17: вертикальний + горизонтальний дають чотири деталі, а не три', () => {
    const parts = mainParts([rect('cross', 3000, 1400, [
      { id: 'v', axis: 'vertical', anchorCorner: 'DA', offset: 1500 },
      { id: 'h', axis: 'horizontal', anchorCorner: 'DA', offset: 700 },
    ])]);

    expect(parts).toHaveLength(4);
    // Хрест посередині: усі чотири шматки однакові.
    for (const part of parts) {
      expect(part.width).toBeGreaterThan(1490);
      expect(part.width).toBeLessThan(1530);
      expect(part.height).toBeGreaterThan(690);
      expect(part.height).toBeLessThan(730);
    }
  });

  it('два паралельних стики дають три деталі', () => {
    const parts = mainParts([rect('triple', 4500, 600, [
      { id: 'a', axis: 'vertical', anchorCorner: 'DA', offset: 1500 },
      { id: 'b', axis: 'vertical', anchorCorner: 'DA', offset: 3000 },
    ])]);

    expect(parts).toHaveLength(3);
  });

  it('FG-07: два стики на тому самому місці — це один різ, а не деталь-волосина', () => {
    const parts = mainParts([rect('dup', 3000, 600, [
      { id: 'a', axis: 'vertical', anchorCorner: 'DA', offset: 1500 },
      { id: 'b', axis: 'vertical', anchorCorner: 'DA', offset: 1500 },
    ])]);

    expect(parts).toHaveLength(2);
    for (const part of parts) {
      expect(part.width).toBeGreaterThan(1000);
    }
  });
});

/**
 * FG-20 у чистому вигляді: збережений проєкт, у якому стоять ОБИДВА прапорці
 * — «деталь цілком» і напрямок стику. Так виглядають виробі, заведені до
 * появи перевірки в редакторі. У 3D пунктир видно, а в цех їхала ціла плита.
 */
describe('стик сильніший за прапорець «деталь цілком»', () => {
  it('Г-форма з wholeDetail і стиком одночасно — все одно ріжеться', () => {
    const detail: Detail = {
      ...base,
      id: 'legacy',
      shape: 'Г-подібна',
      label: 'Виріб',
      geometry: {
        outerWidth: 2000,
        outerHeight: 1200,
        innerHorizontal: 900,
        innerVertical: 500,
        wholeDetail: true,
        jointDirection: 'vertical',
      },
    } as Detail;

    expect(mainParts([detail])).toHaveLength(2);
  });

  it('прямокутна з wholeDetail і довільним стиком — теж ріжеться', () => {
    const detail: Detail = {
      ...base,
      id: 'legacy-rect',
      shape: 'Прямокутна',
      label: 'Стільниця',
      geometry: {
        width: 3200,
        height: 600,
        wholeDetail: true,
        manualJoints: [{ id: 'mj', axis: 'vertical', anchorCorner: 'DA', offset: 1600 }],
      },
    } as unknown as Detail;

    expect(mainParts([detail])).toHaveLength(2);
  });
});
