const fs = require('fs');
let content = fs.readFileSync('src/components/ui/ProductEditorWorkspace.tsx', 'utf8');

const importStr = `import { ProductElement3DNode } from '../3d/ProductElement3DNode';\n`;
if (!content.includes('ProductElement3DNode')) {
  const lastImport = content.lastIndexOf('import ');
  const insertPos = content.indexOf('\n', lastImport) + 1;
  content = content.slice(0, insertPos) + importStr + content.slice(insertPos);
}

const newTag = `
              <ProductElement3DNode
                element={buildProductFromSession(session, 'preview').elements[0]}
                activeDetailId={session.activeDetailId}
                onEdgeClick={handleEdgeClick}
                onCornerClick={handleCornerClick}
                onJointClick={(id, x, y) => setJointContextMenu({ id, x, y })}
                onPlaneClick={() => setModalCutoutId('new')}
                onLegDoubleClick={(id) => setLegModalOpen(id)}
                onWallPanelDoubleClick={(id) => setWallPanelModalOpen(id)}
                onDetailDoubleClick={(id) => setSettingsModalOpen(true)}
                onDetailClick={(id) => setSession({ ...session, activeDetailId: id })}
                onDetailContextMenu={handleDetailContextMenu}
              />`;

content = content.replace(/<Detail3DPreview[\s\S]*?\/>/, newTag);
fs.writeFileSync('src/components/ui/ProductEditorWorkspace.tsx', content);
console.log('ProductEditorWorkspace updated');
