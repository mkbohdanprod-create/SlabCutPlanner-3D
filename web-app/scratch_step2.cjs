const fs = require('fs');
const file = 'src/components/ui/ProductEditorWorkspace.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. SkirtingModal onSave
content = content.replace(
  /onSave=\{\(skirting\) => \{\s*if \(session\.activeDetailId === 'main'\) \{\s*setSession\(\{ \.\.\.session, mainDetail: \{ \.\.\.session\.mainDetail, skirtings: \{ \.\.\.session\.mainDetail\.skirtings, \[skirtingModalOpen\]: skirting \} \} \}\);\s*\}\s*setSkirtingModalOpen\(null\);\s*\}\}/g,
  `onSave={(skirting) => {
                  const id = \`skirting_\${skirtingModalOpen}\`;
                  const newSkirting = session.subDetails[id] ? { ...session.subDetails[id] } : {
                    ...createDraft(),
                    thickness: session.mainDetail.thickness,
                    quantity: session.mainDetail.quantity,
                  };
                  newSkirting.type = 'Бортик' as any;
                  if (skirting.width) newSkirting.width = skirting.width;
                  if (skirting.height) newSkirting.height = skirting.height;
                  
                  setSession({
                    ...session,
                    subDetails: { ...session.subDetails, [id]: newSkirting },
                    activeDetailId: id
                  });
                  setSkirtingModalOpen(null);
                }}`
);

// 2. WallPanelModal onSave (remove writing to mainDetail.wallPanels)
content = content.replace(
  /mainDetail: \{\s*\.\.\.session\.mainDetail,\s*wallPanels: \{ \.\.\.session\.mainDetail\.wallPanels, \[wallPanelModalOpen\]: panel \}\s*\},\s*subDetails:/g,
  `subDetails:`
);

// 3. LegModal onSave (remove writing to mainDetail.legs)
content = content.replace(
  /mainDetail: \{\s*\.\.\.session\.mainDetail,\s*legs: \{ \.\.\.session\.mainDetail\.legs, \[legModalOpen\]: leg \}\s*\},\s*subDetails:/g,
  `subDetails:`
);

// 4. Sidebar labels
content = content.replace(
  /const label = subDetail\.type === 'Опора' \? `Нога \(\$\{id\}\)` : `Стінова панель \(\$\{id\}\)`;/g,
  `const label = subDetail.type === 'Опора' ? \`Нога (\${id})\` : subDetail.type === 'Бортик' ? \`Бортик (\${id})\` : \`Стінова панель (\${id})\`;`
);

// 5. Delete skirting logic from Sidebar (lines 739-744) - no, we leave legacy reading as requested, but maybe add a check. Actually, let's just leave it as is, legacy skirtings will show there.

// 6. Build Product and Save
const imports = `import { buildElementPath } from '../../domain/ids';
import type { Product, ProductElement, Joint } from '../../domain/types';`;

if (!content.includes('buildElementPath')) {
  content = content.replace(/import type \{ Detail, DetailGeometry, DetailShape \} from '\.\.\/\.\.\/domain\/types';/, imports + '\nimport type { Detail, DetailGeometry, DetailShape } from \'../../domain/types\';');
}

const saveLogic = `
          onClick={() => {
            if (session.mainDetail) {
              const productId = session.editingProductId || \`prod_\${Math.random().toString(36).slice(2, 9)}\`; // use existing or new ID for root
              const mainElementId = buildElementPath(productId, 'main');
              
              const elements: ProductElement[] = [];
              const joints: Joint[] = [];
              
              const rootElement: ProductElement = {
                id: mainElementId,
                type: session.mainDetail.type,
                baseDefinition: session.mainDetail,
                additions: [],
                joints: []
              };
              
              Object.entries(session.subDetails || {}).forEach(([id, draft]) => {
                const elementId = buildElementPath(productId, id);
                const isSkirting = id.startsWith('skirting_');
                const isFold = id.startsWith('fold_'); // not implemented yet, but for future
                const isThickening = id.startsWith('thickening_'); // future
                const isWallPanel = id.startsWith('wall_panel_');
                const isLeg = id.startsWith('leg_');
                
                const sideIdMatch = id.match(/_(A|B|C|D|E|F|G|H)$/);
                const sideId = sideIdMatch ? sideIdMatch[1] : 'A';
                
                const sideLength = getSideSize(session.mainDetail!, sideId) || 1000;
                
                const addition: ProductElement = {
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
                
                const joint: Joint = {
                  id: \`joint_\${Math.random().toString(36).slice(2, 9)}\`, // Joints are internal to product
                  origin: 'authored',
                  a: { elementPath: mainElementId, sideId, from: 0, to: sideLength },
                  b: { elementPath: elementId, sideId: 'A', from: 0, to: sideLength },
                  type: jType,
                  dominant: jDominant,
                  textureContinuity: jTexture
                };
                
                rootElement.additions.push(addition);
                rootElement.joints.push(joint);
                // Also add to flat joints array for the product if we had one, but product just has elements
              });
              
              const product: Product = {
                id: productId,
                name: session.mainDetail.label || 'Виріб',
                elements: [rootElement]
              };
              
              if (session.editingProductId) {
                useProjectStore.getState().updateProduct(productId, product);
              } else {
                useProjectStore.getState().addProduct(product);
              }
            }
            setSession(null);
          }}
`;

content = content.replace(/onClick=\{\(\) => \{\s*if \(session\.mainDetail\) \{\s*const detailsToSave = getPreviewDetails\(\);\s*if \(session\.editingProductId\) \{\s*\/\/ update product details\s*\} else \{\s*addDetails\(detailsToSave\);\s*\}\s*\}\s*setSession\(null\);\s*\}\}/g, saveLogic);


fs.writeFileSync(file, content, 'utf8');
console.log('Patch complete.');
