/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../useProjectStore';

describe('projectSlice - updatePlacement3dTransform', () => {
  beforeEach(() => {
    // Reset the store to a known state
    useProjectStore.setState({
      project: {
        id: '123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        name: 'Test',
        orderNumber: 'TEST-1',
        materialId: 'm1',
        parts: [],
        details: [],
        groups: [],
        placements: [
          {
            id: 'pl1',
            slabId: 's1',
            partId: 'p1',
            x: 0,
            y: 0,
            rotation: 0,
            manualLocked: false
          }
        ],
        textureLayouts: [],
        textureFrames: [],
        slabs: []
      },
      currentDbProjectId: null,
      parts: []
    });
  });

  it('saves 3D transform correctly to transform3d property', () => {
    const store = useProjectStore.getState();
    expect(store.project.placements[0].transform3d).toBeUndefined();
    expect((store.project.placements[0] as any).assemblyTransform).toBeUndefined();

    const transform = { x: 10, y: 20, z: 0, rx: 0, ry: 0, rz: 0 };
    store.updatePlacement3dTransform('pl1', transform);

    const updatedStore = useProjectStore.getState();
    const updatedPlacement = updatedStore.project.placements[0];

    expect(updatedPlacement.transform3d).toEqual(transform);
    expect((updatedPlacement as any).assemblyTransform).toBeUndefined();
  });
});
