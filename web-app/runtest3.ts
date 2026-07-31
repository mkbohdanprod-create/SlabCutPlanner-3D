import { flattenProductToDetails } from './src/store/projectHelpers.js';
import { explodeDetails } from './src/engines/geometry.js';
import * as fs from 'fs';

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

let geomCode = fs.readFileSync('./src/engines/geometry.ts', 'utf-8');
geomCode = geomCode.replace(/if \(detail\.shape === 'П-подібна'\) \{/, `if (detail.shape === 'П-подібна') {
        console.log('ENTERED P-SHAPE');
        console.log('side:', g.innerCutSide ?? 'bottom');
        console.log('wholeDetail:', g.wholeDetail);
`);
geomCode = geomCode.replace(/\} else if \(side === 'bottom' \|\| side === 'top'\) \{/, `} else if (side === 'bottom' || side === 'top') {
          console.log('ENTERED SPLIT');
`);
geomCode = geomCode.replace(/pushPartWithEdges\(parts, detail, p3\);/, `pushPartWithEdges(parts, detail, p3);
          console.log('PUSHED PARTS', parts.length);
`);
fs.writeFileSync('./src/engines/geometry_temp.ts', geomCode);

// I don't actually need to write a temporary file if I can just console.log the detail and read geometry.ts. Let's just look at the condition in geometry.ts again.
