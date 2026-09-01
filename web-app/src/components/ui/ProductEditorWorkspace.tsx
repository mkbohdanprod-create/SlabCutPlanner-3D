import React, { useState } from 'react';
import { ProductElement3DNode } from '../3d/ProductElement3DNode';
import {  ChevronDown, ChevronRight, ChevronLeft, Save, Trash2, Folder, LayoutTemplate } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useStore';
import { DesignerCanvas, sideOptionsFor } from './FormsPanel';
import { SinkDesigner } from '../forms/shapes/SinkDesigner';
import { translateStaticUiText } from '../../i18n';
import type { DetailDraft, ShapeKind } from '../forms/utils/draftHelpers';
import { parseAdditionSlot, buildElementPath, toSlot, EDGE_KIND_LABEL } from '../../domain/ids';
import { occupiedEdgeSides } from '../../domain/edgeOccupancy';
import { clickEdgeSideLetter } from '../../store/useEdgeSourceSide';
import { jointAnchorPoints, manualJointPosition, reflexCornerIds } from '../../domain/joints';
import type { JointShapeFields, JointSideSelection } from '../../domain/joints';
import type { ManualJoint } from '../../domain/types';
import { JointOffsetPopup } from './JointOffsetPopup';
import { flattenProductToDetails } from '../../store/projectHelpers';
import { uid } from '../../domain/defaults';
import { radiusElementSpecs, cornerArcLengthMm, radiusMethodFor, radiusReserveFor, radiusRoleForType } from '../../domain/radiusElement';
import { toDetailShape, buildGeometry } from '../../domain/elementToDetail';
import { attachmentContactSide } from '../../engines/transform3d';
import { UCutoutModal } from './UCutoutModal';
import type { UCutoutSide, UCutoutSpec } from '../../domain/uCutout';
import { contourEdges, edgeNamedContour } from '../../domain/baseContour';
import { sinkAdditionElements, createProductSink } from '../../domain/productSink';
import { METAL_PROFILES, DEFAULT_METAL_PROFILE_ID, metalProfileById, pieceSurfaceM2, kgPerMeter } from '../../domain/metalProfiles';
import { metalSegmentElements, metalChainWeightKg, nextSegmentId } from '../../domain/metalChain';
import type { ProductSinkDef } from '../../domain/types';
import type { Product, ProductElement, Joint } from '../../domain/types';

import type { Detail, DetailGeometry, DetailShape } from '../../domain/types';
import { allSides, createDraft, getSideSize } from '../forms/utils/draftHelpers';
import { Detail3DPreview } from './Detail3DPreview';
import { EdgeContextMenu } from './EdgeContextMenu';
import { JointContextMenu } from './JointContextMenu';
import { SkirtingModal } from './SkirtingModal';
import { EdgeAdditionModal, type EdgeAdditionKind } from './EdgeAdditionModal';
import { SideAdditionsPanel } from './SideAdditionsPanel';
import { EdgeProfilesPanel } from '../forms/editors/EdgeProfilesPanel';
import { SurfaceGroovesPanel } from '../forms/editors/SurfaceGroovesPanel';
import { DrainGratePanel } from '../forms/editors/DrainGratePanel';
import { DRAIN_DISC_DIAMETER } from '../../engines/drainGrate';
import { WallPanelModal } from './WallPanelModal';
import { LegModal } from './LegModal';
import { CornerContextMenu } from './CornerContextMenu';
import { CornerProcessingModal } from './CornerProcessingModal';
import { CutoutProcessingModal } from './CutoutProcessingModal';
import { Box, GripHorizontal, FileText, CornerDownRight, Plus } from 'lucide-react';
import { CreateProductModal } from './CreateProductModal';
import { ProductTemplateModal } from './ProductTemplateModal';
import { ElementSettingsModal } from './ElementSettingsModal';
import { MetalTemplateModal } from './MetalTemplateModal';
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
    // Дуги скруглень — теж сторони (FG-27): доповнення на дузі має одразу
    // отримати ширину в довжину дуги, а не вигаданий номінал. Довжину
    // рахуємо з радіуса кута, а не з нормованої кривої: у неї осі стиснуті
    // по-різному і чесної довжини вона не знає.
    Object.entries((def?.corners ?? {}) as Record<string, { type?: string; radius?: number; reflex?: boolean }>).forEach(([cornerId, corner]) => {
      if (corner?.type === 'radius' && (corner.radius ?? 0) > 0 && !corner.reflex) {
        out[`${cornerId}_radius`] = cornerArcLengthMm(corner.radius!);
      }
    });
  } catch {
    // якщо контур не побудувався — лишаємо порожньо, впаде на номінал
  }
  return out;
}
import { DetailContextMenu } from './DetailContextMenu';
import { DetailPassportModal } from './DetailPassportModal';
import type { CustomService } from '../../domain/types';

/**
 * Розділи правого трея — ЗАКРИТІ за замовчуванням (правило власника 10.08):
 * на виробі з мийкою, ногами й панелями розгорнуті секції давали простирадло
 * на кілька екранів, і потрібного розділу було не знайти.
 *
 * Але «закриті за замовчуванням» ≠ «закриваються щоразу»: правий трей
 * перемальовується на кожен клік у дереві деталей, і без пам'яті менеджер
 * відкривав би «Кромки» заново після кожного перемикання. Тому стан живе
 * поза компонентом, за назвою розділу — на час сесії редактора.
 */
const accordionOpenState = new Map<string, boolean>();

function Accordion({ title, children, defaultOpen = false, info }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /**
   * Розділ довідки (01.09, власник: «добавляй значок-кнопку “і” — інформація,
   * і там описано, як правильно користуватись даним інтерфейсом, зі скрінами»).
   * Кнопка стоїть у шапці секції і відкриває бібліотеку інструкцій на цьому розділі.
   */
  info?: string;
}) {
  const [isOpen, setIsOpenState] = useState(() => accordionOpenState.get(title) ?? defaultOpen);
  const openHelp = useUIStore((s) => s.openHelp);
  const setIsOpen = (next: boolean) => {
    accordionOpenState.set(title, next);
    setIsOpenState(next);
  };
  return (
    <div className="border-b border-slate-200">
      <button 
        className="w-full py-3 px-4 flex items-center justify-between text-sm font-bold text-[#1f2d3a] hover:bg-slate-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {title}
        <span className="flex items-center gap-2">
          {info && (
            <span
              role="button"
              title="Як користуватись цим розділом — інструкція зі скрінами"
              className="w-5 h-5 rounded-full border border-[#b9d5f5] bg-[#dbeafe] text-[#0058ab] text-[11px] font-bold flex items-center justify-center hover:bg-[#0084ff] hover:text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); openHelp(info); }}
            >
              i
            </span>
          )}
          {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </span>
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

/**
 * FG-19: людське ім'я кута для підпису в UI.
 *
 * У складних форм кути в даних живуть під іменами ВЕРШИН контуру
 * (`start`, `A`, `B`, …) — і «Кут start» протікав у список обробки кутів.
 * Людське ім'я кута — пара сусідніх сторін: вершина `A` лежить між
 * сторонами A і B → «AB»; `start` — між останньою стороною і A.
 * Тільки підпис: ключі в даних не чіпаємо, вони в збережених проєктах.
 */
const cornerDisplayName = (cornerId: string, kind: string) => {
  if (/^[A-Z]{2}$/.test(cornerId)) return cornerId; // вже парне ім'я
  const last = kind === 'u' ? 'H' : kind === 'l' ? 'F' : 'D';
  if (cornerId === 'start') return `${last}A`;
  if (/^[A-Z]$/.test(cornerId)) {
    const next = cornerId === last ? 'A' : String.fromCharCode(cornerId.charCodeAt(0) + 1);
    return `${cornerId}${next}`;
  }
  return cornerId;
};


export function buildProductFromSession(
  session: import('../forms/utils/draftHelpers').ProductEditorSession,
  productId: string,
  /**
   * Матеріал проєкту. Від нього залежить СПОСІБ виготовлення радіусних
   * елементів (камінь ріжуть сегментами, акрил гнуть) і, як наслідок,
   * технологічний запас: 30% проти 20%. Порожньо — рахуємо як сегментацію.
   */
  projectMaterial?: import('../../domain/types').MaterialType,
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
  
  /*
   * ХВИЛЯ 4, крок 4.2 (FG-14) — доповнення знає СВОГО власника.
   *
   * `elementBySlot` дозволяє причепити панель до ребра іншої панелі, а не
   * завжди до стільниці. Щоб власник напевно вже існував, слоти йдуть за
   * глибиною вкладеності: `wall_panel_B` (0) → `wall_panel_B_leg_C` (1) → …
   */
  const elementBySlot = new Map<string, import('../../domain/types').ProductElement>();

  const ownerDepth = (slot: string): number => {
    const owner = parseAdditionSlot(slot).ownerSlot;
    return owner ? 1 + ownerDepth(owner) : 0;
  };

  const orderedSlots = Object.entries(session.subDetails || {})
    .sort((a, b) => ownerDepth(a[0]) - ownerDepth(b[0]));

  orderedSlots.forEach(([id, draft]) => {
    // Підворот і потовщення генеруються з дерева власника (динамічна гілка
    // нижче): вона знає його галочки й розміри сторін. Тут — усе інше.
    const isTopFold = id.startsWith('fold_');
    const isTopThickening = id.startsWith('thickening_');
    if ((id.includes('fold_') || id.includes('thickening_')) && !isTopFold && !isTopThickening) return;
    // Мийки — ПОХІДНІ від mainDetail.sinks і створюються нижче через
    // sinkAdditionElements. Якщо слот sink_* просочився в subDetails
    // (напр., із сесії відкритого старого виробу) — пропускаємо, інакше
    // мийка дублюється при кожному повторному збереженні.
    if (id.startsWith('sink_')) return;
    // Сегменти ланцюга профілів — так само похідні (від mainDetail.metalSegments)
    if (id.startsWith('mseg_')) return;

    const elementId = buildElementPath(productId, id);
    // Тип і ребро — через спільний розбір слота (domain/ids). Він же знімає
    // суфікс `#2`, яким позначається ДРУГЕ доповнення на тому самому ребрі.
    const parsed = parseAdditionSlot(id);
    // Легасі-прапорці (галочки fold/thickening на самій деталі) породжують
    // слот `fold_<сторона>` у динамічній гілці нижче, і вона ж підхоплює
    // збережений драфт із subDetails. Обробити базовий слот ще й тут —
    // означає ДВА однакові підвороти. Нові доповнення з модалки отримують
    // при зайнятому базовому слоті суфікс `#2` і легасі-перевірку минають.
    if (isTopFold && parsed.index === 1 && session.mainDetail?.fold?.sides?.includes(parsed.sideId)) return;
    if (isTopThickening && parsed.index === 1 && session.mainDetail?.thickening?.sides?.includes(parsed.sideId)) return;
    const isSkirting = parsed.kind === 'skirting';
    const isWallPanel = parsed.kind === 'wall_panel';
    const isLeg = parsed.kind === 'leg';
    const sideId = parsed.sideId || 'A';

    /*
     * Крок 4.2: власник ребра. Раніше тут беззастережно стояла стільниця —
     * і панель, поставлена на торець іншої панелі, приїжджала на стільницю
     * (FG-14), ще й із ЧУЖОЮ довжиною ребра в розкрої.
     */
    const ownerElement = parsed.ownerSlot ? elementBySlot.get(parsed.ownerSlot) : undefined;
    const ownerDetail = ownerElement?.baseDefinition ?? session.mainDetail;
    const ownerElementId = ownerElement?.id ?? mainElementId;

    // Фактична довжина ребра (радіус/Г-заріз вкорочують сторону), інакше бортик
    // і панель поїдуть у розкрій на повну номінальну довжину.
    const ownerEdgeLens = realEdgeLengths(ownerDetail);
    const sideLength = ownerEdgeLens[sideId] || getSideSize(ownerDetail!, sideId) || 1000;
    
    /**
     * Доповнення на ДУЗІ (сторона виду `B_radius`) — гнутий елемент:
     * несе позначку з радіусом і фактичною дугою, щоб кошторис нарахував
     * виготовлення (за шт + за м²). Ширину користувача не чіпаємо — він
     * бачив її в модалці; запас ×1.3 підказано дефолтом ширини.
     */
    const arcCornerId = /_radius$/.test(sideId) ? sideId.replace(/_radius$/, '') : undefined;
    const arcCorner = arcCornerId ? session.mainDetail?.corners?.[arcCornerId] : undefined;
    const arcDraft = (arcCornerId && arcCorner?.type === 'radius' && (arcCorner.radius ?? 0) > 0)
      ? {
          ...draft,
          radiusElement: {
            radiusMm: arcCorner.radius!,
            arcLengthMm: cornerArcLengthMm(arcCorner.radius!),
            cornerId: arcCornerId,
            arcAngleDeg: 90,
            // Виліт смуги — це висота деталі: товщина краю стільниці або
            // висота опори. Саме за нею прайс обирає категорію послуги.
            bandSizeMm: draft.height,
            method: radiusMethodFor(projectMaterial),
            role: radiusRoleForType(draft.type),
            complex: Boolean(arcCorner.complexRadius),
          },
        }
      : draft;

    const addition: import('../../domain/types').ProductElement = {
      id: elementId,
      type: draft.type,
      baseDefinition: arcDraft,
      additions: [],
      joints: []
    };
    
    let jType: 'butt' | 'miter45' | 'glued' | 'tie' = 'butt';
    let jDominant: 'a' | 'b' = 'a';
    let jTexture = false;
    
    if (isSkirting) {
      jType = 'glued'; jDominant = 'a'; jTexture = true;
    } else if (isTopFold) {
      // Підворот — «водоспад»: заусовка 45° і суцільна текстура через ребро.
      jType = 'miter45'; jDominant = 'a'; jTexture = true;
    } else if (isTopThickening) {
      // Потовщення — підклейка знизу: пряма склейка, текстура не тягнеться.
      jType = 'glued'; jDominant = 'a'; jTexture = false;
    } else if (isLeg) {
      // Нога (опора) — «водоспад»: клеїться під 45°, як підворот.
      // Звідси різ під 45 на обох деталях стику і склейка під 45 у кошторисі.
      jType = 'miter45'; jDominant = 'a'; jTexture = false;
    } else if (isWallPanel) {
      jType = 'butt'; jDominant = 'a'; jTexture = false;
    }
    
    // Ділянка стику — РЕАЛЬНА зона контакту, а не вся сторона батька.
    // Панель/нога можуть бути коротшими за ребро і зсунутими вздовж нього
    // (attachOffset), тож стик 0..sideLength нараховував би цеху склейку
    // на всю сторону — довшу за сам шов. Затискаємо в межі ребра, щоб
    // зіпсовані цифри не дали від'ємну або вилітну ділянку.
    const attachFrom = Math.max(0, Math.min(draft.attachOffset ?? 0, sideLength));
    const attachTo = Math.min(sideLength, attachFrom + (draft.width || sideLength));
    const contactLength = Math.max(1, attachTo - attachFrom);

    const joint: import('../../domain/types').Joint = {
      id: `joint_${id}`,
      origin: 'authored',
      a: { elementPath: ownerElementId, sideId, from: attachFrom, to: attachTo },
      b: { elementPath: elementId, sideId: attachmentContactSide(), from: 0, to: contactLength },
      type: jType,
      dominant: jDominant,
      textureContinuity: jTexture
    };
    // §3: Нога і Стінова панель — САМОСТІЙНІ Елементи на рівні Виробу (сусіди Стільниці),
    //     бо мають власну фрактальну структуру (свої підвороти/потовщення).
    // §2: Бортик — дрібне доповнення, лишається в additions свого Елемента.
    if (ownerElement) {
      // Крок 4.2: вкладене доповнення живе В ДЕРЕВІ ВЛАСНИКА. Саме звідти
      // 3D бере його ребро — інакше рендер знову шукав би сторону C на
      // стільниці, а не на панелі, до якої деталь насправді приклеєна.
      ownerElement.additions.push(addition);
      ownerElement.joints.push(joint);
    } else if (isLeg || isWallPanel) {
      // §3: Нога і Стінова панель — САМОСТІЙНІ Елементи на рівні Виробу (сусіди Стільниці),
      //     бо мають власну фрактальну структуру (свої підвороти/потовщення).
      productElements.push(addition);
      rootElement.joints.push(joint);
    } else {
      // §2: Бортик — дрібне доповнення, лишається в additions свого Елемента.
      rootElement.additions.push(addition);
      rootElement.joints.push(joint);
    }
    elementBySlot.set(id, addition);
    allElements.push(addition);
  });

  // Мийки, встановлені в стільницю: кожна — САМОСТІЙНИЙ Елемент виробу
  // (як Опора чи Стінова панель, §3), зі слотом sink_<id>. З нього розкрій
  // робить комплект деталей чаші. Виріз у стільниці домішується в
  // buildGeometry — тут його створювати не треба.
  if (session.mainDetail) {
    sinkAdditionElements(productId, session.mainDetail).forEach((sinkEl) => {
      productElements.push(sinkEl);
      allElements.push(sinkEl);
    });
  }

  // Ланцюг профілів (метал): кожен сегмент — похідна деталь розкрою.
  // 3D малює ланцюг сам із metalSegments базового елемента, тому ці
  // елементи існують ЛИШЕ заради розкрою/відомості й у 3D не рендеряться.
  if (session.mainDetail?.kind === 'metal_profile') {
    metalSegmentElements(productId, session.mainDetail).forEach((segmentEl) => {
      rootElement.additions.push(segmentEl);
    });
  }

  // Dynamically create Additions for Folds & Thickenings for ALL elements
  allElements.forEach((element) => {
    const isMain = element.id === mainElementId;
    const parentId = isMain ? 'main' : element.id.split(':').pop()!;
    const def = element.baseDefinition;

    const edgeLens = realEdgeLengths(def);

    /*
     * ХВИЛЯ 4, крок 4.1 — вкладеність без обмежень.
     *
     * Підворот і потовщення генерувались двома майже однаковими блоками,
     * і обидва ЖОРСТКО ставили ширину = вся сторона. Для першого рівня це
     * майже завжди правда, а для другого (підворот НОГИ) було просто
     * неможливо задати інше: UI ховав поля ширини й відступу саме тому,
     * що генератор їх усе одно затирав. Звідси FG-13 — «на нозі
     * потовщення 50, а в 3D 100»: розмір вкладеної деталі губився.
     *
     * Тепер блок один, а ширина й відступ беруться зі збереженого драфта,
     * якщо користувач їх задав. Не задав — як і раніше, на всю сторону.
     */
    const EDGE_FEATURES = [
      { key: 'fold' as const, jointType: 'miter45' as const, texture: true, fallbackSize: 100 },
      { key: 'thickening' as const, jointType: 'glued' as const, texture: false, fallbackSize: 40 },
    ];

    EDGE_FEATURES.forEach(({ key, jointType, texture, fallbackSize }) => {
      const feature = def?.[key];
      if (!feature?.enabled) return;
      feature.sides.forEach((sideId) => {
        const id = isMain ? `${key}_${sideId}` : `${parentId}_${key}_${sideId}`;
        const elementId = buildElementPath(productId, id);
        // Реальна довжина ребра (з урахуванням радіуса й Г-зарізу), а не номінал сторони.
        const sideLength = edgeLens[sideId] || getSideSize(def, sideId) || 1000;
        const bandSize = feature.sideSizes?.[sideId] || feature.size || fallbackSize;

        // Якщо користувач уже редагував цю деталь (додав виріз/фаску) — беремо збережений
        // драфт із сесії, інакше створюємо новий за розмірами сторони.
        const savedDraft = session.subDetails?.[id];

        // Ширина: число користувача, але тільки якщо воно фізично влазить
        // у ребро. Нуль, від'ємне чи довше за сторону — це або зіпсовані
        // дані, або старий драфт, у якому ширина була просто копією
        // сторони; у таких випадках лишаємось на всю довжину.
        const savedWidth = savedDraft?.width;
        const width = savedWidth && savedWidth > 0 && savedWidth < sideLength
          ? savedWidth
          : sideLength;
        // Відступ уздовж ребра — затискаємо, щоб деталь не звисала за край.
        const attachOffset = Math.max(0, Math.min(savedDraft?.attachOffset ?? 0, sideLength - width));

        const addition: import('../../domain/types').ProductElement = {
          id: elementId, type: EDGE_KIND_LABEL[key],
          baseDefinition: {
            ...(savedDraft ?? createDraft()),
            type: EDGE_KIND_LABEL[key],
            thickness: def.thickness,
            width,
            height: bandSize,
            attachOffset,
          },
          additions: [], joints: []
        };
        element.additions.push(addition);
        // Шов — РЕАЛЬНА зона контакту, як і на першому рівні: вкладена
        // деталь може бути коротшою за ребро і зсунутою вздовж нього.
        element.joints.push({
          id: `joint_${id}`, origin: 'authored',
          a: { elementPath: element.id, sideId, from: attachOffset, to: attachOffset + width },
          b: { elementPath: elementId, sideId: attachmentContactSide(), from: 0, to: width },
          type: jointType, dominant: 'a', textureContinuity: texture
        });
      });
    });

    /**
     * FG-27 — гнуті елементи смуг у ВИРОБІ.
     *
     * Пряма частина потовщення/підвороту вище створюється по сторонах, а
     * дуга скругленого кута між двома вкритими сторонами — ось тут, окремим
     * доповненням-прямокутником: довжина = зовнішня дуга × 1.3, висота =
     * виліт смуги. Правило «де є дуга» — спільне з легасі-шляхом
     * (domain/radiusElement), інакше виріб і DXF-деталь рахувались би
     * по-різному.
     */
    /*
     * РЕМОНТ 19.08 (баг «радіуси на Г-формі»): автоматика бачила ЛИШЕ
     * легасі-галочки (`def.fold.sides`), а модалка з кроку 4.1 пише
     * потовщення/підвороти СЛОТАМИ (`fold_E` у subDetails). Наслідок:
     * потовщення стояло на обох сторонах кута, а дуга між ними лишалась
     * голою — «радіусам не присвоїлась сторона». Тут покриття сторін
     * збирається з ОБОХ джерел.
     */
    const slotPrefix = isMain ? '' : `${parentId}_`;
    const slotCoverage = (kindKey: 'fold' | 'thickening') => {
      const sides: string[] = [];
      const sideSizes: Record<string, number> = {};
      Object.entries(session.subDetails ?? {}).forEach(([slot, slotDraft]) => {
        const parsedSlot = parseAdditionSlot(slot);
        if (parsedSlot.kind !== kindKey) return;
        // Рівно свої слоти: у стільниці `fold_E`, у ноги `leg_B_fold_E`.
        if (!slot.startsWith(`${slotPrefix}${kindKey}_`)) return;
        // Дуги (`fold_E_radius`) — явні доповнення, їх рахує explicitArc.
        if (/_radius$/.test(parsedSlot.sideId ?? '')) return;
        sides.push(parsedSlot.sideId);
        if (slotDraft?.height) sideSizes[parsedSlot.sideId] = slotDraft.height;
      });
      return { sides, sideSizes };
    };
    const mergedFeature = (kindKey: 'fold' | 'thickening') => {
      const legacy = def?.[kindKey];
      const fromSlots = slotCoverage(kindKey);
      const sides = [...new Set([...(legacy?.sides ?? []), ...fromSlots.sides])];
      if (!sides.length) return undefined;
      const sideSizes = { ...(legacy?.sideSizes ?? {}), ...fromSlots.sideSizes };
      return {
        enabled: true,
        sides,
        // Виліт смуги: легасі-розмір, інакше висота першого слота, інакше
        // типова — radiusElementSpecs вимагає додатний size.
        size: legacy?.size ?? Object.values(sideSizes)[0] ?? (kindKey === 'fold' ? 100 : 40),
        sideSizes,
      } as typeof def.fold;
    };

    const arcFeatures: Array<['fold' | 'thickening', typeof def.fold | undefined]> = [
      ['fold', mergedFeature('fold')],
      ['thickening', mergedFeature('thickening')],
    ];
    // Кути, на дугу яких користувач уже повісив доповнення ЯВНО (слот
    // `<kind>_<кут>_radius`): автоматика для них мовчить, інакше дуга
    // порахувалась би двічі.
    const explicitArc = new Set(
      Object.keys(session.subDetails ?? {})
        .map((slot) => parseAdditionSlot(slot))
        .filter((parsed) => /_radius$/.test(parsed.sideId ?? ''))
        .map((parsed) => `${parsed.kind}:${(parsed.sideId ?? '').replace(/_radius$/, '')}`),
    );
    arcFeatures.forEach(([kindKey, feature]) => {
      radiusElementSpecs(feature, def?.corners, def?.kind, projectMaterial).forEach((spec) => {
        if (explicitArc.has(`${kindKey}:${spec.cornerId}`)) return;
        const id = `${isMain ? '' : `${parentId}_`}${kindKey}_arc_${spec.cornerId}`;
        const elementId = buildElementPath(productId, id);
        const arcAddition: import('../../domain/types').ProductElement = {
          id: elementId,
          type: EDGE_KIND_LABEL[kindKey],
          baseDefinition: {
            ...createDraft(),
            type: EDGE_KIND_LABEL[kindKey],
            label: `Обробка гнутої деталі R${Math.round(spec.radiusMm)} (кут ${spec.cornerId})`,
            thickness: def.thickness,
            width: Math.round(spec.lengthMm),
            height: spec.bandSizeMm,
            radiusElement: {
              radiusMm: spec.radiusMm,
              arcLengthMm: spec.arcLengthMm,
              cornerId: spec.cornerId,
              arcAngleDeg: spec.arcAngleDeg,
              bandSizeMm: spec.bandSizeMm,
              method: spec.method,
              role: radiusRoleForType(EDGE_KIND_LABEL[kindKey]),
              complex: spec.complex,
            },
          },
          additions: [], joints: []
        };
        element.additions.push(arcAddition);
        // Шов = фактична дуга, без запасу: цех клеїть по дузі, а запас
        // лишається в матеріалі прямокутника.
        element.joints.push({
          id: `joint_${id}`, origin: 'authored',
          a: { elementPath: element.id, sideId: spec.sides[0], from: 0, to: Math.round(spec.arcLengthMm) },
          b: { elementPath: elementId, sideId: attachmentContactSide(), from: 0, to: Math.round(spec.arcLengthMm) },
          type: kindKey === 'fold' ? 'miter45' : 'glued', dominant: 'a', textureContinuity: kindKey === 'fold'
        });
      });
    });
  });

  return {
    id: productId,
    name: session.mainDetail?.label || 'Виріб',
    // Матеріал виробу (01.09): з модалки «Новий виріб» або з Product при
    // редагуванні; старі вироби без нього лишаються без нього.
    ...(session.material ? { material: session.material } : {}),
    // Місце в приміщенні (01.09): без цього updateProduct затирав би
    // scenePlacement, виставлений у 3D Підборі чи «Поставити на площину».
    ...(session.scenePlacement ? { scenePlacement: session.scenePlacement } : {}),
    elements: productElements
  };
}

export function ProductEditorWorkspace() {
  const session = useUIStore(s => s.productEditorSession);
  const setSession = useUIStore(s => s.setProductEditorSession);
  const isAdminUnlocked = useUIStore(s => s.isAdminUnlocked);
  const lastTemplate = useUIStore(s => s.lastTemplate);
  const setLastTemplate = useUIStore(s => s.setLastTemplate);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
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
  /** Форма нового вирізу за замовчуванням. Раніше її задавали кнопки з 2D
   *  (FG-21) — тепер форму обирають у самому вікні вирізу. */
  const newCutoutShape: 'rect' | 'circle' = 'rect';

  const [edgeContextMenu, setEdgeContextMenu] = useState<{ visible: boolean; x: number; y: number; edgeId: string } | null>(null);
  /*
   * ХВИЛЯ 4, крок 4.3 (FG-15) — кілька панелей на одну сторону.
   *
   * Раніше тут лежала просто сторона, а слот збирався як
   * `wall_panel_<сторона>` — тобто фіксовано один на ребро. Друге
   * додавання мовчки перезаписувало перше: «+» працював, а панель не
   * зʼявлялась. Тепер стан несе ще й слот: порожній — створюємо новий
   * (перший вільний, з суфіксом `#2`, `#3`…), заданий — редагуємо саме його.
   */
  type AdditionTarget = { edgeId: string; slot?: string } | null;
  const [skirtingModalOpen, setSkirtingModalOpen] = useState<AdditionTarget>(null);
  const [wallPanelModalOpen, setWallPanelModalOpen] = useState<AdditionTarget>(null);
  const [legModalOpen, setLegModalOpen] = useState<AdditionTarget>(null);
  /** Крок 4.4 (FG-34): сторона, у яку ріжемо нішу. */
  const [uCutoutSide, setUCutoutSide] = useState<UCutoutSide | null>(null);

  /**
   * Перший вільний слот для доповнення на цьому ребрі: базовий, далі `#2`,
   * `#3`… Спільний для бортика, панелі й ноги — раніше вільний слот умів
   * шукати лише підворот/потовщення, решта затирала сама себе.
   */
  const freeAdditionSlot = (prefix: string, kind: string, edgeId: string, taken: Record<string, unknown>) => {
    for (let n = 1; ; n += 1) {
      const candidate = n === 1 ? `${prefix}${kind}_${edgeId}` : `${prefix}${kind}_${edgeId}#${n}`;
      if (!(candidate in taken)) return candidate;
    }
  };
  /**
   * Потовщення/підворот через модалку (як бортик). `slot` заданий — редагуємо
   * наявне доповнення; `legacy` — редагуємо стару галочку «на всю сторону»,
   * і збереження перенесе її в слот із шириною й відступом.
   */
  const [additionModalOpen, setAdditionModalOpen] = useState<{
    kind: EdgeAdditionKind; edgeId: string; slot?: string; legacy?: boolean; fullSide?: boolean;
  } | null>(null);

  /**
   * Фактична довжина ребра головної деталі — щоб нова панель/нога/бортик
   * одразу мали ширину тієї сторони, на якій їх ставлять. Беремо реальну
   * довжину (радіус і Г-заріз укорочують ребро), а не номінал сторони —
   * той самий порядок, що й у buildProductFromSession.
   */
  const edgeLengthOf = (edgeId: string | null, owner?: DetailDraft): number | undefined => {
    // Крок 4.1: власник ребра — не обов'язково стільниця. Підворот НОГИ
    // має отримати довжину ребра ноги, інакше дефолт ширини приїде з
    // чужої деталі й користувач мовчки збереже неправильне число.
    const main = owner ?? session?.mainDetail;
    if (!edgeId || !main) return undefined;
    const real = realEdgeLengths(main)[edgeId];
    // Дуга (FG-27): дефолт ширини одразу з технологічним запасом — стільки
    // матеріалу реально піде на гнутий елемент. Коефіцієнт диктує матеріал:
    // 30% на сегментацію каменю, 20% на гнуття акрилу. Користувач бачить це
    // число в модалці й може виправити.
    if (real && /_radius$/.test(edgeId)) {
      return Math.round(real * radiusReserveFor(radiusMethodFor(project.projectMaterial)));
    }
    return real || getSideSize(main, edgeId) || undefined;
  };
  const [addElementModalOpen, setAddElementModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [detailContextMenu, setDetailContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [detailPassportModalOpen, setDetailPassportModalOpen] = useState<{ detailId: string, initialTab: 'passport' | 'settings' } | null>(null);
  const [metalTemplateModalOpen, setMetalTemplateModalOpen] = useState(false);
  
  const showEdges = useUIStore(s => s.showEdges);

  if (!session) return null;

  // Підвороти/потовщення генеруються деревом і можуть ще не мати збереженого драфта.
  // Щоб їх можна було редагувати (виріз, фаска, кромка) — беремо згенерований драфт з дерева.
  // Перша ж правка збереже його в session.subDetails (матеріалізація) — див. updateDetail.
  const findGeneratedDraft = (slotId: string): DetailDraft | undefined => {
    if (!session.mainDetail) return undefined;
    const product = buildProductFromSession(session, session.editingProductId || 'preview', session.material ?? project.projectMaterial);
    for (const el of product.elements) {
      for (const add of el.additions) {
        if (toSlot(add.id) === slotId) return add.baseDefinition as DetailDraft;
      }
    }
    return undefined;
  };

  const isMainActive = !session.activeDetailId || session.activeDetailId === 'main';

  /**
   * Крок 4.2 (FG-14): префікс власника для нового слота. Клік по ребру
   * активної деталі має ставити доповнення НА НЕЇ, а не на стільницю.
   * Порожньо, коли активна стільниця.
   */
  const ownerPrefix = isMainActive ? '' : `${session.activeDetailId}_`;

  const detail = isMainActive
    ? session.mainDetail
    : (session.subDetails[session.activeDetailId!] ?? findGeneratedDraft(session.activeDetailId!));

  const isSinkDetail = detail?.kind === 'sink_rect' || detail?.kind === 'sink_slot';
  const isMetalDetail = detail?.kind === 'metal_profile';

  /*
   * Сторони активної деталі, закриті доповненням, що звисає з ребра
   * (нога, потовщення, підворот) — у панелі кромок форму туди не обрати,
   * у 3D літера бліда (власник 01.09). Рахується для головної деталі
   * (слоти без власника + легасі-галочки) і для доповнення (вкладені слоти).
   */
  const occupiedSides = React.useMemo(() => occupiedEdgeSides({
    subDetails: session.subDetails,
    ownerSlot: isMainActive ? undefined : session.activeDetailId ?? undefined,
    legacy: isMainActive && detail ? { fold: detail.fold, thickening: detail.thickening } : null,
  }), [session.subDetails, session.activeDetailId, isMainActive, detail]);

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
    const product = buildProductFromSession(session, productId, session.material ?? project.projectMaterial);
    return flattenProductToDetails(product);
  };

  
  const handleSave = () => {
    if (!session.mainDetail) {
      setSession(null);
      return;
    }

    const productId = session.editingProductId || uid('prod');
    const product = buildProductFromSession(session, productId, session.material ?? project.projectMaterial);
    
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

    /**
     * FG-07: «додала стик повторно, але один із них система не бачить».
     *
     * Причин було дві, і обидві тут. Перша — id виду `joint_${Date.now()}`:
     * два стики, створені в одну мілісекунду, отримували однаковий id, і
     * видалення чи правка чіпали не той. Друга і головна — кнопка «+»
     * щоразу ставила стик на ту саму типову відстань, тож другий різ ішов
     * рівно по межі першого. Такий різ не є різом: рушій його відкидає, а
     * в панелі стик висить — виглядає точнісінько як «система не бачить».
     * Тепер новий стик стає ПОРУЧ із зайнятим місцем, а не поверх нього.
     */
    const step = joint.axis === 'vertical' ? 600 : 400;
    const sameLine = (a: ManualJoint, offset: number) =>
      a.axis === joint.axis
      && (a.anchorCorner ?? '') === (joint.anchorCorner ?? '')
      && Math.abs(a.offset - offset) < 1;

    let offset = joint.offset ?? step;
    for (let guard = 0; guard < 50 && joints.some((item) => sameLine(item, offset)); guard += 1) {
      offset += step;
    }

    updateDetail({
      manualJoints: [
        ...joints,
        {
          id: uid('joint'),
          axis: joint.axis,
          anchorCorner: joint.anchorCorner,
          offset,
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

  /** Лівий клік по літері сторони в 3D — взірець / копіювання обробки, як у панелі кромок. */
  const handleEdgeSelect = (edgeId: string) => {
    if (!detail) return;
    clickEdgeSideLetter({
      side: edgeId,
      scope: session.activeDetailId ?? 'main',
      locked: Boolean(occupiedSides[edgeId]),
      profiles: detail.edgeProfiles,
      apply: (edgeProfiles) => updateDetail({ edgeProfiles }),
    });
  };

  return (
    <div className="absolute inset-0 bg-[#eaf0f4] z-50 flex flex-col shadow-lg overflow-hidden animate-in fade-in zoom-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-[#c6d3dd]">
        <div>
          <h1 className="text-lg font-bold text-[#1f2d3a] flex items-center gap-3">
            {/* «Редагування:» окремим вузлом, а не в шаблоні: перекладач
                DOM міняє текст вузла ЦІЛКОМ, а склеєний рядок із назвою
                деталі жодним ключем не збігається. */}
            {detail ? <>{ui('Редагування:')} {ui(detail.type)} {detail.kind !== 'rect' ? `(${ui(detail.kind)})` : ''}</> : ui('Новий виріб')}
          </h1>
          <p className="text-xs text-slate-500 mt-1">Налаштування розмірів, торців, кутів та вирізів</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Повернення в конфігуратор: виріб зібраний шаблоном — значить його
              можна перебрати іншими розмірами, не складаючи заново. Кнопка
              адмінська, як і самі шаблони. */}
          {isAdminUnlocked && lastTemplate && (
            <button
              onClick={() => setTemplateModalOpen(true)}
              className="px-4 py-2 text-sm font-bold border border-[#0084ff] rounded-md text-[#0084ff] hover:bg-[#0084ff]/5 transition-colors flex items-center gap-2"
              title="Відкрити налаштування шаблону, яким зібрано цей виріб"
            >
              <LayoutTemplate className="w-4 h-4" />
              Налаштування шаблону
            </button>
          )}
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
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div className="absolute top-4 left-4 z-10 flex rounded-md shadow-sm border p-1 gap-1 bg-white border-[#c6d3dd]">
            <button
              onClick={() => setViewMode('2d')}
              className={`px-4 py-1.5 rounded-sm text-sm font-medium transition-colors ${
                viewMode === '2d'
                  ? 'bg-[#e0f0ff] text-[#0084ff]'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              2D Креслення
            </button>
            <button
              onClick={() => setViewMode('3d')}
              className={`px-4 py-1.5 rounded-sm text-sm font-medium transition-colors ${
                viewMode === '3d'
                  ? 'bg-[#e0f0ff] text-[#0084ff]'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              3D Модель
            </button>
          </div>
          
          <div className="flex-1 relative bg-[#eaf0f4] overflow-hidden flex flex-col">
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
                    material={session.material}
                    initialDetail={detail}
                    occupiedSides={occupiedSides}
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
                /* Місце виробу в приміщенні (01.09): із сесії (туди ж пише «Поставити на площину»); новий без місця стане в центр підлоги */
                scenePlacement={session.scenePlacement ?? null}
                material={session.material ?? project.projectMaterial}
                onPlaceInRoom={(placement, elevation) => setSession({
                  ...session,
                  scenePlacement: placement,
                  mainDetail: session.mainDetail ? { ...session.mainDetail, elevation } : session.mainDetail,
                })}
                /* null = нічого не обрано (клік у пусте поле, 01.09) — не підміняємо на main */
                activeDetailId={session.activeDetailId}
                onSelectionClear={() => setSession({ ...session, activeDetailId: null })}
                onEdgeClick={handleEdgeClick}
                onEdgeSelect={handleEdgeSelect}
                occupiedSides={occupiedSides}
                onCornerClick={handleCornerClick}
                /* FG-31: подвійний клік по вирізу відкриває САМЕ його запис.
                   Коли вирізів багато, шукати потрібний перебором у панелі
                   довше, ніж поставити його заново. */
                onCutoutDoubleClick={(cutoutId) => setModalCutoutId(cutoutId)}
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
                onLegDoubleClick={(slot) => setLegModalOpen({ edgeId: parseAdditionSlot(slot).sideId, slot })}
                onWallPanelDoubleClick={(slot) => setWallPanelModalOpen({ edgeId: parseAdditionSlot(slot).sideId, slot })}
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

      {metalTemplateModalOpen && (
        <MetalTemplateModal
          initialProfileId={(detail as { metalProfileId?: string } | undefined)?.metalProfileId ?? DEFAULT_METAL_PROFILE_ID}
          onClose={() => setMetalTemplateModalOpen(false)}
          onApply={(result, profileId) => {
            // Шаблон переписує ланцюг цілком: база = перший матеріальний хід,
            // height = висота перерізу (нею база лягає смужкою в розкрій).
            const profile = metalProfileById(profileId);
            updateDetail({
              metalProfileId: profileId,
              width: result.baseLength,
              height: profile?.h ?? detail?.height,
              metalSegments: result.segments,
            } as never);
            setMetalTemplateModalOpen(false);
          }}
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
                cornerId={cornerDisplayName(modalCornerId, detail?.kind ?? "rect")}
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
                detailWidth={detail?.width}
                detailHeight={detail?.height}
                /* FG-18: вікно має бачити РЕАЛЬНУ форму, а не лише габарит —
                   інакше виріз у виїмці Г-подібної виглядає допустимим. */
                shapeCtx={{
                  shape: detail ? toDetailShape(detail.kind) : undefined,
                  geometry: detail as never,
                  width: detail?.width ?? 0,
                  height: detail?.height ?? 0,
                }}
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
                  if (action === 'thickening' || action === 'fold') {
                    // Раніше клік перемикав галочку «на всю сторону». Тепер —
                    // модалка як у бортика: висота/ширина/відступ, і на одній
                    // стороні їх може бути кілька (слоти #2, #3…).
                    // Крок 4.1: другий рівень більше не окремий випадок —
                    // підворот ноги відкриває ту саму модалку з висотою,
                    // шириною й відступом, що й підворот стільниці.
                    setAdditionModalOpen({ kind: action, edgeId: edgeContextMenu.edgeId });
                  } else if (action === 'skirting') {
                    setSkirtingModalOpen({ edgeId: edgeContextMenu.edgeId });
                  } else if (action === 'wall_panel') {
                    setWallPanelModalOpen({ edgeId: edgeContextMenu.edgeId });
                  } else if (action === 'leg') {
                    setLegModalOpen({ edgeId: edgeContextMenu.edgeId });
                  } else if (action === 'u_cutout') {
                    /*
                     * РЕМОНТ 19.08: ніша дозволена на будь-якому ПРЯМОМУ
                     * ребрі базового контуру — прямокутник, Г- і П-форма.
                     * Раніше тут стояв список A–D, і на Г-подібній сторона
                     * проходила перевірку, але контур будувався з
                     * прямокутника — виріб мовчки міняв форму.
                     */
                    const side = edgeContextMenu.edgeId;
                    const base = edgeNamedContour(detail as never);
                    const isStraightSide = Boolean(base && contourEdges(base).some((edge) => edge.name === side));
                    if (isStraightSide) setUCutoutSide(side as UCutoutSide);
                  }
                }}
              />
            )}

            {additionModalOpen && detail && session.mainDetail && (
              /*
               * ХВИЛЯ 4, крок 4.1 — одна модалка на обидва рівні.
               *
               * Раніше тут стояли ДВІ модалки: повна (висота/ширина/відступ)
               * для стільниці й куца (лише висота) для доповнення на
               * доповненні. Куца існувала не тому, що так треба цеху, а
               * тому, що генератор усе одно затирав ширину — тепер він її
               * поважає, і другий рівень нічим не гірший за перший.
               *
               * Власник — АКТИВНА деталь: підворот ноги пишеться в слот
               * `leg_B_fold_C`, а не в підворот стільниці.
               */
              <EdgeAdditionModal
                kind={additionModalOpen.kind}
                edgeId={additionModalOpen.edgeId}
                sideLength={edgeLengthOf(additionModalOpen.edgeId, detail)}
                initialData={(() => {
                  const feature = detail[additionModalOpen.kind];
                  const saved = additionModalOpen.slot ? session.subDetails[additionModalOpen.slot] : undefined;
                  if (saved && !additionModalOpen.legacy) {
                    return { height: saved.height, width: saved.width, offset: saved.attachOffset ?? 0 };
                  }
                  const height = feature?.sideSizes?.[additionModalOpen.edgeId] ?? feature?.size;
                  return height ? { height } : undefined;
                })()}
                onClose={() => setAdditionModalOpen(null)}
                onSave={(data) => {
                  const { kind, edgeId, legacy } = additionModalOpen;
                  const ownerSlot = isMainActive ? undefined : session.activeDetailId!;
                  const prefix = ownerSlot ? `${ownerSlot}_` : '';
                  const feature = detail[kind] ?? { enabled: false, sides: [], size: undefined, sideSizes: {} };

                  // Вільний слот: базовий може бути зайнятий і збереженим
                  // драфтом, і легасі-галочкою (вона породжує той самий id
                  // у динамічній генерації) — тоді нове доповнення йде в #2.
                  //
                  // На ДРУГОМУ рівні `#2` не буває: там деталь породжує
                  // список сторін власника, а він за визначенням один на
                  // сторону. Тому вкладене доповнення завжди пише в базовий
                  // слот — інакше вийшов би драфт, який ніколи не рендериться.
                  const claimed = new Set(Object.keys(session.subDetails || {}));
                  if (feature?.sides?.includes(edgeId)) claimed.add(`${prefix}${kind}_${edgeId}`);
                  let slot = additionModalOpen.slot;
                  if (!slot && ownerSlot) slot = `${prefix}${kind}_${edgeId}`;
                  if (!slot) {
                    for (let n = 1; !slot; n += 1) {
                      const candidate = n === 1
                        ? `${kind}_${edgeId}`
                        : `${kind}_${edgeId}#${n}`;
                      if (!claimed.has(candidate)) slot = candidate;
                    }
                  }

                  // Редагування зберігає решту драфта (вирізи, фаски) — міняємо
                  // тільки габарити й відступ.
                  const prev = session.subDetails[slot];
                  const draft: DetailDraft = prev ? { ...prev } : {
                    ...createDraft(),
                    thickness: detail.thickness,
                    quantity: detail.quantity,
                  };
                  draft.type = EDGE_KIND_LABEL[kind] as DetailDraft['type'];
                  draft.width = data.width;
                  draft.height = data.height;
                  draft.attachOffset = data.offset;

                  if (ownerSlot) {
                    /*
                     * Другий рівень генерується з дерева власника
                     * (`def.fold.sides`), а не зі списку слотів — інакше
                     * динамічна гілка про нього не дізнається. Тому пишемо
                     * ОБА: галочку власника, щоб деталь узагалі з'явилась,
                     * і драфт слота, звідки генератор візьме ширину/відступ.
                     */
                    const sides = feature.sides.includes(edgeId) ? feature.sides : [...feature.sides, edgeId];
                    setSession({
                      ...session,
                      subDetails: {
                        ...session.subDetails,
                        [ownerSlot]: {
                          ...detail,
                          [kind]: {
                            ...feature,
                            enabled: true,
                            sides,
                            sideSizes: { ...feature.sideSizes, [edgeId]: data.height },
                          },
                        } as DetailDraft,
                        [slot]: draft,
                      },
                    });
                    setAdditionModalOpen(null);
                    return;
                  }

                  // Легасі-галочка після редагування переїжджає у слот: інакше
                  // динамічна генерація й далі малювала б стару версію поверх.
                  const mainPatch: Partial<DetailDraft> = legacy ? {
                    [kind]: {
                      ...feature,
                      sides: feature.sides.filter((s: string) => s !== edgeId),
                      enabled: feature.sides.filter((s: string) => s !== edgeId).length > 0,
                    },
                  } as Partial<DetailDraft> : {};
                  setSession({
                    ...session,
                    mainDetail: { ...session.mainDetail!, ...mainPatch },
                    subDetails: { ...session.subDetails, [slot]: draft },
                  });
                  setAdditionModalOpen(null);
                }}
              />
            )}

            {uCutoutSide && detail && (
              <UCutoutModal
                side={uCutoutSide}
                detail={detail as never}
                initialData={(detail as { uCutout?: UCutoutSpec }).uCutout}
                onClose={() => setUCutoutSide(null)}
                onSave={(uCutout) => updateDetail({ uCutout } as Partial<DetailDraft>)}
                onRemove={() => updateDetail({ uCutout: undefined } as Partial<DetailDraft>)}
              />
            )}

            {skirtingModalOpen && (
              <SkirtingModal
                edgeId={skirtingModalOpen.edgeId}
                sideLength={edgeLengthOf(skirtingModalOpen.edgeId, detail)}
                initialData={skirtingModalOpen.slot
                  ? session.subDetails[skirtingModalOpen.slot]
                  : session.mainDetail.skirtings?.[skirtingModalOpen.edgeId]}
                onClose={() => setSkirtingModalOpen(null)}
                onSave={(skirting) => {
                  const id = skirtingModalOpen.slot
                    ?? freeAdditionSlot(ownerPrefix, 'skirting', skirtingModalOpen.edgeId, session.subDetails);
                  const newSkirting = session.subDetails[id] ? { ...session.subDetails[id] } : {
                    ...createDraft(),
                    thickness: session.mainDetail.thickness,
                    quantity: session.mainDetail.quantity,
                  };
                  newSkirting.type = 'Бортик' as any;
                  if (skirting.width) newSkirting.width = skirting.width;
                  if (skirting.height) newSkirting.height = skirting.height;
                  
                  // Активну деталь НЕ перемикаємо: менеджер щойно налаштував
                  // доповнення у вікні й лишається на батьківській деталі, щоб
                  // додати наступне. Раніше фокус стрибав на нове доповнення —
                  // правий трей повністю мінявся під ним («меню злітає»).
                  // Щоб редагувати саме доповнення — клік у дереві навігації.
                  setSession({
                    ...session,
                    subDetails: { ...session.subDetails, [id]: newSkirting },
                  });
                  setSkirtingModalOpen(null);
                }}
              />
            )}

            {wallPanelModalOpen && (
              <WallPanelModal
                edgeId={wallPanelModalOpen.edgeId}
                sideLength={edgeLengthOf(wallPanelModalOpen.edgeId, detail)}
                initialData={wallPanelModalOpen.slot
                  ? session.subDetails[wallPanelModalOpen.slot]
                  : session.mainDetail.wallPanels?.[wallPanelModalOpen.edgeId]}
                onClose={() => setWallPanelModalOpen(null)}
                onSave={(panel) => {
                  // Крок 4.2: панель на торці ІНШОЇ панелі отримує слот із
                  // адресою власника — `wall_panel_B_wall_panel_C`.
                  // Крок 4.3: на одному ребрі їх може бути кілька — беремо
                  // перший вільний, а при редагуванні той самий.
                  const id = wallPanelModalOpen.slot
                    ?? freeAdditionSlot(ownerPrefix, 'wall_panel', wallPanelModalOpen.edgeId, session.subDetails);
                  const newPanel = session.subDetails[id] ? { ...session.subDetails[id] } : {
                    ...createDraft(),
                    thickness: detail.thickness,
                    quantity: detail.quantity,
                  };
                  newPanel.type = 'Стінова панель';
                  if (panel.width) newPanel.width = panel.width;
                  if (panel.height) newPanel.height = panel.height;
                  
                  setSession({
                    ...session,
                    subDetails: { ...session.subDetails, [id]: newPanel },
                  });
                  setWallPanelModalOpen(null);
                }}
              />
            )}

            {legModalOpen && (
              <LegModal
                edgeId={legModalOpen.edgeId}
                sideLength={edgeLengthOf(legModalOpen.edgeId, detail)}
                initialData={legModalOpen.slot
                  ? (() => {
                      /* Драфт слота зберігає відступ як attachOffset, а
                         модалка чекає Leg із полем offset. Без цього мапінгу
                         повторне відкриття показувало нуль замість
                         збереженого відступу. */
                      const saved = session.subDetails[legModalOpen.slot];
                      if (!saved) return undefined;
                      return {
                        edgeId: legModalOpen.edgeId,
                        width: saved.width,
                        height: saved.height,
                        offset: saved.attachOffset ?? 0,
                        inset: saved.attachInset ?? 0,
                        size: saved.height ? 'Заданий' : 'Довільний (від стільниці до підлоги)',
                        jointType: 'Без фрезерування',
                      };
                    })()
                  : session.mainDetail.legs?.[legModalOpen.edgeId]}
                onClose={() => setLegModalOpen(null)}
                onSave={(leg) => {
                  const id = legModalOpen.slot
                    ?? freeAdditionSlot(ownerPrefix, 'leg', legModalOpen.edgeId, session.subDetails);
                  const newLeg = session.subDetails[id] ? { ...session.subDetails[id] } : {
                    ...createDraft(),
                    thickness: detail.thickness,
                    quantity: detail.quantity,
                  };
                  newLeg.type = 'Опора';
                  if (leg.width) newLeg.width = leg.width;
                  if (leg.height) newLeg.height = leg.height;
                  /*
                   * Відступ (виправлено 26.08): модалка його віддавала, а
                   * тут він мовчки губився — attachOffset не писався, і на
                   * сцені нога стояла в нулі ребра, хоч у полі стояло 200.
                   * Ця сама цифра йде і в стик (contactLength від
                   * attachFrom), і в 3D-позицію ноги вздовж ребра.
                   */
                  newLeg.attachOffset = Math.max(0, leg.offset ?? 0);
                  /* Зсув углиб стільниці — той самий attachInset, який уже
                     розуміє вся 3D-математика. Модалка лише відкриває його
                     користувачу (26.08, прохання продажів). */
                  newLeg.attachInset = Math.max(0, leg.inset ?? 0);

                  setSession({
                    ...session,
                    subDetails: { ...session.subDetails, [id]: newLeg },
                  });
                  setLegModalOpen(null);
                }}
              />
            )}

            {/* FG-21: тут стояла колонка з трьох значків — «Прямокутний виріз»,
                «Довільний виріз», «Круглий виріз». Вони дублювали правильний
                шлях (праве меню на площині деталі в 3D), при цьому «довільний»
                насправді відкривав прямокутний, а прив'язка кута лишалась
                порожньою — виріз падав у нуль координат. Спосіб додати виріз
                тепер один. Прибрано. */}
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
            const product = buildProductFromSession(session, productId, session.material ?? project.projectMaterial);
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
                              } else if (elementSlot.startsWith('sink_')) {
                                // Мийка живе в mainDetail.sinks, а не в subDetails
                                const nextSinks = { ...session.mainDetail?.sinks };
                                delete nextSinks[elementSlot.slice('sink_'.length)];
                                setSession({ ...session, mainDetail: { ...session.mainDetail!, sinks: nextSinks }, activeDetailId: isActive ? 'main' : session.activeDetailId });
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
                          
                          // Ребро — спільним розбором слота: регулярка «літера в
                          // кінці» не бачила ні Г-заріз (`BC_lcut1`), ні друге
                          // доповнення на ребрі (`fold_B#2`) — і в дереві висіло
                          // безіменне «Підворот (Доповнення)».
                          const parsedAdd = parseAdditionSlot(additionSlot);
                          const sideId = parsedAdd.kind ? parsedAdd.sideId : '';
                          const label = sideId
                            ? `${ui(addition.type)} (${sideId}${parsedAdd.index > 1 ? ` #${parsedAdd.index}` : ''})`
                            : ui(addition.type);
                          
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
                                      // Підворот/потовщення живуть у двох виглядах: слот у
                                      // subDetails (новий, з шириною і відступом) і легасі-
                                      // галочка на деталі. Чистимо ОБА, інакше видалене
                                      // доповнення відроджується з того джерела, яке лишилось.
                                      const isFold = additionSlot.startsWith('fold_');
                                      const key = isFold ? 'fold' : 'thickening';
                                      const sideId = parseAdditionSlot(additionSlot).sideId;
                                      const newMain = { ...session.mainDetail! };
                                      const feature = newMain[key];
                                      if (feature && parseAdditionSlot(additionSlot).index === 1) {
                                        const sides = feature.sides.filter(s => s !== sideId);
                                        newMain[key] = { ...feature, sides, enabled: sides.length > 0 };
                                      }
                                      const newSubDetails = { ...session.subDetails };
                                      delete newSubDetails[additionSlot];
                                      setSession({ ...session, mainDetail: newMain, subDetails: newSubDetails, activeDetailId: isAddActive ? 'main' : session.activeDetailId });
                                    } else if (additionSlot.startsWith('sink_')) {
                                      // Старий формат (мийка як доповнення): джерело — mainDetail.sinks
                                      const nextSinks = { ...session.mainDetail?.sinks };
                                      delete nextSinks[additionSlot.slice('sink_'.length)];
                                      setSession({ ...session, mainDetail: { ...session.mainDetail!, sinks: nextSinks }, activeDetailId: isAddActive ? 'main' : session.activeDetailId });
                                    } else if (additionSlot.startsWith('mseg_')) {
                                      // Сегмент ланцюга профілів: джерело — mainDetail.metalSegments
                                      const segId = additionSlot.slice('mseg_'.length);
                                      setSession({
                                        ...session,
                                        mainDetail: { ...session.mainDetail!, metalSegments: (session.mainDetail?.metalSegments ?? []).filter((item) => item.id !== segId) },
                                        activeDetailId: isAddActive ? 'main' : session.activeDetailId,
                                      });
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
              
              {/* Мийка — не плоска деталь: у неї власні розміри чаші
                  (довжина, ширина, глибина), а кромки й кути на неї не
                  накладаються. Тому для неї показуємо конструктор мийки
                  замість таблиці сторін. */}
              {isMetalDetail ? (
                <Accordion title="Профіль металопрокату">
                  <div className="p-4 flex flex-col gap-3 bg-white">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-600">Типорозмір</label>
                      <select
                        value={(detail as { metalProfileId?: string }).metalProfileId ?? DEFAULT_METAL_PROFILE_ID}
                        onChange={(e) => {
                          const profile = metalProfileById(e.target.value);
                          // height = висота перерізу: нею деталь лягає смужкою в розкрій
                          updateDetail({ metalProfileId: e.target.value, height: profile?.h ?? detail.height } as never);
                        }}
                        className="border border-slate-300 rounded-sm h-8 px-2 bg-white text-sm"
                      >
                        {METAL_PROFILES.map((profile) => (
                          <option key={profile.id} value={profile.id}>{profile.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-600">Довжина відрізка, мм</label>
                      <input
                        type="number"
                        min={10}
                        value={detail.width}
                        onChange={(e) => updateDetail({ width: Math.max(10, Number(e.target.value) || 0) })}
                        className="border border-slate-300 rounded-sm h-8 px-2 text-sm font-bold w-40"
                      />
                    </div>
                    {/* Ланцюг: проєктування «від торця» — наступний профіль
                        продовжує попередній прямо або з поворотом 90°/45°.
                        Джерело істини — metalSegments; розкрій і 3D похідні. */}
                    {/* Шаблони: генератор пише готовий ланцюг (рама/ферма/опора/мийка) —
                        далі його можна докручувати тими самими сегментами. */}
                    <button
                      onClick={() => setMetalTemplateModalOpen(true)}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-[#0084ff] hover:bg-[#006fd6] rounded-sm transition-colors"
                    >
                      Шаблони виробів: рама · ферма · опора · мийка
                    </button>
                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-200">
                      <span className="text-xs font-bold text-slate-700">Продовження ланцюга</span>
                      {(() => {
                        // Нумеруємо тільки матеріальні сегменти: переміщення (gap) — службові
                        let materialNo = 1;
                        return (detail.metalSegments ?? []).map((segment) => {
                          const label = segment.gap ? 'Переміщення (без матеріалу)' : `Сегмент ${(materialNo += 1)}`;
                          return { segment, label };
                        });
                      })().map(({ segment, label }) => (
                        <div key={segment.id} className={`p-2 border border-slate-200 rounded-sm flex flex-col gap-2 ${segment.gap ? 'bg-white opacity-60' : 'bg-slate-50'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[#1f2d3a]">{label}</span>
                            <button
                              onClick={() => updateDetail({ metalSegments: (detail.metalSegments ?? []).filter((item) => item.id !== segment.id) })}
                              className="text-red-500 hover:bg-red-50 p-1 rounded-sm transition-colors"
                              title="Видалити сегмент"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <select
                              value={segment.turn}
                              onChange={(e) => updateDetail({ metalSegments: (detail.metalSegments ?? []).map((item) => item.id === segment.id ? { ...item, turn: e.target.value as typeof segment.turn } : item) })}
                              className="flex-1 border border-slate-300 rounded-sm h-7 px-1 bg-white text-xs"
                            >
                              <option value="straight">Прямо</option>
                              <option value="up">Вгору</option>
                              <option value="down">Вниз</option>
                              <option value="left">Вліво</option>
                              <option value="right">Вправо</option>
                            </select>
                            <select
                              value={segment.angle}
                              disabled={segment.turn === 'straight'}
                              onChange={(e) => updateDetail({ metalSegments: (detail.metalSegments ?? []).map((item) => item.id === segment.id ? { ...item, angle: Number(e.target.value) } : item) })}
                              className="w-16 border border-slate-300 rounded-sm h-7 px-1 bg-white text-xs disabled:opacity-40"
                            >
                              <option value={90}>90°</option>
                              <option value={45}>45°</option>
                              {/* Кути з шаблонів (розкоси ферми) — довільні; показуємо як є */}
                              {![90, 45].includes(segment.angle) && (
                                <option value={segment.angle}>{Math.round(segment.angle * 10) / 10}°</option>
                              )}
                            </select>
                            <input
                              type="number"
                              min={0}
                              value={segment.length}
                              onChange={(e) => updateDetail({ metalSegments: (detail.metalSegments ?? []).map((item) => item.id === segment.id ? { ...item, length: Math.max(segment.gap ? 0 : 10, Number(e.target.value) || 0) } : item) })}
                              className="w-20 border border-slate-300 rounded-sm h-7 px-1 text-xs font-bold"
                              title="Довжина, мм"
                            />
                          </div>
                          {!segment.gap && (
                            <select
                              value={segment.profileId ?? ''}
                              onChange={(e) => updateDetail({ metalSegments: (detail.metalSegments ?? []).map((item) => item.id === segment.id ? { ...item, profileId: e.target.value || undefined } : item) })}
                              className="border border-slate-300 rounded-sm h-7 px-1 bg-white text-xs"
                            >
                              <option value="">Профіль як у базового</option>
                              {METAL_PROFILES.map((profile) => (
                                <option key={profile.id} value={profile.id}>{profile.label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => updateDetail({
                          metalSegments: [
                            ...(detail.metalSegments ?? []),
                            { id: nextSegmentId(detail), length: 1000, turn: (detail.metalSegments?.length ? 'up' : 'up') as 'up', angle: 90 },
                          ],
                        })}
                        className="px-3 py-1.5 text-xs font-medium text-[#0084ff] border border-[#0084ff] hover:bg-[#0084ff]/5 rounded-sm transition-colors"
                      >
                        + Продовжити профіль від торця
                      </button>
                    </div>
                    {(() => {
                      const totalWeight = metalChainWeightKg(detail) * (detail.quantity || 1);
                      const profile = metalProfileById((detail as { metalProfileId?: string }).metalProfileId ?? DEFAULT_METAL_PROFILE_ID);
                      if (!profile) return null;
                      const qty = detail.quantity || 1;
                      const surface = pieceSurfaceM2(profile, detail.width || 0) * qty;
                      const segmentCount = 1 + (detail.metalSegments?.filter((segment) => !segment.gap).length ?? 0);
                      return (
                        <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-sm px-3 py-2 flex flex-col gap-1">
                          <span>Відрізків у ланцюгу: <b>{segmentCount}</b> · Маса разом: <b>{totalWeight.toFixed(2)} кг</b> (× {qty} шт)</span>
                          <span>База: {kgPerMeter(profile).toFixed(2)} кг/м · фарбування бази: {surface.toFixed(3)} м²</span>
                        </div>
                      );
                    })()}
                  </div>
                </Accordion>
              ) : isSinkDetail ? (
                <>
                  <Accordion title="Розміри мийки">
                    <div className="p-3 bg-white">
                      <SinkDesigner detail={detail} updateDetail={(patch) => updateDetail(patch)} />
                    </div>
                  </Accordion>
                  {/* Решітка зливу (28.08) — водоструменевий різ у дні.
                      Живе тільки в мийки: на стільниці такої операції немає. */}
                  <Accordion title="Решітка зливу (різ водою)">
                    <DrainGratePanel
                      grate={detail.drainGrate}
                      /* Решітка живе в КРУГЛІЙ деталі дна Ø114 (деталь №14
                         розкладки мийки), не в чаші — тому межі беремо з неї. */
                      bottomWidthMm={DRAIN_DISC_DIAMETER}
                      bottomHeightMm={DRAIN_DISC_DIAMETER}
                      onChange={(drainGrate) => updateDetail({ drainGrate })}
                    />
                  </Accordion>
                </>
              ) : (
                <div className="accordion-edges transition-all duration-500">
                  {/* Доповнення і кромки — ДВА окремі треї (10.08): кромка і
                      підворот на одній стороні сумісні, стара спільна таблиця
                      їх взаємовиключала. */}
                  <Accordion title="Сторони (Бортики, Потовщення, Підвороти)">
                    {/* Крок 4.1: трей однаковий і для стільниці, і для
                        доповнення — з розмірами на обох рівнях. Префікс
                        слота каже панелі, чиї саме доповнення показувати. */}
                    <SideAdditionsPanel
                      ownerDetail={detail}
                      subDetails={session.subDetails}
                      /* Сторони за формою деталі + ДУГИ скруглених кутів
                         (ремонт 19.08): дуга — теж сторона, на неї можна
                         повісити потовщення/підворот, і з неї виросте
                         гнутий елемент. Раніше дуги жили лише в 3D, і з
                         трея їх було не дістати. */
                      sides={(() => {
                        /*
                         * Сторони треба брати з РЕАЛЬНОГО контуру, а не зі
                         * статичного списку форми. Два радіуси по 400 на
                         * стороні 800 з'їдають її повністю — такої сторони
                         * фізично немає, і пропонувати повісити на неї
                         * панель означає обіцяти те, чого цех не зробить.
                         * (У таблиці РОЗМІРІВ сторона лишається — там це
                         * поле вводу, а не ребро.)
                         */
                        const lens = realEdgeLengths(detail);
                        const known = Object.keys(lens).length > 0;
                        const straight = sideOptionsFor(detail.kind, detail)
                          .filter((side) => !known || (lens[side] ?? 0) > 0.5);
                        const arcs = Object.entries(detail.corners ?? {})
                          .filter(([, corner]) => corner?.type === 'radius' && (corner.radius ?? 0) > 0 && !corner.reflex)
                          .map(([cornerId]) => `${cornerId}_radius`);
                        return [...straight, ...arcs];
                      })()}
                      ownerSlot={isMainActive ? undefined : session.activeDetailId!}
                      onAdd={(kind, sideId) => {
                        if (kind === 'skirting') setSkirtingModalOpen({ edgeId: sideId });
                        else if (kind === 'wall_panel') setWallPanelModalOpen({ edgeId: sideId });
                        else if (kind === 'leg') setLegModalOpen({ edgeId: sideId });
                        else setAdditionModalOpen({ kind, edgeId: sideId });
                      }}
                      onEdit={(entry) => {
                        // Крок 4.3: віддаємо саме той слот, по чипу якого
                        // клікнули, — інакше правка другого бортика
                        // затирала перший.
                        if (entry.kind === 'skirting') setSkirtingModalOpen({ edgeId: entry.sideId, slot: entry.slot });
                        else if (entry.kind === 'wall_panel') setWallPanelModalOpen({ edgeId: entry.sideId, slot: entry.slot });
                        else if (entry.kind === 'leg') setLegModalOpen({ edgeId: entry.sideId, slot: entry.slot });
                        else setAdditionModalOpen({
                          kind: entry.kind,
                          edgeId: entry.sideId,
                          slot: entry.slot ?? `${isMainActive ? '' : `${session.activeDetailId}_`}${entry.kind}_${entry.sideId}`,
                          legacy: entry.legacy,
                        });
                      }}
                      onDelete={(entry) => {
                        // Панель і нога живуть ТІЛЬКИ слотом — легасі-галочки
                        // в них немає, тож видалення це просто зняття слота.
                        const isEdgeFeature = entry.kind === 'fold' || entry.kind === 'thickening';
                        if (!isMainActive && isEdgeFeature) {
                          // Вкладене доповнення живе двома записами: галочкою
                          // на власнику (звідки воно генерується) і драфтом
                          // слота (звідки беруться розміри). Прибираємо обидва,
                          // інакше наступне створення підхопить стару ширину.
                          const feature = detail[entry.kind as 'fold' | 'thickening'];
                          const nextSides = feature.sides.filter((s: string) => s !== entry.sideId);
                          const nestedSlot = entry.slot ?? `${session.activeDetailId}_${entry.kind}_${entry.sideId}`;
                          const nextSub = { ...session.subDetails };
                          delete nextSub[nestedSlot];
                          nextSub[session.activeDetailId!] = {
                            ...detail,
                            [entry.kind]: { ...feature, sides: nextSides, enabled: nextSides.length > 0 },
                          } as DetailDraft;
                          setSession({ ...session, subDetails: nextSub });
                          return;
                        }
                        const nextSub = { ...session.subDetails };
                        if (entry.slot) delete nextSub[entry.slot];
                        let mainPatch: Partial<DetailDraft> = {};
                        if (entry.legacy && isEdgeFeature) {
                          const feature = detail[entry.kind as 'fold' | 'thickening'];
                          const nextSides = feature.sides.filter((s: string) => s !== entry.sideId);
                          mainPatch = { [entry.kind]: { ...feature, sides: nextSides, enabled: nextSides.length > 0 } } as Partial<DetailDraft>;
                        }
                        setSession({
                          ...session,
                          mainDetail: { ...session.mainDetail!, ...mainPatch },
                          subDetails: nextSub,
                          activeDetailId: entry.slot && session.activeDetailId === entry.slot ? 'main' : session.activeDetailId,
                        });
                      }}
                    />
                  </Accordion>
                  <Accordion title="Кромки (Обробка торців)" info="edges">
                    <EdgeProfilesPanel
                      edgeProfiles={detail.edgeProfiles}
                      /* Матеріал виробу (01.09) — від нього порядок груп у випадачці кромок */
                      material={session.material ?? project.projectMaterial}
                      sides={sideOptionsFor(detail.kind, detail)}
                      /* Реальні довжини ребер (радіус і Г-заріз укорочують
                         сторону) — щоб «Довільна» затискалась по факту, а
                         «Факт. розмір» показував правду. */
                      sideLengths={realEdgeLengths(detail)}
                      /* Сторони, закриті ногою/потовщенням/підворотом — форму не обрати (01.09) */
                      occupiedSides={occupiedSides}
                      scope={session.activeDetailId ?? 'main'}
                      onChange={(edgeProfiles) => updateDetail({ edgeProfiles })}
                    />
                  </Accordion>
                </div>
              )}

          {/* Кути й вирізи існують на плоскій деталі; у мийки й металопрокату їх нема */}
          {!isSinkDetail && !isMetalDetail && (
          <>
          <Accordion title="Обробка кутів (Радіуси)">
            <div className="p-4 flex flex-col gap-2">
              {detail.corners && Object.keys(detail.corners).length > 0 ? (
                Object.entries(detail.corners).map(([cornerId, corner]) => (
                  <div key={cornerId} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-sm">
                    <div className="flex flex-col">
                      <span className="font-bold text-[#1f2d3a] text-sm">Кут {cornerDisplayName(cornerId, detail.kind)}</span>
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

          {/* Фрезерування площини НЕ на всю товщину (28.08): проточки для
              стікання води біля врізної мийки, декоративні канавки фасаду.
              Стоїть поруч із вирізами свідомо: та сама площина деталі,
              різниця лише в тому, що виріз наскрізний, а канавка — ні. */}
          <Accordion title="Фрезерування площини (Проточки для води)">
            <SurfaceGroovesPanel
              groups={detail.surfaceGrooves}
              partWidthMm={realEdgeLengths(detail).A || detail.width || 1000}
              partHeightMm={realEdgeLengths(detail).B || detail.height || 600}
              thicknessMm={detail.thickness || 20}
              material={useProjectStore.getState().project.slabs?.[0]?.material}
              onChange={(surfaceGrooves) => updateDetail({ surfaceGrooves })}
            />
          </Accordion>
          </>
          )}

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

          {isMainActive && !isSinkDetail && !isMetalDetail && (
          <Accordion title="Встановлення мийки в виріб">
            <div className="flex flex-col gap-3">
              {Object.values(detail.sinks ?? {}).map((sink) => {
                const patchSink = (patch: Partial<ProductSinkDef>) => {
                  updateDetail({ sinks: { ...detail.sinks, [sink.id]: { ...sink, ...patch } } });
                };
                return (
                  <div key={sink.id} className="p-2 bg-slate-50 border border-slate-200 rounded-sm flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#1f2d3a] text-sm">
                        Мийка {sink.kind === 'slot' ? '(щілинна)' : '(прямокутна)'}
                      </span>
                      <button
                        onClick={() => {
                          const next = { ...detail.sinks };
                          delete next[sink.id];
                          updateDetail({ sinks: next });
                        }}
                        className="text-red-500 hover:bg-red-50 p-1 rounded-sm transition-colors"
                        title="Видалити мийку"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <select
                      value={sink.kind}
                      onChange={(e) => patchSink({ kind: e.target.value as 'rect' | 'slot' })}
                      className="px-2 py-1 text-xs border border-slate-300 rounded-sm bg-white"
                    >
                      <option value="rect">Прямокутна чаша</option>
                      <option value="slot">Щілинна чаша</option>
                    </select>

                    {/* Прив'язка чаші — та сама механіка, що у вирізів: менеджер
                        обирає кут деталі й міряє від нього до кута чаші. */}
                    <label className="flex flex-col gap-0.5 text-[11px] text-slate-500 font-medium">
                      Прив'язка до кута
                      <select
                        value={sink.bindCorner ?? ''}
                        onChange={(e) => patchSink({ bindCorner: e.target.value })}
                        className="px-2 py-1 text-xs border border-slate-300 rounded-sm bg-white text-slate-800 font-bold"
                      >
                        <option value="">Лівий верхній</option>
                        {getCornersForKind(detail.kind).map((corner) => (
                          <option key={corner} value={corner}>{corner}</option>
                        ))}
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      {/* Чаша міряється так само, як виріз: від прив'язаного
                          кута деталі до кута чаші, а не до її центру. */}
                      {([
                        ['Від кута по X, мм', 'x'],
                        ['Від кута по Y, мм', 'y'],
                        ['Довжина чаші, мм', 'width'],
                        ['Ширина чаші, мм', 'height'],
                        ['Глибина чаші, мм', 'depth'],
                      ] as Array<[string, 'x' | 'y' | 'width' | 'height' | 'depth']>).map(([label, field]) => (
                        <label key={field} className="flex flex-col gap-0.5 text-[11px] text-slate-500 font-medium">
                          {label}
                          <input
                            type="number"
                            value={sink[field]}
                            onChange={(e) => patchSink({ [field]: Math.max(0, Number(e.target.value) || 0) } as Partial<ProductSinkDef>)}
                            className="px-2 py-1 text-sm border border-slate-300 rounded-sm font-bold text-slate-800"
                          />
                        </label>
                      ))}
                    </div>

                    <div className="text-[11px] text-slate-500 leading-snug">
                      Виріз у стільниці ({sink.width}×{sink.height} мм) робиться автоматично
                      за внутрішнім контуром чаші. Чаша підклеюється знизу.
                    </div>
                  </div>
                );
              })}

              <button
                onClick={() => {
                  const existing = Object.keys(detail.sinks ?? {});
                  let n = existing.length + 1;
                  while (existing.includes(String(n))) n += 1;
                  const sink = createProductSink(String(n), detail);
                  updateDetail({ sinks: { ...detail.sinks, [sink.id]: sink } });
                }}
                className="px-3 py-1.5 text-xs font-medium text-[#0084ff] border border-[#0084ff] hover:bg-[#0084ff]/5 rounded-sm transition-colors"
              >
                + Додати мийку
              </button>

              {!Object.keys(detail.sinks ?? {}).length && (
                <div className="text-xs text-slate-500 text-center">
                  Мийка нижнього монтажу: позиціонується як виріз, редагується
                  за розмірами, деталі чаші потрапляють у розкрій автоматично.
                </div>
              )}
            </div>
          </Accordion>
          )}
            </>
          ) : session.activeDetailId?.startsWith('mseg_') ? (
            <div className="p-8 text-center text-slate-500 flex flex-col gap-2 items-center justify-center h-full">
              <Box className="w-8 h-8 text-slate-300" />
              <span className="font-medium text-slate-600">Це сегмент ланцюга профілів</span>
              <p className="text-sm mt-2">
                Напрямок, кут і довжина редагуються на базовому профілі —
                розділ «Профіль металопрокату».
              </p>
              <button
                onClick={() => setSession({ ...session, activeDetailId: 'main' })}
                className="mt-4 px-4 py-1.5 text-sm font-medium text-[#0084ff] border border-[#0084ff] hover:bg-[#0084ff]/5 rounded-sm transition-colors"
              >
                Перейти до базового профілю
              </button>
            </div>
          ) : session.activeDetailId?.startsWith('sink_') ? (
            /*
             * Мийка, ВСТАНОВЛЕНА у виріб. Позиція і габарити чаші живуть на
             * стільниці (`mainDetail.sinks`), тому тут — пояснення й перехід.
             *
             * АЛЕ решітка зливу (28.08) редагується САМЕ тут: вона належить
             * дну цієї чаші, а не стільниці. Власник шукав її на мийці — і
             * мав рацію.
             */
            (() => {
              const sinkId = session.activeDetailId!.replace(/^sink_/, '');
              const sinkDef = session.mainDetail?.sinks?.[sinkId]
                ?? Object.values(session.mainDetail?.sinks ?? {}).find((item) => session.activeDetailId!.includes(item.id));
              const patchSink = (grate: import('../../domain/types').DrainGrate | undefined) => {
                if (!sinkDef || !session.mainDetail) return;
                setSession({
                  ...session,
                  mainDetail: {
                    ...session.mainDetail,
                    sinks: { ...session.mainDetail.sinks, [sinkDef.id]: { ...sinkDef, drainGrate: grate } },
                  },
                });
              };

              return (
                <div className="flex flex-col">
                  <div className="p-6 text-center text-slate-500 flex flex-col gap-1 items-center border-b border-slate-200">
                    <Box className="w-7 h-7 text-slate-300" />
                    <span className="font-medium text-slate-600">Це мийка, встановлена у виріб</span>
                    <p className="text-sm">
                      Позиція і розміри чаші редагуються на стільниці —
                      розділ «Встановлення мийки в виріб».
                    </p>
                    <button
                      onClick={() => setSession({ ...session, activeDetailId: 'main' })}
                      className="mt-3 px-4 py-1.5 text-sm font-medium text-[#0084ff] border border-[#0084ff] hover:bg-[#0084ff]/5 rounded-sm transition-colors"
                    >
                      Перейти до стільниці
                    </button>
                  </div>
                  {sinkDef && (
                    <Accordion title="Решітка зливу (різ водою)">
                      <DrainGratePanel
                        grate={sinkDef.drainGrate}
                        bottomWidthMm={DRAIN_DISC_DIAMETER}
                        bottomHeightMm={DRAIN_DISC_DIAMETER}
                        onChange={patchSink}
                      />
                    </Accordion>
                  )}
                </div>
              );
            })()
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
          projectMaterial={project.projectMaterial}
          onClose={() => setAddElementModalOpen(false)}
          onSave={(draft, name, material) => {
            setSession({ ...session, material, mainDetail: { ...draft, label: name }, activeDetailId: 'main' });
            // Проєкт без матеріалу (слебів ще нема) бере матеріал першого
            // виробу — від нього залежать профілі торця, радіуси, ТУ.
            // Якщо матеріал уже є (з першого слеба) — не перезаписуємо:
            // модалка попередила про розбіжність, рішення за менеджером.
            if (!project.projectMaterial) {
              useProjectStore.getState().updateProject({ projectMaterial: material });
            }
            setAddElementModalOpen(false);
          }}
          onApplyTemplate={(tpl, state) => {
            setLastTemplate({ ...state, slots: Object.keys(tpl.subDetails) });
            // Шаблон приносить готову сесію: головна деталь + суб-деталі за
            // слотами. Наявні субдеталі сесії зберігаємо (та сама семантика,
            // що й у onSave, який теж не чіпає subDetails).
            setSession({
              ...session,
              mainDetail: tpl.mainDetail,
              subDetails: { ...session.subDetails, ...tpl.subDetails },
              activeDetailId: 'main',
            });
            setAddElementModalOpen(false);
          }}
        />
      )}
      {templateModalOpen && lastTemplate && (
        <ProductTemplateModal
          initialTemplateId={lastTemplate.templateId}
          initialValues={lastTemplate.values}
          onClose={() => setTemplateModalOpen(false)}
          onCreate={(tpl, state) => {
            // Перебудова. Спершу ПРИБИРАЄМО деталі, які шаблон створив
            // минулого разу: інакше вимкнена ніша лишала б свої стінки
            // стирчати всередині подіуму (їх ніхто не перезаписує, бо в
            // новому наборі таких слотів просто немає). Ручні доповнення,
            // додані поверх шаблону, при цьому не чіпаємо.
            const kept = { ...session.subDetails };
            (lastTemplate.slots ?? []).forEach((slot) => { delete kept[slot]; });
            setLastTemplate({ ...state, slots: Object.keys(tpl.subDetails) });
            setSession({
              ...session,
              mainDetail: tpl.mainDetail,
              subDetails: { ...kept, ...tpl.subDetails },
              activeDetailId: 'main',
            });
            setTemplateModalOpen(false);
          }}
        />
      )}
      {settingsModalOpen && detail && (
        <ElementSettingsModal
          project={project}
          material={session.material}
          initialDetail={detail}
          occupiedSides={occupiedSides}
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
