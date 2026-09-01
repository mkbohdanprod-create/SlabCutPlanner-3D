import { describe, it, expect } from 'vitest';
import { analyseSlabPixels, cornerTriangle, inflateCornerCut, usableAreaPolygon } from '../slabOutline';

/**
 * Контур натурального слеба з фото (27.08).
 *
 * Головне, що охороняють ці тести, — різниця між ПОРОЖНЕЧЕЮ і ТЕМНИМ
 * КАМЕНЕМ. Прожилки в камені бувають чорніші за фон; якщо рахувати їх
 * фоном, зріз кута роздувається в рази і програма викидає придатний
 * матеріал. На реальному фото ця помилка давала 29% втрат замість 6%.
 */

/** Кадр: усе камінь, далі домальовуємо порожнечу */
function frame(w: number, h: number, paint?: (x: number, y: number) => 'stone' | 'void') {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const isVoid = paint?.(x, y) === 'void';
      const value = isVoid ? 0 : 180;
      data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
    }
  }
  return { data, w, h };
}

describe('контур слеба з фото', () => {
  it('рівний лист без порожнечі — контур не потрібен', () => {
    const { data, w, h } = frame(120, 80);
    expect(analyseSlabPixels(data, w, h)).toBeNull();
  });

  it('відкушений верхній лівий кут — зріз знайдено', () => {
    // Трикутник порожнечі: 30% ширини × 40% висоти
    const { data, w, h } = frame(120, 80, (x, y) => (x / 36 + y / 32 < 1 ? 'void' : 'stone'));
    const outline = analyseSlabPixels(data, w, h);
    expect(outline).not.toBeNull();
    const cut = outline!.corners.find((c) => c.corner === 'TL');
    expect(cut).toBeDefined();
    // Зріз покриває реальну порожнечу і не роздутий більш ніж на чверть
    expect(cut!.along).toBeGreaterThanOrEqual(0.29);
    expect(cut!.along).toBeLessThan(0.4);
    expect(cut!.down).toBeGreaterThanOrEqual(0.39);
    expect(cut!.down).toBeLessThan(0.55);
    // Інші кути цілі
    expect(outline!.corners.map((c) => c.corner)).toEqual(['TL']);
  });

  it('ТЕМНА ПРОЖИЛКА ВСЕРЕДИНІ КАМЕНЮ — НЕ порожнеча', () => {
    // Чорна пляма в центрі, до краю не дотикається: це малюнок каменю
    const { data, w, h } = frame(120, 80, (x, y) =>
      (x > 40 && x < 70 && y > 30 && y < 50 ? 'void' : 'stone'));
    expect(analyseSlabPixels(data, w, h)).toBeNull();
  });

  it('прожилка, що йде від краю всередину, не роздуває зріз кута', () => {
    // Скол у куті + вузька темна смуга від правого краю до середини
    const { data, w, h } = frame(120, 80, (x, y) => {
      if (x / 24 + y / 16 < 1) return 'void';           // скол у TL
      if (y > 38 && y < 42 && x > 80) return 'void';     // смуга від правого краю
      return 'stone';
    });
    const outline = analyseSlabPixels(data, w, h)!;
    const tl = outline.corners.find((c) => c.corner === 'TL')!;
    // Смуга праворуч належить іншій половині кадру і зріз TL не чіпає
    expect(tl.along).toBeLessThan(0.32);
  });

  it('прозорий фон PNG читається так само, як чорний фон JPG', () => {
    const w = 120; const h = 80;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const isVoid = x / 36 + y / 32 < 1;
        data[i] = 200; data[i + 1] = 200; data[i + 2] = 200;
        data[i + 3] = isVoid ? 0 : 255; // порожнеча — прозора, не чорна
      }
    }
    const outline = analyseSlabPixels(data, w, h);
    expect(outline?.corners.find((c) => c.corner === 'TL')).toBeDefined();
  });

  it('трикутник зрізу будується в міліметрах слеба для кожного кута', () => {
    const tl = cornerTriangle({ corner: 'TL', along: 0.25, down: 0.5 }, 3200, 1600);
    expect(tl).toEqual([{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 0, y: 800 }]);

    const br = cornerTriangle({ corner: 'BR', along: 0.25, down: 0.5 }, 3200, 1600);
    expect(br).toEqual([{ x: 3200, y: 1600 }, { x: 2400, y: 1600 }, { x: 3200, y: 800 }]);
  });
});

describe('припуск ураховує скол', () => {
  it('рівний лист — припуск лишається прямокутником', () => {
    const polygon = usableAreaPolygon(3200, 1600, 10, []);
    expect(polygon).toEqual([
      { x: 10, y: 10 }, { x: 3190, y: 10 }, { x: 3190, y: 1590 }, { x: 10, y: 1590 },
    ]);
  });

  it('зрізаний кут відсікає ріг припуску, решта меж на місці', () => {
    const cut = { corner: 'TL' as const, along: 0.25, down: 0.5 };
    const polygon = usableAreaPolygon(3200, 1600, 10, [cut]);
    // З'явилась п'ята вершина — зріз
    expect(polygon.length).toBe(5);
    // Кут (10,10) у прямокутнику припуску більше не належить зоні
    expect(polygon.some((p) => p.x === 10 && p.y === 10)).toBe(false);
    // Протилежний бік недоторканий
    expect(polygon).toContainEqual({ x: 3190, y: 1590 });
  });

  it('дефект відступає від лінії розлому рівно на припуск', () => {
    const cut = { corner: 'TL' as const, along: 0.25, down: 0.5 }; // 800 × 800 мм
    const inflated = inflateCornerCut(cut, 3200, 1600, 10);
    // Гіпотенуза паралельна вихідній (нахил a/b зберігся) і відсунута назовні
    expect(inflated.along * 3200).toBeGreaterThan(800);
    expect(inflated.down * 1600).toBeGreaterThan(800);
    const before = (800 * 800) / Math.hypot(800, 800);
    const after = (inflated.along * 3200 * inflated.down * 1600)
      / Math.hypot(inflated.along * 3200, inflated.down * 1600);
    expect(after - before).toBeCloseTo(10, 6);
  });

  it('припуск не зникає, коли скол малий', () => {
    const polygon = usableAreaPolygon(3200, 1600, 10, [{ corner: 'BR', along: 0.05, down: 0.05 }]);
    expect(polygon.length).toBeGreaterThanOrEqual(4);
  });
});
