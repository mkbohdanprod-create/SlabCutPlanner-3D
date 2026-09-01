/**
 * FG-18 — «виріз не стає туди, куди прив'язали, якщо форма складна».
 *
 * Причин було дві, і обидві дають той самий симптом: виріз тихо їде не
 * туди, а програма нічого не каже.
 *
 *   1. Вікно вирізу називає кути ПАРАМИ літер (`DE`), а дані складних
 *      форм — іменами ВЕРШИН (`D`). Пошук `anchors['DE']` не знаходив
 *      нічого, прив'язка «зникала», і відступ відкладався від лівого
 *      верхнього кута деталі.
 *   2. Навіть із правильною точкою напрямок «усередину» брався з
 *      габаритного прямокутника. На Г-подібній це неправда: кут стоїть
 *      посеред габариту, і відступ ішов у порожнечу.
 *
 * Контрольна деталь — та сама Г-подібна, що на скріні фокус-групи.
 */
import { describe, expect, it } from 'vitest';
import { cornerAnchor, cutoutCenter, type AnchorShapeContext } from '../cutoutAnchor';
import { cornerIdForSides, contourVertexOrder } from '../sideNaming';

/**
 * Г-подібна 2000×1200, внутрішній кут 900×500.
 * Вершини за обходом (те саме, що віддає jointAnchorPoints):
 *   start(0,0) A(2000,0) B(2000,700) C(900,700) D(900,1200) E(0,1200)
 * Матеріал: уся смуга y ∈ [0,700] і ліва частина x ∈ [0,900] нижче неї.
 */
const L: AnchorShapeContext = {
  shape: 'Г-подібна',
  geometry: { outerWidth: 2000, outerHeight: 1200, innerHorizontal: 900, innerVertical: 500 } as never,
  width: 2000,
  height: 1200,
};

describe('FG-18 · імена кутів: пара літер ↔ вершина', () => {
  it('пара з вікна вирізу перекладається у вершину даних', () => {
    expect(cornerIdForSides('DE', 'Г-подібна')).toBe('D');
    expect(cornerIdForSides('AB', 'Г-подібна')).toBe('A');
    // Останній кут замикає контур: вершина `start` між сторонами F і A.
    expect(cornerIdForSides('FA', 'Г-подібна')).toBe('start');
  });

  it('П-подібна замикається через H, а не через F', () => {
    expect(cornerIdForSides('HA', 'П-подібна')).toBe('start');
    expect(cornerIdForSides('GH', 'П-подібна')).toBe('G');
  });

  it('прямокутник уже названий парами — переклад його не чіпає', () => {
    expect(cornerIdForSides('AB', 'Прямокутна')).toBe('AB');
    expect(contourVertexOrder('Прямокутна')).toEqual(['DA', 'AB', 'BC', 'CD']);
  });

  it('невідоме ім\'я не вигадується', () => {
    expect(cornerIdForSides('ZZ', 'Г-подібна')).toBeUndefined();
    expect(contourVertexOrder('Кругла')).toBeUndefined();
  });
});

describe('FG-18 · кут знаходиться і на складній формі', () => {
  it('кут DE — це вершина D, а не «нічого»', () => {
    const anchor = cornerAnchor(L, 'DE');
    expect(anchor).toBeDefined();
    expect(anchor!.x).toBe(900);
    expect(anchor!.y).toBe(1200);
  });

  it('усі кути форми знаходяться — жоден не губиться', () => {
    for (const name of ['AB', 'BC', 'CD', 'DE', 'EF', 'FA']) {
      expect(cornerAnchor(L, name), `кут ${name}`).toBeDefined();
    }
  });
});

describe('FG-18 · напрямок «усередину» береться з контуру', () => {
  it('опуклий кут DE міряє вліво і вгору — туди, де камінь', () => {
    const anchor = cornerAnchor(L, 'DE')!;
    expect(anchor.dirX).toBe(-1);
    expect(anchor.dirY).toBe(-1);
  });

  it('увігнутий кут CD не міряє у виїмку', () => {
    // Вершина C (900,700) — єдиний увігнутий кут Г-форми. Обидва ребра
    // від неї ведуть у бік, де матеріалу немає; правильна чверть —
    // вгору-вправо, під верхню смугу.
    const anchor = cornerAnchor(L, 'CD')!;
    expect(anchor.x).toBe(900);
    expect(anchor.y).toBe(700);
    expect(anchor.dirX).toBe(1);
    expect(anchor.dirY).toBe(-1);
  });

  it('на прямокутнику поведінка не змінилась', () => {
    const rect: AnchorShapeContext = {
      shape: 'Прямокутна',
      geometry: { width: 2000, height: 600 } as never,
      width: 2000,
      height: 600,
    };
    expect(cornerAnchor(rect, 'DA')).toMatchObject({ x: 0, y: 0, dirX: 1, dirY: 1 });
    expect(cornerAnchor(rect, 'AB')).toMatchObject({ x: 2000, y: 0, dirX: -1, dirY: 1 });
    expect(cornerAnchor(rect, 'BC')).toMatchObject({ x: 2000, y: 600, dirX: -1, dirY: -1 });
    expect(cornerAnchor(rect, 'CD')).toMatchObject({ x: 0, y: 600, dirX: 1, dirY: -1 });
  });
});

describe('FG-18 · виріз стає туди, куди його поставили', () => {
  it('прямокутний виріз 450×450 з відступом 100/100 від кута DE', () => {
    const { cx, cy } = cutoutCenter(
      { shape: 'rect', width: 450, height: 450, x: 100, y: 100, bindCorner: 'DE' } as never,
      L,
    );
    // 900 − (100 + 225) = 575;  1200 − (100 + 225) = 875
    expect(cx).toBe(575);
    expect(cy).toBe(875);
  });

  it('до ремонту той самий виріз опинявся біля лівого верхнього кута', () => {
    // Так поводилась стара гілка: прив'язки «немає» → міряємо від нуля.
    const asIfAnchorLost = { cx: 100 + 225, cy: 100 + 225 };
    const { cx, cy } = cutoutCenter(
      { shape: 'rect', width: 450, height: 450, x: 100, y: 100, bindCorner: 'DE' } as never,
      L,
    );
    expect({ cx, cy }).not.toEqual(asIfAnchorLost);
  });

  it('круглий отвір міряється до центру, а не до кута', () => {
    const { cx, cy } = cutoutCenter(
      { shape: 'circle', radius: 32.5, x: 100, y: 100, bindCorner: 'DE' } as never,
      L,
    );
    expect(cx).toBe(800);
    expect(cy).toBe(1100);
  });
});
