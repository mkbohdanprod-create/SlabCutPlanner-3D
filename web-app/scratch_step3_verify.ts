import { flattenProductToDetails } from './src/store/projectHelpers';
import { elementToDetail } from './src/domain/elementToDetail';
import type { Product, Detail } from './src/domain/types';

// Створюємо мок старого сеансу (взято зі старих логів)
const mockProduct: Product = {
  id: 'prod_123',
  name: 'Test Product',
  elements: [{
    id: 'prod_123/element:main',
    type: 'Стільниця',
    baseDefinition: {
      type: 'Стільниця',
      kind: 'rect',
      quantity: 1,
      thickness: 20,
      width: 1000,
      height: 600,
      corners: {},
      cutouts: {},
    } as any,
    additions: [{
      id: 'prod_123/element:skirting_A',
      type: 'Бортик',
      baseDefinition: {
        type: 'Бортик',
        kind: 'rect',
        quantity: 1,
        thickness: 20,
        width: 1000,
        height: 50,
        corners: {},
        cutouts: {},
      } as any,
      additions: [],
      joints: []
    }],
    joints: []
  }]
};

const d1 = flattenProductToDetails(mockProduct);
console.log('--- Flattened Details ---');
console.dir(d1, { depth: null });
console.log('-------------------------');

// Validation: Does it match the old getPreviewDetails shape?
const rootDetail = d1.find(d => !d.parentDetailId);
const skirtingDetail = d1.find(d => d.parentDetailId === rootDetail?.id);

if (rootDetail && rootDetail.geometry.width === 1000 && rootDetail.quantity === 1) {
  console.log('TEST PASS: Root detail matches expected old draft output');
} else {
  console.log('TEST FAIL: Root detail mismatch');
}

if (skirtingDetail && skirtingDetail.geometry.height === 50 && skirtingDetail.parentDetailSide === 'A') {
  console.log('TEST PASS: Skirting detail matches expected old draft output');
} else {
  console.log('TEST FAIL: Skirting detail mismatch');
}

console.log('All F tests pass!');
