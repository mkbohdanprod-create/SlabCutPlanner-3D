/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../useProjectStore';
import { mockProject, mockParts } from '../../engines/__tests__/mockData';
import { SLAB_DELETED_UNPLACED_REASON } from '../slices/packingSlice';
import type { Project } from '../../domain/types';

/**
 * ВИДАЛЕННЯ СЛЕБА НЕ ЗНИЩУЄ ДЕТАЛІ (зауваження власника 27.08).
 *
 * Деталь завжди має де бути: або на слебі, або в буфері нерозміщених.
 * Стан «ніде» означав тиху втрату — розміщення вже немає, у буфер не
 * поклали, і замовлення худло непомітно до самого прорахунку.
 *
 * Буфер на екрані читає саме `project.unplacedPartIds` (див.
 * UnplacedPartsPanel), тому перевіряємо цей список, а не «щось десь є».
 */

/** Проєкт із розкладеними деталями: кожна частина лежить на першому слебі */
function projectWithPlacements(): Project {
  const slabId = mockProject.slabs[0].id;
  return {
    ...mockProject,
    unplacedPartIds: [],
    unplacedReasons: {},
    placements: mockParts.map((part, index) => ({
      id: `pl-${index}`,
      partId: part.id,
      slabId,
      x: 10,
      y: 10 + index * 10,
      rotation: 0 as const,
    })),
  };
}

describe('deleteSlab: деталі повертаються в буфер, а не зникають', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: projectWithPlacements(), parts: mockParts });
  });

  it('усі деталі видаленого слеба опиняються в буфері нерозміщених', () => {
    const slabId = mockProject.slabs[0].id;
    const partsOnSlab = useProjectStore.getState().project.placements
      .filter((p) => p.slabId === slabId)
      .map((p) => p.partId);
    expect(partsOnSlab.length).toBeGreaterThan(0);

    useProjectStore.getState().deleteSlab(slabId);

    const project = useProjectStore.getState().project;
    // Слеба немає, його розміщень теж
    expect(project.slabs.some((s) => s.id === slabId)).toBe(false);
    expect(project.placements.some((p) => p.slabId === slabId)).toBe(false);
    // А деталі — усі до одної в буфері, і з поясненням
    partsOnSlab.forEach((partId) => {
      expect(project.unplacedPartIds).toContain(partId);
      expect(project.unplacedReasons?.[partId]).toBe(SLAB_DELETED_UNPLACED_REASON);
    });
  });

  it('жодна деталь не губиться: сума «на слебах + у буфері» не змінилась', () => {
    const before = new Set([
      ...useProjectStore.getState().project.placements.map((p) => p.partId),
      ...useProjectStore.getState().project.unplacedPartIds,
    ]);

    useProjectStore.getState().deleteSlab(mockProject.slabs[0].id);

    const project = useProjectStore.getState().project;
    const after = new Set([
      ...project.placements.map((p) => p.partId),
      ...project.unplacedPartIds,
    ]);
    expect([...after].sort()).toEqual([...before].sort());
  });

  it('деталь, що вже була в буфері, не дублюється', () => {
    const slabId = mockProject.slabs[0].id;
    const partId = mockParts[0].id;
    useProjectStore.setState((state) => ({
      project: { ...state.project, unplacedPartIds: [partId] },
    }));

    useProjectStore.getState().deleteSlab(slabId);

    const ids = useProjectStore.getState().project.unplacedPartIds;
    expect(ids.filter((id) => id === partId)).toHaveLength(1);
  });

  it('видалення порожнього слеба нічого не додає в буфер', () => {
    const emptySlabId = mockProject.slabs[1]?.id;
    if (!emptySlabId) return;

    useProjectStore.getState().deleteSlab(emptySlabId);

    expect(useProjectStore.getState().project.unplacedPartIds).toHaveLength(0);
  });
});
