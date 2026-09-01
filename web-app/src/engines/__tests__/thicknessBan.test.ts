import { describe, it, expect } from 'vitest';
import { autoPack, detectConflicts } from '../packing';
import { mockProject, mockParts } from './mockData';
import type { Project } from '../../domain/types';

/**
 * Товщина деталі проти товщини слеба (рішення 25.08 → 26.08).
 *
 * РІШЕННЯ ВЛАСНИКА 26.08: поки що ПОПЕРЕДЖЕННЯ, не заборона. Деталь
 * 12 мм на слебі 20 мм ЛЯГАЄ — розкрій працює як працював, — але
 * розміщення несе thicknessWarning із числами, і дошка його показує
 * (янтарний бейдж «T» + рядок над слебом).
 *
 * Якщо колись вмикатиметься жорстка заборона — це окреме погоджене
 * рішення, і перший тест нижче має бути СВІДОМО переписаний, а не
 * «полагоджений»: він охороняє саме м'яку поведінку.
 */

const withSlabThickness = (project: Project, thickness: number): Project => ({
  ...project,
  slabs: project.slabs.map((slab) => ({ ...slab, thickness })),
});

const packAndDetect = (project: Project) => {
  const packed = autoPack(project, mockParts);
  return { packed, detected: detectConflicts(project, mockParts, packed.placements) };
};

describe('товщина деталі ≠ товщині слеба — попередження, не заборона', () => {
  it('деталь 20 мм ЛЯГАЄ на сляб 12 мм, але з попередженням із числами', () => {
    const project = withSlabThickness(mockProject, 12);
    const { packed, detected } = packAndDetect(project);
    // Не заборона: розкрій пройшов, деталі на слебах
    expect(packed.placements.length).toBeGreaterThan(0);
    // Але кожне розміщення попереджає, і текст називає обидва числа
    detected.forEach((placement) => {
      expect(placement.thicknessWarning).toContain('товщина деталі 20 мм');
      expect(placement.thicknessWarning).toContain('товщині слеба 12 мм');
      // Попередження ≠ конфлікт: статус проєкту не червоніє через товщину
      expect(placement.conflict).toBeFalsy();
    });
  });

  it('та сама товщина — попередження немає', () => {
    const { packed, detected } = packAndDetect(mockProject);
    expect(packed.placements.length).toBeGreaterThan(0);
    detected.forEach((placement) => {
      expect(placement.thicknessWarning).toBeUndefined();
    });
  });

  it('дробова різниця теж ловиться: 20 ≠ 20.5', () => {
    const project = withSlabThickness(mockProject, 20.5);
    const { detected } = packAndDetect(project);
    expect(detected.length).toBeGreaterThan(0);
    detected.forEach((placement) => {
      expect(placement.thicknessWarning).toBeTruthy();
    });
  });

  it('товщина слеба не задана — попередження немає (старі проєкти)', () => {
    const project = withSlabThickness(mockProject, 0);
    const { packed, detected } = packAndDetect(project);
    expect(packed.placements.length).toBeGreaterThan(0);
    detected.forEach((placement) => {
      expect(placement.thicknessWarning).toBeUndefined();
    });
  });

  it('два сляби різної товщини — попередження тільки на чужому', () => {
    const project: Project = {
      ...mockProject,
      slabs: mockProject.slabs.map((slab, index) => ({
        ...slab,
        thickness: index === 0 ? 12 : 20,
      })),
    };
    const { detected } = packAndDetect(project);
    detected.forEach((placement) => {
      if (placement.slabId === 'slab-1') expect(placement.thicknessWarning).toBeTruthy();
      else expect(placement.thicknessWarning).toBeUndefined();
    });
  });
});
