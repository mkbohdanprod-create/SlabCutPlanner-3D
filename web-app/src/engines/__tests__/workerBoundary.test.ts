import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoPack } from '../packing';
import { mockProject, mockParts } from './mockData';
import { stripBase64 } from '../workerMapper';
import { produce } from 'immer';

let idCounter = 0;

vi.mock('../../domain/defaults', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domain/defaults')>();
  return {
    ...actual,
    uid: () => `test-id-${++idCounter}`,
  };
});

describe('Worker Boundary (Serialization Safety Net)', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it('should survive structuredClone serialization and produce identical results', () => {
    // 1. Run normal autoPack
    idCounter = 0;
    const directResult = autoPack(mockProject, mockParts);

    // 2. Prepare data for worker transfer (strip base64)
    // We wrap mockProject in immer produce to simulate a Zustand frozen state/proxy
    const frozenProject = produce(mockProject, draft => { draft.orderNumber = mockProject.orderNumber; });
    const strippedProject = stripBase64(frozenProject);
    
    // 3. Serialize/Deserialize using structuredClone (simulating postMessage)
    const clonedProject = structuredClone(strippedProject);
    const clonedParts = structuredClone(mockParts);

    // 4. Run autoPack on cloned data
    idCounter = 0;
    const clonedResult = autoPack(clonedProject, clonedParts);

    // 5. Verify the results are EXACTLY identical
    // This proves that stripping base64 and structuredClone don't break geometry or algorithm
    expect(clonedResult.placements).toEqual(directResult.placements);
    expect(clonedResult.unplacedPartIds).toEqual(directResult.unplacedPartIds);
  });
});
