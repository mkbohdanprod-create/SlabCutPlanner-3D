import { explodeDetails } from '../geometry';
import type { Detail, Project, SlabInstance } from '../../domain/types';
import { DEFAULT_ALLOWANCES } from '../../domain/defaults';

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

export const mockDetails: Detail[] = [
  // 1. Normal large part
  {
    id: 'det-1',
    type: 'Стільниця',
    shape: 'Прямокутна',
    quantity: 1,
    geometry: { width: 2000, height: 600 },
    thickness: 20,
    label: 'Det1'
  },
  // 2. Exact match (zero gap vertically for slab 1) - height 1480 + 2*10 margin = 1500
  {
    id: 'det-2',
    type: 'Стільниця',
    shape: 'Прямокутна',
    quantity: 1,
    geometry: { width: 1000, height: 1480 },
    thickness: 20,
    label: 'Det2'
  },
  // 3. Multiple identical parts
  {
    id: 'det-3',
    type: 'Стільниця',
    shape: 'Прямокутна',
    quantity: 2,
    geometry: { width: 500, height: 500 },
    thickness: 20,
    label: 'Det3'
  },
  // 4. Fold part (підворот)
  {
    id: 'det-4',
    type: 'Стільниця',
    shape: 'Прямокутна',
    quantity: 1,
    geometry: { width: 2000, height: 500 },
    thickness: 20,
    label: 'Det4',
    fold: { enabled: true, size: 50, sides: ['B'] }
  },
  // 5. Overflow part (won't fit anywhere)
  {
    id: 'det-5',
    type: 'Стільниця',
    shape: 'Прямокутна',
    quantity: 1,
    geometry: { width: 4000, height: 4000 },
    thickness: 20,
    label: 'Det5'
  }
];

export const mockAllowances = {
  ...DEFAULT_ALLOWANCES,
  detailLength: 10,
  detailWidth: 10,
  elementLength: 5,
  elementWidth: 5,
  interPartSpacing: 10
};

// mockParts генеруються через реальний explodeDetails, тож зміни в geometry.ts
// можуть тригерити перегенерацію snapshot не тільки geometry.test, а й packing.test.
// Це нормально — це end-to-end safety net.
export const mockParts = explodeDetails(mockDetails, mockAllowances);

export const mockProject = {
  slabs: mockSlabs,
  placements: [],
  details: mockDetails,
  textureLayouts: [],
  textureFrames: [],
  manualDimensions: [],
  unplacedPartIds: [],
  allowances: mockAllowances
} as unknown as Project;
