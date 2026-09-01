/**
 * SC-02 — шов, який зробив різ, має дійти до грошей.
 *
 * Цех пиляє і клеїть кожен стик незалежно від того, з'явився він між двома
 * елементами виробу чи всередині однієї деталі. Факти ж читались лише з
 * дерева виробу, тому кутовий стик Г-форми і будь-який довільний стик
 * проходили повз кошторис: робота є, рядка в прорахунку немає.
 */
import { describe, it, expect } from 'vitest';
import { explodeDetails } from '../geometry';
import { extractProductionFacts } from '../productionFacts';
import { createEmptyProject } from '../../domain/defaults';
import type { Detail, Project } from '../../domain/types';

const base = { type: 'Стільниця', quantity: 1, thickness: 20 } as const;

function factsFor(detail: Detail) {
  const parts = explodeDetails([detail]);
  const project: Project = { ...createEmptyProject(), details: [detail] };
  return { parts, facts: extractProductionFacts(project, parts, { details: [detail] }) };
}

const RECT_WITH_JOINT: Detail = {
  ...base,
  id: 'r',
  shape: 'Прямокутна',
  label: 'Стільниця',
  geometry: {
    width: 3200,
    height: 600,
    manualJoints: [{ id: 'mj', axis: 'vertical', anchorCorner: 'DA', offset: 1600 }],
  },
} as unknown as Detail;

const L_WITH_JOINT: Detail = {
  ...base,
  id: 'l',
  shape: 'Г-подібна',
  label: 'Виріб',
  geometry: {
    outerWidth: 2000,
    outerHeight: 1200,
    innerHorizontal: 900,
    innerVertical: 500,
    jointDirection: 'vertical',
  },
} as unknown as Detail;

describe('стик = гроші', () => {
  it('довільний стик на прямокутній деталі дає довжину шва в фактах', () => {
    const { facts } = factsFor(RECT_WITH_JOINT);
    const length = facts.filter((fact) => fact.kind === 'joint_length');
    expect(length).toHaveLength(1);
    // Шов іде поперек деталі: 600 мм = 0.6 м. Припуск на різ додає крихти.
    expect(length[0].qty).toBeGreaterThan(0.59);
    expect(length[0].qty).toBeLessThan(0.65);
  });

  it('той самий стик дає рівно один пропил, а не два', () => {
    const { facts } = factsFor(RECT_WITH_JOINT);
    const count = facts.filter((fact) => fact.kind === 'joint_count');
    expect(count).toHaveLength(1);
    // 600 мм < 500 мм? ні — отже довгий пропил.
    expect(count[0].variant).toBe('gt500');
  });

  it('кутовий стик Г-форми теж потрапляє в кошторис', () => {
    const { facts } = factsFor(L_WITH_JOINT);
    const length = facts.filter((fact) => fact.kind === 'joint_length');
    expect(length).toHaveLength(1);
    // Вертикальний стик: шов = зовнішня висота мінус внутрішня, 1200-500=700.
    expect(length[0].qty).toBeGreaterThan(0.68);
    expect(length[0].qty).toBeLessThan(0.72);
  });

  it('деталь без стику не породжує жодного шва', () => {
    const whole: Detail = {
      ...base,
      id: 'w',
      shape: 'Прямокутна',
      label: 'Стільниця',
      geometry: { width: 1200, height: 600 },
    } as unknown as Detail;

    const { facts } = factsFor(whole);
    expect(facts.filter((fact) => fact.kind === 'joint_length')).toHaveLength(0);
    expect(facts.filter((fact) => fact.kind === 'joint_count')).toHaveLength(0);
  });

  it('шов носить рівно один парт із двох — інакше склейка подвоїться', () => {
    const { parts } = factsFor(RECT_WITH_JOINT);
    const carriers = parts.filter((part) => part.jointSeams?.length);
    expect(carriers).toHaveLength(1);
  });
});

/**
 * Кінець ланцюга: не «факт з'явився», а «в кошторисі є рядок із ціною».
 * Саме цього вимагав SC-02: «Г-форма → 1 шов → 2 послуги».
 */
describe('шов доходить до кошторису', () => {
  it('Г-форма з кутовим стиком дає склейку і пропил', async () => {
    const { computeEstimate } = await import('../estimate');
    const parts = explodeDetails([L_WITH_JOINT]);
    const project: Project = { ...createEmptyProject(), details: [L_WITH_JOINT] };

    // Вбудований каталог без цін — гроші дає 1С за кодом номенклатури.
    // У склейки коду немає, тому ціну для перевірки задаємо явно: тест
    // про те, що рядок доходить до кошторису З ГРОШИМА, а не про тариф.
    const { DEFAULT_SERVICE_CATALOG } = await import('../../domain/services');
    const catalog = {
      ...DEFAULT_SERVICE_CATALOG,
      GLUING_STRAIGHT: { ...DEFAULT_SERVICE_CATALOG.GLUING_STRAIGHT, price: 450 },
    };
    const estimate = computeEstimate(project, parts, { details: [L_WITH_JOINT], catalog });
    const ids = estimate.lines.map((line) => line.serviceId);

    expect(ids).toContain('GLUING_STRAIGHT');
    expect(ids).toContain('JOINT_SAWCUT');

    const gluing = estimate.lines.find((line) => line.serviceId === 'GLUING_STRAIGHT')!;
    expect(gluing.quantity).toBeGreaterThan(0.68);
    expect(gluing.total).toBeGreaterThan(0);
  });

  it('та сама Г-форма цілою деталлю склейки не дає', async () => {
    const { computeEstimate } = await import('../estimate');
    const whole = {
      ...L_WITH_JOINT,
      id: 'l-whole',
      geometry: { ...L_WITH_JOINT.geometry, jointDirection: undefined, wholeDetail: true },
    } as Detail;

    const parts = explodeDetails([whole]);
    const project: Project = { ...createEmptyProject(), details: [whole] };
    const ids = computeEstimate(project, parts, { details: [whole] }).lines.map((l) => l.serviceId);

    expect(ids).not.toContain('GLUING_STRAIGHT');
    expect(ids).not.toContain('JOINT_SAWCUT');
  });
});
