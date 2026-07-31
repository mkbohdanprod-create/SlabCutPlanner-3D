import { uid } from './src/domain/defaults';
import { buildElementPath } from './src/domain/ids';

// Mock getSideSize
const getSideSize = () => 1000;

export function buildProductFromSession(session: any): any {
  const productId = session.editingProductId || uid('prod');
  const mainElementId = buildElementPath(productId, 'main');
  
  const rootElement: any = {
    id: mainElementId,
    type: session.mainDetail!.type,
    baseDefinition: session.mainDetail!,
    additions: [],
    joints: []
  };
  
  Object.entries(session.subDetails || {}).forEach(([id, draft]: [string, any]) => {
    const elementId = buildElementPath(productId, id);
    const isSkirting = id.startsWith('skirting_');
    const isFold = id.startsWith('fold_');
    const isThickening = id.startsWith('thickening_');
    const isWallPanel = id.startsWith('wall_panel_');
    const isLeg = id.startsWith('leg_');
    
    const sideIdMatch = id.match(/_(A|B|C|D|E|F|G|H)$/);
    const sideId = sideIdMatch ? sideIdMatch[1] : 'A';
    
    const sideLength = getSideSize() || 1000;
    
    const addition: any = {
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
    
    const joint: any = {
      id: `joint_${id}`,
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
    id: productId,
    name: (session.mainDetail as any)?.label || 'Виріб',
    elements: [rootElement]
  };
}

const session = {
  editingProductId: 'prod_123',
  mainDetail: { type: 'Стільниця', label: 'My Table' },
  subDetails: {
    'skirting_A': { type: 'Бортик', width: 40, height: 40 },
    'skirting_B': { type: 'Бортик', width: 40, height: 40 }
  },
  activeDetailId: 'main'
};

const p1 = buildProductFromSession(session);
const p2 = buildProductFromSession(session);

const assert = require('assert');
try {
  assert.deepStrictEqual(p1, p2);
  console.log('TEST PASSED: buildProductFromSession is idempotent!');
} catch (e: any) {
  console.error('TEST FAILED: Products differ.');
  console.error(e.message);
}
