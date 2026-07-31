const fs = require('fs');
let c = fs.readFileSync('src/components/ui/ProductEditorWorkspace.tsx', 'utf8');
c = c.replace(/const toDetailShape =.*?};\n/s, '');
c = c.replace(/const buildGeometry =.*?};\n/s, '');
c = c.replace(/import \{ buildElementPath \} from '\.\.\/\.\.\/domain\/ids';/, "import { buildElementPath } from '../../domain/ids';\nimport { toDetailShape, buildGeometry } from '../../domain/elementToDetail';");
fs.writeFileSync('src/components/ui/ProductEditorWorkspace.tsx', c);
console.log('Done Workspace');
