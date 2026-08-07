/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../useProjectStore';
import type { Project } from '../../domain/types';

/**
 * Глобальний Undo/Redo: знімок = пара посилань {project, parts}.
 *
 * Головні властивості, які тримає цей тест:
 *  · undo повертає І проєкт, І парти — разом, без розсинхрону;
 *  · кожен undo/redo інкрементує packingRequestId — відповідь воркера,
 *    запущена до відкату, буде відкинута обробником;
 *  · знімки — посилання (structural sharing), не клони;
 *  · нова дія після undo стирає майбутнє (класична поведінка історії).
 */

function makeProject(name: string): Project {
  return {
    id: 'p1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    orderNumber: name,
    materialId: 'm1',
    parts: [], details: [], groups: [],
    placements: [], textureLayouts: [], textureFrames: [], slabs: [],
  } as unknown as Project;
}

const partsA = [{ id: 'part-a' }] as never[];
const partsB = [{ id: 'part-b' }] as never[];

describe('historySlice — глобальний undo/redo', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: makeProject('A'),
      parts: partsA,
      history: [],
      future: [],
      currentDbProjectId: null,
      packingRequestId: 0,
      isPacking: false,
    } as never);
  });

  function mutateTo(name: string, parts: never[]) {
    // Імітація дії користувача: знімок ДО зміни (як у triggerPackingAsync),
    // потім сама зміна.
    useProjectStore.getState().pushHistorySnapshot();
    useProjectStore.setState({ project: makeProject(name), parts } as never);
  }

  it('undo повертає проєкт І парти разом', () => {
    const before = useProjectStore.getState().project;
    mutateTo('B', partsB);
    expect(useProjectStore.getState().project.orderNumber).toBe('B');

    useProjectStore.getState().undo();
    const s = useProjectStore.getState();
    expect(s.project).toBe(before);      // те саме ПОСИЛАННЯ, не копія
    expect(s.parts).toBe(partsA);
  });

  it('redo повертає скасоване', () => {
    mutateTo('B', partsB);
    const after = useProjectStore.getState().project;
    useProjectStore.getState().undo();
    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project).toBe(after);
    expect(useProjectStore.getState().parts).toBe(partsB);
  });

  it('кожен undo/redo відсікає відповіді воркера (bump requestId)', () => {
    mutateTo('B', partsB);
    const id0 = useProjectStore.getState().packingRequestId;
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().packingRequestId).toBe(id0 + 1);
    expect(useProjectStore.getState().isPacking).toBe(false);
    useProjectStore.getState().redo();
    expect(useProjectStore.getState().packingRequestId).toBe(id0 + 2);
  });

  it('нова дія після undo стирає майбутнє', () => {
    mutateTo('B', partsB);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().future.length).toBe(1);
    mutateTo('C', partsB);
    expect(useProjectStore.getState().future.length).toBe(0);
    // redo тепер нікуди не веде
    const current = useProjectStore.getState().project;
    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project).toBe(current);
  });

  it('повторний знімок без зміни не створює порожній крок (дедуп)', () => {
    useProjectStore.getState().pushHistorySnapshot();
    useProjectStore.getState().pushHistorySnapshot();
    expect(useProjectStore.getState().history.length).toBe(1);
  });

  it('undo на порожній історії — нічого не робить і не падає', () => {
    const before = useProjectStore.getState().project;
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project).toBe(before);
  });

  it('глибина обмежена 50 кроками', () => {
    for (let i = 0; i < 60; i++) mutateTo(`step-${i}`, partsB);
    expect(useProjectStore.getState().history.length).toBe(50);
  });

  it('старі імена (pushMovementSnapshot/undoLastMovement) працюють як аліаси', () => {
    const before = useProjectStore.getState().project;
    useProjectStore.getState().pushMovementSnapshot();
    useProjectStore.setState({ project: makeProject('moved') } as never);
    useProjectStore.getState().undoLastMovement();
    expect(useProjectStore.getState().project).toBe(before);
  });
});
