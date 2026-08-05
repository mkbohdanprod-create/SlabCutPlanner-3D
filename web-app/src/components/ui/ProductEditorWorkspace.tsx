import React, { useState } from 'react';
import { ProductElement3DNode } from '../3d/ProductElement3DNode';
import {  ChevronDown, ChevronRight, ChevronLeft, Save, Trash2, Folder } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useStore';
import { DesignerCanvas } from './FormsPanel';
import { EdgeProcessingDesigner } from '../forms/editors/EdgeProcessingDesigner';
import { translateStaticUiText } from '../../i18n';
import type { DetailDraft, ShapeKind } from '../forms/utils/draftHelpers';
import { buildElementPath, toSlot } from '../../domain/ids';
import { jointAnchorPoints, manualJointPosition, reflexCornerIds } from '../../domain/joints';
import type { JointShapeFields, JointSideSelection } from '../../domain/joints';
import type { ManualJoint } from '../../domain/types';
import { JointOffsetPopup } from './JointOffsetPopup';
import { flattenProductToDetails } from '../../store/projectHelpers';
import { uid } from '../../domain/defaults';
import { toDetailShape, buildGeometry } from '../../domain/elementToDetail';
import type { Product, ProductElement, Joint } from '../../domain/types';

import type { Detail, DetailGeometry, DetailShape } from '../../domain/types';
import { allSides, createDraft, getSideSize } from '../forms/utils/draftHelpers';
import { Detail3DPreview } from './Detail3DPreview';
import { EdgeContextMenu } from './EdgeContextMenu';
import { JointContextMenu } from './JointContextMenu';
import { SkirtingModal } from './SkirtingModal';
import { WallPanelModal } from './WallPanelModal';
import { LegModal } from './LegModal';
import { CornerContextMenu } from './CornerContextMenu';
import { CornerProcessingModal } from './CornerProcessingModal';
import { CutoutProcessingModal } from './CutoutProcessingModal';
import { Circle, Square, PlusSquare, Box, GripHorizontal, FileText, CornerDownRight, Plus } from 'lucide-react';
import { CreateProductModal } from './CreateProductModal';
import { ElementSettingsModal } from './ElementSettingsModal';
import { Detail2DBlueprint } from './Detail2DBlueprint';
import { getDetailPointsAndBounds, buildDetailShape } from '../../engines/shapeBuilder';

/**
 * Фактична довжина кожного ребра контуру (мм), а не номінальний розмір сторони.
 * Радіус кута та Г-заріз вкорочують сторону — саме цю довжину бачить 3D,
 * і саме вона має потрапляти в розкрій для бортика/підвороту/потовщення.
 */
function realEdgeLengths(def: any): Record<string, number> {
  const out: Record<string, number> = {};
  try {
    const { points, bounds } = getDetailPointsAndBounds(def);
    const { curves, edgeMap } = buildDetailShape(def, points, bounds);
    const w = (bounds.maxX - bounds.minX) || 1;
    const h = (bounds.maxY - bounds.minY) || 1;
    (curves ?? []).forEach((curve: any, i: number) => {
      const id = edgeMap?.[i];
      if (!id || curve.type !== 'LineCurve') return;
      const dx = (curve.v2.x - curve.v1.x) * w;
      const dy = (curve.v2.y - curve.v1.y) * h;
      const len = Math.sqrt(dx * dx + dy * dy);
      // якщо сторона розбита на кілька відрізків — беремо найдовший прямий
      if (!out[id] || len > out[id]) out[id] = len;
    });
  } catch {
    // якщо контур не побудувався — лишаємо порожньо, впаде на номінал
  }
  return out;
}
import { DetailContextMenu } from './DetailContextMenu';
import { DetailPassportModal } from './DetailPassportModal';
import type { CustomService } from '../../domain/types';

function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-200">
      <button 
        className="w-full py-3 px-4 flex items-center justify-between text-sm font-bold text-[#1f2d3a] hover:bg-slate-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {title}
        {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

const getCornersForKind = (kind: string) => {
  if (kind === 'l') return ['AB', 'BC', 'CD', 'DE', 'EF', 'FA'];
  if (kind === 'u') return ['AB', 'BC', 'CD', 'DE', 'EF', 'FG', 'GH', 'HA'];
  return ['AB', 'BC', 'CD', 'DA'];
};


export function buildProductFromSession(
  session: import('../forms/utils/draftHelpers').ProductEditorSession,
  productId: string
): import('../../domain/types').Product {
  const mainElementId = buildElementPath(productId, 'main');
  
  const rootElement: import('../../domain/types').ProductElement = {
    id: mainElementId,
    type: session.mainDetail?.type || 'Стільниця',
    baseDefinition: session.mainDetail || createDraft(),
    additions: [],
    joints: []
  };

  const productElements: import('../../domain/types').ProductElement[] = [rootElement];
  const allElements: import('../../domain/types').ProductElement[] = [rootElement];
  
  Object.entries(session.subDetails || {}).forEach(([id, draft]) => {
    // Only process top-level subDetails (skirtings, legs, wall panels)
    // We ignore explicitly saved folds/thickenings to avoid conflicts with dynamic generation
    const isFold = id.includes('fold_');
    const isThickening = id.includes('thickening_');
    if (isFold || isThickening) return;

    const elementId = buildElementPath(productId, id);
    const isSkirting = id.startsWith('skirting_');
    const isWallPanel = id.startsWith('wall_panel_');
    const isLeg = id.startsWith('leg_');
    
    // Ребро = слот без префікса типу. Важливо для Г-зарізу: він створює ребра
    // з іменами на кшталт 'BC_lcut1', і стара регулярка _(A..H)$ їх не ловила —
    // сторона мовчки ставала 'A', тому ноги чіплялись не до того ребра.
    const sideId = id.replace(/^(wall_panel|skirting|fold|thickening|leg)_/, '') || 'A';
    // Фактична довжина ребра (радіус/Г-заріз вкорочують сторону), інакше бортик
    // і панель поїдуть у розкрій на повну номінальну довжину.
    const mainEdgeLens = realEdgeLengths(session.mainDetail);
    const sideLength = mainEdgeLens[sideId] || getSideSize(session.mainDetail!, sideId) || 1000;
    
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
    } else if (isLeg) {
      // Нога (опора) — «водоспад»: клеїться під 45°, як підворот.
      // Звідси різ під 45 на обох деталях стику і склейка під 45 у кошторисі.
      jType = 'miter45'; jDominant = 'a'; jTexture = false;
    } else if (isWallPanel) {
      jType = 'butt'; jDominant = 'a'; jTexture = false;
    }
    
    const joint: import('../../domain/types').Joint = {
      id: `joint_${id}`,
      origin: 'authored',
      a: { elementPath: mainElementId, sideId, from: 0, to: sideLength },
      b: { elementPath: elementId, sideId: 'A', from: 0, to: sideLength },
      type: jType,
      dominant: jDominant,
      textureContinuity: jTexture
    };
    // §3: Нога і Стінова панель — САМОСТІЙНІ Елементи на рівні Виробу (сусіди Стільниці),
    //     бо мають власну фрактальну структуру (свої підвороти/потовщення).
    // §2: Бортик — дрібне доповнення, лишається в additions свого Елемента.
    if (isLeg || isWallPanel) {
      productElements.push(addition);
    } else {
      rootElement.additions.push(addition);
    }
    // Стик зберігається на Стільниці в обох випадках: якорі шляхові (elementPath),
    // тому Joint коректно посилається і на елемент-сусід.
    rootElement.joints.push(joint);
    allElements.push(addition);
  });

  // Dynamically create Additions for Folds & Thickenings for ALL elements
  allElements.forEach((element) => {
    const isMain = element.id === mainElementId;
    const parentId = isMain ? 'main' : element.id.split(':').pop()!;
    const def = element.baseDefinition;

    const edgeLens = realEdgeLengths(def);

    if (def?.fold?.enabled) {
      def.fold.sides.forEach(sideId => {
        const id = isMain ? `fold_${sideId}` : `${parentId}_fold_${sideId}`;
        const elementId = buildElementPath(productId, id);
        // Реальна довжина ребра (з урахуванням радіуса й Г-зарізу), а не номінал сторони.
        const sideLength = edgeLens[sideId] || getSideSize(def, sideId) || 1000;
        const foldSize = def.fold?.sideSizes?.[sideId] || def.fold?.size || 100;
        
        // Якщо користувач уже редагував цей підворот (додав виріз/фаску) — беремо збережений
        // драфт із сесії, інакше створюємо новий за розмірами сторони.
        const savedDraft = session.subDetails?.[id];
        const addition: import('../../domain/types').ProductElement = {
          id: elementId, type: 'Підворот',
          baseDefinition: savedDraft
            ? { ...savedDraft, type: 'Підворот', thickness: def.thickness, width: sideLength, height: foldSize }
            : {
                ...createDraft(),
                type: 'Підворот',
                thickness: def.thickness,
                width: sideLength,
                height: foldSize
              },
          additions: [], joints: []
        };
        element.additions.push(addition);
        element.joints.push({
          id: `joint_${id}`, origin: 'authored',
          a: { elementPath: element.id, sideId, from: 0, to: sideLength },
          b: { elementPath: elementId, sideId: 'A', from: 0, to: sideLength },
          type: 'miter45', dominant: 'a', textureContinuity: true
        });
      });
    }

    if (def?.thickening?.enabled) {
      def.thickening.sides.forEach(sideId => {
        const id = isMain ? `thickening_${sideId}` : `${parentId}_thickening_${sideId}`;
        const elementId = buildElementPath(productId, id);
        // Так само як для підвороту — фактична довжина ребра, не номінал.
        const sideLength = edgeLens[sideId] || getSideSize(def, sideId) || 1000;
        const thickSize = def.thickening?.sideSizes?.[sideId] || def.thickening?.size || 40;

        // Так само як для підвороту: збережений драфт (з вирізами/фасками) має пріоритет.
        const savedThickDraft = session.subDetails?.[id];
        const addition: import('../../domain/types').ProductElement = {
          id: elementId, type: 'Потовщення',
          baseDefinition: savedThickDraft
            ? { ...savedThickDraft, type: 'Потовщення', thickness: def.thickness, width: sideLength, height: thickSize }
            : {
                ...createDraft(),
                type: 'Потовщення',
                thickness: def.thickness,
                width: sideLength,
                height: thickSize
              },
          additions: [], joints: []
        };
        element.additions.push(addition);
        element.joints.push({
          id: `joint_${id}`, origin: 'authored',
          a: { elementPath: element.id, sideId, from: 0, to: sideLength },
          b: { elementPath: elementId, sideId: 'A', from: 0, to: sideLength },
          type: 'glued', dominant: 'a', textureContinuity: false
        });
      });
    }
  });

  return {
    id: productId,
    name: session.mainDetail?.label || 'Виріб',
    elements: productElements
  };
}

export function ProductEditorWorkspace() {
  const session = useUIStore(s => s.productEditorSession);
  const setSession = useUIStore(s => s.setProductEditorSession);
  const addDetails = useProjectStore(s => s.addDetails);
  const project = useProjectStore(s => s.project);
  const language = useProjectStore(s => s.language);
  const ui = (text: string) => translateStaticUiText(language, text);

  const [viewMode, setViewMode] = useState<'2d' | '3d'>('3d');
  const [navCollapsed, setNavCollapsed] = useState(false);

  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [jointContextMenu, setJointContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  /** Клік по стороні в режимі «Стики»: що саме різатимемо і де відкрити віконечко. */
  const [jointSidePopup, setJointSidePopup] = useState<{ joint: JointSideSelection; x: number; y: number } | null>(null);
  const [modalCornerId, setModalCornerId] = useState<string | null>(null);
  const [modalCutoutId, setModalCutoutId] = useState<string | null>(null);
  const [newCutoutShape, setNewCutoutShape] = useState<'rect' | 'circle'>('rect');

  const [edgeContextMenu, setEdgeContextMenu] = useState<{ visible: boolean; x: number; y: number; edgeId: string } | null>(null);
  const [skirtingModalOpen, setSkirtingModalOpen] = useState<string | null>(null);
  const [wallPanelModalOpen, setWallPanelModalOpen] = useState<string | null>(null);
  const [legModalOpen, setLegModalOpen] = useState<string | null>(null);
  const [addElementModalOpen, setAddElementModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [detailContextMenu, setDetailContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [detailPassportModalOpen, setDetailPassportModalOpen] = useState<{ detailId: string, initialTab: 'passport' | 'settings' } | null>(null);
  
  const showEdges = useUIStore(s => s.showEdges);

  if (!session) return null;

  // Підвороти/потовщення генеруються деревом і можуть ще не мати збереженого драфта.
  // Щоб їх можна було редагувати (виріз, фаска, кромка) — беремо згенерований драфт з дерева.
  // Перша ж правка збереже його в session.subDetails (матеріалізація) — див. updateDetail.
  const findGeneratedDraft = (slotId: string): DetailDraft | undefined => {
    if (!session.mainDetail) return undefined;
    const product = buildProductFromSession(session, session.editingProductId || 'preview');
    for (const el of product.elements) {
      for (const add of el.additions) {
        if (toSlot(add.id) === slotId) return add.baseDefinition as DetailDraft;
      }
    }
    return undefined;
  };

  const isMainActive = !session.activeDetailId || session.activeDetailId === 'main';

  const detail = isMainActive
    ? session.mainDetail
    : (session.subDetails[session.activeDetailId!] ?? findGeneratedDraft(session.activeDetailId!));

  const updateDetail = (patch: Partial<DetailDraft>) => {
    if (!detail) return;
    const parentId = session.activeDetailId === 'main' ? 'main' : session.activeDetailId;
    let nextSubDetails = { ...session.subDetails };
    let didUpdateSubDetails = false;

    if (patch.fold && patch.fold.size !== detail.fold?.size) {
      patch.fold.sides.forEach(side => {
        const id = parentId === 'main' ? `fold_${side}` : `${parentId}_fold_${side}`;
        if (nextSubDetails[id]) {
          nextSubDetails[id] = { ...nextSubDetails[id], height: patch.fold.size };
          didUpdateSubDetails = true;
        }
      });
    }
    
    if (patch.thickening && patch.thickening.size !== detail.thickening?.size) {
      patch.thickening.sides.forEach(side => {
        const id = parentId === 'main' ? `thickening_${side}` : `${parentId}_thickening_${side}`;
        if (nextSubDetails[id]) {
          nextSubDetails[id] = { ...nextSubDetails[id], height: patch.thickening.size };
          didUpdateSubDetails = true;
        }
      });
    }

    if (parentId === 'main') {
      setSession({ 
        ...session, 
        mainDetail: { ...session.mainDetail, ...patch },
        subDetails: didUpdateSubDetails ? nextSubDetails : session.subDetails
      });
    } else {
      // Матеріалізація: якщо драфта ще немає в сесії (підворот/потовщення були згенеровані
      // деревом), беремо за основу вирішений `detail`, інакше втратимо розміри й тип.
      nextSubDetails[parentId] = { ...(nextSubDetails[parentId] ?? detail), ...patch };
      setSession({
        ...session,
        subDetails: nextSubDetails
      });
    }
  };

  const handleClose = () => {
    setSession(null);
  };

  const getPreviewDetails = (): Detail[] => {
    if (!session.mainDetail) return [];
    const productId = session.editingProductId || uid('prod');
    const product = buildProductFromSession(session, productId);
    return flattenProductToDetails(product);
  };

  
  const handleSave = () => {
    if (!session.mainDetail) {
      setSession(null);
      return;
    }

    const productId = session.editingProductId || uid('prod');
    const product = buildProductFromSession(session, productId);
    
    if (session.editingProductId) {
      useProjectStore.getState().updateProduct(session.editingProductId, product);
    } else {
      useProjectStore.getState().addProduct(product);
    }
    setSession(null);
  };
const handleDetailContextMenu = (id: string, x: number, y: number) => {
    setDetailContextMenu({ id: toSlot(id), x, y });
  };

  const handlePassportSave = (detailId: string, customServices: CustomService[]) => {
    if (detailId === 'main') {
      updateDetail({ customServices });
    } else {
      setSession({
        ...session,
        subDetails: {
          ...session.subDetails,
          [detailId]: {
            ...session.subDetails[detailId],
            customServices
          }
        }
      });
    }
  };

  const handleCornerClick = (id: string, x: number, y: number) => {
    setContextMenu({ id, x, y });
  };

  const handleCornerSave = (data: import('../../domain/types').CornerProcessing | undefined) => {
    if (modalCornerId) {
      const newCorners = { ...detail.corners };
      if (data) {
        newCorners[modalCornerId] = data;
      } else {
        delete newCorners[modalCornerId];
      }
      updateDetail({ corners: newCorners });
    }
    setModalCornerId(null);
  };

  const handleCutoutSave = (cutout: any) => {
    const newCutouts = { ...detail.cutouts };
    
    if (modalCutoutId === 'new') {
      const id = `cutout_${Date.now()}`;
      newCutouts[id] = { ...cutout, id };
    } else if (modalCutoutId) {
      newCutouts[modalCutoutId] = { ...cutout, id: modalCutoutId };
    }

    updateDetail({ cutouts: newCutouts });
    setModalCutoutId(null);
  };

  const handleDeleteCorner = (cornerId: string) => {
    const newCorners = { ...detail.corners };
    delete newCorners[cornerId];
    updateDetail({ corners: newCorners });
  };

  const handleDeleteCutout = (cutoutId: string) => {
    const newCutouts = { ...detail.cutouts };
    delete newCutouts[cutoutId];
    updateDetail({ cutouts: newCutouts });
  };

  // ── Довільні стики ────────────────────────────────────────────────────────
  // Стик на заданій відстані від кута. Потрібен, коли деталь більша за сляб
  // або коли ріжемо із залишку — тобто не обов'язково там, де є увігнутий кут.
  const jointAnchorOptions = React.useMemo(
    () => Object.keys(jointAnchorPoints(detail ? toDetailShape(detail.kind) : undefined, detail as JointShapeFields) ?? {}),
    [detail],
  );

  /** Опорні кути активної деталі — спільні для панелі й для віконечка в 3D. */
  const activeJointAnchors = React.useMemo(
    () => (detail ? jointAnchorPoints(toDetailShape(detail.kind), detail as JointShapeFields) : undefined),
    [detail],
  );

  /** Куди насправді стане стик, якщо задана відстань потрапляє на радіус. */
  const snapJointPreview = (draft: typeof detail, joint: ManualJoint): number | null => {
    if (!draft) return null;
    const anchors = jointAnchorPoints(toDetailShape(draft.kind), draft as JointShapeFields);
    const { requested, snapped } = manualJointPosition(anchors, draft.corners, joint);
    return Math.abs(snapped - requested) > 0.01 ? snapped : null;
  };

  /**
   * Додає стик. Приймає готовий опис, а не сам напрямок: коли стик задають
   * кліком по стороні в 3D, напрямок і опорний кут уже виведені з геометрії
   * (`jointSelectionFor` у `Detail3DPreview`), і вгадувати їх удруге не можна.
   */
  const handleAddManualJoint = (joint: {
    axis: 'vertical' | 'horizontal';
    anchorCorner?: string;
    offset?: number;
  }) => {
    if (!detail) return;
    const joints = detail.manualJoints ?? [];
    updateDetail({
      manualJoints: [
        ...joints,
        {
          id: `joint_${Date.now()}`,
          axis: joint.axis,
          anchorCorner: joint.anchorCorner,
          offset: joint.offset ?? (joint.axis === 'vertical' ? 600 : 400),
        },
      ],
    });
  };

  const handleUpdateManualJoint = (jointId: string, patch: Partial<ManualJoint>) => {
    if (!detail) return;
    updateDetail({
      manualJoints: (detail.manualJoints ?? []).map((joint) =>
        joint.id === jointId ? { ...joint, ...patch } : joint,
      ),
    });
  };

  const handleDeleteManualJoint = (jointId: string) => {
    if (!detail) return;
    updateDetail({
      manualJoints: (detail.manualJoints ?? []).filter((joint) => joint.id !== jointId),
    });
  };

  const handleEdgeClick = (edgeId: string, x: number, y: number) => {
    setEdgeContextMenu({ visible: true, x, y, edgeId });
  };

  return (
    <div className="absolute inset-0 bg-[#eaf0f4] z-50 flex flex-col shadow-lg overflow-hidden animate-in fade-in zoom-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-[#c6d3dd]">
        <div>
          <h1 className="text-lg font-bold text-[#1f2d3a] flex items-center gap-3">
            {detail ? `Редагування: ${ui(detail.type)} ${detail.kind !== 'rect' ? `(${ui(detail.kind)})` : ''}` : 'Новий виріб'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">Налаштування розмірів, торців, кутів та вирізів</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleClose}
            className="px-4 py-2 text-sm font-bold border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Скасувати
          </button>
          {session.mainDetail && (
            <button 
              onClick={handleSave}
              className="px-6 py-2 text-sm font-bold bg-[#0084ff] text-white rounded-md shadow-sm hover:bg-[#006bce] transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Зберегти виріб
            </button>
          )}
        </div>
      </div>

      {/* Split Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Canvas Area */}
        <div className="flex-1 p-6 flex flex-col overflow-hidden relative gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('2d')}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                viewMode === '2d'
                  ? 'bg-white text-[#0084ff] shadow-sm border border-[#c6d3dd]'
                  : 'bg-transparent text-slate-500 hover:bg-slate-200'
              }`}
            >
              2D Креслення
            </button>
            <button
              onClick={() => setViewMode('3d')}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                viewMode === '3d'
                  ? 'bg-white text-[#0084ff] shadow-sm border border-[#c6d3dd]'
                  : 'bg-transparent text-slate-500 hover:bg-slate-200'
              }`}
            >
              3D Модель
            </button>
          </div>
          
          <div className="flex-1 relative bg-[#eaf0f4] rounded-md overflow-hidden border border-[#c6d3dd] shadow-inner flex flex-col">
            {viewMode === '2d' ? (
              detail ? (
                <div className="flex-1 w-full relative flex flex-col">
                  {/* Той самий редактор «Налаштування розмірів та торців», але вбудований:
                      дерево ліворуч і властивості праворуч лишаються видимими,
                      тож між деталями можна перемикатись не виходячи з 2D. */}
                  <ElementSettingsModal
                    embedded
                    key={session.activeDetailId ?? 'main'}
                    project={project}
                    initialDetail={detail}
                    onClose={() => setViewMode('3d')}
                    onSave={(draft) => updateDetail(draft)}
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-sm">
                  <Box className="w-12 h-12 text-slate-300 mb-2" />
                  Виберіть деталь для відображення в 2D
                </div>
              )
            ) : session.mainDetail ? (
              <Detail3DPreview
                detail={session.mainDetail}
                subDetails={session.subDetails}
                activeDetailId={session.activeDetailId ?? 'main'}
                onEdgeClick={handleEdgeClick}
                onCornerClick={handleCornerClick}
                onJointClick={(id, x, y) => setJointContextMenu({ id, x, y })}
                onJointSideClick={(joint, x, y) => setJointSidePopup({ joint, x, y })}
                /* Виріз має лягти на ту деталь, по площині якої клікнули,
                   а не на активну — інакше виріз для панелі потрапляє на стільницю. */
                onPlaneClick={(clickedId) => {
                  const slot = clickedId ? toSlot(clickedId) : (session.activeDetailId ?? 'main');
                  if (slot !== session.activeDetailId) {
                    setSession({ ...session, activeDetailId: slot });
                  }
                  setModalCutoutId('new');
                }}
                onLegDoubleClick={(id) => setLegModalOpen(id)}
                onWallPanelDoubleClick={(id) => setWallPanelModalOpen(id)}
                onDetailDoubleClick={(id) => setSettingsModalOpen(true)}
                onDetailClick={(id) => setSession({ ...session, activeDetailId: toSlot(id) })}
                onDetailContextMenu={handleDetailContextMenu}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-sm">
                <Box className="w-12 h-12 text-slate-300 mb-2" />
                Додайте базову деталь, щоб побачити 3D
              </div>
            )}
            {jointContextMenu && (
              <JointContextMenu
                x={jointContextMenu.x}
                y={jointContextMenu.y}
                language={language}
                onClose={() => setJointContextMenu(null)}
                onSelect={(direction) => {
                  setJointContextMenu(null);
                  const isU = detail.kind === 'u';
                  const isL = detail.kind === 'l';
                  
                  if (direction === 'none') {
                    if (isU) {
                      if (jointContextMenu.id === 'E') updateDetail({ jointOmegaDirection: undefined });
                      else if (jointContextMenu.id === 'D') updateDetail({ jointLambdaDirection: undefined });
                    } else if (isL) {
                      updateDetail({ jointDirection: undefined });
                    }
                  } else {
                    if (isU) {
                      if (jointContextMenu.id === 'E') updateDetail({ jointOmegaDirection: direction as 'horizontal' | 'vertical' });
                      else if (jointContextMenu.id === 'D') updateDetail({ jointLambdaDirection: direction as 'horizontal' | 'vertical' });
                    } else if (isL) {
                      updateDetail({ jointDirection: direction as 'horizontal' | 'vertical' });
                    }
                  }
                }}
              />
            )}

            {jointSidePopup && (
              <JointOffsetPopup
                x={jointSidePopup.x}
                y={jointSidePopup.y}
                joint={jointSidePopup.joint}
                anchors={activeJointAnchors}
                corners={detail?.corners}
                onCancel={() => setJointSidePopup(null)}
                onConfirm={(offset) => {
                  handleAddManualJoint({
                    axis: jointSidePopup.joint.axis,
                    anchorCorner: jointSidePopup.joint.anchorCorner,
                    offset,
                  });
                  setJointSidePopup(null);
                }}
              />
            )}

                  {detailContextMenu && (
        <DetailContextMenu
          x={detailContextMenu.x}
          y={detailContextMenu.y}
          detailId={detailContextMenu.id}
          onClose={() => setDetailContextMenu(null)}
          onAction={(action, id) => {
            setDetailPassportModalOpen({ detailId: id, initialTab: action });
            setDetailContextMenu(null);
          }}
        />
      )}

      {detailPassportModalOpen && (
        <DetailPassportModal
          detailId={detailPassportModalOpen.detailId}
          project={project}
          details={getPreviewDetails()}
          initialTab={detailPassportModalOpen.initialTab}
          onClose={() => setDetailPassportModalOpen(null)}
          onSave={handlePassportSave}
        />
      )}

      {contextMenu && (
              <CornerContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                language={language}
                onClose={() => setContextMenu(null)}
                onSelect={(type) => {
                  setContextMenu(null);
                  const existing = detail.corners?.[contextMenu.id];
                  if (!existing) {
                    const newCorners = { ...detail.corners, [contextMenu.id]: { type, radius: 10, sizeB: 10, sizeC: 10 } };
                    updateDetail({ corners: newCorners });
                  }
                  setModalCornerId(contextMenu.id);
                }}
              />
            )}

            {modalCornerId && (
              <CornerProcessingModal
                cornerId={modalCornerId}
                initialData={detail.corners?.[modalCornerId]}
                language={language}
                onClose={() => setModalCornerId(null)}
                onSave={handleCornerSave}
              />
            )}

            {modalCutoutId && (
              <CutoutProcessingModal
                initialData={modalCutoutId === 'new' ? { shape: newCutoutShape } : detail.cutouts?.[modalCutoutId]}
                corners={getCornersForKind(detail.kind)}
                language={language}
                onClose={() => setModalCutoutId(null)}
                onSave={handleCutoutSave}
              />
            )}

            {edgeContextMenu && (
              <EdgeContextMenu
                x={edgeContextMenu.x}
                y={edgeContextMenu.y}
                edgeId={edgeContextMenu.edgeId}
                onClose={() => setEdgeContextMenu(null)}
                onSelectProfile={(profile) => {
                  setEdgeContextMenu(null);
                  const newProfiles = { ...detail.edgeProfiles };
                  if (profile) newProfiles[edgeContextMenu.edgeId] = profile as any;
                  else delete newProfiles[edgeContextMenu.edgeId];
                  updateDetail({ edgeProfiles: newProfiles });
                }}
                onSelect={(action) => {
                  setEdgeContextMenu(null);
                  if (action === 'thickening') {
                    const nextSides = detail.thickening.sides.includes(edgeContextMenu.edgeId)
                      ? detail.thickening.sides.filter(s => s !== edgeContextMenu.edgeId)
                      : [...detail.thickening.sides, edgeContextMenu.edgeId];
                    updateDetail({ thickening: { ...detail.thickening, enabled: nextSides.length > 0, sides: nextSides } });
                  } else if (action === 'fold') {
                    const nextSides = detail.fold.sides.includes(edgeContextMenu.edgeId)
                      ? detail.fold.sides.filter(s => s !== edgeContextMenu.edgeId)
                      : [...detail.fold.sides, edgeContextMenu.edgeId];
                    updateDetail({ fold: { ...detail.fold, enabled: nextSides.length > 0, sides: nextSides } });
                  } else if (action === 'skirting') {
                    setSkirtingModalOpen(edgeContextMenu.edgeId);
                  } else if (action === 'wall_panel') {
                    setWallPanelModalOpen(edgeContextMenu.edgeId);
                  } else if (action === 'leg') {
                    setLegModalOpen(edgeContextMenu.edgeId);
                  }
                }}
              />
            )}

            {skirtingModalOpen && (
              <SkirtingModal
                edgeId={skirtingModalOpen}
                initialData={session.mainDetail.skirtings?.[skirtingModalOpen]}
                onClose={() => setSkirtingModalOpen(null)}
                onSave={(skirting) => {
                  const id = `skirting_${skirtingModalOpen}`;
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
                    activeDetailId: toSlot(id)
                  });
                  setSkirtingModalOpen(null);
                }}
              />
            )}

            {wallPanelModalOpen && (
              <WallPanelModal
                edgeId={wallPanelModalOpen}
                initialData={session.mainDetail.wallPanels?.[wallPanelModalOpen]}
                onClose={() => setWallPanelModalOpen(null)}
                onSave={(panel) => {
                  const id = `wall_panel_${wallPanelModalOpen}`;
                  const newPanel = session.subDetails[id] ? { ...session.subDetails[id] } : {
                    ...createDraft(),
                    thickness: session.mainDetail.thickness,
                    quantity: session.mainDetail.quantity,
                  };
                  newPanel.type = 'Стінова панель';
                  if (panel.width) newPanel.width = panel.width;
                  if (panel.height) newPanel.height = panel.height;
                  
                  setSession({
                    ...session,
                    subDetails: { ...session.subDetails, [id]: newPanel },
                    activeDetailId: toSlot(id)
                  });
                  setWallPanelModalOpen(null);
                }}
              />
            )}

            {legModalOpen && (
              <LegModal
                edgeId={legModalOpen}
                initialData={session.mainDetail.legs?.[legModalOpen]}
                onClose={() => setLegModalOpen(null)}
                onSave={(leg) => {
                  const id = `leg_${legModalOpen}`;
                  const newLeg = session.subDetails[id] ? { ...session.subDetails[id] } : {
                    ...createDraft(),
                    thickness: session.mainDetail.thickness,
                    quantity: session.mainDetail.quantity,
                  };
                  newLeg.type = 'Опора';
                  if (leg.width) newLeg.width = leg.width;
                  if (leg.height) newLeg.height = leg.height;

                  setSession({
                    ...session,
                    subDetails: { ...session.subDetails, [id]: newLeg },
                    activeDetailId: toSlot(id)
                  });
                  setLegModalOpen(null);
                }}
              />
            )}

            {viewMode === '2d' && (
              <div className="absolute left-4 top-4 flex flex-col gap-2 bg-white border border-[#c6d3dd] rounded-sm p-1 shadow-sm">
                <button 
                  onClick={() => { setNewCutoutShape('rect'); setModalCutoutId('new'); }}
                  className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-[#1f93ef] hover:bg-[#1f93ef]/10 rounded-sm transition-colors"
                  title="Прямокутний виріз"
                >
                  <Square className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => { setNewCutoutShape('rect'); setModalCutoutId('new'); }}
                  className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-[#1f93ef] hover:bg-[#1f93ef]/10 rounded-sm transition-colors"
                  title="Довільний виріз"
                >
                  <PlusSquare className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => { setNewCutoutShape('circle'); setModalCutoutId('new'); }}
                  className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-[#1f93ef] hover:bg-[#1f93ef]/10 rounded-sm transition-colors"
                  title="Круглий виріз"
                >
                  <Circle className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Left: Навігація — окремий бар, що згортається.
            order-first ставить його перед канвасом без переносу JSX. */}
        <div className={`${navCollapsed ? 'w-10' : 'w-[320px]'} order-first bg-white border-r border-[#c6d3dd] flex flex-col overflow-y-auto shadow-sm z-10 transition-all duration-200 shrink-0`}>
          <button
            onClick={() => setNavCollapsed(!navCollapsed)}
            className="w-full p-2 flex items-center justify-center gap-2 text-slate-500 hover:bg-slate-100 border-b border-slate-200 shrink-0"
            title={navCollapsed ? 'Показати навігацію' : 'Згорнути навігацію'}
          >
            {navCollapsed
              ? <ChevronRight className="w-4 h-4" />
              : <><ChevronLeft className="w-4 h-4" /><span className="text-xs font-bold">Згорнути</span></>}
          </button>

          {!navCollapsed && (
           <>
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700">Навігація</h2>
            {!session.mainDetail && (
              <button
                className="text-xs font-bold text-[#0084ff] hover:bg-[#0084ff]/10 px-2 py-1 rounded-sm transition-colors"
                onClick={() => setAddElementModalOpen(true)}
              >
                + Створити виріб
              </button>
            )}
          </div>
          
          {(() => {
            if (!session.mainDetail) return null;
            const productId = session.editingProductId || 'preview';
            const product = buildProductFromSession(session, productId);
            const mainElement = product.elements[0];
            
            return (
              <div className="flex flex-col gap-2 font-medium text-sm text-slate-600 p-4 border-b border-slate-200">
                {/* Product */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-slate-400" />
                    <span className="font-bold text-slate-700">{product.name}</span>
                  </div>
                  <button
                    onClick={() => setAddElementModalOpen(true)}
                    className="text-[#0084ff] hover:bg-[#0084ff]/10 p-1 rounded-sm transition-colors"
                    title="Додати деталь до виробу"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Elements */}
                {product.elements.map((element, idx) => {
                  const isMain = idx === 0;
                  const elementSlot = toSlot(element.id);
                  const isActive = session.activeDetailId === elementSlot;
                  
                  return (
                    <div key={element.id} className="flex flex-col gap-1 ml-3 pl-3 border-l-2 border-slate-200">
                      <div className="flex items-center gap-2 mt-1 py-1 px-1">
                        <Folder className="w-4 h-4 text-slate-400" />
                        <span className="font-bold text-slate-600">{ui(element.type)} (Елемент)</span>
                      </div>

                      {/* Detail itself */}
                      <div className="flex flex-col gap-1 ml-4 pl-3 border-l-2 border-slate-200 pb-2">
                        <div 
                          className={`flex items-center justify-between mt-1 hover:bg-slate-100 py-1 px-1 rounded-sm pr-2 cursor-pointer ${isActive ? 'text-[#1f93ef] bg-blue-50/50' : ''}`}
                          onClick={() => setSession({ ...session, activeDetailId: elementSlot })}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <FileText className={`w-4 h-4 ${isActive ? 'text-[#1f93ef]' : 'text-slate-400'}`} />
                            <span className={isActive ? 'font-bold' : ''}>
                              {ui(element.type)} {isMain ? '' : `(${elementSlot.replace(/^.*_/, '')})`} (Деталь)
                            </span>
                          </div>
                          <button
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (isMain) {
                                setSession({ ...session, mainDetail: undefined, activeDetailId: null }); 
                              } else {
                                const newSubDetails = { ...session.subDetails };
                                delete newSubDetails[elementSlot];
                                setSession({ ...session, subDetails: newSubDetails, activeDetailId: isActive ? 'main' : session.activeDetailId });
                              }
                            }}
                            className="text-slate-400 hover:text-red-500 transition-colors p-1"
                            title="Видалити"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Additions of THIS element */}
                        {element.additions.map(addition => {
                          const additionSlot = toSlot(addition.id);
                          const isAddActive = session.activeDetailId === additionSlot;
                          
                          const sideMatch = additionSlot.match(/_(A|B|C|D|E|F|G|H)$/);
                          const sideId = sideMatch ? sideMatch[1] : '';
                          const label = sideId ? `${ui(addition.type)} (${sideId})` : ui(addition.type);
                          
                          const isElementAddon = addition.type === 'Опора' || addition.type === 'Стінова панель';
                          const icon = isElementAddon 
                            ? <Folder className={`w-4 h-4 ${isAddActive ? 'text-[#1f93ef]' : 'text-slate-400'}`} />
                            : <FileText className={`w-4 h-4 ${isAddActive ? 'text-[#1f93ef]' : 'text-slate-400'}`} />;
                          const suffix = isElementAddon ? '(Елемент)' : '(Доповнення)';

                          return (
                            <div key={addition.id} className="flex flex-col">
                              <div 
                                className={`flex items-center justify-between mt-1 hover:bg-slate-100 py-1 px-1 rounded-sm pr-2 cursor-pointer ${isAddActive ? 'text-[#1f93ef] bg-blue-50/50' : ''}`}
                                onClick={() => setSession({ ...session, activeDetailId: additionSlot })}
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  {icon}
                                  <span className={isAddActive ? 'font-bold' : ''}>{label} {suffix}</span>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (additionSlot.startsWith('fold_') || additionSlot.startsWith('thickening_')) {
                                      const isFold = additionSlot.startsWith('fold_');
                                      const sideId = additionSlot.split('_')[1];
                                      const newMain = { ...session.mainDetail! };
                                      if (isFold && newMain.fold) {
                                        newMain.fold = { ...newMain.fold, sides: newMain.fold.sides.filter(s => s !== sideId) };
                                        if (newMain.fold.sides.length === 0) newMain.fold.enabled = false;
                                      } else if (!isFold && newMain.thickening) {
                                        newMain.thickening = { ...newMain.thickening, sides: newMain.thickening.sides.filter(s => s !== sideId) };
                                        if (newMain.thickening.sides.length === 0) newMain.thickening.enabled = false;
                                      }
                                      setSession({ ...session, mainDetail: newMain, activeDetailId: isAddActive ? 'main' : session.activeDetailId });
                                    } else {
                                      const newSubDetails = { ...session.subDetails };
                                      delete newSubDetails[additionSlot];
                                      setSession({ ...session, subDetails: newSubDetails, activeDetailId: isAddActive ? 'main' : session.activeDetailId });
                                    }
                                  }}
                                  className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                  title="Видалити"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              
                              {/* Nested Additions (Folds/Thickenings for Legs and Wall Panels) */}
                              {addition.additions && addition.additions.length > 0 && (
                                <div className="flex flex-col gap-1 ml-4 pl-3 border-l-2 border-slate-200">
                                  {addition.additions.map(nestedAddition => {
                                    const nestedSlot = toSlot(nestedAddition.id);
                                    const isNestedActive = session.activeDetailId === nestedSlot;
                                    const nSideMatch = nestedSlot.match(/_(A|B|C|D|E|F|G|H)$/);
                                    const nSideId = nSideMatch ? nSideMatch[1] : '';
                                    const nLabel = nSideId ? `${ui(nestedAddition.type)} (${nSideId})` : ui(nestedAddition.type);
                                    
                                    return (
                                      <div 
                                        key={nestedAddition.id} 
                                        className={`flex items-center justify-between mt-1 hover:bg-slate-100 py-1 px-1 rounded-sm pr-2 cursor-pointer ${isNestedActive ? 'text-[#1f93ef] bg-blue-50/50' : ''}`}
                                        onClick={() => setSession({ ...session, activeDetailId: nestedSlot })}
                                      >
                                        <div className="flex items-center gap-2 flex-1">
                                          <FileText className={`w-4 h-4 ${isNestedActive ? 'text-[#1f93ef]' : 'text-slate-400'}`} />
                                          <span className={isNestedActive ? 'font-bold' : ''}>{nLabel} (Доповнення)</span>
                                        </div>
                                        {/* Nested deletions require modifying subDetails */}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const subId = addition.id.split(':').pop()!;
                                            const newSubDetails = { ...session.subDetails };
                                            const subDetail = newSubDetails[subId];
                                            if (subDetail) {
                                              const isFold = nestedSlot.includes('_fold_');
                                              const nSideIdStr = nestedSlot.split('_').pop()!;
                                              if (isFold && subDetail.fold) {
                                                subDetail.fold = { ...subDetail.fold, sides: subDetail.fold.sides.filter(s => s !== nSideIdStr) };
                                                if (subDetail.fold.sides.length === 0) subDetail.fold.enabled = false;
                                              } else if (!isFold && subDetail.thickening) {
                                                subDetail.thickening = { ...subDetail.thickening, sides: subDetail.thickening.sides.filter(s => s !== nSideIdStr) };
                                                if (subDetail.thickening.sides.length === 0) subDetail.thickening.enabled = false;
                                              }
                                              setSession({ ...session, subDetails: newSubDetails, activeDetailId: isNestedActive ? additionSlot : session.activeDetailId });
                                            }
                                          }}
                                          className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                          title="Видалити"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
           </>
          )}
        </div>

        {/* Right: Властивості деталі */}
        <div className="w-[450px] bg-white border-l border-[#c6d3dd] flex flex-col overflow-y-auto shadow-sm z-10 shrink-0">
          {detail ? (
            <>
              <div className="p-4 bg-slate-50 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-700">Властивості деталі</h2>
              </div>
              
              <div className="accordion-edges transition-all duration-500">
                <Accordion title="Сторони (Розміри та Кромка)" defaultOpen={true}>
                  <EdgeProcessingDesigner
                    edgeProfiles={detail.edgeProfiles}
                  thickening={detail.thickening}
                  fold={detail.fold}
                  sides={allSides}
                  blockedEdgeSides={[]}
                  linkedThickeningSides={[]}
                  linkedFoldSides={[]}
                  onChange={(patch) => updateDetail(patch)}
                />
                </Accordion>
              </div>

          <Accordion title="Обробка кутів (Радіуси)">
            <div className="p-4 flex flex-col gap-2">
              {detail.corners && Object.keys(detail.corners).length > 0 ? (
                Object.entries(detail.corners).map(([cornerId, corner]) => (
                  <div key={cornerId} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-sm">
                    <div className="flex flex-col">
                      <span className="font-bold text-[#1f2d3a] text-sm">Кут {cornerId}</span>
                      <span className="text-xs text-slate-500">
                        {corner.type === 'radius' && `Радіус: ${corner.radius} мм`}
                        {corner.type === 'chamfer' && `Фаска: ${corner.sizeB}x${corner.sizeC} мм`}
                        {corner.type === 'l-cut' && `Г-виріз: ${corner.sizeB}x${corner.sizeC} мм`}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setModalCornerId(cornerId)}
                        className="text-[#0084ff] hover:bg-[#0084ff]/10 px-2 py-1 rounded-sm text-xs font-medium transition-colors"
                      >
                        Редагувати
                      </button>
                      <button 
                        onClick={() => handleDeleteCorner(cornerId)}
                        className="text-red-500 hover:bg-red-50 p-1 rounded-sm transition-colors"
                        title="Видалити"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500 text-center py-4">
                  Щоб налаштувати кут, клікніть на плюсик (+) у 2D або правим кліком на кут у 3D моделі.
                </div>
              )}
            </div>
          </Accordion>

          <Accordion title="Обробка площин (Вирізи)">
            <div className="p-4 flex flex-col gap-2">
              {detail.cutouts && Object.keys(detail.cutouts).length > 0 ? (
                Object.entries(detail.cutouts).map(([cutoutId, cutout]) => (
                  <div key={cutoutId} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-sm">
                    <div className="flex flex-col">
                      <span className="font-bold text-[#1f2d3a] text-sm">Виріз {cutout.type === 'socket' ? '(Розетка)' : cutout.type === 'faucet' ? '(Кран)' : '(Довільний)'}</span>
                      <span className="text-xs text-slate-500">
                        {cutout.shape === 'circle' ? `Радіус: ${cutout.radius} мм` : `Розмір: ${cutout.width}x${cutout.height} мм`}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setModalCutoutId(cutoutId)}
                        className="text-[#0084ff] hover:bg-[#0084ff]/10 px-2 py-1 rounded-sm text-xs font-medium transition-colors"
                      >
                        Редагувати
                      </button>
                      <button 
                        onClick={() => handleDeleteCutout(cutoutId)}
                        className="text-red-500 hover:bg-red-50 p-1 rounded-sm transition-colors"
                        title="Видалити"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500 text-center py-4">
                  Немає вирізів. Створіть їх через праве меню на поверхні.
                </div>
              )}
            </div>
          </Accordion>

          <Accordion title="Стики (З'єднання деталей)">
            <div className="p-4 flex flex-col gap-2">
              {/* Кому дістається дуга, коли стик стоїть у куті з радіусом.
                  Поля `jointOmegaRadiusSide` / `jointLambdaRadiusSide` давно
                  працювали в рушії, але кнопок не було — діяв мовчазний `second`.
                  Показуємо перемикач ЛИШЕ коли питання справді стоїть: форма
                  П-подібна (тільки для неї рушій ці поля читає), на увігнутому
                  куті справді радіус, і на цьому куті справді заданий стик. */}
              {detail.kind === 'u' && (() => {
                const reflexIds = reflexCornerIds(toDetailShape(detail.kind));
                const rows = [
                  {
                    cornerId: 'E',
                    title: 'Стик у куті E (омега)',
                    direction: detail.jointOmegaDirection,
                    value: detail.jointOmegaRadiusSide ?? 'second',
                    apply: (side: 'first' | 'second') => updateDetail({ jointOmegaRadiusSide: side }),
                  },
                  {
                    cornerId: 'D',
                    title: 'Стик у куті D (лямбда)',
                    direction: detail.jointLambdaDirection,
                    value: detail.jointLambdaRadiusSide ?? 'second',
                    apply: (side: 'first' | 'second') => updateDetail({ jointLambdaRadiusSide: side }),
                  },
                ].filter((row) => {
                  const corner = detail.corners?.[row.cornerId];
                  return (
                    reflexIds.includes(row.cornerId) &&
                    corner?.type === 'radius' &&
                    (corner.radius ?? 0) > 0 &&
                    !!row.direction
                  );
                });

                if (!rows.length) return null;

                return (
                  <div className="p-2 bg-amber-50/60 border border-amber-200 rounded-sm flex flex-col gap-2">
                    <span className="font-bold text-[#1f2d3a] text-sm">Кому дістається радіус</span>
                    <p className="text-xs text-slate-500">
                      Вести стик по дузі не можна — деталь звузилась би там у нуль. Дуга
                      лишається цілою на одній деталі; оберіть, на якій.
                    </p>
                    {rows.map((row) => {
                      const isVertical = row.direction === 'vertical';
                      return (
                        <div key={row.cornerId} className="flex flex-col gap-1">
                          <span className="text-xs text-slate-600">{row.title}</span>
                          <div className="flex gap-1">
                            {(['first', 'second'] as const).map((side) => (
                              <button
                                key={side}
                                onClick={() => row.apply(side)}
                                className={`flex-1 px-2 py-1 text-xs rounded-sm border transition-colors ${
                                  row.value === side
                                    ? 'bg-[#0084ff] text-white border-[#0084ff] font-bold'
                                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                {side === 'first'
                                  ? isVertical ? 'Лишити лівій' : 'Лишити нижній'
                                  : isVertical ? 'Передати правій' : 'Передати верхній'}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {(detail.manualJoints ?? []).map((joint) => {
                const snapped = snapJointPreview(detail, joint);
                return (
                  <div key={joint.id} className="p-2 bg-slate-50 border border-slate-200 rounded-sm flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#1f2d3a] text-sm">
                        {joint.axis === 'vertical' ? 'Вертикальний стик' : 'Горизонтальний стик'}
                      </span>
                      <button
                        onClick={() => handleDeleteManualJoint(joint.id)}
                        className="text-red-500 hover:bg-red-50 p-1 rounded-sm transition-colors"
                        title="Видалити"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={joint.anchorCorner ?? ''}
                        onChange={(e) => handleUpdateManualJoint(joint.id, { anchorCorner: e.target.value || undefined })}
                        className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded-sm bg-white"
                      >
                        <option value="">Від краю деталі</option>
                        {jointAnchorOptions.map((id) => (
                          <option key={id} value={id}>Від кута {id}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={joint.offset}
                        onChange={(e) => handleUpdateManualJoint(joint.id, { offset: Number(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 text-xs border border-slate-300 rounded-sm"
                      />
                      <span className="text-xs text-slate-500">мм</span>
                    </div>

                    {snapped !== null && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1.5">
                        Стик буде посунуто на <b>{Math.round(snapped)} мм</b>: на заданій відстані він
                        потрапляє на радіус, деталь звузилась би там у нуль і вістря лопнуло б при різі.
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleAddManualJoint({ axis: 'vertical' })}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-[#0084ff] border border-[#0084ff] hover:bg-[#0084ff]/5 rounded-sm transition-colors"
                >
                  + Вертикальний
                </button>
                <button
                  onClick={() => handleAddManualJoint({ axis: 'horizontal' })}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-[#0084ff] border border-[#0084ff] hover:bg-[#0084ff]/5 rounded-sm transition-colors"
                >
                  + Горизонтальний
                </button>
              </div>

              {!(detail.manualJoints ?? []).length && (
                <div className="text-xs text-slate-500 text-center pt-1">
                  Стик на довільній відстані — коли деталь більша за сляб або ріжемо із залишку.
                </div>
              )}
            </div>
          </Accordion>

          <Accordion title="Встановлення мийки в виріб">
            <div className="text-sm text-slate-500 py-4 text-center">
              Інтерфейс мийок буде додано тут...
            </div>
          </Accordion>
            </>
          ) : session.activeDetailId?.startsWith('fold_') || session.activeDetailId?.startsWith('thickening_') ? (
            <div className="p-8 text-center text-slate-500 flex flex-col gap-2 items-center justify-center h-full">
              <Box className="w-8 h-8 text-slate-300" />
              <span className="font-medium text-slate-600">Це доповнення</span>
              <p className="text-sm mt-2">
                Редагується у властивостях головної деталі (розділ "Сторони").
              </p>
              <button 
                onClick={() => setSession({ ...session, activeDetailId: 'main' })}
                className="mt-4 px-4 py-1.5 text-sm font-medium text-[#0084ff] border border-[#0084ff] hover:bg-[#0084ff]/5 rounded-sm transition-colors"
              >
                Перейти до головної деталі
              </button>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-sm flex items-center justify-center h-full">
              Виберіть деталь для редагування
            </div>
          )}
        </div>
      </div>
      {addElementModalOpen && (
        <CreateProductModal
          onClose={() => setAddElementModalOpen(false)}
          onSave={(draft, name) => {
            setSession({ ...session, mainDetail: { ...draft, label: name }, activeDetailId: 'main' });
            setAddElementModalOpen(false);
          }}
        />
      )}
      {settingsModalOpen && detail && (
        <ElementSettingsModal
          project={project}
          initialDetail={detail}
          onClose={() => setSettingsModalOpen(false)}
          onSave={(draft) => {
            updateDetail(draft);
            setSettingsModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
