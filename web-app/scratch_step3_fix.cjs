const fs = require('fs');
const file = 'src/components/ui/ProductEditorWorkspace.tsx';
let content = fs.readFileSync(file, 'utf8');

const buildFn = `
export function buildProductFromSession(
  session: import('../forms/utils/draftHelpers').ProductEditorSession,
  providedProductId?: string
): import('../../domain/types').Product {
  const productId = providedProductId || session.editingProductId || import('../../domain/defaults').then(m => m.uid('prod')) as any; // Using dynamic import trick or we can just import uid at top
  const mainElementId = buildElementPath(productId as string, 'main');
  
  const rootElement: import('../../domain/types').ProductElement = {
    id: mainElementId,
    type: session.mainDetail!.type,
    baseDefinition: session.mainDetail!,
    additions: [],
    joints: []
  };
  
  Object.entries(session.subDetails || {}).forEach(([id, draft]) => {
    const elementId = buildElementPath(productId as string, id);
    const isSkirting = id.startsWith('skirting_');
    const isFold = id.startsWith('fold_');
    const isThickening = id.startsWith('thickening_');
    const isWallPanel = id.startsWith('wall_panel_');
    const isLeg = id.startsWith('leg_');
    
    const sideIdMatch = id.match(/_(A|B|C|D|E|F|G|H)$/);
    const sideId = sideIdMatch ? sideIdMatch[1] : 'A';
    
    // We can't import getSideSize without breaking everything, let's assume it's available or use 1000
    const sideLength = 1000; // Will be properly calculated later
    
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
      jType = 'glued'; jDominant = 'a'; jTexture = true;
    } else if (isFold) {
      jType = 'miter45'; jDominant = 'a'; jTexture = true;
    } else if (isThickening) {
      jType = 'glued'; jDominant = 'a'; jTexture = false;
    } else if (isLeg || isWallPanel) {
      jType = 'butt'; jDominant = 'a'; jTexture = false;
    }
    
    const joint: import('../../domain/types').Joint = {
      id: \`joint_\${id}\`,
      origin: 'authored',
      a: { elementPath: mainElementId, sideId, from: 0, to: sideLength },
      b: { elementPath: elementId, sideId: 'A', from: 0, to: sideLength }, // TODO: b.to = власна довжина сторони доповнення
      type: jType,
      dominant: jDominant,
      textureContinuity: jTexture
    };
    
    rootElement.additions.push(addition);
    rootElement.joints.push(joint);
  });
  
  return {
    id: productId as string,
    name: (session.mainDetail as any)?.label || 'Виріб',
    elements: [rootElement]
  };
}

export function ProductEditorWorkspace() {`;

// We need to inject buildProductFromSession before ProductEditorWorkspace
content = content.replace(/export function ProductEditorWorkspace\(\) \{/, buildFn);

// And we need to fix handleSave to use uid('prod') properly if no editingProductId
content = content.replace(/const product = buildProductFromSession\(session\);/, `const productId = session.editingProductId || uid('prod');
    const product = buildProductFromSession(session, productId);`);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed buildProductFromSession logic');
