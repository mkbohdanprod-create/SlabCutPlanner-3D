const fs = require('fs');
let content = fs.readFileSync('src/components/ui/Detail3DPreview.tsx', 'utf8');

// Replace buildDetailShape with buildDetailGeometry
content = content.replace(/import \{ buildDetailShape \} from '\.\.\/\.\.\/engines\/shapeBuilder';/, "import { buildDetailShape, buildDetailGeometry } from '../../engines/shapeBuilder';");

const newHook = `
export function useDetailGeometry(detail: any, points: any[], bounds: any) {
  return useMemo(() => {
    return buildDetailGeometry(detail, points, bounds);
  }, [detail, points, bounds]);
}
`;
content = content + newHook;

// Also I need to modify Detail3DNode to use `useDetailGeometry` instead of `useDetailShape` + manual extrude.
// And remove `R3SkirtingGeometry` entirely.
fs.writeFileSync('src/components/ui/Detail3DPreview.tsx', content);
console.log('useDetailGeometry added');
