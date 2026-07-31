import { useProjectStore } from './src/store/useProjectStore';
import type { Product, ProductElement } from './src/domain/types';

// Setup basic product for test
const p1: Product = {
  id: 'prod_123',
  name: 'Test',
  elements: [{
    id: 'prod_123/element:main',
    type: 'Стільниця',
    baseDefinition: {} as any,
    additions: [],
    joints: []
  }]
};

// 1. Lifecycle test
console.log('--- Lifecycle Test ---');
useProjectStore.getState().addProduct(p1);
let state = useProjectStore.getState();
console.log('Initial product additions:', state.project.products?.[0].elements[0].additions.length);

const addition: ProductElement = {
  id: 'prod_123/element:skirting_A',
  type: 'Бортик',
  baseDefinition: {} as any,
  additions: [],
  joints: []
};
const joint = {
  id: 'joint_xyz',
  origin: 'authored',
  a: { elementPath: 'prod_123/element:main', sideId: 'A', from: 0, to: 1000 },
  b: { elementPath: 'prod_123/element:skirting_A', sideId: 'A', from: 0, to: 1000 },
  type: 'glued',
  dominant: 'a',
  textureContinuity: true
} as any;

// Add skirting
const p2 = { ...p1, elements: [{ ...p1.elements[0], additions: [addition], joints: [joint] }] };
useProjectStore.getState().updateProduct('prod_123', p2);
state = useProjectStore.getState();
console.log('After adding skirting -> additions.length:', state.project.products?.[0].elements[0].additions.length);
console.log('After adding skirting -> joints.length:', state.project.products?.[0].elements[0].joints.length);

// Remove skirting
useProjectStore.getState().updateProduct('prod_123', p1);
state = useProjectStore.getState();
console.log('After removing skirting -> additions.length:', state.project.products?.[0].elements[0].additions.length);
console.log('After removing skirting -> joints.length:', state.project.products?.[0].elements[0].joints.length);

// 2. Idempotency test
console.log('\\n--- Idempotency Test ---');
useProjectStore.getState().updateProduct('prod_123', p2);
const saved = useProjectStore.getState().project.products?.[0];
useProjectStore.getState().updateProduct('prod_123', saved!);
const resaved = useProjectStore.getState().project.products?.[0];

console.log('saved === resaved:', JSON.stringify(saved) === JSON.stringify(resaved));
console.log('saved (additions, joints):', saved?.elements[0].additions.length, saved?.elements[0].joints.length);
console.log('resaved (additions, joints):', resaved?.elements[0].additions.length, resaved?.elements[0].joints.length);

