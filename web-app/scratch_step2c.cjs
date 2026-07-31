const fs = require('fs');
const file = 'src/components/ui/ProductEditorWorkspace.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/const productId = session\.editingProductId \|\| genId\('prod'\);/g, 'const productId = session.editingProductId || uid(\'prod\');');

// Restore handleSave logic that was messed up by replace_file_content
content = content.replace(
  /if \(session\.editingProductId\) \{\s*const productId = session\.editingProductId \|\| uid\('prod'\);\s*useProjectStore\.getState\(\)\.updateProduct\(productId, product\);\s*\}\s*else\s*\{\s*useProjectStore\.getState\(\)\.addProduct\(product\);\s*\}/,
  `if (session.editingProductId) {
      useProjectStore.getState().updateProduct(session.editingProductId, product);
    } else {
      useProjectStore.getState().addProduct(product);
    }`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed buildProductFromSession');
