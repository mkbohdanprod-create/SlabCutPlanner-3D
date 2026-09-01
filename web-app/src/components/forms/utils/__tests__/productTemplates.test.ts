/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { PRODUCT_TEMPLATES } from '../productTemplates';
import { getSideSize } from '../draftHelpers';
import { buildProductFromSession } from '../../../ui/ProductEditorWorkspace';
import { cutoutCenter } from '../../../../domain/cutoutAnchor';
import { anchorContextFor } from '../../../../domain/elementToDetail';

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
        const match = slot.match(/^(leg|wall_panel)_([A-H])(?:#\\d+)?$/);
        expect(match, `слот ${slot}`).toBeTruthy();
        const [, prefix, side] = match!;
        expect(sides).toContain(side);
        expect(sub.type).toBe(prefix === 'leg' ? 'Опора' : 'Стінова панель');
        // Доповнення може бути коротшим за ребро і зсунутим уздовж нього,
        // але ділянка мусить лишатися в межах сторони — інакше деталь
        // висітиме в повітрі за плитою.
        const sideLength = getSideSize(main, side);
        const from = sub.attachOffset ?? 0;
        expect(from).toBeGreaterThanOrEqual(0);
        expect(sub.width).toBeGreaterThan(0);
        expect(from + sub.width).toBeLessThanOrEqual(sideLength);
        // Зсув углиб не може перевищити габарит деталі поперек цього ребра
        const across = side === 'A' || side === 'C' ? main.height : main.width;
        expect(sub.attachInset ?? 0).toBeGreaterThanOrEqual(0);
        expect(sub.attachInset ?? 0).toBeLessThanOrEqual(across);
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

  it('камін сучасний: виступи задаються окремо і складають габарит подіуму', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const session = modern.build({
      boxWidth: 1200, boxDepth: 450, overhangLeft: 300, overhangRight: 300, overhangFront: 250,
    });
    const main = session.mainDetail!;
    const front = session.subDetails.wall_panel_A;
    const right = session.subDetails.wall_panel_B;
    const left = session.subDetails.wall_panel_D;

    // Подіум = короб + виступи, а не окремо задана «загальна ширина»
    expect(main.width).toBe(1800);
    expect(main.height).toBe(700);

    expect(front.width).toBe(1200);
    expect(front.attachOffset).toBe(300);        // виступ ліворуч
    expect(front.attachInset).toBe(450);         // фронт коробу за глибину від задньої сторони
    expect(right.attachInset).toBe(300);
    expect(left.attachInset).toBe(300);
    expect(right.attachOffset).toBe(0);          // ребро B іде від A до C
    expect(left.attachOffset).toBe(250);         // ребро D — навпаки
    expect(left.attachOffset! + left.width).toBe(main.height);
  });

  it('камін сучасний: асиметричні виступи — короб зсувається, а не розтягується', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const session = modern.build({
      boxWidth: 1000, boxDepth: 400, overhangLeft: 700, overhangRight: 0, overhangFront: 300,
    });
    const main = session.mainDetail!;
    const front = session.subDetails.wall_panel_A;
    expect(main.width).toBe(1700);
    expect(front.width).toBe(1000);
    // Уся «зайва» ширина пішла ліворуч: короб притиснутий до правого краю
    expect(front.attachOffset).toBe(700);
    expect(front.attachOffset! + front.width).toBe(main.width);
    expect(session.subDetails.wall_panel_B.attachInset).toBe(0);
    expect(session.subDetails.wall_panel_D.attachInset).toBe(700);
  });

  it('камін сучасний: нульові виступи — подіум урівень із коробом', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const session = modern.build({
      boxWidth: 1200, boxDepth: 450, overhangLeft: 0, overhangRight: 0, overhangFront: 0,
    });
    expect(session.mainDetail!.width).toBe(1200);
    expect(session.mainDetail!.height).toBe(450);
    // Боки коробу сідають рівно на бічні ребра подіуму
    expect(session.subDetails.wall_panel_B.attachInset).toBe(0);
    expect(session.subDetails.wall_panel_D.attachInset).toBe(0);
    expect(session.subDetails.wall_panel_D.attachOffset).toBe(0);
    // Фронт коробу — на ПЕРЕДНЬОМУ ребрі: зсув углиб = вся глибина подіуму,
    // бо виступу вперед немає. Це не «зайвий» зсув, а край плити.
    expect(session.subDetails.wall_panel_A.attachOffset).toBe(0);
    expect(session.subDetails.wall_panel_A.attachInset).toBe(session.mainDetail!.height);
  });

  it('камін сучасний: склад деталей і топка в межах фронту', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const session = modern.build({});
    expect(Object.keys(session.subDetails).sort()).toEqual(
      ['leg_B', 'leg_C', 'leg_D', 'wall_panel_A', 'wall_panel_B', 'wall_panel_D'],
    );
    const front = session.subDetails.wall_panel_A;
    const firebox = front.cutouts.tpl_firebox;
    expect(firebox).toBeTruthy();
    expect(firebox.shape).toBe('rect');
    // Виріз центровано по ширині панелі і він не ширший за неї
    expect(firebox.x! * 2 + firebox.width!).toBe(front.width);
    expect(firebox.width!).toBeLessThan(front.width);
    expect(firebox.height!).toBeLessThan(front.height);
    // Поріг: виріз не торкається краю панелі (CSG не любить дотику ребер)
    expect(firebox.y).toBeGreaterThan(0);

    // ГОЛОВНЕ: у 3D панель стоїть на подіумі НИЖНІМ ребром, тож топка
    // мусить опинитись у нижній половині фронту. Рахуємо абсолютний центр
    // тим самим резолвером, що й рушій (інв. 2.24) — це ловить і зміну
    // прив'язки в шаблоні, і переорієнтацію панелей у рендері.
    const { cx, cy } = cutoutCenter(firebox, anchorContextFor(front as never));
    expect(cy).toBeGreaterThan(front.height / 2);
    expect(cx).toBeCloseTo(front.width / 2, 5);
    // Виріз цілком усередині панелі
    expect(cy - firebox.height! / 2).toBeGreaterThan(0);
    expect(cy + firebox.height! / 2).toBeLessThan(front.height);
    // Ноги подіуму — на всю сторону плити (обшивка виступаючої основи)
    expect(session.subDetails.leg_B.width).toBe(session.mainDetail!.height);
    expect(session.subDetails.leg_C.width).toBe(session.mainDetail!.width);
  });

  it('камін сучасний: топка ширша/вища за короб затискається всередину', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const session = modern.build({ width: 800, boxHeight: 1000, fireboxWidth: 1500, fireboxHeight: 1200, fireboxUp: 900 });
    const front = session.subDetails.wall_panel_A;
    const firebox = front.cutouts.tpl_firebox;
    expect(firebox.width!).toBeLessThanOrEqual(front.width - 100);
    expect(firebox.x!).toBeGreaterThanOrEqual(0);
    expect(firebox.height!).toBeGreaterThan(0);
    const { cy } = cutoutCenter(firebox, anchorContextFor(front as never));
    expect(cy - firebox.height! / 2).toBeGreaterThanOrEqual(0);
    expect(cy + firebox.height! / 2).toBeLessThanOrEqual(front.height);
  });

  it('камін сучасний: поріг піднімає топку, але не випускає її за короб', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const front = (up: number) => {
      const s = modern.build({ fireboxUp: up });
      const panel = s.subDetails.wall_panel_A;
      return { panel, cut: panel.cutouts.tpl_firebox };
    };
    const low = front(0);
    const high = front(600);
    const cyLow = cutoutCenter(low.cut, anchorContextFor(low.panel as never)).cy;
    const cyHigh = cutoutCenter(high.cut, anchorContextFor(high.panel as never)).cy;
    // Більший поріг → топка вище, тобто МЕНШЕ значення cy (вісь y донизу)
    expect(cyHigh).toBeLessThan(cyLow);
    expect(cyHigh - high.cut.height! / 2).toBeGreaterThan(0);
  });

  it('камін сучасний: вентиляційні щілини — капсули в межах деталі', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const session = modern.build({ width: 1800, depth: 700, podiumHeight: 450, boxDepth: 450, boxHeight: 2000 });

    const podium = session.subDetails.leg_C;
    const right = session.subDetails.wall_panel_B;
    const left = session.subDetails.wall_panel_D;

    const podiumVents = Object.values(podium.cutouts);
    expect(podiumVents).toHaveLength(8);
    expect(Object.values(right.cutouts)).toHaveLength(8);
    expect(Object.values(left.cutouts)).toHaveLength(8);

    // Кожна щілина — прямокутник із радіусом «півширини», тобто капсула,
    // і радіус мусить проходити мінімум для крихких матеріалів (керамограніт 5)
    podiumVents.forEach((slot) => {
      expect(slot.shape).toBe('rect');
      expect(slot.cornerRadius).toBe(slot.height! / 2);
      expect(slot.cornerRadius!).toBeGreaterThanOrEqual(5);
      expect(slot.height).toBeGreaterThanOrEqual(10);
      expect(slot.height).toBeLessThanOrEqual(15);
      // Довжина — рівно «деталь мінус 40»
      expect(slot.width).toBe(podium.width - 40);
    });

    // Жодна щілина не виходить за контур деталі (рахуємо реальні центри)
    const inside = (panel: typeof podium) => {
      Object.values(panel.cutouts).forEach((slot) => {
        const { cx, cy } = cutoutCenter(slot, anchorContextFor(panel as never));
        expect(cx - slot.width! / 2).toBeGreaterThanOrEqual(0);
        expect(cx + slot.width! / 2).toBeLessThanOrEqual(panel.width);
        expect(cy - slot.height! / 2).toBeGreaterThanOrEqual(0);
        expect(cy + slot.height! / 2).toBeLessThanOrEqual(panel.height);
      });
    };
    inside(podium);
    inside(right);
    inside(left);

    // Щілини не злипаються: просвіт між сусідніми не менший за їхню ширину
    const ys = podiumVents.map((s) => s.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(podiumVents[0].height! * 2);
    }

    // Витяжка на коробі стоїть ВИЩЕ топки, а не навпроти неї
    const firebox = session.subDetails.wall_panel_A.cutouts.tpl_firebox;
    const fireboxTopFromBottom = firebox.y! + firebox.height!;
    Object.values(right.cutouts).forEach((slot) => {
      expect(slot.y).toBeGreaterThan(fireboxTopFromBottom);
    });
  });

  it('камін сучасний: у кожній зоні свій отвір, зі своїми числами', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const allOff = {
      podiumFront_kind: 'none', podiumRight_kind: 'none', podiumLeft_kind: 'none',
      boxRight_kind: 'none', boxLeft_kind: 'none', boxFront_kind: 'none',
    };

    const none = modern.build(allOff);
    ['leg_B', 'leg_C', 'leg_D', 'wall_panel_B', 'wall_panel_D'].forEach((slot) => {
      expect(Object.keys(none.subDetails[slot].cutouts), slot).toHaveLength(0);
    });
    // вікно топки лишається завжди — воно не «зона»
    expect(Object.keys(none.subDetails.wall_panel_A.cutouts)).toEqual(['tpl_firebox']);
    // без ніші коробу ніші теж немає
    expect(none.subDetails['leg_C#2']).toBeUndefined();

    // Кожна зона керується окремо і своїми числами
    const mixed = modern.build({
      ...allOff,
      boxRight_kind: 'vent', boxRight_count: 4, boxRight_slot: 20,
      boxLeft_kind: 'vent', boxLeft_count: 10, boxLeft_slot: 8,
    });
    const right = Object.values(mixed.subDetails.wall_panel_B.cutouts);
    const left = Object.values(mixed.subDetails.wall_panel_D.cutouts);
    expect(right).toHaveLength(4);
    expect(left).toHaveLength(10);
    expect(right[0].height).toBe(20);
    expect(left[0].height).toBe(8);

    // На фронті коробу отвір додається ДО топки і стоїть вище вікна
    const front = modern.build({ ...allOff, boxFront_kind: 'vent' });
    const frontCuts = front.subDetails.wall_panel_A.cutouts;
    const fb = frontCuts.tpl_firebox;
    expect(fb).toBeTruthy();
    Object.entries(frontCuts)
      .filter(([id]) => id.startsWith('tpl_vent_'))
      .forEach(([, slot]) => expect(slot.y).toBeGreaterThan(fb.y! + fb.height!));
  });

  it('камін сучасний: ніша у фронті подіуму — до підлоги, з коробом по висоті вирізу', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const session = modern.build({
      boxWidth: 1200, boxDepth: 450, overhangLeft: 300, overhangRight: 300, overhangFront: 250,
      podiumHeight: 450,
      podiumFront_kind: 'niche', podiumFront_nicheH: 250, podiumFront_nicheD: 300,
      podiumFront_marginL: 200, podiumFront_marginR: 100,
    });

    // Дрова кладуть на підлогу: у лицьовій панелі не отвір, а розрив контуру
    const face = session.subDetails.leg_C;
    expect(Object.keys(face.cutouts)).toHaveLength(0);
    expect(face.customPoints).toBeTruthy();
    // Глибина прорізу — САМЕ висота ніші (250), не залишок 450−250:
    // «висоту взяло від верху» — це був баг першої ітерації
    const notch = face.customPoints!.filter((p) => p.y > 0 && p.y < face.height);
    expect(notch).toHaveLength(2);
    expect(notch[0].y).toBe(250);
    // Ширина ніші — це те, що лишилось між відступами, її окремо не задають
    const xs = notch.map((p) => p.x).sort((a, b) => a - b);
    expect(xs[0]).toBe(200);
    expect(xs[1]).toBe(1800 - 100);
    // У деталей, що звисають униз, ПІДЛОГА — ребро y = 0. Проріз мусить
    // розривати саме його, а ребро біля плити (y = height) — суцільне.
    // Якщо впало — контур знову відкрився не в той бік.
    const onFloor = face.customPoints!.filter((p) => p.y === 0).map((p) => p.x).sort((a, b) => a - b);
    const onTop = face.customPoints!.filter((p) => p.y === face.height).map((p) => p.x).sort((a, b) => a - b);
    expect(onFloor).toEqual([0, 200, 1700, 1800]);   // підлога розірвана прорізом
    expect(onTop).toEqual([0, 1800]);                // біля плити суцільно

    // Короб ніші: три стінки, кожна ЗАВВИШКИ ЯК ВИРІЗ і піднята на різницю
    const right = session.subDetails['leg_B#2'];
    const left = session.subDetails['leg_D#2'];
    const back = session.subDetails['leg_C#2'];
    [right, left, back].forEach((wall) => {
      expect(wall).toBeTruthy();
      expect(wall.type).toBe('Опора');
      expect(wall.height).toBe(250);             // рівно висота ніші
      expect(wall.attachGap).toBe(200);          // 450 − 250: стінка стоїть на підлозі
    });
    expect(right.width).toBe(300);               // глибина ніші
    expect(left.width).toBe(300);
    expect(back.width).toBe(1500);               // 1800 − 200 − 100, з відступів
    expect(back.attachInset).toBe(300);          // задня стінка — на глибині ніші
    // Стінки стоять рівно на межах вирізу: лівий відступ ліворуч, правий праворуч
    expect(left.attachInset).toBe(200);
    expect(right.attachInset).toBe(100);
    // Ребро C обходиться справа наліво, тому задня стінка міряється справа
    expect(back.attachOffset).toBe(100);
    expect(right.attachOffset).toBe(400);        // глибина 700 − 300
    expect(left.attachOffset).toBe(0);
  });

  it('камін сучасний: ніша на всю висоту робить деталь П-подібною, а не отвором', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const session = modern.build({
      boxWidth: 1200, overhangLeft: 300, overhangRight: 300, podiumHeight: 450,
      podiumFront_kind: 'niche', podiumFront_nicheH: 450,
      podiumFront_marginL: 100, podiumFront_marginR: 100,
    });
    const face = session.subDetails.leg_C;
    // Отвору немає — є контур: цех ріже саме форму деталі
    expect(Object.keys(face.cutouts)).toHaveLength(0);
    // Стінки коробу теж на всю висоту — відсувати їх нема куди
    expect(session.subDetails['leg_C#2'].attachGap).toBe(20);
    const pts = face.customPoints!;
    expect(pts).toBeTruthy();
    expect(pts).toHaveLength(8);
    // Контур не виходить за габарит деталі і має імена ребер
    pts.forEach((p) => {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(face.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(face.height);
      expect(p.id).toBeTruthy();
    });
    // Проріз ніші — рівно заданої ширини
    const notch = pts.filter((p) => p.y > 0 && p.y < face.height);
    expect(notch).toHaveLength(2);
    expect(notch[0].y).toBe(430);                            // 450 − перемичка 20
    expect(Math.abs(notch[1].x - notch[0].x)).toBe(1600);   // 1800 − 100 − 100
  });

  it('камін сучасний: різні відступи ліворуч і праворуч зсувають отвір', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const session = modern.build({
      podiumFront_kind: 'vent', podiumFront_marginL: 400, podiumFront_marginR: 50,
      boxRight_kind: 'none', boxLeft_kind: 'none',
    });
    const panel = session.subDetails.leg_C;
    const slot = Object.values(panel.cutouts)[0];
    expect(slot.x).toBe(400);
    expect(slot.width).toBe(panel.width - 450);
  });

  it('камін сучасний: висота решітки задається в мм від низу', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const at = (mm: number) => {
      const s = modern.build({ podiumHeight: 700, podiumFront_kind: 'vent', podiumFront_pos: mm });
      const panel = s.subDetails.leg_C;
      const ys = Object.values(panel.cutouts).map((c) => c.y);
      return (Math.min(...ys) + Math.max(...ys)) / 2;
    };
    // Центр групи їде рівно на різницю заданих висот
    expect(at(500) - at(300)).toBeCloseTo(200, 0);
  });

  it('камін сучасний: ніша в інших зонах — отвір без коробу', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const session = modern.build({ podiumFront_kind: 'none', boxRight_kind: 'niche' });
    expect(Object.keys(session.subDetails.wall_panel_B.cutouts)).toHaveLength(1);
    expect(session.subDetails['leg_B#2']).toBeUndefined();
  });

  it('камін сучасний: кількість, ширина, просвіт і відступ решітки керовані', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const session = modern.build({
      podiumFront_kind: 'vent', podiumFront_count: 5, podiumFront_slot: 15,
      podiumFront_gap: 30, podiumFront_marginL: 60, podiumFront_marginR: 60,
      boxRight_kind: 'none', boxLeft_kind: 'none',
    });
    const podium = session.subDetails.leg_C;
    const slots = Object.values(podium.cutouts);
    expect(slots).toHaveLength(5);
    slots.forEach((slot) => {
      expect(slot.height).toBe(15);
      expect(slot.cornerRadius).toBe(7.5);
      expect(slot.x).toBe(60);
      expect(slot.width).toBe(podium.width - 120);
      // Обшивка подіуму звисає вниз: її підлога — ребро A, тож «від низу»
      // міряється від кута DA. CD тут означав би відлік від плити.
      expect(slot.bindCorner).toBe('DA');
    });
    const ys = slots.map((s) => s.y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBe(45); // ширина 15 + просвіт 30
  });

  it('камін сучасний: позиція решітки по висоті керована', () => {
    const modern = PRODUCT_TEMPLATES.find((t) => t.id === 'fireplace_modern')!;
    const low = modern.build({ podiumFront_pos: 0, podiumHeight: 700 });
    const high = modern.build({ podiumFront_pos: 3000, podiumHeight: 700 });
    const yOf = (s: ReturnType<typeof modern.build>) =>
      Math.min(...Object.values(s.subDetails.leg_C.cutouts).map((c) => c.y));
    expect(yOf(high)).toBeGreaterThan(yOf(low));
    [low, high].forEach((s) => {
      const panel = s.subDetails.leg_C;
      Object.values(panel.cutouts).forEach((slot) => {
        const { cy } = cutoutCenter(slot, anchorContextFor(panel as never));
        expect(cy - slot.height! / 2).toBeGreaterThanOrEqual(0);
        expect(cy + slot.height! / 2).toBeLessThanOrEqual(panel.height);
      });
    });
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

      // EdgeFeature `thickening` головної деталі стає доповненнями, які цех
      // називає «Підворот» (10.08 назви помінялись місцями, коди — ні).
      if (session.mainDetail!.thickening.enabled) {
        const thickenings = root.additions.filter((a) => a.type === 'Підворот');
        expect(thickenings.length).toBe(session.mainDetail!.thickening.sides.length);
        thickenings.forEach((t) => {
          expect(t.baseDefinition.width).toBeGreaterThan(0);
          expect(t.baseDefinition.height).toBe(40);
        });
      }
    });
  });
});
