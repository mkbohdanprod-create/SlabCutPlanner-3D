/**
 * @vitest-environment jsdom
 */
/**
 * ХВИЛЯ 4 · крок 4.5 — НАСКРІЗНИЙ ЕТАЛОН («камін»).
 *
 * Кроки 4.1–4.4 кожен закривався своїм тестом, але всі вони — про ОДНЕ:
 * дерево виробу глибше за один рівень. Поодинці такі речі зазвичай
 * працюють, а разом розходяться: вкладена деталь губить власника,
 * власник губить розмір, ніша з'їдає імена сторін.
 *
 * Тому тут зібрано один виріб, у якому є все одразу:
 *
 *   Стільниця 2000×700
 *    ├── Опора (нога) на стороні C, 2000×700
 *    │     └── потовщення 40 мм на власній стороні A, ШИРИНОЮ 600 (4.1)
 *    ├── Стінова панель на стороні A, 2000×600
 *    │     └── Стінова панель на власній стороні B (4.2)
 *    ├── Друга стінова панель на стороні A — вікно між ними (4.3)
 *    └── лицьова панель подіуму з нішею під дрова (4.4)
 *
 * і проганяється весь ланцюг: сесія → виріб → деталі → парти → факти →
 * кошторис. Перевіряємо не «не впало», а конкретні числа: скільки партів,
 * яка площа, де стики, які послуги.
 *
 * Це водночас демо-сценарій: якщо він зелений — камін заводиться без
 * обхідних шляхів.
 */
import { describe, expect, it } from 'vitest';
import { buildProductFromSession } from '../../components/ui/ProductEditorWorkspace';
import { flattenProductToDetails } from '../../store/projectHelpers';
import { createDraft } from '../../components/forms/utils/draftHelpers';
import type { DetailDraft } from '../../components/forms/utils/draftHelpers';
import { explodeDetails } from '../geometry';
import { extractProductionFacts } from '../productionFacts';
import { createEmptyProject } from '../../domain/defaults';
import { toSlot } from '../../domain/ids';
import { buildUCutoutContour, uCutoutWallIds } from '../../domain/uCutout';
import { attachmentContactSide } from '../transform3d';
import type { Project } from '../../domain/types';

const draft = (type: string, patch: Partial<DetailDraft> = {}): DetailDraft => ({
  ...createDraft(),
  kind: 'rect',
  type: type as DetailDraft['type'],
  thickness: 20,
  ...patch,
});

const TOP = { width: 2000, height: 700 };

function fireplaceSession() {
  return {
    activeDetailId: 'main',
    mainDetail: draft('Стільниця', { ...TOP }),
    subDetails: {
      // 4.1 — нога з ВЛАСНИМ потовщенням заданої ширини й відступу.
      'leg_C': draft('Опора', {
        width: 2000, height: 700,
        thickening: { enabled: true, sides: ['A'], size: 40, sideSizes: { A: 40 } },
      } as Partial<DetailDraft>),
      'leg_C_thickening_A': draft('Підворот', { width: 600, height: 40, attachOffset: 200 }),

      // 4.2 — панель на панелі.
      'wall_panel_A': draft('Стінова панель', { width: 700, height: 600, attachOffset: 0 }),
      'wall_panel_A_wall_panel_B': draft('Стінова панель', { width: 400, height: 300 }),

      // 4.3 — друга панель на тій самій стороні, з вікном між ними.
      'wall_panel_A#2': draft('Стінова панель', { width: 700, height: 600, attachOffset: 1300 }),

      // 4.4 — лицьова панель подіуму з нішею під дрова.
      'leg_B': draft('Опора', {
        width: 1400, height: 700,
        uCutout: { side: 'A', offsetMm: 400, widthMm: 600, depthMm: 400 },
      } as Partial<DetailDraft>),
    },
  } as Parameters<typeof buildProductFromSession>[0];
}

const product = () => buildProductFromSession(fireplaceSession(), 'fireplace');

const allSlots = (p: ReturnType<typeof product>) => {
  const out: string[] = [];
  const walk = (element: { id: string; additions: Array<{ id: string; additions: never[] }> }) => {
    out.push(toSlot(element.id));
    element.additions.forEach((child) => walk(child as never));
  };
  p.elements.forEach((element) => walk(element as never));
  return out;
};

describe('камін-еталон: дерево виробу', () => {
  it('усі шість деталей на місці, кожна на своєму рівні', () => {
    const slots = allSlots(product());
    expect(slots).toContain('main');
    expect(slots).toContain('leg_C');
    expect(slots).toContain('leg_C_thickening_A');
    expect(slots).toContain('wall_panel_A');
    expect(slots).toContain('wall_panel_A_wall_panel_B');
    expect(slots).toContain('wall_panel_A#2');
    expect(slots).toContain('leg_B');
  });

  it('потовщення ноги — доповнення НОГИ, а не стільниці (4.1)', () => {
    const p = product();
    const leg = p.elements.find((el) => toSlot(el.id) === 'leg_C')!;
    const thick = leg.additions.find((a) => toSlot(a.id) === 'leg_C_thickening_A')!;
    expect(thick).toBeDefined();
    // Ширина і відступ користувача дожили — це і є FG-13.
    expect(thick.baseDefinition.width).toBe(600);
    expect(thick.baseDefinition.attachOffset).toBe(200);
    expect(thick.baseDefinition.height).toBe(40);
    // Стик — рівно зона контакту.
    const joint = leg.joints.find((j) => j.id === 'joint_leg_C_thickening_A')!;
    expect(joint.a.from).toBe(200);
    expect(joint.a.to).toBe(800);
    expect(joint.b.sideId).toBe(attachmentContactSide());
  });

  it('панель на панелі прив’язана до панелі (4.2)', () => {
    const p = product();
    const panel = p.elements.find((el) => toSlot(el.id) === 'wall_panel_A')!;
    const nested = panel.additions.find((a) => toSlot(a.id) === 'wall_panel_A_wall_panel_B')!;
    expect(nested).toBeDefined();
    const joint = panel.joints.find((j) => j.id === 'joint_wall_panel_A_wall_panel_B')!;
    expect(toSlot(joint.a.elementPath)).toBe('wall_panel_A');
    // Стільниця про цей стик нічого не знає.
    expect(p.elements[0].joints.map((j) => j.id)).not.toContain('joint_wall_panel_A_wall_panel_B');
  });

  it('дві панелі на стороні A не перекриваються — між ними вікно (4.3)', () => {
    const p = product();
    const first = p.elements[0].joints.find((j) => j.id === 'joint_wall_panel_A')!;
    const second = p.elements[0].joints.find((j) => j.id === 'joint_wall_panel_A#2')!;
    expect(first.a.to).toBe(700);
    expect(second.a.from).toBe(1300);
    expect(second.a.from).toBeGreaterThan(first.a.to);
  });
});

describe('камін-еталон: розкрій', () => {
  const parts = () => {
    const details = flattenProductToDetails(product());
    return { details, parts: explodeDetails(details) };
  };

  it('кожна деталь виробу доїхала до розкрою власним партом', () => {
    const { parts: list } = parts();
    const mains = list.filter((part) => part.isMain);
    // Шість деталей виробу — шість головних партів.
    expect(mains.length).toBeGreaterThanOrEqual(6);
  });

  it('ніша справді з’їла матеріал лицьової панелі (4.4)', () => {
    const { details } = parts();
    const facade = details.find((detail) => detail.id.includes('leg_B'))!;
    expect(facade).toBeDefined();
    // Контур виведено зі специфікації, а не лишився прямокутником.
    expect(facade.geometry.customPoints).toBeDefined();
    expect(facade.geometry.customPoints).toHaveLength(8);

    const expected = buildUCutoutContour(
      { side: 'A', offsetMm: 400, widthMm: 600, depthMm: 400 },
      { width: 1400, height: 700 },
    )!;
    expect(facade.geometry.customPoints).toEqual(expected);

    // Площа парта менша за габарит рівно на нішу.
    const part = explodeDetails([facade]).find((p) => p.isMain)!;
    const area = Math.abs(part.points.reduce(
      (sum, p, i) => sum + (p.x * part.points[(i + 1) % part.points.length].y
        - part.points[(i + 1) % part.points.length].x * p.y), 0,
    ) / 2);
    expect(area).toBeCloseTo(1400 * 700 - 600 * 400, 3);
  });

  it('торці ніші мають імена — інакше їх не обробити й не продати', () => {
    const { details } = parts();
    const facade = details.find((detail) => detail.id.includes('leg_B'))!;
    const segments = facade.geometry.sideSegments ?? {};
    uCutoutWallIds('A').forEach((wall) => {
      expect(Object.keys(segments), `торець ${wall}`).toContain(wall);
    });
  });
});

describe('камін-еталон: гроші', () => {
  const factsOf = () => {
    const details = flattenProductToDetails(product());
    const parts = explodeDetails(details);
    const project: Project = { ...createEmptyProject(), details };
    return { facts: extractProductionFacts(project, parts, { details }), details };
  };

  it('кожна деталь виробу дає різ — жодна не випала з виробництва', () => {
    const { facts, details } = factsOf();
    const cuts = facts.filter((fact) => fact.kind === 'saw_cut');
    expect(cuts.length).toBe(details.length);
  });

  it('площа виробу рахується і вона додатна', () => {
    const { facts } = factsOf();
    const area = facts.find((fact) => fact.kind === 'detail_area');
    expect(area).toBeDefined();
    expect(area!.qty).toBeGreaterThan(0);
  });

  it('жоден факт не має від’ємної чи нульової кількості', () => {
    // Найтиповіший симптом сплутаних сторін: довжина «−0.4 м» або нуль
    // там, де цех фізично щось робить.
    factsOf().facts.forEach((fact) => {
      expect(fact.qty, `${fact.kind} ${fact.ref?.side ?? ''}`).toBeGreaterThan(0);
    });
  });

  /**
   * ВІДОМА ДІРА, зафіксована навмисно (не баг цієї хвилі).
   *
   * У застосунку ДВІ моделі стику: `ManualJoint` — різ у геометрії деталі,
   * з нього рушій робить факти `joint_length`; і `Joint` — зв'язок у дереві
   * виробу (саме його будує buildProductFromSession). Другий у факти НЕ
   * потрапляє: склейка панелі до стільниці існує в моделі, але в кошторис
   * не йде.
   *
   * На виробі з шести деталей це п'ять неоплачених швів. Тест закріплює
   * поточну поведінку, щоб її не сплутали з випадковою регресією, і
   * впаде, щойно діру закриють — тоді його треба переписати на перевірку
   * сум, а не нулів.
   */
  it('ВІДОМО: стики дерева виробу поки не доходять до фактів', () => {
    const { facts } = factsOf();
    const joints = facts.filter((fact) => fact.kind === 'joint_length' || fact.kind === 'joint_count');
    expect(joints).toHaveLength(0);

    // А в самому виробі стики є — тобто дані не втрачені, їх лише ніхто
    // не читає на шляху до грошей.
    const authored = product().elements.flatMap((el) => [
      ...el.joints,
      ...el.additions.flatMap((child) => child.joints),
    ]);
    expect(authored.length).toBeGreaterThanOrEqual(5);
  });
});
