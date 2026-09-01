import { describe, expect, it } from 'vitest';
import {
  rulesForMaterial, checkInnerCorner, checkLShapeInnerCorner, checkPartSize,
  checkCutout, checkCutoutSpacing, checkAccessoryHole, checkOverhang, checkJointNearCutout,
  MATERIAL_RULES, NC300_MAX_PART,
} from '../materialRules';

/**
 * ТУ цеху 26.03.2025. Головне правило власника: порушення ТУ —
 * ПОПЕРЕДЖЕННЯ, не блокування. Тому тести стежать не лише за тим, ЩО
 * ловиться, а й за тим, що жодна перевірка не видає 'error'.
 */
describe('ТУ по матеріалах', () => {
  it('усі перевірки дають лише попередження, нічого не блокують', () => {
    const all = [
      ...checkInnerCorner(1, 'Керамограніт'),
      ...checkLShapeInnerCorner(10, 'Кварцит'),
      ...checkPartSize(4000, 2000, 'Кварцит'),
      ...checkCutout(5, 10, 'Керамограніт'),
      ...checkCutoutSpacing(20, 'Акрил'),
      ...checkAccessoryHole(80, 10, 10),
      ...checkOverhang(500),
      ...checkJointNearCutout(0, 'sink'),
    ];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((i) => i.level === 'warning')).toBe(true);
  });

  it('мінімальний внутрішній радіус — свій у кожного матеріалу', () => {
    expect(MATERIAL_RULES['Керамограніт'].minInnerCornerR).toBe(5);
    expect(MATERIAL_RULES['Кварцит'].minInnerCornerR).toBe(3);
    expect(MATERIAL_RULES['Акрил'].minInnerCornerR).toBe(4);
  });

  it('кераміка нижче R5 — з посиланням на заборону виробника', () => {
    const [issue] = checkInnerCorner(3, 'Керамограніт');
    expect(issue.message).toContain('виробником');
  });

  it('кварцит R3 проходить, а R2 — ні', () => {
    expect(checkInnerCorner(3, 'Кварцит')).toEqual([]);
    expect(checkInnerCorner(2, 'Кварцит')).toHaveLength(1);
  });

  it('натуральний камінь ведеться по кварциту', () => {
    expect(rulesForMaterial('Натуральний камінь')?.material).toBe('Кварцит');
  });

  it('Г-подібна: фрезерована кромка дає R60, менше — ручна робота', () => {
    const [issue] = checkLShapeInnerCorner(10, 'Кварцит');
    expect(issue.message).toContain('ВРУЧНУ');
  });

  it('плита 40 мм із кромкою U40 вимагає R70 у куті', () => {
    const [issue] = checkLShapeInnerCorner(20, 'Кварцит', 40, ['u_40']);
    expect(issue.message).toContain('R70');
    expect(issue.message).toContain('євростик');
  });

  it('деталь більша за стіл NC300 — попередження про узгодження з цехом', () => {
    const issues = checkPartSize(3200, 1700, 'Кварцит');
    expect(issues.some((i) => i.message.includes('NC300'))).toBe(true);
    expect(checkPartSize(2000, 900, 'Кварцит').some((i) => i.message.includes('NC300'))).toBe(false);
  });

  it('виріз під мийку: кераміка/кварцит R15, акрил R10', () => {
    expect(checkCutout(10, 100, 'Кварцит')).toHaveLength(1);
    expect(checkCutout(10, 100, 'Акрил')).toEqual([]);
    expect(checkCutout(15, 100, 'Керамограніт')).toEqual([]);
  });

  it('відстань між вирізами: акрил суворіший за камінь', () => {
    expect(checkCutoutSpacing(120, 'Кварцит')).toEqual([]);
    expect(checkCutoutSpacing(120, 'Акрил')).toHaveLength(1);
  });

  it('отвір під аксесуар: чим більший, тим далі від вирізу', () => {
    expect(checkAccessoryHole(35, 25, 25)).toEqual([]);
    expect(checkAccessoryHole(35, 15, 25)).toHaveLength(1);
    expect(checkAccessoryHole(80, 60, 60).some((i) => i.message.includes('100'))).toBe(true);
  });

  it('нависання понад 300 мм — попередження про тріщину', () => {
    expect(checkOverhang(280)).toEqual([]);
    expect(checkOverhang(400)[0].message).toContain('трісне');
  });

  it('стик по краю вирізу під мийку — категорична заборона ТУ', () => {
    expect(checkJointNearCutout(0, 'sink')[0].message).toContain('категорично');
    expect(checkJointNearCutout(150, 'sink')).toEqual([]);
  });

  it('стик по центру варильної — можливо, але з опорами', () => {
    expect(checkJointNearCutout(0, 'hob')[0].message).toContain('опорами');
  });

  it('усі попередження називають джерело — це ТУ, не наша вигадка', () => {
    const issues = [...checkOverhang(400), ...checkInnerCorner(1, 'Кварцит')];
    expect(issues.every((i) => i.source?.includes('ТУ'))).toBe(true);
  });

  it('межі станка збережені як факт', () => {
    expect(NC300_MAX_PART).toEqual({ width: 3000, height: 1600 });
  });
});
