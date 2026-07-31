const fs = require('fs');
let c = fs.readFileSync('src/components/ui/ProductEditorWorkspace.tsx', 'utf8');

c = c.replace(/const getPreviewDetails = \(\): Detail\[\] => \{[\s\S]*?return detailsToSave;\n  };/, 
  'const getPreviewDetails = (): Detail[] => {\n' +
  '    if (!session.mainDetail) return [];\n' +
  '    const productId = session.editingProductId || uid(\'prod\');\n' +
  '    const product = buildProductFromSession(session, productId);\n' +
  '    return flattenProductToDetails(product);\n' +
  '  };');

c = c.replace(/import \{ buildElementPath \} from '\.\.\/\.\.\/domain\/ids';/, 
  'import { buildElementPath } from \'../../domain/ids\';\nimport { flattenProductToDetails } from \'../../store/projectHelpers\';\nimport { uid } from \'../../domain/defaults\';');

fs.writeFileSync('src/components/ui/ProductEditorWorkspace.tsx', c);
