const fs = require('fs');
let content = fs.readFileSync('src/components/ui/Detail3DPreview.tsx', 'utf8');

// 1. Export Detail3DNode
content = content.replace("function Detail3DNode({", "export function Detail3DNode({");

// 2. Remove R3SkirtingGeometry
const r3Search = 'function R3SkirtingGeometry({';
const r3StartIndex = content.indexOf(r3Search);
if (r3StartIndex !== -1) {
  let bracketCount = 1;
  let endIndex = -1;
  const startBracketIndex = content.indexOf('{', r3StartIndex);
  for (let i = startBracketIndex + 1; i < content.length; i++) {
    if (content[i] === '{') bracketCount++;
    if (content[i] === '}') bracketCount--;
    if (bracketCount === 0) {
      endIndex = i;
      break;
    }
  }
  content = content.substring(0, r3StartIndex) + content.substring(endIndex + 1);
}

// 3. Update Detail3DNode to use useDetailGeometry and remove extrudeGeometry
const geomSearch1 = 'const { shape: mainShape, edgeMap: mainEdgeMap } = useDetailShape(';
const geomSearch2 = 'const geom = new THREE.ExtrudeGeometry(shape, {';
const shapeStartIndex = content.indexOf(geomSearch1);
if (shapeStartIndex !== -1) {
   // Use regex or manual replace for this part inside Detail3DNode
   content = content.replace(
      /const \{ shape: mainShape, edgeMap: mainEdgeMap \} = useDetailShape\([\s\S]*?\);/,
      "const { geometry, edgeMap: mainEdgeMap, curves: mainLineSegments } = useDetailGeometry(detail || { kind: 'rect' } as any, mainPoints, mainBounds);"
   );
   
   // We need to replace the extrudeGeometry rendering
   content = content.replace(
      /<extrudeGeometry args=\{\[mainShape, \{ depth: thickness, bevelEnabled: false, curveSegments: 32 \}\]\} \/>/g,
      "<primitive object={geometry} attach=\"geometry\" />"
   );
}

// 4. Remove LOCAL ATTACHMENTS (Skirtings, Thickenings, Folds)
// Since Skirtings are now ProductElement3DNodes, we don't render them here.
// Wait, what about Thickenings and Folds? 
// The user said: "Бортик - це не спецкейс, а просто інша геометрія...". Thickenings and folds might still be generated here or become product elements later.
// Let's just remove the `skirting` related code from the map.
content = content.replace(
  /const skirting = detail.skirtings\?\.\[pId\];/g,
  "const skirting = null;"
);

fs.writeFileSync('src/components/ui/Detail3DPreview.tsx', content);
console.log('Detail3DNode updated');
