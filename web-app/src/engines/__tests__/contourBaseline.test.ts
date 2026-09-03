// =====================================================================
//  СТОРОЖІ СЬОГОДНІШНІХ ЧИСЕЛ — знято 03.09.2026, перед зведенням
//  математики деталі («Одна математика деталі», захід 1).
//
//  ЩО ЦЕ. Характеристичні тести. Вони НЕ стверджують, що числа нижче
//  правильні — частина з них завідомо неправильна (див. «ВІДОМО НЕ ТАК»
//  у назвах кейсів). Вони фіксують те, як застосунок рахує СЬОГОДНІ, щоб
//  на кожному кроці зведення було видно рівно те, що змінилось, — і щоб
//  зміну можна було звірити з наміром, а не з пам'яттю.
//
//  ЯК КОРИСТУВАТИСЬ. Після кроку зведення тест впаде на тих кейсах, де
//  число змінилось. Далі одне з двох:
//    • ми цього і хотіли → оновити очікування ТУТ, у тому ж комміті, і
//      дописати в назву кейса, що саме тепер правильно;
//    • ми цього не хотіли → це регрес, який спіймали до цеху.
//  Мовчки оновлювати цілим файлом («тести червоні, перегенерую») — рівно
//  той спосіб, яким губиться робота; саме через це існує цей файл.
//
//  ЩО САМЕ ЗАПИСУЄМО. Контур (з іменами сторін), площу, кількість партів
//  та їхні габарити. Це той мінімум, який видно в цеху: форма, скільки
//  матеріалу, скільки шматків.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { explodeDetails } from '../geometry';
import { buildGeometry } from '../../domain/elementToDetail';
import { DEFAULT_ALLOWANCES } from '../../domain/defaults';
import type { Detail, DetailPart, ElementDefinition, Point } from '../../domain/types';

/** Чернетка редактора з дефолтами — той самий createDraft, без React. */
const draft = (patch: Partial<ElementDefinition>): ElementDefinition => ({
  type: 'Стільниця', kind: 'rect', quantity: 1, thickness: 20, elevation: 900,
  width: 1200, height: 600,
  outerWidth: 1200, outerHeight: 900, innerHorizontal: 500, innerVertical: 400,
  wholeDetail: true,
  innerCutWidth: 1200, innerCutDepth: 600, innerCutOffset: 600, innerCutSide: 'top',
  leftLegHeight: 1200, rightLegHeight: 1200,
  diameter: 800, circleSizeMode: 'diameter', ellipseWidth: 1200, ellipseHeight: 600,
  edgeProfiles: {}, corners: {}, cutouts: {},
  skirtings: {}, wallPanels: {}, legs: {},
  ...patch,
} as ElementDefinition);

const detailFrom = (def: ElementDefinition, shape: Detail['shape']): Detail => ({
  id: 'det_1', type: def.type, shape, quantity: 1, thickness: def.thickness,
  name: 'Деталь', label: 'Деталь', isProduct: true,
  geometry: buildGeometry(def),
  skirtings: {}, wallPanels: {}, legs: {},
} as unknown as Detail);

const areaM2 = (pts: Point[]) =>
  Math.abs(pts.reduce((sum, p, i) => {
    const q = pts[(i + 1) % pts.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0) / 2) / 1e6;

/** Один рядок опису парта — усе, що видно в цеху. */
const describePart = (part: DetailPart) => ({
  контур: part.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' '),
  площа: Number(areaM2(part.points).toFixed(4)),
  габарит: `${Math.round(part.width)}×${Math.round(part.height)}`,
  сторони: Object.keys(part.sideSegments ?? {}).sort().join(''),
});

const explode = (def: ElementDefinition, shape: Detail['shape']) =>
  explodeDetails([detailFrom(def, shape)], DEFAULT_ALLOWANCES, 'Кварцит')
    .filter((part) => part.isMain)
    .map(describePart);

// ── 1. Прямокутна ────────────────────────────────────────────────────

describe('сторожі: прямокутна', () => {
  it('ціла 1200×600 — чотири точки', () => {
    // Без обробки кутів контур іде «як є», без імен сторін і без дублів.
    expect(explode(draft({}), 'Прямокутна')).toEqual([{
      контур: '0,0 1200,0 1200,600 0,600',
      площа: 0.72,
      габарит: '1200×600',
      сторони: '',
    }]);
  });

  it('з радіусом 100 на куті AB — старий будівник, 18 точок із двома дублями', () => {
    // ВІДОМО НЕ ТАК: `buildComplexRectPoints` кладе першу точку дуги на
    // попередню вершину (`1100,0 1100,0`) і дублює старт у кінці (`0,0`).
    // Новий будівник дублів не робить — після зведення точок стане менше,
    // і саме тут це буде видно.
    const parts = explode(draft({ corners: { AB: { type: 'radius', radius: 100 } } } as never), 'Прямокутна');
    expect(parts[0].площа).toBe(0.7178);
    expect(parts[0].габарит).toBe('1200×600');
    expect(parts[0].контур.split(' ').length).toBe(18);
    expect(parts[0].контур.startsWith('0,0 1100,0 1100,0 ')).toBe(true);
    expect(parts[0].сторони).toBe('ABCD');
  });

  it('з фаскою 100 на куті AB', () => {
    const parts = explode(draft({ corners: { AB: { type: 'chamfer', sizeB: 100, sizeC: 100 } } } as never), 'Прямокутна');
    expect(parts[0].площа).toBe(0.715);
    expect(parts[0].контур).toBe('0,0 1100,0 1200,100 1200,600 0,600 0,0');
    expect(parts[0].сторони).toBe('ABCD');
  });
});

// ── 2. Г-подібна ─────────────────────────────────────────────────────

const L = { kind: 'l' as const, outerWidth: 2000, outerHeight: 1200, innerHorizontal: 900, innerVertical: 500 };

describe('сторожі: Г-подібна', () => {
  it('права ціла', () => {
    expect(explode(draft(L), 'Г-подібна')).toEqual([{
      контур: '0,0 2000,0 2000,700 900,700 900,1200 0,1200',
      площа: 1.85,
      габарит: '2000×1200',
      сторони: 'ABCDEF',
    }]);
  });

  it('ліва ціла — дзеркальна (виправлено 03.09: раніше лягала контуром правої)', () => {
    expect(explode(draft({ ...L, mirrorL: true } as never), 'Г-подібна')).toEqual([{
      контур: '0,0 2000,0 2000,1200 900,1200 900,700 0,700',
      площа: 1.95,
      габарит: '2000×1200',
      сторони: 'ABCDEF',
    }]);
  });

  it('УГОДА, ЯКУ ТРЕБА ПІДТВЕРДИТИ: дзеркало міняє й ширину вирізу (1100 → 900)', () => {
    // `innerHorizontal` — це координата внутрішнього ребра, а не ширина
    // вирізу. Тому «дзеркало» дає не те саме дзеркально, а іншу деталь.
    // 3D і розкрій тут узгоджені між собою, тож це угода, а не помилка;
    // рішення власника ще не ухвалене (розбір «Одна математика деталі»).
    const right = explode(draft(L), 'Г-подібна')[0];
    const left = explode(draft({ ...L, mirrorL: true } as never), 'Г-подібна')[0];
    expect(right.площа).not.toBe(left.площа);
    expect(left.площа - right.площа).toBeCloseTo(0.1, 4);
  });

  it('з кутовим стиком по вертикалі — два прямокутники (старий шлях)', () => {
    const parts = explode(draft({ ...L, wholeDetail: false, jointDirection: 'vertical' } as never), 'Г-подібна');
    expect(parts.length).toBe(2);
    expect(parts.map((p) => p.габарит)).toEqual(['900×1200', '1100×700']);
    expect(Number(parts.reduce((s, p) => s + p.площа, 0).toFixed(4))).toBe(1.85);
  });

  it('з кутовим стиком по горизонталі — два прямокутники (старий шлях)', () => {
    const parts = explode(draft({ ...L, wholeDetail: false, jointDirection: 'horizontal' } as never), 'Г-подібна');
    expect(parts.length).toBe(2);
    expect(parts.map((p) => p.габарит)).toEqual(['2000×700', '900×500']);
    expect(Number(parts.reduce((s, p) => s + p.площа, 0).toFixed(4))).toBe(1.85);
  });

  it('з довільним стиком x=900 — ніж по контуру, імена сторін збережені', () => {
    const parts = explode(draft({
      ...L, wholeDetail: false,
      manualJoints: [{ id: 'j1', axis: 'vertical', offset: 900 }],
    } as never), 'Г-подібна');
    expect(parts.length).toBe(2);
    expect(Number(parts.reduce((s, p) => s + p.площа, 0).toFixed(4))).toBe(1.85);
    // Саме тут видно різницю зі старим шляхом: шматки несуть імена сторін
    // оригіналу, а не вигадані A–D.
    expect(parts.every((p) => p.сторони.length > 0)).toBe(true);
  });

  it('ВИПРАВЛЕНО 03.09: кутовий і довільний стик ріжуть разом — три шматки', () => {
    const parts = explode(draft({
      ...L, wholeDetail: false, jointDirection: 'horizontal',
      manualJoints: [{ id: 'j1', axis: 'vertical', offset: 900 }],
    } as never), 'Г-подібна');
    // Було 2 шматки: гілка довільних стояла раніше і робила continue, тому
    // кутовий стик мовчки зникав. Після зведення (рішення власника 03.09:
    // лишаються тільки довільні стики) обидва різи їдуть одним ножем.
    expect(parts.length).toBe(3);
    expect(Number(parts.reduce((s, p) => s + p.площа, 0).toFixed(4))).toBe(1.85);
    // І кожен шматок несе імена сторін оригіналу — старий шлях їх вигадував.
    expect(parts.every((p) => p.сторони.length > 0)).toBe(true);
  });
});

// ── 3. П-подібна ─────────────────────────────────────────────────────

const U = {
  kind: 'u' as const, width: 2600, height: 1600,
  innerCutWidth: 1200, innerCutDepth: 1000, innerCutOffset: 700,
  leftLegHeight: 1600, rightLegHeight: 1600, innerCutSide: 'bottom' as const,
};

describe('сторожі: П-подібна', () => {
  it('ціла', () => {
    const parts = explode(draft(U), 'П-подібна');
    expect(parts.length).toBe(1);
    expect(parts[0].площа).toBe(2.96);
    expect(parts[0].габарит).toBe('2600×1600');
  });

  it('зі стиком омега — ніж по контуру, імена сторін збережені', () => {
    const parts = explode(draft({ ...U, wholeDetail: false, jointOmegaDirection: 'vertical' } as never), 'П-подібна');
    expect(parts.length).toBe(2);
    expect(parts.map((p) => p.площа)).toEqual([1.12, 1.84]);
    expect(parts.map((p) => p.сторони)).toEqual(['AFGH', 'ABCDE']);
    expect(Number(parts.reduce((s, p) => s + p.площа, 0).toFixed(4))).toBe(2.96);
  });

  it('зі стиками омега і лямбда — три шматки', () => {
    const parts = explode(draft({
      ...U, wholeDetail: false,
      jointOmegaDirection: 'vertical', jointLambdaDirection: 'vertical',
    } as never), 'П-подібна');
    expect(parts.length).toBe(3);
    expect(parts.map((p) => p.площа)).toEqual([1.12, 0.72, 1.12]);
    expect(Number(parts.reduce((s, p) => s + p.площа, 0).toFixed(4))).toBe(2.96);
  });

  it('ВИПРАВЛЕНО 03.09: виріз збоку без стику — ціла деталь, а не три прямокутники', () => {
    const parts = explode(draft({ ...U, wholeDetail: false, innerCutSide: 'left' } as never), 'П-подібна');
    // Було: три прямокутники з номіналів, ЗОВСІМ без імен сторін — на них
    // не малювались кромки і не переносились кути з вирізами. Стало: різати
    // нема чим (стику немає), тому деталь іде цілою, з іменами сторін і з
    // гучним попередженням у консолі. Рішення власника 03.09: ріже тільки
    // явно поставлений стик.
    expect(parts.length).toBe(1);
    expect(parts[0].сторони).toBe('ABCDEFGH');
  });
});

// ── 4. Криві ─────────────────────────────────────────────────────────

describe('сторожі: коло та овал', () => {
  it('коло Ø800 — 36 хорд, імен сторін немає', () => {
    const parts = explode(draft({ kind: 'circle', diameter: 800 } as never), 'Кругла');
    expect(parts[0].контур.split(' ').length).toBe(36);
    expect(parts[0].площа).toBe(0.5001);
  });

  it('овал 1200×600 — 42 хорди', () => {
    const parts = explode(draft({ kind: 'ellipse', ellipseWidth: 1200, ellipseHeight: 600 } as never), 'Овальна');
    expect(parts[0].контур.split(' ').length).toBe(42);
    expect(parts[0].площа).toBe(0.5634);
  });
});

// ── 5. Вирізи ────────────────────────────────────────────────────────

describe('сторожі: вирізи', () => {
  it('прямокутна з вирізом 500×300 — отвір у парті, площа контуру без нього', () => {
    const detail = detailFrom(draft({
      cutouts: { c1: { id: 'c1', shape: 'rect', type: 'custom', bindCorner: 'DA', x: 350, y: 150, width: 500, height: 300 } },
    } as never), 'Прямокутна');
    const parts = explodeDetails([detail], DEFAULT_ALLOWANCES, 'Кварцит').filter((p) => p.isMain);
    expect(parts.length).toBe(1);
    expect(parts[0].holes?.length).toBe(1);
    expect(areaM2(parts[0].points)).toBeCloseTo(0.72, 4);
  });
});
