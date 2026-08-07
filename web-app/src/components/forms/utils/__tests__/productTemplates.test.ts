/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { PRODUCT_TEMPLATES } from '../productTemplates';
import { getSideSize } from '../draftHelpers';
import { buildProductFromSession } from '../../../ui/ProductEditorWorkspace';

// Шаблони видають сесію, яку далі без жодних перевірок їсть
// buildProductFromSession. Тому контракти тримаємо тестом:
//   · слоти лише leg_* / wall_panel_* із валідною стороною для форми головної;
//   · ширина суб-деталі = довжина сторони кріплення;
//   · потовщення — фічею головної деталі, а не суб-деталлю;
//   · криві вхідні значення (порожньо, за межами) не ламають геометрію.

const SIDES_BY_KIND: Record<string, string[]> = {
  rect: ['A', 'B', 'C', 'D'],
  l: ['A', 'B', 'C', 'D', 'E', 'F'],
  u: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
};

describe('шаблони виробів: структура сесії', () => {
  PRODUCT_TEMPLATES.forEach((template) => {
    it(`${template.name}: дефолтна збірка валідна`, () => {
      const session = template.build({});
      const main = session.mainDetail!;
      expect(main).toBeTruthy();
      expect(session.activeDetailId).toBe('main');
      expect(main.label).toBeTruthy();
      expect(main.thickness).toBeGreaterThan(0);

      // Усі сторони головної деталі мають додатну довжину
      const sides = SIDES_BY_KIND[main.kind] ?? [];
      expect(sides.length).toBeGreaterThan(0);
      sides.forEach((side) => {
        expect(getSideSize(main, side), `сторона ${side}`).toBeGreaterThan(0);
      });

      // Потовщення, якщо ввімкнене, — лише на сторонах цієї форми
      if (main.thickening.enabled) {
        main.thickening.sides.forEach((side) => {
          expect(sides).toContain(side);
        });
        expect(main.thickening.size).toBeGreaterThan(0);
      }

      // Слоти суб-деталей: тип за префіксом, сторона з контуру,
      // ширина = довжина сторони кріплення, спадок товщини/кількості
      Object.entries(session.subDetails).forEach(([slot, sub]) => {
        const match = slot.match(/^(leg|wall_panel)_([A-H])$/);
        expect(match, `слот ${slot}`).toBeTruthy();
        const [, prefix, side] = match!;
        expect(sides).toContain(side);
        expect(sub.type).toBe(prefix === 'leg' ? 'Опора' : 'Стінова панель');
        expect(sub.width).toBe(getSideSize(main, side));
        expect(sub.height).toBeGreaterThan(0);
        expect(sub.thickness).toBe(main.thickness);
        expect(sub.quantity).toBe(main.quantity);
      });
    });
  });

  it('острів: вибір сторони ноги перемикає слот B/D', () => {
    const island = PRODUCT_TEMPLATES.find((t) => t.id === 'island_leg')!;
    expect(Object.keys(island.build({ legSide: 'right' }).subDetails)).toEqual(['leg_B']);
    expect(Object.keys(island.build({ legSide: 'left' }).subDetails)).toEqual(['leg_D']);
    // Зіпсоване значення не має лишити виріб без ноги
    expect(Object.keys(island.build({ legSide: 'банан' }).subDetails)).toEqual(['leg_B']);
  });

  it('Г-подібна: обидва плеча мають задану глибину', () => {
    const l = PRODUCT_TEMPLATES.find((t) => t.id === 'l_top')!;
    const main = l.build({ lengthA: 2400, lengthF: 1800, depth: 600 }).mainDetail!;
    // Глибина плеча вздовж стіни A = B (outerHeight − innerVertical),
    // глибина плеча вздовж стіни F = E (innerHorizontal) — контур 'BR'.
    expect(getSideSize(main, 'B')).toBe(600);
    expect(getSideSize(main, 'E')).toBe(600);
    expect(getSideSize(main, 'A')).toBe(2400);
    expect(getSideSize(main, 'F')).toBe(1800);
  });

  it('Г-подібна: глибина, більша за плече, не вироджує контур', () => {
    const l = PRODUCT_TEMPLATES.find((t) => t.id === 'l_top')!;
    const main = l.build({ lengthA: 700, lengthF: 700, depth: 5000 }).mainDetail!;
    SIDES_BY_KIND.l.forEach((side) => {
      expect(getSideSize(main, side), `сторона ${side}`).toBeGreaterThan(0);
    });
  });

  it('числа за межами затискаються, сміття падає в дефолт', () => {
    const straight = PRODUCT_TEMPLATES.find((t) => t.id === 'straight_top')!;
    expect(straight.build({ length: 999999 }).mainDetail!.width).toBe(3200);
    expect(straight.build({ length: 1 }).mainDetail!.width).toBe(300);
    expect(straight.build({ length: Number.NaN }).mainDetail!.width).toBe(2400);
    expect(straight.build({ length: 'абв' }).mainDetail!.width).toBe(2400);
  });

  it('камін: дві стійки і фриз на повну ширину', () => {
    const fire = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_surround')!;
    const session = fire.build({});
    expect(Object.keys(session.subDetails).sort()).toEqual(['leg_B', 'leg_C', 'leg_D']);
    expect(session.subDetails.leg_C.width).toBe(session.mainDetail!.width);
    // Стійки — на всю висоту (до підлоги), і полиця лежить на них зверху
    expect(session.subDetails.leg_B.height).toBe(session.mainDetail!.elevation);
  });
});

describe('шаблони виробів: збірка у Виріб (buildProductFromSession)', () => {
  PRODUCT_TEMPLATES.forEach((template) => {
    it(`${template.name}: сесія збирається без викидів і з валідними стиками`, () => {
      const session = template.build({});
      const product = buildProductFromSession(session, 'tpl_test');
      expect(product.elements.length).toBeGreaterThan(0);

      const root = product.elements[0];
      // Ноги і стінпанелі — самостійні елементи Виробу (§3)
      const legCount = Object.keys(session.subDetails).filter((s) => s.startsWith('leg_')).length;
      const panelCount = Object.keys(session.subDetails).filter((s) => s.startsWith('wall_panel_')).length;
      expect(product.elements.length).toBe(1 + legCount + panelCount);

      // Кожен стик — з додатною довжиною і правильним типом:
      // нога → «водоспад» 45°, панель → встик, потовщення → склейка
      root.joints.forEach((joint) => {
        expect(joint.a.to).toBeGreaterThan(0);
      });
      Object.keys(session.subDetails).forEach((slot) => {
        const joint = root.joints.find((j) => j.id === `joint_${slot}`)!;
        expect(joint, `стик ${slot}`).toBeTruthy();
        expect(joint.type).toBe(slot.startsWith('leg_') ? 'miter45' : 'butt');
        expect(joint.a.to).toBeGreaterThan(0);
      });

      // Потовщення головної деталі стало доповненнями «Потовщення»
      if (session.mainDetail!.thickening.enabled) {
        const thickenings = root.additions.filter((a) => a.type === 'Потовщення');
        expect(thickenings.length).toBe(session.mainDetail!.thickening.sides.length);
        thickenings.forEach((t) => {
          expect(t.baseDefinition.width).toBeGreaterThan(0);
          expect(t.baseDefinition.height).toBe(40);
        });
      }
    });
  });
});
