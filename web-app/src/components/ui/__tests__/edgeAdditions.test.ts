/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { buildProductFromSession } from '../ProductEditorWorkspace';
import { collectSideAdditions } from '../SideAdditionsPanel';
import { createDraft } from '../../forms/utils/draftHelpers';
import type { DetailDraft } from '../../forms/utils/draftHelpers';
import { toSlot } from '../../../domain/ids';

/**
 * ПОТОВЩЕННЯ/ПІДВОРОТ ЯК БОРТИК (10.08): слот у subDetails із шириною,
 * висотою і відступом; на одній стороні їх може бути кілька (#2, #3).
 * Найнебезпечніше тут — співіснування зі старим способом (галочка «на всю
 * сторону»): той самий слот `fold_C` породжують ОБИДВА шляхи, і без
 * запобіжника виріб отримує два однакові підвороти.
 */

const mainDetail = (patch: Partial<DetailDraft> = {}): DetailDraft => ({
  ...createDraft(),
  kind: 'rect',
  width: 2000,
  height: 600,
  thickness: 20,
  ...patch,
});

const draftFor = (type: string, patch: Partial<DetailDraft> = {}): DetailDraft => ({
  ...createDraft(),
  kind: 'rect',
  type: type as DetailDraft['type'],
  ...patch,
});

const session = (main: DetailDraft, subDetails: Record<string, DetailDraft>) => ({
  mainDetail: main,
  subDetails,
  activeDetailId: 'main',
} as Parameters<typeof buildProductFromSession>[0]);

const additionsOf = (product: ReturnType<typeof buildProductFromSession>) =>
  product.elements[0].additions.map((a) => ({ slot: toSlot(a.id), type: a.type }));

describe('потовщення/підворот зі слотів subDetails', () => {
  it('підворот: заусовка 45° і ділянка стику з відступом', () => {
    const product = buildProductFromSession(session(
      mainDetail(),
      { 'fold_C': draftFor('Потовщення', { width: 800, height: 100, attachOffset: 300 }) },
    ), 'p1');

    expect(additionsOf(product)).toEqual([{ slot: 'fold_C', type: 'Потовщення' }]);
    const joint = product.elements[0].joints.find((j) => j.id === 'joint_fold_C')!;
    expect(joint.type).toBe('miter45');
    expect(joint.textureContinuity).toBe(true);
    expect(joint.a.from).toBe(300);
    expect(joint.a.to).toBe(1100);          // 300 + 800
  });

  it('потовщення: пряма склейка без текстурної неперервності', () => {
    const product = buildProductFromSession(session(
      mainDetail(),
      { 'thickening_B': draftFor('Підворот', { width: 600, height: 40 }) },
    ), 'p1');

    const joint = product.elements[0].joints.find((j) => j.id === 'joint_thickening_B')!;
    expect(joint.type).toBe('glued');
    expect(joint.textureContinuity).toBe(false);
  });

  it('два потовщення на одній стороні через #2 — обидва в виробі', () => {
    const product = buildProductFromSession(session(
      mainDetail(),
      {
        'thickening_A': draftFor('Підворот', { width: 500, height: 40 }),
        'thickening_A#2': draftFor('Підворот', { width: 400, height: 40, attachOffset: 1200 }),
      },
    ), 'p1');

    const slots = additionsOf(product).map((a) => a.slot);
    expect(slots).toContain('thickening_A');
    expect(slots).toContain('thickening_A#2');
  });

  it('легасі-галочка НЕ дублюється зі своїм збереженим драфтом', () => {
    // Стара схема: fold.sides=['C'] породжує слот fold_C у динамічній гілці,
    // а редагування того підвороту зберігає драфт у subDetails під тим самим
    // id. Обробити його ще й як слот верхнього рівня — два підвороти.
    const product = buildProductFromSession(session(
      mainDetail({ fold: { enabled: true, sides: ['C'], size: 100 } }),
      { 'fold_C': draftFor('Потовщення', { width: 2000, height: 100 }) },
    ), 'p1');

    const folds = additionsOf(product).filter((a) => a.slot === 'fold_C');
    expect(folds).toHaveLength(1);
  });

  it('нове доповнення поруч із легасі-галочкою йде у слот #2', () => {
    const product = buildProductFromSession(session(
      mainDetail({ fold: { enabled: true, sides: ['C'], size: 100 } }),
      { 'fold_C#2': draftFor('Потовщення', { width: 600, height: 80, attachOffset: 0 }) },
    ), 'p1');

    const folds = additionsOf(product).filter((a) => a.slot.startsWith('fold_C'));
    expect(folds.map((f) => f.slot).sort()).toEqual(['fold_C', 'fold_C#2']);
  });

  it('вкладений підворот ноги не стає доповненням стільниці', () => {
    const product = buildProductFromSession(session(
      mainDetail(),
      {
        'leg_B': draftFor('Нога', { width: 600, height: 900 }),
        'leg_B_fold_C': draftFor('Потовщення', { width: 600, height: 100 }),
      },
    ), 'p1');

    const rootSlots = additionsOf(product).map((a) => a.slot);
    expect(rootSlots).not.toContain('leg_B_fold_C');
  });
});

describe('трей «Сторони»: список доповнень', () => {
  it('збирає слоти і легасі-галочки без дублів', () => {
    const main = mainDetail({ thickening: { enabled: true, sides: ['B'], size: 40 } });
    const subs = {
      'thickening_B': draftFor('Підворот', { width: 2000, height: 40 }),   // драфт легасі
      'thickening_B#2': draftFor('Підворот', { width: 300, height: 60 }),  // нове з модалки
      'skirting_A': draftFor('Бортик', { width: 2000, height: 50 }),
      'leg_B_fold_C': draftFor('Потовщення', { width: 600, height: 100 }),     // вкладене — не сюди
    };
    const bySide = collectSideAdditions(main, subs, ['A', 'B', 'C', 'D']);

    expect(bySide.A).toHaveLength(1);
    expect(bySide.A[0].kind).toBe('skirting');
    // B: одна легасі (не двічі!) + одна нова
    expect(bySide.B).toHaveLength(2);
    expect(bySide.B.filter((e) => e.legacy)).toHaveLength(1);
    expect(bySide.C).toHaveLength(0);
  });

  /**
   * ХВИЛЯ 4, крок 4.1. Раніше тут стояв прапорець `fullSideOnly`, і на
   * доповненні трей показував ЛИШЕ легасі-галочки. Тепер він знає слот
   * власника і показує його власні вкладені доповнення — з розмірами.
   */
  it('на доповненні видно СВОЇ вкладені слоти і не видно чужих', () => {
    const owner = draftFor('Нога', { fold: { enabled: true, sides: ['C'], size: 30 } });
    const subs = {
      'thickening_B': draftFor('Підворот', { width: 2000, height: 40 }),      // чуже: стільниці
      'leg_B_fold_C': draftFor('Потовщення', { width: 300, height: 30, attachOffset: 50 }), // своє
    };
    const bySide = collectSideAdditions(owner, subs, ['A', 'B', 'C', 'D'], 'leg_B');

    // Легасі-чип власника знайшов свій драфт і веде саме в нього.
    expect(bySide.C).toHaveLength(1);
    expect(bySide.C[0]).toMatchObject({ kind: 'fold', legacy: true, slot: 'leg_B_fold_C' });
    // Підворот СТІЛЬНИЦІ в трей ноги не потрапив.
    expect(bySide.B).toHaveLength(0);
  });

  it('стільниця не бачить вкладених доповнень своєї ноги', () => {
    const main = mainDetail();
    const subs = {
      'leg_B': draftFor('Нога', { width: 600, height: 900 }),
      'leg_B_fold_C': draftFor('Потовщення', { width: 300, height: 30 }),
    };
    const bySide = collectSideAdditions(main, subs, ['A', 'B', 'C', 'D']);
    // Сама нога — це доповнення стільниці на стороні B, її чип тут доречний
    // (крок 4.3 додав панелі й ноги в трей).
    expect(bySide.B).toHaveLength(1);
    expect(bySide.B[0].kind).toBe('leg');
    // А ось підворот НОГИ — не її справа: він живе в треї ноги.
    expect(bySide.C).toHaveLength(0);
  });
});

/**
 * ХВИЛЯ 4 · крок 4.1 — другий рівень вкладеності без обмежень.
 *
 * FG-13: «на нозі потовщення 50, а в 3D 100». Причина була не в 3D:
 * генератор вкладених деталей ЖОРСТКО ставив ширину = вся сторона
 * власника й ігнорував збережений драфт, а UI ховав поля ширини та
 * відступу саме тому, що вони все одно затирались. Тепер розмір
 * вкладеної деталі доживає до розкрою.
 */
describe('вкладене доповнення тримає свій розмір', () => {
  /** Нога 900×600 з підворотом на своїй стороні C. */
  const legWithFold = (foldDraft?: Partial<DetailDraft>) => session(
    mainDetail(),
    {
      'leg_B': draftFor('Нога', {
        width: 900, height: 600, thickness: 20,
        fold: { enabled: true, sides: ['C'], size: 50, sideSizes: { C: 50 } },
      }),
      ...(foldDraft ? { 'leg_B_fold_C': draftFor('Потовщення', foldDraft) } : {}),
    },
  );

  const nestedOf = (product: ReturnType<typeof buildProductFromSession>) => {
    const leg = product.elements.find((el) => toSlot(el.id) === 'leg_B')!;
    return { leg, addition: leg.additions[0], joint: leg.joints[0] };
  };

  it('без збереженого драфта — як і раніше, на всю сторону', () => {
    const { addition } = nestedOf(buildProductFromSession(legWithFold(), 'p1'));
    expect(toSlot(addition.id)).toBe('leg_B_fold_C');
    expect(addition.baseDefinition.width).toBe(900);
    expect(addition.baseDefinition.height).toBe(50);
  });

  it('ширина й відступ користувача доживають до виробу', () => {
    const { addition, joint } = nestedOf(buildProductFromSession(
      legWithFold({ width: 300, height: 50, attachOffset: 200 }), 'p1',
    ));
    expect(addition.baseDefinition.width).toBe(300);
    expect(addition.baseDefinition.attachOffset).toBe(200);
    // Шов — рівно зона контакту, а не вся сторона ноги.
    expect(joint.a.from).toBe(200);
    expect(joint.a.to).toBe(500);
    expect(joint.b.to).toBe(300);
  });

  it('висота береться з галочки власника, а не з драфта', () => {
    // sideSizes власника — джерело правди для вильоту смуги: саме його
    // редагує модалка. Драфт може нести старе число після зміни розміру.
    const { addition } = nestedOf(buildProductFromSession(
      legWithFold({ width: 300, height: 999, attachOffset: 0 }), 'p1',
    ));
    expect(addition.baseDefinition.height).toBe(50);
  });

  it('брехлива ширина (0, від’ємна, довша за ребро) — падаємо на всю сторону', () => {
    for (const width of [0, -100, 5000]) {
      const { addition } = nestedOf(buildProductFromSession(
        legWithFold({ width, height: 50 }), 'p1',
      ));
      expect(addition.baseDefinition.width, `ширина ${width}`).toBe(900);
    }
  });

  it('відступ затиснуто в межі ребра', () => {
    const { addition, joint } = nestedOf(buildProductFromSession(
      legWithFold({ width: 300, height: 50, attachOffset: 5000 }), 'p1',
    ));
    expect(addition.baseDefinition.attachOffset).toBe(600); // 900 − 300
    expect(joint.a.to).toBe(900);
  });

  it('вкладена деталь доїжджає до розкрою окремим партом', () => {
    const product = buildProductFromSession(
      legWithFold({ width: 300, height: 50, attachOffset: 200 }), 'p1',
    );
    const slots = product.elements.flatMap((el) => el.additions.map((a) => toSlot(a.id)));
    expect(slots).toContain('leg_B_fold_C');
  });
});

/**
 * ХВИЛЯ 4 · крок 4.2 (FG-14) — «панель до стільниці, хоча вибирав торець
 * іншої панелі».
 *
 * Причина була не в 3D: слот панелі не мав адреси власника, тож і рушій,
 * і обидва рендери могли зробити тільки одне — повісити її на головну
 * деталь. Тепер слот несе власника, і стик іде саме туди.
 */
describe('доповнення на доповненні: панель на панелі', () => {
  const nested = () => buildProductFromSession(session(
    mainDetail(),
    {
      'wall_panel_B': draftFor('Стінова панель', { width: 600, height: 400, thickness: 20 }),
      'wall_panel_B_wall_panel_C': draftFor('Стінова панель', { width: 300, height: 200, thickness: 20 }),
    },
  ), 'p1');

  it('вкладена панель живе в дереві власника, а не серед сусідів стільниці', () => {
    const product = nested();
    const owner = product.elements.find((el) => toSlot(el.id) === 'wall_panel_B')!;
    expect(owner).toBeDefined();
    expect(owner.additions.map((a) => toSlot(a.id))).toContain('wall_panel_B_wall_panel_C');
    // І її НЕМА серед доповнень стільниці.
    expect(additionsOf(product).map((a) => a.slot)).not.toContain('wall_panel_B_wall_panel_C');
  });

  it('стик прив’язаний до панелі-власника, а не до стільниці', () => {
    const product = nested();
    const owner = product.elements.find((el) => toSlot(el.id) === 'wall_panel_B')!;
    const joint = owner.joints.find((j) => j.id === 'joint_wall_panel_B_wall_panel_C')!;
    expect(joint).toBeDefined();
    expect(toSlot(joint.a.elementPath)).toBe('wall_panel_B');
    expect(joint.a.sideId).toBe('C');
    // Стик на стільниці не з’явився.
    const mainJoints = product.elements[0].joints.map((j) => j.id);
    expect(mainJoints).not.toContain('joint_wall_panel_B_wall_panel_C');
  });

  it('довжина ребра береться у ВЛАСНИКА, а не в стільниці', () => {
    // Панель-власник має ширину 600; стільниця — 2000. Якщо ширину
    // вкладеної деталі не задано, вона має стати 600, а не 2000.
    const product = buildProductFromSession(session(
      mainDetail(),
      {
        'wall_panel_B': draftFor('Стінова панель', { width: 600, height: 400, thickness: 20 }),
        'wall_panel_B_wall_panel_A': draftFor('Стінова панель', { height: 200, thickness: 20, width: 0 }),
      },
    ), 'p1');
    const owner = product.elements.find((el) => toSlot(el.id) === 'wall_panel_B')!;
    const joint = owner.joints.find((j) => j.id === 'joint_wall_panel_B_wall_panel_A')!;
    // Ділянка контакту не може бути довшою за ребро власника.
    expect(joint.a.to).toBeLessThanOrEqual(600);
  });

  it('порядок слотів у сесії не має значення — власник знаходиться завжди', () => {
    const product = buildProductFromSession(session(
      mainDetail(),
      {
        // Вкладена деталь ПЕРШОЮ: раніше такий порядок дав би стільницю.
        'wall_panel_B_leg_C': draftFor('Опора', { width: 300, height: 700, thickness: 20 }),
        'wall_panel_B': draftFor('Стінова панель', { width: 600, height: 400, thickness: 20 }),
      },
    ), 'p1');
    const owner = product.elements.find((el) => toSlot(el.id) === 'wall_panel_B')!;
    expect(owner.additions.map((a) => toSlot(a.id))).toContain('wall_panel_B_leg_C');
  });

  it('звичайна панель на стільниці лишається сусідом стільниці', () => {
    const product = buildProductFromSession(session(
      mainDetail(),
      { 'wall_panel_B': draftFor('Стінова панель', { width: 600, height: 400 }) },
    ), 'p1');
    expect(product.elements.map((el) => toSlot(el.id))).toContain('wall_panel_B');
    const joint = product.elements[0].joints.find((j) => j.id === 'joint_wall_panel_B')!;
    expect(toSlot(joint.a.elementPath)).toBe('main');
  });
});

/**
 * ХВИЛЯ 4 · крок 4.3 (FG-15) — кілька панелей на одну сторону.
 *
 * Слоти `#2` існували в парсері з самого початку, але ними користувались
 * лише підворот і потовщення. Панель, нога й бортик збирали слот жорстко
 * (`wall_panel_<сторона>`), тож друге додавання тихо перезаписувало перше:
 * кнопка спрацьовувала, а панель не з'являлась. Тепер вільний слот шукають
 * усі — і на одній стороні можна зробити «панель | вікно | панель».
 */
describe('кілька доповнень одного типу на одній стороні', () => {
  it('дві панелі на стороні A — це дві окремі деталі виробу', () => {
    const product = buildProductFromSession(session(
      mainDetail(),
      {
        'wall_panel_A': draftFor('Стінова панель', { width: 700, height: 600, attachOffset: 0 }),
        'wall_panel_A#2': draftFor('Стінова панель', { width: 700, height: 600, attachOffset: 1300 }),
      },
    ), 'p1');

    const panels = product.elements.map((el) => toSlot(el.id)).filter((slot) => slot.startsWith('wall_panel_A'));
    expect(panels.sort()).toEqual(['wall_panel_A', 'wall_panel_A#2']);
  });

  it('вікно між панелями: стики не перекриваються', () => {
    const product = buildProductFromSession(session(
      mainDetail(),
      {
        'wall_panel_A': draftFor('Стінова панель', { width: 700, height: 600, attachOffset: 0 }),
        'wall_panel_A#2': draftFor('Стінова панель', { width: 700, height: 600, attachOffset: 1300 }),
      },
    ), 'p1');

    const [first, second] = ['joint_wall_panel_A', 'joint_wall_panel_A#2']
      .map((id) => product.elements[0].joints.find((j) => j.id === id)!);
    expect(first.a.from).toBe(0);
    expect(first.a.to).toBe(700);
    expect(second.a.from).toBe(1300);
    expect(second.a.to).toBe(2000);
    // Проміжок 700…1300 — те саме «вікно», заради якого це робилось.
    expect(second.a.from).toBeGreaterThan(first.a.to);
  });

  it('дві ноги на одній стороні не зливаються в одну', () => {
    const product = buildProductFromSession(session(
      mainDetail(),
      {
        'leg_C': draftFor('Опора', { width: 400, height: 900, attachOffset: 100 }),
        'leg_C#2': draftFor('Опора', { width: 400, height: 900, attachOffset: 1500 }),
      },
    ), 'p1');
    const legs = product.elements.map((el) => toSlot(el.id)).filter((slot) => slot.startsWith('leg_C'));
    expect(legs).toHaveLength(2);
  });

  it('трей показує обидві панелі окремими чипами з різними слотами', () => {
    const subs = {
      'wall_panel_A': draftFor('Стінова панель', { width: 700, height: 600 }),
      'wall_panel_A#2': draftFor('Стінова панель', { width: 700, height: 400 }),
    };
    const bySide = collectSideAdditions(mainDetail(), subs, ['A', 'B', 'C', 'D']);
    expect(bySide.A).toHaveLength(2);
    expect(bySide.A.map((e) => e.slot).sort()).toEqual(['wall_panel_A', 'wall_panel_A#2']);
    // Різна висота видно прямо на чипі — інакше їх не розрізнити.
    expect(bySide.A[0].label).not.toBe(bySide.A[1].label);
  });
});
