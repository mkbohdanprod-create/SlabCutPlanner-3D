import type { ShapeKind, DetailShape, DetailGeometry, ElementDefinition, Detail, ProductElement, CutAllowances } from './types';
import { buildDetailPath } from './ids';
import { sinkCutoutRecord } from './productSink';
import { toCenterCutouts } from './cutoutAnchor';

/**
 * Контекст, у якому рахується прив'язка вирізу до кута деталі.
 * Габарит беремо той самий, що й побудова контуру, — інакше кут AB
 * опиниться не там, де його намалювали.
 */
export function anchorContextFor(draft: ElementDefinition) {
  const any = draft as any;
  const shape = toDetailShape(draft.kind);
  // Габарит — описаний прямокутник форми. Коло і еліпс теж мають бути тут:
  // без цього виріз на круглій стільниці мірявся б від «кута» деталі
  // з нульовою шириною і летів у край.
  const width = any.outerWidth ?? draft.width ?? any.diameter ?? any.ellipseWidth ?? 0;
  const height = any.outerHeight ?? any.height ?? any.diameter ?? any.ellipseHeight ?? 0;
  return { shape, geometry: any, width, height };
}

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
    // Мийки, встановлені в деталь, домішують свої отвори до вирізів —
    // так виріз під чашу потрапляє в розкрій, креслення і бланк погодження
    // без ручного дублювання (джерело істини — draft.sinks).
    // Прив'язка по куту знімається ТУТ, на межі «редактор → розкрій»: далі за
    // течією (рушій, креслення, бланк) усі чекають абсолютний центр вирізу.
    // Одна точка переведення — щоб карта крою і поле в редакторі не розійшлись.
    cutouts: toCenterCutouts(
      draft.sinks && Object.keys(draft.sinks).length > 0
        ? { ...(draft.cutouts ?? {}), ...sinkCutoutRecord(draft) }
        : draft.cutouts,
      anchorContextFor(draft),
    ),
    jointDirection: draft.jointDirection,
    jointOmegaDirection: draft.jointOmegaDirection,
    jointLambdaDirection: draft.jointLambdaDirection,
    jointOmegaRadiusSide: draft.jointOmegaRadiusSide,
    jointLambdaRadiusSide: draft.jointLambdaRadiusSide,
    manualJoints: draft.manualJoints,
    /**
     * Тип мийки. Рушій розкрою розкладає мийку на 13 деталей (стінки,
     * трикутники дна, підклейки), а 3D збирає її в чашу — і те, і те
     * вмикається САМЕ цим полем. Без нього мийка з редактора виробу
     * ставала звичайною плитою: у старому редакторі вона працювала,
     * бо там geometry збиралась іншим шляхом.
     */
    sinkKind: draft.kind === 'sink_rect' ? 'rect'
      : draft.kind === 'sink_slot' ? 'slot'
      : undefined,
    /** Металопрокат: id профілю вмикає метал-гілку розкрою і 3D */
    metalProfileId: draft.kind === 'metal_profile' ? (draft as { metalProfileId?: string }).metalProfileId : undefined,
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
    // Мийка в стільниці — не «бокове» доповнення: сторони в неї немає,
    // тож ім'я беремо з label (unikальний per мийку — важливо для групування
    // деталей чаші в 3D за parentLabel).
    name: isMain ? (productName || 'Виріб')
      : slot?.startsWith('sink_') ? (def.label || 'Мийка (в стільниці)')
      : (def.type + ' (' + (side || slot || '') + ')'),
    label: isMain ? (productName || 'Виріб')
      : slot?.startsWith('sink_') ? (def.label || 'Мийка (в стільниці)')
      : (def.type + ' (' + (side || slot || '') + ')'),
    isProduct: isMain,
    skirtings: {},
    wallPanels: {},
    legs: {},
    customServices: def.customServices
  };
}
