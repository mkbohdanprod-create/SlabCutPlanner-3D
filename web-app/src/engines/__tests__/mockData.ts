import type { DetailPart, Project, SlabInstance } from '../../domain/types';

export const mockSlabs: SlabInstance[] = [
  {
    id: 'slab-1',
    width: 3000,
    height: 1500,
    thickness: 20,
    material: 'Керамограніт',
    decor: 'White',
    comment: '',
    minMargin: 10,
    textureTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, opacity: 1 },
    defects: [],
    serialNumber: 'SN-001'
  },
  {
    id: 'slab-2', // identical slab
    width: 3000,
    height: 1500,
    thickness: 20,
    material: 'Керамограніт',
    decor: 'White',
    comment: '',
    minMargin: 10,
    textureTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, opacity: 1 },
    defects: [
       // edge case: defect in the middle
       { id: 'def-1', shapeType: 'rect', x: 1000, y: 500, width: 200, height: 200 }
    ],
    serialNumber: 'SN-002'
  }
];

export const mockParts: DetailPart[] = [
  // 1. Normal large part
  {
    id: 'part-1', detailId: 'det-1', name: 'Стільниця', type: 'Стільниця', shape: 'Прямокутна',
    width: 2000, height: 600, rotation: 0, area: 1.2, points: [], isMain: true,
    parentLabel: 'Det1', dimsLabel: '2000x600', textureIrrelevant: false
  },
  // 2. Exact match (zero gap vertically for slab 1) - height 1480 + 2*10 margin = 1500
  {
    id: 'part-exact', detailId: 'det-2', name: 'Стільниця Exact', type: 'Стільниця', shape: 'Прямокутна',
    width: 1000, height: 1480, rotation: 0, area: 1.48, points: [], isMain: true,
    parentLabel: 'Det2', dimsLabel: '1000x1480', textureIrrelevant: false
  },
  // 3. Multiple identical parts
  {
    id: 'part-dup-1', detailId: 'det-3', name: 'Полиця 1', type: 'Стільниця', shape: 'Прямокутна',
    width: 500, height: 500, rotation: 0, area: 0.25, points: [], isMain: true,
    parentLabel: 'Det3', dimsLabel: '500x500', textureIrrelevant: false
  },
  {
    id: 'part-dup-2', detailId: 'det-3', name: 'Полиця 2', type: 'Стільниця', shape: 'Прямокутна',
    width: 500, height: 500, rotation: 0, area: 0.25, points: [], isMain: true,
    parentLabel: 'Det3', dimsLabel: '500x500', textureIrrelevant: false
  },
  // 4. Fold part (підворот)
  {
    id: 'part-fold-1', detailId: 'det-1', name: 'Підворот', type: 'Стільниця', shape: 'Прямокутна',
    width: 2000, height: 50, rotation: 0, area: 0.1, points: [], isMain: false,
    parentLabel: 'Det1', dimsLabel: '2000x50', edgeKind: 'fold', textureIrrelevant: false
  },
  // 5. Overflow part (won't fit anywhere)
  {
    id: 'part-huge', detailId: 'det-5', name: 'Too Big', type: 'Стільниця', shape: 'Прямокутна',
    width: 4000, height: 4000, rotation: 0, area: 16, points: [], isMain: true,
    parentLabel: 'Det5', dimsLabel: '4000x4000', textureIrrelevant: false
  }
];

export const mockProject = {
  slabs: mockSlabs,
  placements: [],
  details: [],
  textureLayouts: [],
  textureFrames: [],
  manualDimensions: [],
  unplacedPartIds: [],
  allowances: {
    detailLength: 10,
    detailWidth: 10,
    elementLength: 5,
    elementWidth: 5,
    interPartSpacing: 10
  }
} as unknown as Project;
