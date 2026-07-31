import type { ShapeKind, DetailShape, DetailGeometry, ElementDefinition, Detail, ProductElement, CutAllowances } from './types';
import { buildDetailPath } from './ids';

export function toDetailShape(kind: ShapeKind): DetailShape {
  switch (kind) {
    case 'circle': return 'Кругла';
    case 'ellipse': return 'Овальна';
    case 'l': return 'Г-подібна';
    case 'u': return 'П-подібна';
    default: return 'Прямокутна';
  }
}

export function buildGeometry(draft: ElementDefinition): DetailGeometry {
  return {
    width: draft.width,
    height: 'height' in draft ? (draft as any).height : undefined,
    outerWidth: 'outerWidth' in draft ? (draft as any).outerWidth : undefined,
    outerHeight: 'outerHeight' in draft ? (draft as any).outerHeight : undefined,
    innerHorizontal: 'innerHorizontal' in draft ? (draft as any).innerHorizontal : undefined,
    innerVertical: 'innerVertical' in draft ? (draft as any).innerVertical : undefined,
    innerCutWidth: 'innerCutWidth' in draft ? (draft as any).innerCutWidth : undefined,
    innerCutDepth: 'innerCutDepth' in draft ? (draft as any).innerCutDepth : undefined,
    innerCutSide: 'innerCutSide' in draft ? (draft as any).innerCutSide : undefined,
    innerCutOffset: 'innerCutOffset' in draft ? (draft as any).innerCutOffset : undefined,
    leftLegHeight: 'leftLegHeight' in draft ? (draft as any).leftLegHeight : undefined,
    rightLegHeight: 'rightLegHeight' in draft ? (draft as any).rightLegHeight : undefined,
    diameter: 'diameter' in draft ? (draft as any).diameter : undefined,
    ellipseWidth: 'ellipseWidth' in draft ? (draft as any).ellipseWidth : undefined,
    ellipseHeight: 'ellipseHeight' in draft ? (draft as any).ellipseHeight : undefined,
    // Довільний стик так само робить деталь розрізаною — інакше спрацювала б
    // гілка «деталь цілком», і стик просто зник би з розкрою.
    wholeDetail: 'wholeDetail' in draft ? (draft as any).wholeDetail && !draft.jointDirection && !draft.jointOmegaDirection && !draft.jointLambdaDirection && !draft.manualJoints?.length : undefined,
    corners: draft.corners,
    cutouts: draft.cutouts,
    jointDirection: draft.jointDirection,
    jointOmegaDirection: draft.jointOmegaDirection,
    jointLambdaDirection: draft.jointLambdaDirection,
    jointOmegaRadiusSide: draft.jointOmegaRadiusSide,
    jointLambdaRadiusSide: draft.jointLambdaRadiusSide,
    manualJoints: draft.manualJoints,
  };
}

export function elementToDetail(
  element: ProductElement,
  multiplierQuantity: number,
  isMain: boolean,
  parentDetailId?: string,
  parentDetailSide?: string,
  productName?: string
): Detail {
  const def = element.baseDefinition;
  
  // Extract slot side if this is an addition, e.g. "skirting_A" -> "A"
  const slot = element.id.split(':').pop();
  // Ребро = те, що після ОСТАННЬОГО префікса типу:
  //   'leg_BC_lcut1' → 'BC_lcut1', 'leg_BC_lcut2_fold_B' → 'B', 'fold_C' → 'C'.
  const side = (() => {
    if (!slot) return undefined;
    let best = -1;
    let res = slot;
    for (const t of ['wall_panel', 'skirting', 'fold', 'thickening', 'leg']) {
      const i = slot.lastIndexOf(t + '_');
      if (i > best) { best = i; res = slot.slice(i + t.length + 1); }
    }
    return res || undefined;
  })();
  
  let importRole: 'thickening' | 'fold' | undefined = undefined;
  if ((def.type as string) === 'Потовщення') importRole = 'thickening';
  else if ((def.type as string) === 'Підворот') importRole = 'fold';

  // Parse productId and elementSlot from element.id (e.g., "prod_123/element:skirting_A")
  const idParts = element.id.match(/^prod_(.+?)\/element:(.+)$/);
  const productId = idParts ? idParts[1] : 'unknown';
  const elementSlot = idParts ? idParts[2] : 'main';

  return {
    id: buildDetailPath(productId, elementSlot, 'main'),
    type: def.type,
    shape: toDetailShape(def.kind),
    quantity: def.quantity * multiplierQuantity,
    thickness: def.thickness,
    geometry: buildGeometry(def),
    parentDetailId,
    parentDetailSide: parentDetailSide || side,
    slot: slot as any,
    importRole,
    // fold/thickening НЕ копіюємо: у виробі вони існують як окремі Елементи (additions).
    // Якщо скопіювати — legacy-генератор у explodeDetails створить дублікати партів.
    // Для DXF/бланку/ручних деталей legacy-шлях працює як раніше (вони не проходять через цю функцію).
    edgeProfiles: def.edgeProfiles,
    name: isMain ? (productName || 'Виріб') : (def.type + ' (' + (side || slot || '') + ')'),
    label: isMain ? (productName || 'Виріб') : (def.type + ' (' + (side || slot || '') + ')'),
    isProduct: isMain,
    skirtings: {},
    wallPanels: {},
    legs: {},
    customServices: def.customServices
  };
}
