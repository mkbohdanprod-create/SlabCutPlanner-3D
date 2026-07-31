import { flattenProductToDetails } from './src/store/projectHelpers';
import { explodeDetails } from './src/engines/geometry';
import type { Product } from './src/domain/types';
import { DEFAULT_ALLOWANCES } from './src/domain/defaults';

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

const details = flattenProductToDetails(mockProduct);
const parts = explodeDetails(details, DEFAULT_ALLOWANCES);

const skirtPart = parts.find(p => p.parentLabel.startsWith('Бортик'));
if (skirtPart) {
  console.log('--- Skirting Part ---');
  console.log('isMain:', skirtPart.isMain);
  console.log('parentLabel:', skirtPart.parentLabel);
  console.log('detailId:', skirtPart.detailId);
}
