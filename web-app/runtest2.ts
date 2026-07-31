import { flattenProductToDetails } from './src/store/projectHelpers.js';
import { explodeDetails } from './src/engines/geometry.js';

const product = {
  id: 'prod_u',
  name: 'U-Shape Real',
  elements: [{
    id: 'element_u',
    type: 'Стільниця',
    baseDefinition: { type: 'Стільниця', width: 3000, height: 1000, quantity: 1, kind: 'u' },
    joints: [],
    additions: []
  }]
};
const details = flattenProductToDetails(product as any);
details[0].geometry = details[0].geometry || {};
details[0].geometry.wholeDetail = false;
details[0].geometry.innerCutSide = 'bottom';
details[0].geometry.width = 3000;
details[0].geometry.height = 1000;
details[0].geometry.innerCutWidth = 1000;
details[0].geometry.innerCutDepth = 500;
details[0].geometry.innerCutOffset = 500;
details[0].geometry.leftLegHeight = 1000;
details[0].geometry.rightLegHeight = 1000;

try {
  const parts = explodeDetails(details);
  console.log('Parts count:', parts.length);
} catch (e) {
  console.log('Error:', e);
}
