import { describe, it, expect } from 'vitest';
import { cutoutBox, cornerAnchor, cutoutCenter, toCenterCutouts } from '../cutoutAnchor';
import { anchorContextFor } from '../elementToDetail';
import type { SurfaceCutout } from '../types';

/**
 * Прив'язка вирізу до кута деталі.
 *
 * Головне правило: користувач задає відстань від кута деталі до КУТА вирізу.
 * Рушій отримує центр. Якщо ці два числа розійдуться — на слябі буде діра
 * не там, де на ескізі.
 */

const rect = { shape: 'Прямокутна', geometry: { width: 2000, height: 600 } as never, width: 2000, height: 600 };

function cut(patch: Partial<SurfaceCutout>): SurfaceCutout {
  return {
    id: 'c1', shape: 'rect', type: 'custom', bindCorner: 'DA',
    x: 100, y: 100, width: 100, height: 100, ...patch,
  };
}

describe('cutoutBox — габарит вирізу', () => {
  it('прямокутник дає свої ширину й висоту', () => {
    expect(cutoutBox({ shape: 'rect', width: 300, height: 200 })).toEqual({ w: 300, h: 200 });
  });

  it('коло дає описаний квадрат зі стороною в діаметр', () => {
    expect(cutoutBox({ shape: 'circle', radius: 32.5 })).toEqual({ w: 65, h: 65 });
  });
});

describe('cornerAnchor — точка кута і напрямок усередину', () => {
  it('DA — лівий верхній, обидва напрямки додатні', () => {
    expect(cornerAnchor(rect, 'DA')).toEqual({ x: 0, y: 0, dirX: 1, dirY: 1 });
  });

  it('AB — правий верхній, по X ідемо вліво', () => {
    expect(cornerAnchor(rect, 'AB')).toEqual({ x: 2000, y: 0, dirX: -1, dirY: 1 });
  });

  it('BC — правий нижній, обидва напрямки відʼємні', () => {
    expect(cornerAnchor(rect, 'BC')).toEqual({ x: 2000, y: 600, dirX: -1, dirY: -1 });
  });

  it('CD — лівий нижній', () => {
    expect(cornerAnchor(rect, 'CD')).toEqual({ x: 0, y: 600, dirX: 1, dirY: -1 });
  });

  it('без прив’язки — нічого', () => {
    expect(cornerAnchor(rect, '')).toBeUndefined();
    expect(cornerAnchor(rect, 'НЕМАЄ_ТАКОГО')).toBeUndefined();
  });
});

describe('cutoutCenter — кут → центр', () => {
  it('від DA: центр глибше на пів габариту', () => {
    expect(cutoutCenter(cut({ bindCorner: 'DA' }), rect)).toEqual({ cx: 150, cy: 150 });
  });

  it('від AB: кут вирізу рівно за 100 мм від правого верхнього кута', () => {
    const { cx, cy } = cutoutCenter(cut({ bindCorner: 'AB' }), rect);
    expect({ cx, cy }).toEqual({ cx: 1850, cy: 150 });
    // Зворотна перевірка: найближчий до AB кут вирізу
    expect(2000 - (cx + 50)).toBe(100);
    expect(cy - 50).toBe(100);
  });

  it('від BC: обидві осі рахуються назад', () => {
    expect(cutoutCenter(cut({ bindCorner: 'BC' }), rect)).toEqual({ cx: 1850, cy: 450 });
  });

  it('від CD', () => {
    expect(cutoutCenter(cut({ bindCorner: 'CD' }), rect)).toEqual({ cx: 150, cy: 450 });
  });

  // Коло — виняток за рішенням власника: у нього немає кута, тому користувач
  // задає координату ЦЕНТРУ, як на кресленнях.
  it('коло: задане число і є центром, півдіаметр не додається', () => {
    const socket = cut({ shape: 'circle', radius: 32.5, width: undefined, height: undefined, bindCorner: 'DA', x: 50, y: 50 });
    expect(cutoutCenter(socket, rect)).toEqual({ cx: 50, cy: 50 });
  });

  it('коло від дальнього кута теж рахується до центру', () => {
    const socket = cut({ shape: 'circle', radius: 32.5, width: undefined, height: undefined, bindCorner: 'BC', x: 50, y: 50 });
    expect(cutoutCenter(socket, rect)).toEqual({ cx: 1950, cy: 550 });
  });

  it('прямокутник і коло з тими самими числами дають РІЗНІ центри — це навмисно', () => {
    const r = cutoutCenter(cut({ bindCorner: 'DA', x: 50, y: 50 }), rect);
    const c = cutoutCenter(cut({ shape: 'circle', radius: 50, width: undefined, height: undefined, bindCorner: 'DA', x: 50, y: 50 }), rect);
    expect(r).toEqual({ cx: 100, cy: 100 });
    expect(c).toEqual({ cx: 50, cy: 50 });
  });

  it('без прив’язки міряємо від лівого верхнього кута деталі (так лежить мийка)', () => {
    expect(cutoutCenter(cut({ bindCorner: '' }), rect)).toEqual({ cx: 150, cy: 150 });
  });

  it('виріз не вилазить за деталь при прив’язці до дальнього кута', () => {
    const { cx, cy } = cutoutCenter(cut({ bindCorner: 'BC', x: 0, y: 0 }), rect);
    expect(cx + 50).toBe(2000);
    expect(cy + 50).toBe(600);
  });
});

describe('toCenterCutouts — шлюз у рушій', () => {
  it('переводить усі вирізи і не втрачає решту полів', () => {
    const out = toCenterCutouts({
      a: cut({ id: 'a', bindCorner: 'DA', cornerRadius: 5, edgeProcessing: 'Фреза' }),
      b: cut({ id: 'b', bindCorner: 'AB' }),
    }, rect)!;
    expect(out.a.x).toBe(150);
    expect(out.a.cornerRadius).toBe(5);
    expect(out.a.edgeProcessing).toBe('Фреза');
    expect(out.b.x).toBe(1850);
  });

  it('порожню довідку віддає як є', () => {
    expect(toCenterCutouts(undefined, rect)).toBeUndefined();
  });

  it('Г-подібна форма бере кути зі спільного джерела імен', () => {
    const lShape = {
      shape: 'Г-подібна',
      geometry: { outerWidth: 2000, outerHeight: 600, innerHorizontal: 800, innerVertical: 300 } as never,
      width: 2000,
      height: 600,
    };
    // Кут A у Г-форми — правий верхній (outerWidth, 0)
    const anchor = cornerAnchor(lShape, 'A');
    expect(anchor?.x).toBe(2000);
    expect(anchor?.dirX).toBe(-1);
  });
});

describe('габарит контексту прив\'язки', () => {
  // Контур деталі, точки кутів (jointAnchorPoints) і контекст прив'язки
  // МУСЯТЬ брати габарит з тих самих полів. Розбіжність тут не зсуває виріз
  // на кілька міліметрів — вона перевертає напрямок «усередину деталі»,
  // і виріз від нижнього кута виїжджає за контур.
  const draft = (patch: Record<string, unknown>) => ({
    kind: 'rect', width: 1200, height: 600,
    outerWidth: 1200, outerHeight: 900,      // сміття з createDraft: сенс лише для Г-форми
    innerHorizontal: 500, innerVertical: 400,
    diameter: 800, ellipseWidth: 1200, ellipseHeight: 600,
    ...patch,
  } as never);

  it('прямокутник бере власні width/height, а не outerWidth/outerHeight', () => {
    const ctx = anchorContextFor(draft({ width: 1800, height: 450 }));
    expect(ctx.width).toBe(1800);
    expect(ctx.height).toBe(450);
  });

  it('низька деталь: від нижнього кута виріз іде ВГОРУ, а не за контур', () => {
    // Обшивка подіуму 1800×450 із заповненим outerHeight=900: раніше
    // 450 <= 900/2 давало напрямок «вниз» і виріз опинявся під деталлю.
    const panel = draft({ width: 1800, height: 450 });
    const anchor = cornerAnchor(anchorContextFor(panel), 'CD');
    expect(anchor?.y).toBe(450);
    expect(anchor?.dirY).toBe(-1);

    const slot: SurfaceCutout = {
      id: 'v', shape: 'rect', type: 'custom', bindCorner: 'CD',
      x: 20, y: 100, width: 1760, height: 12,
    };
    const { cy } = cutoutCenter(slot, anchorContextFor(panel));
    expect(cy).toBe(450 - 106);
    expect(cy).toBeGreaterThan(0);
    expect(cy).toBeLessThan(450);
  });

  it('Г-подібна далі бере outerWidth/outerHeight — там це і є габарит', () => {
    const ctx = anchorContextFor(draft({ kind: 'l', outerWidth: 2400, outerHeight: 1800 }));
    expect(ctx.width).toBe(2400);
    expect(ctx.height).toBe(1800);
  });

  it('коло і еліпс беруть свої габарити', () => {
    const circle = anchorContextFor(draft({ kind: 'circle', diameter: 900 }));
    expect(circle.width).toBe(900);
    expect(circle.height).toBe(900);
    const ellipse = anchorContextFor(draft({ kind: 'ellipse', ellipseWidth: 1400, ellipseHeight: 700 }));
    expect(ellipse.width).toBe(1400);
    expect(ellipse.height).toBe(700);
  });
});
