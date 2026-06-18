import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoPack } from '../packing';
import { mockProject, mockParts } from './mockData';

let idCounter = 0;

vi.mock('../../domain/defaults', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domain/defaults')>();
  return {
    ...actual,
    uid: () => `test-id-${++idCounter}`,
  };
});

describe('packing.ts (Safety Net)', () => {
  beforeEach(() => {
    idCounter = 0; // Reset counter to ensure determinism across test runs
  });

  it('should autoPack project with deterministic output matching snapshot', () => {
    const result = autoPack(mockProject, mockParts);

    // Normalize placements to prevent floating-point flakiness
    const normalizedPlacements = result.placements.map(p => ({
      ...p,
      x: Math.round(p.x * 100) / 100 + 0, // +0 converts -0 to 0
      y: Math.round(p.y * 100) / 100 + 0,
      rotation: Math.round(p.rotation * 100) / 100 + 0,
    }));

    // Expect stable outputs
    expect(normalizedPlacements).toMatchSnapshot('placements');
    expect(result.unplacedPartIds).toMatchSnapshot('unplacedPartIds');
    expect(result.unplacedReasons).toMatchSnapshot('unplacedReasons');
  });
});
