/**
 * РАДІУСНІ (ГНУТІ) ЕЛЕМЕНТИ — ТЗ від 19.08.2026.
 *
 * Тест тримає три межі, на яких найлегше втратити гроші:
 *   · геометрія — прямокутник у розкрої дорівнює дузі плюс запас, і запас
 *     залежить від матеріалу (30% сегментація / 20% гнуття);
 *   · класифікація — прайс має п'ять категорій, і в кожну треба потрапити
 *     саме тією ознакою, якою це робить конструктор;
 *   · матриця — рахується за унікальними геометріями, а не за радіусами.
 */
import { describe, it, expect } from 'vitest';
import { explodeDetails } from '../geometry';
import { extractProductionFacts } from '../productionFacts';
import { computeEstimate } from '../estimate';
import { checkManufacturability } from '../../domain/manufacturability';
import {
  classifyRadiusMatrix,
  classifyRadiusService,
  radiusMatrixKey,
  radiusMethodFor,
  radiusReserveFor,
} from '../../domain/radiusElement';
import { createEmptyProject } from '../../domain/defaults';
import type { Detail, MaterialType, Project, RadiusElementMark } from '../../domain/types';

const base = { type: 'Стільниця', quantity: 1, thickness: 20 } as const;

/** Стільниця 2000×600 з потовщенням по сторонах A і B і радіусом на куті AB. */
function countertop(cornerRadius: number | undefined, bandSize = 100, sides = ['A', 'B']): Detail {
  return {
    ...base,
    id: 'ct',
    shape: 'Прямокутна',
    label: 'Стільниця',
    geometry: {
      width: 2000,
      height: 600,
      corners: cornerRadius ? { AB: { type: 'radius', radius: cornerRadius } } : undefined,
    },
    fold: { enabled: true, size: bandSize, sides },
  } as unknown as Detail;
}

const radiusParts = (detail: Detail, material?: MaterialType) =>
  explodeDetails([detail], undefined, material).filter((part) => part.radiusElement);

function factsFor(detail: Detail, material?: MaterialType) {
  const parts = explodeDetails([detail], undefined, material);
  const project: Project = { ...createEmptyProject(), details: [detail], projectMaterial: material };
  return { parts, project, facts: extractProductionFacts(project, parts, { details: [detail] }) };
}

// ── Геометрія і запас ────────────────────────────────────────────────

describe('гнутий елемент у розкрої', () => {
  it('радіус на куті, який обходить смуга, дає окремий прямокутник', () => {
    expect(radiusParts(countertop(150))).toHaveLength(1);
  });

  it('камінь: довжина = зовнішня дуга плюс 30%', () => {
    const part = radiusParts(countertop(150), 'Керамограніт')[0];
    expect(part.radiusElement!.arcLengthMm).toBeCloseTo(Math.PI * 150 / 2, 1);
    const long = Math.max(part.width, part.height);
    // π·150/2 = 235.6 → ×1.3 = 306.3
    expect(long).toBeGreaterThan(300);
    expect(long).toBeLessThan(312);
  });

  it('акрил: той самий радіус дає запас 20%, а не 30%', () => {
    const part = radiusParts(countertop(150), 'Акрил')[0];
    const long = Math.max(part.width, part.height);
    // 235.6 → ×1.2 = 282.7
    expect(long).toBeGreaterThan(277);
    expect(long).toBeLessThan(289);
    expect(part.radiusElement!.method).toBe('bending');
  });

  it('запас і спосіб задаються матеріалом, а не користувачем', () => {
    expect(radiusMethodFor('Керамограніт')).toBe('segments');
    expect(radiusMethodFor('Натуральний камінь')).toBe('segments');
    expect(radiusMethodFor('Кварцит')).toBe('segments');
    expect(radiusMethodFor('Акрил')).toBe('bending');
    expect(radiusReserveFor('segments')).toBe(1.3);
    expect(radiusReserveFor('bending')).toBe(1.2);
  });

  it('без радіуса гнутих елементів немає', () => {
    expect(radiusParts(countertop(undefined))).toHaveLength(0);
  });

  it('смуга лише на одній стороні кута — гнути нічого', () => {
    expect(radiusParts(countertop(150, 100, ['A']))).toHaveLength(0);
  });

  it('потовщення і підворот на тому самому куті — це ДВА елементи', () => {
    const detail = {
      ...countertop(150),
      thickening: { enabled: true, size: 40, sides: ['A', 'B'] },
    } as unknown as Detail;
    expect(radiusParts(detail)).toHaveLength(2);
  });

  it('подвійного рахунку немає: пряма смуга коротшає рівно на радіус', () => {
    const withRadius = explodeDetails([countertop(150)])
      .filter((part) => part.edgeKind && !part.radiusElement)
      .find((part) => part.width > part.height)!;
    const plain = explodeDetails([countertop(undefined)])
      .filter((part) => part.edgeKind)
      .find((part) => part.width > part.height)!;
    expect(Math.round(plain.width - withRadius.width)).toBe(150);
  });
});

// ── Класифікація послуги ─────────────────────────────────────────────

describe('категорія послуги за ТЗ', () => {
  const seg = (role: 'countertop' | 'leg' | 'other', bandSizeMm: number, complex = false) =>
    classifyRadiusService({ method: 'segments', role, bandSizeMm, radiusMm: 150, complex });

  it('стільниця класифікується за товщиною краю', () => {
    expect(seg('countertop', 40)).toBe('countertop_le80');
    expect(seg('countertop', 80)).toBe('countertop_le80');
    expect(seg('countertop', 81)).toBe('countertop_80_200');
    expect(seg('countertop', 200)).toBe('countertop_80_200');
  });

  it('товщина понад 200 мм прайсу невідома — це складний радіус', () => {
    expect(seg('countertop', 250)).toBe('complex');
  });

  it('опора класифікується за висотою', () => {
    expect(seg('leg', 900)).toBe('leg_le900');
    expect(seg('leg', 901)).toBe('leg_gt900');
    expect(seg('leg', 1800)).toBe('leg_gt900');
  });

  it('усе, що не стільниця і не опора, іде як складний', () => {
    expect(seg('other', 100)).toBe('complex');
  });

  it('вибір людини сильніший за автомат', () => {
    expect(seg('countertop', 40, true)).toBe('complex');
  });

  it('гнуття класифікується ТІЛЬКИ за радіусом', () => {
    const bend = (radiusMm: number) =>
      classifyRadiusService({ method: 'bending', role: 'countertop', bandSizeMm: 40, radiusMm });
    expect(bend(400)).toBe('bend_le600');
    expect(bend(600)).toBe('bend_le600');
    expect(bend(601)).toBe('bend_gt600');
  });
});

// ── Матриця ──────────────────────────────────────────────────────────

describe('матриця для гнуття', () => {
  it('категорія матриці йде за тим самим порогом, що й гнуття', () => {
    const m = (radiusMm: number, complex = false) =>
      classifyRadiusMatrix({ method: 'bending', role: 'countertop', bandSizeMm: 40, radiusMm, complex });
    expect(m(500)).toBe('matrix_le600');
    expect(m(800)).toBe('matrix_gt600');
    expect(m(500, true)).toBe('matrix_complex');
  });

  it('однакова геометрія — один ключ, різна висота смуги — різні', () => {
    const a = radiusMatrixKey({ radiusMm: 500, bandSizeMm: 40, arcAngleDeg: 90 });
    const b = radiusMatrixKey({ radiusMm: 500, bandSizeMm: 40, arcAngleDeg: 90 });
    const c = radiusMatrixKey({ radiusMm: 500, bandSizeMm: 100, arcAngleDeg: 90 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('приклад із ТЗ (п. 3.6): 3×R500 + 1×R500 іншої геометрії + 1×R800', () => {
    const marks: RadiusElementMark[] = [
      { radiusMm: 500, arcLengthMm: 1, cornerId: 'a', bandSizeMm: 40, arcAngleDeg: 90, method: 'bending' },
      { radiusMm: 500, arcLengthMm: 1, cornerId: 'b', bandSizeMm: 40, arcAngleDeg: 90, method: 'bending' },
      { radiusMm: 500, arcLengthMm: 1, cornerId: 'c', bandSizeMm: 40, arcAngleDeg: 90, method: 'bending' },
      { radiusMm: 500, arcLengthMm: 1, cornerId: 'd', bandSizeMm: 120, arcAngleDeg: 90, method: 'bending' },
      { radiusMm: 800, arcLengthMm: 1, cornerId: 'e', bandSizeMm: 40, arcAngleDeg: 90, method: 'bending' },
    ];
    const keys = new Set(marks.map((mark) => radiusMatrixKey({
      radiusMm: mark.radiusMm,
      bandSizeMm: mark.bandSizeMm!,
      arcAngleDeg: mark.arcAngleDeg!,
    })));
    // Три унікальні матриці: R500/40, R500/120, R800/40.
    expect(keys.size).toBe(3);

    // Гнуття рахується за КІЛЬКІСТЮ радіусів: 4 до 600 і 1 понад.
    const bends = marks.map((mark) => classifyRadiusService({
      method: 'bending', role: 'countertop', bandSizeMm: mark.bandSizeMm!, radiusMm: mark.radiusMm,
    }));
    expect(bends.filter((kind) => kind === 'bend_le600')).toHaveLength(4);
    expect(bends.filter((kind) => kind === 'bend_gt600')).toHaveLength(1);
  });
});

// ── Гроші ────────────────────────────────────────────────────────────

describe('радіусний елемент у кошторисі', () => {
  it('керамограніт, край 100 мм → категорія 80–200 з кодом 298635', () => {
    const detail = countertop(150, 100);
    const { project, parts } = factsFor(detail, 'Керамограніт');
    // Ціну дає 1С за кодом номенклатури — тут підставлена відповідь
    // сервісу за 298635. Перевіряється саме зв'язка «класифікація →
    // код → гроші»: без коду рядок лишився б нульовим.
    const erpPrices = { '298635': 15872.15 };
    const lines = computeEstimate(project, parts, { details: [detail], erpPrices }).lines;
    const line = lines.find((item) => item.serviceId === 'RADIUS_CT200_CERAMIC');
    expect(line).toBeDefined();
    expect(line!.quantity).toBe(1);
    expect(line!.externalId).toBe('298635');
    expect(line!.priceSource).toBe('erp');
    expect(line!.total).toBeCloseTo(15872.15, 2);
  });

  it('керамограніт, край 40 мм → дешевша категорія до 80 мм', () => {
    const detail = countertop(150, 40);
    const { project, parts } = factsFor(detail, 'Керамограніт');
    const ids = computeEstimate(project, parts, { details: [detail] }).lines.map((l) => l.serviceId);
    expect(ids).toContain('RADIUS_CT80_CERAMIC');
    expect(ids).not.toContain('RADIUS_CT200_CERAMIC');
  });

  it('кварцит бере свою номенклатуру, а не керамогранітну', () => {
    const detail = countertop(150, 40);
    const { project, parts } = factsFor(detail, 'Кварцит');
    const ids = computeEstimate(project, parts, { details: [detail] }).lines.map((l) => l.serviceId);
    expect(ids).toContain('RADIUS_CT80_QUARTZ');
    expect(ids).not.toContain('RADIUS_CT80_CERAMIC');
  });

  it('акрил дає гнуття і матрицю, а не сегментацію', () => {
    const detail = countertop(500, 40);
    const { project, parts } = factsFor(detail, 'Акрил');
    const ids = computeEstimate(project, parts, { details: [detail] }).lines.map((l) => l.serviceId);
    expect(ids).toContain('RADIUS_BEND_ACRYLIC');
    expect(ids).toContain('RADIUS_MATRIX_ACRYLIC');
    expect(ids.some((id) => id.endsWith('_CERAMIC'))).toBe(false);
  });

  it('два однакові радіуси на акрилі — два гнуття, але одна матриця', () => {
    const detail = {
      ...base,
      id: 'two',
      shape: 'Прямокутна',
      label: 'Стільниця',
      geometry: {
        width: 2000,
        height: 600,
        corners: {
          AB: { type: 'radius', radius: 500 },
          BC: { type: 'radius', radius: 500 },
        },
      },
      fold: { enabled: true, size: 40, sides: ['A', 'B', 'C'] },
    } as unknown as Detail;

    const { project, parts } = factsFor(detail, 'Акрил');
    const lines = computeEstimate(project, parts, { details: [detail] }).lines;
    expect(lines.find((l) => l.serviceId === 'RADIUS_BEND_ACRYLIC')!.quantity).toBe(2);
    expect(lines.find((l) => l.serviceId === 'RADIUS_MATRIX_ACRYLIC')!.quantity).toBe(1);
  });

  it('без радіуса жодної радіусної послуги немає', () => {
    const detail = countertop(undefined);
    const { project, parts } = factsFor(detail, 'Керамограніт');
    const ids = computeEstimate(project, parts, { details: [detail] }).lines.map((l) => l.serviceId);
    expect(ids.some((id) => id.startsWith('RADIUS_'))).toBe(false);
  });
});

// ── Попередження ─────────────────────────────────────────────────────

describe('попередження', () => {
  const issuesFor = (radius: number, material?: MaterialType) => {
    const detail = countertop(radius);
    const parts = explodeDetails([detail], undefined, material);
    const project: Project = { ...createEmptyProject(), details: [detail], projectMaterial: material };
    return checkManufacturability(project, parts, { details: [detail] });
  };

  it('R80 просить узгодити з технологом, але нічого не блокує', () => {
    const issues = issuesFor(80, 'Керамограніт');
    const notice = issues.find((issue) => issue.code === 'radius_needs_technologist');
    expect(notice).toBeDefined();
    expect(notice!.severity).toBe('guarantee');
    expect(issues.some((issue) => issue.severity === 'error')).toBe(false);
    expect(radiusParts(countertop(80))).toHaveLength(1);
  });

  it('R150 попередження не викликає', () => {
    expect(issuesFor(150, 'Керамограніт').some((i) => i.code === 'radius_needs_technologist')).toBe(false);
  });

  it('матеріал без тарифу не мовчить, а каже про себе', () => {
    const issues = issuesFor(150, 'Компакт-плита');
    expect(issues.some((issue) => issue.code === 'radius_material_unpriced')).toBe(true);
  });
});
