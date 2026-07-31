const fs = require('fs');
let content = fs.readFileSync('src/engines/shapeBuilder.ts', 'utf8');

const newCode = `
export function buildDetailGeometry(detail: DetailDraft, points: any[], bounds: any) {
  const s = 0.001;
  if (detail.type === 'Бортик') {
    const length = (detail.width || 1000) * s;
    const height = (detail.height || 50) * s;
    const depth = (detail.thickness || 20) * s;
    
    const shape = new THREE.Shape();
    const r = Math.min(3 * s, height, depth);
    shape.moveTo(-depth, 0);
    shape.lineTo(0, 0);
    shape.lineTo(0, height);
    shape.lineTo(-depth + r, height);
    shape.quadraticCurveTo(-depth, height, -depth, height - r);
    shape.lineTo(-depth, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: length,
      bevelEnabled: false,
    });
    geometry.translate(0, 0, -length / 2);
    geometry.rotateY(Math.PI / 2);
    
    return { geometry, edgeMap: {}, curves: [] };
  }
  
  const { shape, edgeMap, curves } = buildDetailShape(detail, points, bounds);
  const thickness = (detail.thickness || 20) * s;
  
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 32,
  });
  
  return { geometry, edgeMap, curves };
}
`;

fs.writeFileSync('src/engines/shapeBuilder.ts', content + newCode);
console.log('buildDetailGeometry added');
