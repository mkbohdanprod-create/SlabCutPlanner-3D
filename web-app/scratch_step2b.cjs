const fs = require('fs');
const file = 'src/components/ui/ProductEditorWorkspace.tsx';
let content = fs.readFileSync(file, 'utf8');

const newHandleSave = `
  const handleSave = () => {
    if (!session.mainDetail) {
      setSession(null);
      return;
    }

    const productId = session.editingProductId || genId('prod');
    const mainElementId = buildElementPath(productId, 'main');
    
    const rootElement: import('../../domain/types').ProductElement = {
      id: mainElementId,
      type: session.mainDetail.type,
      baseDefinition: session.mainDetail,
      additions: [],
      joints: []
    };
    
    Object.entries(session.subDetails || {}).forEach(([id, draft]) => {
      const elementId = buildElementPath(productId, id);
      const isSkirting = id.startsWith('skirting_');
      const isFold = id.startsWith('fold_');
      const isThickening = id.startsWith('thickening_');
      const isWallPanel = id.startsWith('wall_panel_');
      const isLeg = id.startsWith('leg_');
      
      const sideIdMatch = id.match(/_(A|B|C|D|E|F|G|H)$/);
      const sideId = sideIdMatch ? sideIdMatch[1] : 'A';
      
      const sideLength = getSideSize(session.mainDetail!, sideId) || 1000;
      
      const addition: import('../../domain/types').ProductElement = {
        id: elementId,
        type: draft.type,
        baseDefinition: draft,
        additions: [],
        joints: []
      };
      
      let jType: 'butt' | 'miter45' | 'glued' | 'tie' = 'butt';
      let jDominant: 'a' | 'b' = 'a';
      let jTexture = false;
      
      if (isSkirting) {
        jType = 'glued';
        jDominant = 'a';
        jTexture = true;
      } else if (isFold) {
        jType = 'miter45';
        jDominant = 'a';
        jTexture = true;
      } else if (isThickening) {
        jType = 'glued';
        jDominant = 'a';
        jTexture = false;
      } else if (isLeg || isWallPanel) {
        jType = 'butt';
        jDominant = 'a';
        jTexture = false;
      }
      
      const joint: import('../../domain/types').Joint = {
        id: \`joint_\${genId('')}\`,
        origin: 'authored',
        a: { elementPath: mainElementId, sideId, from: 0, to: sideLength },
        b: { elementPath: elementId, sideId: 'A', from: 0, to: sideLength },
        type: jType,
        dominant: jDominant,
        textureContinuity: jTexture
      };
      
      rootElement.additions.push(addition);
      rootElement.joints.push(joint);
    });
    
    const product: import('../../domain/types').Product = {
      id: productId,
      name: session.mainDetail.label || 'Виріб',
      elements: [rootElement]
    };
    
    if (session.editingProductId) {
      useProjectStore.getState().updateProduct(productId, product);
    } else {
      useProjectStore.getState().addProduct(product);
    }
    setSession(null);
  };
`;

content = content.replace(/const handleSave = \(\) => \{[\s\S]*?setSession\(null\);\s*\};\s*/, newHandleSave);

// ensure buildElementPath is imported
if (!content.includes('buildElementPath')) {
  content = content.replace(/import { allSides, createDraft } from '\.\.\/forms\/utils\/draftHelpers';/, "import { allSides, createDraft } from '../forms/utils/draftHelpers';\nimport { buildElementPath } from '../../domain/ids';");
}

fs.writeFileSync(file, content, 'utf8');
console.log('Patch 3 complete.');
