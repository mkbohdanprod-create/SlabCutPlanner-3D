const fs = require('fs');
const content = fs.readFileSync('src/components/ui/Detail3DPreview.tsx', 'utf8');
const searchString = 'export function useDetailShape';
const fnStart = content.indexOf(searchString);
const startMatch = 'const shape = new THREE.Shape();';
const startIndex = content.indexOf(startMatch, fnStart);
if (startIndex === -1) throw new Error('Not found');
let bracketCount = 1;
let endIndex = -1;
for (let i = startIndex + startMatch.length; i < content.length; i++) {
  if (content[i] === '{') bracketCount++;
  if (content[i] === '}') bracketCount--;
  if (bracketCount === 0) {
    endIndex = i;
    break;
  }
}
const innerContent = content.substring(startIndex, endIndex);

const finalCode = `import * as THREE from 'three';
import type { DetailDraft } from '../components/forms/utils/draftHelpers';

export function buildDetailShape(detail: DetailDraft, points: any[], bounds: any) {
  ${innerContent}
  
  return { shape, edgeMap, curves: shape.curves };
}
`;
fs.writeFileSync('src/engines/shapeBuilder.ts', finalCode);
console.log('shapeBuilder.ts written successfully');
