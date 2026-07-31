import { describe, it, expect } from 'vitest';
import { buildAssemblyGroups } from '../grouping3d';
import type { DetailPart, Placement } from '../../domain/types';

describe('buildAssemblyGroups', () => {
  it('groups multiple sinks as independent assembly groups (Test A)', () => {
    const parts: DetailPart[] = [
      { id: 'p1', detailId: 'd1', name: 'Sink Base 1', type: 'Мийка', shape: 'Прямокутна', width: 500, height: 400, rotation: 0, area: 0.2, points: [], isMain: true, parentLabel: 'Sink 1', dimsLabel: '', textureGroupKind: 'rectSink' },
      { id: 'p2', detailId: 'd1', name: 'Sink Fold 1', type: 'Мийка', shape: 'Прямокутна', width: 500, height: 200, rotation: 0, area: 0.1, points: [], isMain: false, parentLabel: 'Sink 1', dimsLabel: '', textureGroupKind: 'rectSink' },
      { id: 'p3', detailId: 'd1', name: 'Sink Base 2', type: 'Мийка', shape: 'Прямокутна', width: 500, height: 400, rotation: 0, area: 0.2, points: [], isMain: true, parentLabel: 'Sink 2', dimsLabel: '', textureGroupKind: 'rectSink' },
      { id: 'p4', detailId: 'd1', name: 'Sink Base 3', type: 'Мийка', shape: 'Прямокутна', width: 500, height: 400, rotation: 0, area: 0.2, points: [], isMain: true, parentLabel: 'Sink 3', dimsLabel: '', textureGroupKind: 'rectSink' }
    ];

    const placements: Placement[] = [
      { id: 'pl1', slabId: 's1', partId: 'p1', x: 0, y: 0, rotation: 0, manualLocked: false },
      { id: 'pl2', slabId: 's1', partId: 'p2', x: 10, y: 10, rotation: 0, manualLocked: false },
      { id: 'pl3', slabId: 's1', partId: 'p3', x: 20, y: 20, rotation: 0, manualLocked: false },
      { id: 'pl4', slabId: 's1', partId: 'p4', x: 30, y: 30, rotation: 0, manualLocked: false }
    ];

    const groups = buildAssemblyGroups(parts, placements, true);

    expect(groups).toHaveLength(3); // 3 independent sinks
    
    const group1 = groups.find(g => g.mainPart.parentLabel === 'Sink 1');
    expect(group1).toBeDefined();
    expect(group1?.isSink).toBe(true);
    expect(group1?.foldPlacements).toHaveLength(1); // p2
    
    const group2 = groups.find(g => g.mainPart.parentLabel === 'Sink 2');
    expect(group2).toBeDefined();
    expect(group2?.isSink).toBe(true);
    expect(group2?.foldPlacements).toHaveLength(0);
  });

  it('groups DXF tabletop and folds as a single assembly group (Test B)', () => {
    const parts: DetailPart[] = [
      { id: 'p1', detailId: 'd1', name: 'DXF Tabletop', type: 'Стільниця', shape: 'customContour', width: 1000, height: 600, rotation: 0, area: 0.6, points: [], isMain: true, parentLabel: 'DXF 1', dimsLabel: '', textureGroupLabel: 'import:tabletop' },
      { id: 'p2', detailId: 'd1', name: 'DXF Skirting', type: 'Плінтус', shape: 'Прямокутна', width: 1000, height: 50, rotation: 0, area: 0.05, points: [], isMain: true, parentLabel: 'DXF 1', dimsLabel: '', textureGroupLabel: 'import:tabletop' } // Notice both are isMain=true!
    ];

    const placements: Placement[] = [
      { id: 'pl1', slabId: 's1', partId: 'p1', x: 0, y: 0, rotation: 0, manualLocked: false },
      { id: 'pl2', slabId: 's1', partId: 'p2', x: 10, y: 10, rotation: 0, manualLocked: false }
    ];

    const groups = buildAssemblyGroups(parts, placements, true);

    expect(groups).toHaveLength(1); // DXF grouped together
    expect(groups[0].isSink).toBe(false);
    expect(groups[0].foldPlacements).toHaveLength(1);
    expect(groups[0].foldPlacements[0].id).toBe('pl2');
  });

  it('separates sink from DXF tabletop even if sink is inside DXF (Test C - Edge case)', () => {
    // DXF group includes a sink part inside it (in terms of physical placement, but logically we need them separate).
    // Sinks have textureGroupKind: 'rectSink', DXF has textureGroupLabel: 'import:tabletop'
    const parts: DetailPart[] = [
      { id: 'p1', detailId: 'd1', name: 'DXF Tabletop', type: 'Стільниця', shape: 'customContour', width: 1000, height: 600, rotation: 0, area: 0.6, points: [], isMain: true, parentLabel: 'DXF 1', dimsLabel: '', textureGroupLabel: 'import:tabletop' },
      // What if sink accidentally has the same textureGroupLabel because it was imported with the DXF?
      { id: 'p2', detailId: 'd2', name: 'Sink Base', type: 'Мийка', shape: 'Прямокутна', width: 500, height: 400, rotation: 0, area: 0.2, points: [], isMain: true, parentLabel: 'Sink 1', dimsLabel: '', textureGroupKind: 'rectSink', textureGroupLabel: 'import:tabletop' }
    ];

    const placements: Placement[] = [
      { id: 'pl1', slabId: 's1', partId: 'p1', x: 0, y: 0, rotation: 0, manualLocked: false },
      { id: 'pl2', slabId: 's1', partId: 'p2', x: 10, y: 10, rotation: 0, manualLocked: false }
    ];

    const groups = buildAssemblyGroups(parts, placements, true);

    // Because Sinks are processed first, it will consume pl2. 
    // Then DXF block logic runs, but it shouldn't consume pl2.
    // DXF group should have pl1.
    // Sink group should have pl2.
    expect(groups).toHaveLength(2);
    
    const sinkGroup = groups.find(g => g.isSink);
    expect(sinkGroup).toBeDefined();
    expect(sinkGroup?.mainPlacement.id).toBe('pl2');
    
    const dxfGroup = groups.find(g => !g.isSink);
    expect(dxfGroup).toBeDefined();
    expect(dxfGroup?.mainPlacement.id).toBe('pl1');
    expect(dxfGroup?.foldPlacements).toHaveLength(0); // Sink shouldn't be a fold
  });
});
