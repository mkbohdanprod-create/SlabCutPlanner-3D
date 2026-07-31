import { flattenProductToDetails, explodeDetailsWrapped } from './src/store/projectHelpersLogic';

const mockProduct = {
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
    },
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
      },
      additions: [],
      joints: []
    }],
    joints: []
  }]
};

const assert = require('assert');
try {
  const d1 = flattenProductToDetails(mockProduct as any);
  const d2 = flattenProductToDetails(mockProduct as any);
  assert.deepStrictEqual(d1, d2);
  console.log('F1. flatten is deterministic: PASS');
  
  const legacyDetails = [{ id: 'detail_old_1' }];
  const intersection = legacyDetails.filter(ld => d1.some(d => d.id === ld.id));
  assert.strictEqual(intersection.length, 0);
  console.log('F2. ID intersection empty: PASS');
  
  const result = explodeDetailsWrapped(d1);
  console.log(`F3. explodeDetails returned ${result.parts.length} parts and ${result.derivedJoints.length} derived joints.`);
  
  const hasMain = result.parts.some(p => p.parentLabel === 'Test Product');
  const hasSkirting = result.parts.some(p => p.parentLabel === 'Бортик (A)');
  
  if (hasMain && hasSkirting) {
    console.log('F3. Real product with skirting exploded correctly: PASS');
  } else {
    console.error('F3 FAILED. Missing main or skirting parts.', result.parts.map(p => p.parentLabel));
  }
} catch (e) {
  console.error('TEST FAILED:', e);
}
