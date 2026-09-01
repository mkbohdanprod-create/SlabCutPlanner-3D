import {  useMemo, useState } from 'react';
import { Loader2 , Plus, SquarePlus, FileUp, ClipboardList, StretchHorizontal, FileBox, AlertTriangle } from 'lucide-react';
import { referenceData, uid, MATERIALS_IN_USE } from '../../domain/defaults';
import { ChangeEvent, useEffect, useRef } from 'react';
import type { BindingAnchor, Detail, DetailShape, DetailType, EdgeFeature, EdgeProfileSelection, EdgeProfileType, MaterialType, SlabInstance, UiLanguage } from '../../domain/types';
import { translateStaticUiText } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { DEFAULT_MIN_SIDE_MM } from '../../domain/manufacturability';
import { parseSketchupProduct, formatSketchupReport } from '../../utils/sketchupImport';
import { getAllProjectDetails } from '../../store/projectHelpers';
import { useUIStore } from '../../store/useStore';
import { SlabCatalogModal, type SlabPick } from './SlabCatalogModal';
import type { ApprovalImportItem, ApprovalImportPreview } from '../../utils/approvalImport';
import {
  parseApprovalFile,
  applyApprovalItemDimensionsToPoints,
  layoutItems,
} from '../../utils/approvalImport';
import { DEFAULT_EDGE_PROFILE } from '../../utils/edgeProfiles';
import { applyUCutout } from '../../domain/uCutout';
import type { UCutoutSpec } from '../../domain/uCutout';
import { contourEdges, edgeNamedContour } from '../../domain/baseContour';
import type {
  DxfPoint, DxfPreviewContour, DxfBindingSession,
  DxfBlockDraft, DxfModalResize, DxfPreviewDrag, DxfImportRole,
} from '../../parsers/dxf';
import {
  dxfBounds, dxfSvgPath, dxfCanvasSize, dxfViewportForContours,
  dxfSelectionBounds, rotateDxfPreviewContour,
  parseDxfContours,
  inferDxfShape, inferDxfType, inferDxfRole, inferDxfEdgeProfile,
  inferDxfEdgeSide, inferDxfParentDetailId, inferDxfBindingPair,
  dxfBindingSides, dxfBindingAnchorPoint, detailMainDimensions,
} from '../../parsers/dxf';

const rectDetailTemplateSrc = new URL('../../assets/rect-detail-template.svg', import.meta.url).href;
const lDetailTemplateSrc = new URL('../../assets/l-detail-template.svg', import.meta.url).href;

import type { ShapeKind, CircleSizeMode, DetailDraft } from '../forms/utils/draftHelpers';
import { visibleDetailTypes, TYPE_COUNTERTOP,  TYPE_SINK, TYPE_SUPPORT, TYPE_METAL, SHAPE_RECT, SHAPE_L, SHAPE_U, SHAPE_CIRCLE,  baseDesigns, visibleBaseDesigns, sinkDesigns, metalDesigns, allSides, curveSides,  createDraft, defaultsForKind,   draftFromDetail } from '../forms/utils/draftHelpers';


function ImportedDetailPreview({ detail, linkedElements }: { detail: Detail; linkedElements: Detail[] }) {
  const points = detail.geometry.customPoints ?? [];
  const holes = detail.geometry.customHoles ?? [];
  const bounds = dxfBounds(points);
  const pad = Math.max(bounds.width, bounds.height) * 0.08;
  return (
    <section className="imported-detail-editor">
      <h3>Імпортований контур DXF</h3>
      <p>Геометрія та вирізи зберігаються без приведення до шаблонної форми.</p>
      <svg viewBox={`${bounds.minX - pad} ${bounds.minY - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`} aria-label="Імпортована деталь">
        <path d={dxfSvgPath(points, holes)} fillRule="evenodd" />
      </svg>
      <span>{Math.round(bounds.width)}×{Math.round(bounds.height)} мм</span>
      {linkedElements.length > 0 && (
        <div className="imported-linked-elements">
          <strong>Прив'язані елементи</strong>
          {linkedElements.map((element) => (
            <span key={element.id}>
              {EDGE_KIND_LABEL[element.importRole === 'fold' ? 'fold' : 'thickening']}: {element.label || 'DXF контур'}
              {element.parentDetailSide ? `, сторона ${element.parentDetailSide}` : ''}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export function designsForType(type: DetailType, isAdminUnlocked = false, currentKind?: ShapeKind) {
  if (type === TYPE_SINK) return sinkDesigns;
  if (type === TYPE_METAL) return metalDesigns;
  // Стільниця: усі базові форми (коло й овал повернуті всім 01.09).
  if (type === TYPE_COUNTERTOP) return visibleBaseDesigns(isAdminUnlocked, currentKind);
  return baseDesigns.filter((item) => item.kind === 'rect');
}

export function designForKind(kind: ShapeKind) {
  return [...baseDesigns, ...sinkDesigns, ...metalDesigns].find((item) => item.kind === kind) ?? baseDesigns[0];
}

/**
 * Сторони деталі — те, що видно в треях «Сторони» і «Кромки».
 *
 * ХВИЛЯ 4, крок 4.4 (FG-34): другий аргумент. Ніша ділить свою сторону на
 * п'ять ділянок, і три з них — реальні торці, які цех обробляє й за які
 * бере гроші. Поки список сторін залежав ЛИШЕ від `kind`, ці торці не
 * існували для решти застосунку: ні кромки задати, ні панель повісити.
 * Тому, коли деталь має нішу, імена беремо з її контуру.
 */
export function sideOptionsFor(kind: ShapeKind, detail?: { uCutout?: UCutoutSpec } & object) {
  const niche = detail?.uCutout;
  if (niche) {
    // РЕМОНТ 19.08: сторони деталі з нішею читаються з її РЕАЛЬНОГО
    // контуру (rect/Г/П), а не з прямокутника за габаритом.
    const base = edgeNamedContour({ ...(detail as object), kind } as never);
    const points = base ? applyUCutout(base, niche) : undefined;
    if (points) return contourEdges(points).map((edge) => edge.name);
  }
  if (kind === 'circle' || kind === 'ellipse') return curveSides;
  if (kind === 'u') return allSides;
  if (kind === 'l') return ['A', 'B', 'C', 'D', 'E', 'F'];
  return ['A', 'B', 'C', 'D'];
}

/**
 * Чи має деталь таблицю «Сторони» (розміри + кромка).
 *
 * Раніше тут були лише Стільниця й Опора, і через це стінова панель,
 * фасад і довільний елемент лишалися БЕЗ полів розмірів — змінити
 * габарити було нічим. Плоскі деталі з каменю всі мають сторони;
 * виняток — мийка, у неї власний конструктор із моделями.
 */
export function supportsEdges(type: DetailType) {
  return type !== TYPE_SINK && type !== TYPE_METAL;
}

import { RectangleDesigner } from '../forms/shapes/RectangleDesigner';
import { CircleDesigner } from '../forms/shapes/CircleDesigner';
import { EllipseDesigner } from '../forms/shapes/EllipseDesigner';
import { LDesigner } from '../forms/shapes/LDesigner';
import { UDesigner } from '../forms/shapes/UDesigner';
import { SinkDesigner } from '../forms/shapes/SinkDesigner';
import { EdgeProcessingDesigner } from '../forms/editors/EdgeProcessingDesigner';
import { DxfOverview, DXF_ROLE_LABELS, DxfPreviewShape } from '../forms/import/DxfOverview';
import { approvalItemHasExtractedGeometry, approvalPreviewDebugDumpFromState, approvalPreviewDebugSummary, ApprovalItemCrop } from '../forms/import/ApprovalOverview';
import {
  approvalItemPoints,
  approvalItemToDxfContour,
  approvalFeatureOverlaysForItem,
  approvalEdgeOverlaysForItem,
  approvalJointOverlaysForItem,
  approvalJointGuideOverlaysForItem,
  nearestApprovalContourPoint,
  approvalJointSegmentForPoint,
  approvalCustomJointIsInside,
} from '../forms/import/approvalCanvasUtils';
import type { ApprovalJointToolMode, ApprovalJointHover } from '../forms/import/approvalCanvasUtils';
import {   ShapeIcon, Field } from '../forms/utils/sharedInputs';
import { splitApprovalItemByJoint } from '../../engines/approvalSplit';
import { ApprovalItemEditors } from '../forms/import/ApprovalItemEditors';
import { EDGE_KIND_LABEL } from '../../domain/ids';
/**
 * compact — просунутий режим: панель стає вузькою колонкою значків.
 * Кнопки ті самі, обробники ті самі (усі модалки та file-input-и живуть
 * тут же) — міняється лише подача. Назва кожної дії — у підказці.
 */
export function FormsPanel({ activeTab, compact = false }: { activeTab?: 'details' | 'slabs'; compact?: boolean }) {
  const { addSlab, addDetail, addDetails, updateDetailRecord, updateAllowances, updateProjectHeader, project, editingDetailId, clearEditDetail } = useProjectStore();
  /** FG-10 — поріг короткої сторони за матеріалом (налаштування застосунку). */
  const minSideMm = useSettingsStore((s) => s.minSideMm);
  const setMinSideMm = useSettingsStore((s) => s.setMinSideMm);
  // Частина інструментів прихована за супер-адміном (щит у шапці, PIN)
  const isAdminUnlocked = useUIStore((s) => s.isAdminUnlocked);
  const language = project.uiLanguage ?? 'uk';
  const ui = (value: string) => translateStaticUiText(language, value);
  const [error, setError] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [allowancesOpen, setAllowancesOpen] = useState(false);
  const dxfInputRef = useRef<HTMLInputElement | null>(null);
  const sketchupInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Імпорт виробу зі SketchUp (файл із плагіна tools/sketchup/slabcut_export.rb).
   * Парсер нічого не домислює: усе, що не пройшло перевірку, показується у звіті.
   */
  const onSketchupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const productId = uid('prod');
      const { product, report } = parseSketchupProduct(raw, productId);
      if (!product) {
        window.alert(formatSketchupReport(report));
        return;
      }
      useProjectStore.getState().addProduct(product);
      window.alert(formatSketchupReport(report));
    } catch (err) {
      window.alert(`Не вдалося прочитати файл.\n\n${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const approvalInputRef = useRef<HTMLInputElement | null>(null);
  const [approvalPreview, setApprovalPreview] = useState<ApprovalImportPreview | null>(null);
  const [approvalSplitItemIds, setApprovalSplitItemIds] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [approvalDxfContext, setApprovalDxfContext] = useState<ApprovalImportPreview | null>(null);
  const [modalPosition, setModalPosition] = useState<{ x: number; y: number } | null>(null);
  const [modalDrag, setModalDrag] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [dxfModalPosition, setDxfModalPosition] = useState<{ x: number; y: number } | null>(null);
  const [dxfModalDrag, setDxfModalDrag] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [dxfModalSize, setDxfModalSize] = useState<{ width: number; height: number } | null>(null);
  const [dxfModalResize, setDxfModalResize] = useState<DxfModalResize | null>(null);
  const [dxfPreview, setDxfPreview] = useState<DxfPreviewContour[] | null>(null);
  const [dxfBinding, setDxfBinding] = useState<DxfBindingSession | null>(null);
  const [dxfBlockMode, setDxfBlockMode] = useState(false);
  const [dxfBlockDraft, setDxfBlockDraft] = useState<DxfBlockDraft | null>(null);
  const [dxfBlockEditorIds, setDxfBlockEditorIds] = useState<string[] | null>(null);
  const [dxfSelectedContourIds, setDxfSelectedContourIds] = useState<string[]>([]);
  const [dxfPreviewDrag, setDxfPreviewDrag] = useState<DxfPreviewDrag | null>(null);
  const [dxfPreviewCanvasSize, setDxfPreviewCanvasSize] = useState({ width: 1, height: 1 });
  const [dxfLayers, setDxfLayers] = useState<string[]>([]);
  const [selectedDxfLayers, setSelectedDxfLayers] = useState<string[]>([]);
  const [dxfLayersOpen, setDxfLayersOpen] = useState(false);
  const [dxfZoom, setDxfZoom] = useState(1);
  const [dxfNotice, setDxfNotice] = useState('');
  const dxfOverviewScrollRef = useRef<HTMLDivElement | null>(null);
  const [approvalSelectedItemIds, setApprovalSelectedItemIds] = useState<string[]>([]);
  const [approvalBlockMode, setApprovalBlockMode] = useState(false);
  const [approvalBlockDraft, setApprovalBlockDraft] = useState<DxfBlockDraft | null>(null);
  const [approvalPreviewDrag, setApprovalPreviewDrag] = useState<DxfPreviewDrag | null>(null);
  const [approvalOverviewPanDrag, setApprovalOverviewPanDrag] = useState<DxfModalResize | null>(null);
  const [approvalZoom, setApprovalZoom] = useState(1);
  const [approvalPreviewCanvasSize, setApprovalPreviewCanvasSize] = useState({ width: 1, height: 1 });
  const approvalOverviewScrollRef = useRef<HTMLDivElement | null>(null);
  const [approvalJointTool, setApprovalJointTool] = useState<{ itemId: string; mode: ApprovalJointToolMode } | null>(null);
  const [approvalJointDraft, setApprovalJointDraft] = useState<{ itemId: string; point: DxfPoint } | null>(null);
  const [approvalJointHover, setApprovalJointHover] = useState<ApprovalJointHover | null>(null);
  const [approvalJointNotice, setApprovalJointNotice] = useState('');
  const [slabCatalogOpen, setSlabCatalogOpen] = useState(false);

  /**
   * Слеб із каталогу → екземпляри проєкту. Фото натуралки додається вручну.
   *
   * Кількість приходить із кроку підтвердження (для натуралки завжди 1).
   * Нумерація йде від МАКСИМАЛЬНОГО зайнятого номера, а не від довжини
   * масиву: по-перше, `project.slabs` не встигає оновитись між викликами
   * в одному циклі, по-друге, після видалення слеба довжина повертається
   * назад і номери починають повторюватись. Дірки в нумерації нормальні,
   * два SL-1 у розкрої — ні: за серійним номером цех упізнає лист.
   */
  const addSlabFromCatalog = (pick: SlabPick) => {
    const usedNumbers = project.slabs
      .map((slab) => Number(/^SL-(\d+)$/.exec(slab.serialNumber)?.[1]))
      .filter((value) => Number.isFinite(value));
    const startFrom = usedNumbers.length ? Math.max(...usedNumbers) : 0;

    for (let index = 0; index < Math.max(1, pick.quantity); index += 1) {
      const item: SlabInstance = {
        id: uid('slab'),
        width: pick.width,
        height: pick.height,
        thickness: pick.thickness,
        material: pick.material,
        decor: pick.decor,
        // Артикул — в СВОЄ поле. Коментар лишається вільною нотаткою
        // менеджера: якби артикул жив у ньому, будь-яка правка тексту
        // тихо рвала б зв'язок слебу з номенклатурою 1С.
        article: pick.article,
        manufacturer: pick.manufacturer,
        finish: pick.finish,
        comment: '',
        minMargin: 10,
        photo: pick.photo || undefined,
        ...(pick.photoBacklit ? { photoBacklit: pick.photoBacklit } : {}),
        ...(pick.customerOwn ? { customerOwn: true } : {}),
        serialNumber: `SL-${startFrom + index + 1}`,
        defects: [],
        textureTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, opacity: 0.85 },
      };
      addSlab(item);
    }
  };

  const [detail, setDetail] = useState<DetailDraft>(() => createDraft());
  const allDetails = getAllProjectDetails(project);
  const editingDetail = editingDetailId ? allDetails.find((item) => item.id === editingDetailId) : undefined;
  const isImportedDetailEdit = Boolean(editingDetail?.geometry.customPoints?.length);
  const linkedImportedElements = editingDetail
    ? (() => {
      const linkedIds = new Set([editingDetail.id]);
      const result: Detail[] = [];
      let found = true;
      while (found) {
        found = false;
        allDetails.forEach((item) => {
          if (
            item.parentDetailId
            && linkedIds.has(item.parentDetailId)
            && !linkedIds.has(item.id)
            && (item.importRole === 'thickening' || item.importRole === 'fold')
          ) {
            linkedIds.add(item.id);
            result.push(item);
            found = true;
          }
        });
      }
      return result;
    })()
    : [];
  const linkedImportedThickeningSides = linkedImportedElements
    .filter((item) => item.importRole === 'thickening' && item.parentDetailSide)
    .map((item) => item.parentDetailSide as string);
  const linkedImportedFoldSides = linkedImportedElements
    .filter((item) => item.importRole === 'fold' && item.parentDetailSide)
    .map((item) => item.parentDetailSide as string);
  const selectedDxfLayerSet = useMemo(() => new Set(selectedDxfLayers), [selectedDxfLayers]);
  const visibleDxfPreview = useMemo(
    () => dxfPreview?.filter((contour) => selectedDxfLayerSet.has(contour.layer)) ?? [],
    [dxfPreview, selectedDxfLayerSet],
  );
  const dxfBlockEditorContours = useMemo(() => {
    const idSet = new Set(dxfBlockEditorIds ?? []);
    return visibleDxfPreview.filter((contour) => idSet.has(contour.id));
  }, [dxfBlockEditorIds, visibleDxfPreview]);
  const dxfBlockEditorViewport = useMemo(() => dxfViewportForContours(dxfBlockEditorContours), [dxfBlockEditorContours]);

  const designs = useMemo(
    () => designsForType(detail.type, isAdminUnlocked, detail.kind),
    [detail.type, isAdminUnlocked, detail.kind],
  );
  const currentDesign = designForKind(detail.kind);
  const sides = sideOptionsFor(detail.kind);
  const showEdges = supportsEdges(detail.type);

  useEffect(() => {
    if (!editingDetail) return;
    setDetail(draftFromDetail(editingDetail));
    setDetailOpen(true);
  }, [editingDetail]);

  useEffect(() => {
    if (!modalDrag) return;
    const onMove = (event: globalThis.MouseEvent) => {
      setModalPosition({
        x: modalDrag.originX + event.clientX - modalDrag.startX,
        y: modalDrag.originY + event.clientY - modalDrag.startY,
      });
    };
    const onUp = () => setModalDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [modalDrag]);

  useEffect(() => {
    if (!dxfModalDrag) return;
    const onMove = (event: globalThis.MouseEvent) => {
      setDxfModalPosition({
        x: dxfModalDrag.originX + event.clientX - dxfModalDrag.startX,
        y: dxfModalDrag.originY + event.clientY - dxfModalDrag.startY,
      });
    };
    const onUp = () => setDxfModalDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dxfModalDrag]);

  useEffect(() => {
    if (!dxfModalResize) return;
    const onMove = (event: globalThis.MouseEvent) => {
      const maxWidth = Math.max(620, window.innerWidth - dxfModalResize.originX - 8);
      const maxHeight = Math.max(420, window.innerHeight - dxfModalResize.originY - 8);
      setDxfModalSize({
        width: dxfModalResize.edge === 'bottom'
          ? dxfModalResize.originWidth
          : Math.min(maxWidth, Math.max(620, dxfModalResize.originWidth + event.clientX - dxfModalResize.startX)),
        height: dxfModalResize.edge === 'right'
          ? dxfModalResize.originHeight
          : Math.min(maxHeight, Math.max(420, dxfModalResize.originHeight + event.clientY - dxfModalResize.startY)),
      });
    };
    const onUp = () => setDxfModalResize(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dxfModalResize]);

  useEffect(() => {
    if (!dxfNotice) return;
    const timeout = window.setTimeout(() => setDxfNotice(''), 2800);
    return () => window.clearTimeout(timeout);
  }, [dxfNotice]);

  const updateDetail = (patch: Partial<DetailDraft>) => setDetail((prev) => {
    const kindDefaults = patch.kind ? defaultsForKind(patch.kind, prev.kind) : {};
    const next = { ...prev, ...kindDefaults, ...patch };
    if (patch.edgeProfiles) {
      const edgeSides = new Set(Object.keys(patch.edgeProfiles).filter((side) => patch.edgeProfiles?.[side]));
      next.thickening = { ...next.thickening, sides: next.thickening.sides.filter((side) => !edgeSides.has(side)) };
      next.fold = { ...next.fold, sides: next.fold.sides.filter((side) => !edgeSides.has(side)) };
      next.thickening.enabled = next.thickening.sides.length > 0;
      next.fold.enabled = next.fold.sides.length > 0;
    } else if (patch.thickening || patch.fold) {
      const featureSides = new Set([...(patch.thickening?.sides ?? []), ...(patch.fold?.sides ?? [])]);
      if (featureSides.size) {
        next.edgeProfiles = Object.fromEntries(Object.entries(next.edgeProfiles).filter(([side]) => !featureSides.has(side)));
      }
    }
    return next;
  });

  const validateDetail = () => {
    if (detail.kind === 'u' && detail.innerCutOffset + detail.innerCutWidth > detail.width) {
      return 'Для П-подібної деталі відступ до вирізу + ширина вирізу не можуть перевищувати ширину деталі.';
    }
    if (detail.kind === 'l' && detail.innerHorizontal >= detail.outerWidth) {
      return 'Для Г-подібної деталі внутрішня горизонталь має бути меншою за зовнішню ширину.';
    }
    if (detail.kind === 'l' && detail.innerVertical >= detail.outerHeight) {
      return 'Для Г-подібної деталі внутрішня вертикаль має бути меншою за зовнішню висоту.';
    }
    return '';
  };

  const closeDetailModal = () => {
    setDetailOpen(false);
    clearEditDetail();
    setDxfPreview(null);
  };

  const closeDxfPreview = () => {
    setDxfBinding(null);
    setDxfBlockMode(false);
    setDxfBlockDraft(null);
    setDxfBlockEditorIds(null);
    setDxfSelectedContourIds([]);
    setDxfPreviewDrag(null);
    setDxfPreview(null);
    setDxfLayers([]);
    setSelectedDxfLayers([]);
    setDxfLayersOpen(false);
    setDxfZoom(1);
    setDxfNotice('');
    setApprovalDxfContext(null);
  };

  const closeDxfBlockEditor = () => {
    setDxfBinding(null);
    setDxfSelectedContourIds([]);
    setDxfPreviewDrag(null);
    setDxfBlockEditorIds(null);
  };

  const approvalStableCanvasSizeForItems = (items: ApprovalImportItem[]) => {
    const contours = items.filter(approvalItemHasExtractedGeometry).map(approvalItemToDxfContour);
    const size = dxfCanvasSize(contours);
    return {
      width: Math.max(1400, size.width),
      height: Math.max(900, size.height),
    };
  };

  const closeApprovalPreview = () => {
    setApprovalPreview(null);
    setApprovalJointTool(null);
    setApprovalJointDraft(null);
    setApprovalJointHover(null);
    setApprovalJointNotice('');
  };


  const onApprovalFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      console.warn('[APPROVAL_IMPORT_V2_REACHED]', {
        fileName: file.name,
        timestamp: new Date().toISOString(),
      });
      setIsImporting(true);
      const parsed = await parseApprovalFile(file);
      setIsImporting(false);
      if (!parsed.items.length) {
        setError('У бланку погодження не знайдено таблиць виробів для імпорту.');
        return;
      }
      setError('');
      setApprovalPreview(parsed);
      setApprovalPreviewCanvasSize(approvalStableCanvasSizeForItems(parsed.items));
    } catch (reason) {
      setIsImporting(false);
      console.error('[APPROVAL_IMPORT_ERROR]', reason);
      setError(`Не вдалося прочитати бланк погодження: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  };

  const updateApprovalPreview = (patch: Partial<ApprovalImportPreview>) => {
    setApprovalPreview((current) => current ? { ...current, ...patch } : current);
  };

  const downloadApprovalDebugJson = () => {
    if (!approvalPreview) return;
    const blob = new Blob([JSON.stringify(approvalPreviewDebugDumpFromState(approvalPreview), null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${approvalPreview.fileName.replace(/\.[^.]+$/u, '')}-approval-import-debug.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const copyApprovalDebugSummary = async () => {
    if (!approvalPreview) return;
    const summary = approvalPreviewDebugSummary(approvalPreview);
    try {
      await navigator.clipboard?.writeText(summary);
      setError('');
    } catch {
      setError(summary);
    }
  };

  const updateApprovalItem = (id: string, patch: Partial<ApprovalImportItem>) => {
    setApprovalPreview((current) => {
      if (!current) return current;
      const nextItems = current.items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        return applyApprovalItemDimensionsToPoints(next);
      });
      return { ...current, items: layoutItems(nextItems) as ApprovalImportItem[] };
    });
  };

  const deleteApprovalItem = (id: string) => {
    if (approvalJointTool?.itemId === id) {
      setApprovalJointTool(null);
      setApprovalJointDraft(null);
      setApprovalJointHover(null);
    }
    setApprovalPreview((current) => {
      if (!current) return current;
      const items = current.items.filter((item) => item.id !== id);
      return items.length ? { ...current, items } : null;
    });
  };

  const commitApprovalJoint = (itemId: string, joint: { start: DxfPoint; end: DxfPoint }) => {
    setApprovalPreview((current) => {
      if (!current) return null;
      return {
        ...current,
        items: current.items.map((item) => {
          if (item.id !== itemId) return item;
          const nextJoints = [...(item.joints ?? [])];
          const newJoint = {
            id: uid('joint'),
            type: approvalJointTool?.mode ?? 'custom',
            start: joint.start,
            end: joint.end,
            source: 'manual' as const,
          };
          nextJoints.push(newJoint);
          const patch: Partial<ApprovalImportItem> = {
            joints: nextJoints,
            importStatus: 'Needs review',
          };
          return { ...item, ...patch };
        }),
      };
    });
    setApprovalSplitItemIds((prev) => [...new Set([...prev, itemId])]);
    setApprovalJointDraft(null);
    setApprovalJointHover(null);
    setApprovalJointNotice('Стик додано.');
  };

  const updateApprovalJointHover = (itemId: string, globalPoint: DxfPoint) => {
    if (!approvalJointTool || approvalJointTool.itemId !== itemId || !approvalPreview) return;
    const item = approvalPreview.items.find((i) => i.id === itemId);
    if (!item) return;
    if (approvalJointTool.mode === 'pointToPoint') {
      const snap = nearestApprovalContourPoint(item, globalPoint);
      if (!snap) {
        setApprovalJointHover(null);
        return;
      }
      const draftPoint = approvalJointDraft?.itemId === itemId ? approvalJointDraft.point : null;
      let previewJoint: { start: DxfPoint; end: DxfPoint } | undefined;
      if (draftPoint) {
        previewJoint = { start: draftPoint, end: snap.point };
      }
      setApprovalJointHover({
        itemId,
        point: snap.point,
        edgeStart: snap.edgeStart,
        edgeEnd: snap.edgeEnd,
        snappedToCorner: snap.snappedToCorner,
        previewJoint,
      });
      return;
    }
    const result = approvalJointSegmentForPoint(item, globalPoint, approvalJointTool.mode);
    if (result.error) {
      setApprovalJointNotice(result.error);
      setApprovalJointHover(null);
      return;
    }
    if (result.snap && result.joint) {
      setApprovalJointHover({
        itemId,
        point: result.snap.point,
        edgeStart: result.snap.edgeStart,
        edgeEnd: result.snap.edgeEnd,
        snappedToCorner: result.snap.snappedToCorner,
        previewJoint: result.joint,
      });
      setApprovalJointNotice('');
    }
  };

  const createApprovalJointAtPoint = (itemId: string, globalPoint: DxfPoint) => {
    if (!approvalJointTool || approvalJointTool.itemId !== itemId || !approvalPreview) return;
    const item = approvalPreview.items.find((i) => i.id === itemId);
    if (!item) return;
    if (approvalJointTool.mode === 'pointToPoint') {
      const snap = nearestApprovalContourPoint(item, globalPoint);
      if (!snap) return;
      if (approvalJointDraft?.itemId === itemId) {
        const start = approvalJointDraft.point;
        const end = snap.point;
        if (Math.hypot(end.x - start.x, end.y - start.y) < 2) {
          setApprovalJointNotice('Стик не може бути нульової довжини.');
          return;
        }
        if (!approvalCustomJointIsInside(item, start, end)) {
          setApprovalJointNotice('Стик «від точки до точки» має повністю проходити всередині деталі та з’єднувати протилежні сторони.');
          return;
        }
        commitApprovalJoint(itemId, { start, end });
      } else {
        setApprovalJointDraft({ itemId, point: snap.point });
        setApprovalJointNotice('Оберіть другу точку на контурі для завершення стику.');
      }
      return;
    }
    const result = approvalJointSegmentForPoint(item, globalPoint, approvalJointTool.mode);
    if (result.error) {
      setApprovalJointNotice(result.error);
      return;
    }
    if (result.joint) {
      commitApprovalJoint(itemId, result.joint);
    }
  };

  const deleteApprovalJoints = (itemId: string) => {
    setApprovalPreview((current) => {
      if (!current) return null;
      return {
        ...current,
        items: current.items.map((item) => {
          if (item.id !== itemId) return item;
          return {
            ...item,
            joints: [],
            importStatus: 'Needs review',
          };
        }),
      };
    });
    setApprovalSplitItemIds((prev) => prev.filter((id) => id !== itemId));
    setApprovalJointNotice('Всі стики на деталі видалено.');
  };

  const approvalItemGeometry = (item: ApprovalImportItem): Detail['geometry'] => {
    if (item.customPoints?.length) {
      return {
        width: item.width,
        height: item.height,
        customPoints: item.customPoints,
        customHoles: item.customHoles ?? [],
        sideSegments: item.sideSegments,
      };
    }
    throw new Error('Approval form contour is missing. Template fallback disabled.');
  };

  const openApprovalBindingPreview = () => {
    if (!approvalPreview?.items.length) return;
    const contours: DxfPreviewContour[] = approvalPreview.items.map((item) => ({
      id: item.id,
      name: item.name,
      width: item.width,
      height: item.height,
      points: approvalItemPoints(item),
      holes: item.customHoles ?? [],
      sideSegments: item.sideSegments,
      sourceX: item.sourceX,
      sourceY: item.sourceY,
      groupId: `Бланк група ${item.sourceProductNumber}`,
      layer: 'Бланк погодження',
      edgeProfiles: item.edgeProfiles,
      type: item.type,
      shape: item.shape,
      role: 'detail',
      parentDetailId: undefined,
      parentDetailSide: undefined,
      elementSide: undefined,
      parentAnchor: 'center',
      elementAnchor: 'center',
    }));
    setApprovalDxfContext(approvalPreview);
    setDxfBinding(null);
    setDxfBlockMode(false);
    setDxfBlockDraft(null);
    setDxfBlockEditorIds(null);
    setDxfSelectedContourIds([]);
    setDxfPreviewDrag(null);
    setDxfLayers(['Бланк погодження']);
    setSelectedDxfLayers(['Бланк погодження']);
    setDxfLayersOpen(false);
    setDxfZoom(1);
    setDxfNotice('Контури бланку відкрито у вікні прив’язок.');
    setDxfPreviewCanvasSize(dxfCanvasSize(contours));
    setDxfPreview(contours);
    setApprovalPreview(null);
  };

  const importApprovalPreview = () => {
    if (!approvalPreview?.items.length) return;
    const importableItems = approvalPreview.items.filter(item => approvalItemHasExtractedGeometry(item) && item.width > 0 && item.height > 0);
    if (!importableItems.length) {
      setError('Geometry was not extracted. This product cannot be imported.');
      return;
    }
    updateProjectHeader({
      orderNumber: approvalPreview.orderNumber,
      customer: approvalPreview.customer,
    });
    // Матеріал і декор із бланку більше нікуди не кладемо: ручної форми
    // слебу немає, а сам слеб береться з каталогу за артикулом.

    // P1.2 — розбиття позначених деталей по стику (no-op, якщо нічого не позначено)
    const importedItems = importableItems.flatMap((item) => (
      approvalSplitItemIds.includes(item.id) ? splitApprovalItemByJoint(item) : [item]
    ));

    // P1.1 — групування: спільний origin для деталей одного виробу
    const approvalGroupKey = (item: ApprovalImportItem) =>
      `Бланк ${approvalPreview.orderNumber || approvalPreview.fileName} виріб ${item.sourceProductNumber}`;
    const approvalGroupOrigins = new Map<string, { x: number; y: number }>();
    importedItems.forEach((item) => {
      const key = approvalGroupKey(item);
      const origin = approvalGroupOrigins.get(key);
      approvalGroupOrigins.set(key, {
        x: Math.min(origin?.x ?? Infinity, item.sourceX),
        y: Math.min(origin?.y ?? Infinity, item.sourceY),
      });
    });

    const imported = importedItems.map((item) => {
      const groupKey = approvalGroupKey(item);
      const groupOrigin = approvalGroupOrigins.get(groupKey) ?? { x: item.sourceX, y: item.sourceY };
      return {
        id: uid('detail'),
        type: item.type,
        shape: item.shape,
        quantity: item.quantity,
        thickness: approvalPreview.thickness || detail.thickness,
        label: item.name,
        thickening: item.thickening,
        fold: item.fold,
        edgeProfiles: item.edgeProfiles,
        importGroupId: groupKey,
        importOffsetX: item.sourceX - groupOrigin.x,
        importOffsetY: item.sourceY - groupOrigin.y,
        geometry: approvalItemGeometry(item),
      } satisfies Detail;
    });

    addDetails(imported);
    closeApprovalPreview();
  };

  const addDetailClick = () => {
    const validation = validateDetail();
    if (validation) {
      setError(validation);
      return;
    }
    setError('');

    const shape = isImportedDetailEdit && editingDetail ? editingDetail.shape : currentDesign.shape;
    const diameter = detail.circleSizeMode === 'radius' ? detail.diameter * 2 : detail.diameter;
    const geometry: Detail['geometry'] = isImportedDetailEdit && editingDetail
      ? editingDetail.geometry
      : shape === SHAPE_RECT
      ? {
        width: detail.width,
        height: detail.height,
        ...(detail.kind === 'sink_rect' ? { sinkKind: 'rect' as const, innerVertical: detail.innerVertical } : {}),
        ...(detail.kind === 'sink_slot' ? { sinkKind: 'slot' as const, innerVertical: detail.innerVertical } : {}),
      }
      : shape === SHAPE_L
        ? {
          outerWidth: detail.outerWidth,
          outerHeight: detail.outerHeight,
          innerHorizontal: detail.innerHorizontal,
          innerVertical: detail.innerVertical,
          // Ліва Г — та сама геометрія рушія, інша орієнтація вирізу
          cornerOrientation: detail.mirrorL ? 'BL' as const : 'BR' as const,
          wholeDetail: detail.wholeDetail && !detail.jointDirection,
          jointDirection: detail.jointDirection,
        }
        : shape === SHAPE_U
          ? {
            width: detail.width,
            height: detail.height,
            innerCutWidth: detail.innerCutWidth,
            innerCutDepth: detail.innerCutDepth,
            innerCutOffset: detail.innerCutOffset,
            innerCutSide: detail.innerCutSide,
            wholeDetail: detail.wholeDetail
              && !detail.jointOmegaDirection
              && !detail.jointLambdaDirection,
            jointOmegaDirection: detail.jointOmegaDirection,
            jointLambdaDirection: detail.jointLambdaDirection,
          }
          : shape === SHAPE_CIRCLE
            ? { diameter }
            : { ellipseWidth: detail.ellipseWidth, ellipseHeight: detail.ellipseHeight };

    const item: Detail = {
      ...(editingDetail ?? {}),
      id: editingDetail?.id ?? uid('detail'),
      type: detail.type,
      shape,
      quantity: detail.quantity,
      thickness: detail.thickness,
      geometry,
      label: editingDetail?.label,
      thickening: showEdges ? detail.thickening : undefined,
      fold: showEdges ? detail.fold : undefined,
      edgeProfiles: detail.edgeProfiles,
    };

    if (editingDetail) updateDetailRecord(editingDetail.id, item);
    else addDetail(item);
    closeDetailModal();
  };

  const setType = (type: DetailType) => {
    const nextDesigns = designsForType(type, isAdminUnlocked, detail.kind);
    setDetail((prev) => ({
      ...prev,
      type,
      ...(() => {
        const kind = nextDesigns.some((item) => item.kind === prev.kind) ? prev.kind : nextDesigns[0].kind;
        return { ...defaultsForKind(kind, prev.kind), kind };
      })(),
    }));
  };

  const onDxfFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (/\.dwg$/i.test(file.name)) {
      setError('DWG потребує попереднього перетворення в DXF для браузерного імпорту.');
      return;
    }
    const text = await file.text();
    const parsed = parseDxfContours(text);
    if (!parsed.contours.length) {
      setError('У DXF не знайдено закритих контурів для імпорту.');
      return;
    }
    setError('');
    setDxfBinding(null);
    setDxfBlockMode(false);
    setDxfBlockDraft(null);
    setDxfBlockEditorIds(null);
    setDxfSelectedContourIds([]);
    setDxfPreviewDrag(null);
    setDxfLayers(parsed.layers);
    setSelectedDxfLayers(parsed.layers);
    setDxfLayersOpen(false);
    setDxfZoom(1);
    const preview: DxfPreviewContour[] = parsed.contours.map((contour, index) => {
      const rounded = {
        width: Math.round(contour.width),
        height: Math.round(contour.height),
        points: contour.points,
        holes: contour.holes,
      };
      const role = inferDxfRole(rounded, contour.suggestedName);
      const type = inferDxfType(rounded, contour.suggestedName);
      const roleLabel = ui(DXF_ROLE_LABELS[role]);
      return {
        id: uid('dxf'),
        name: contour.suggestedName || (role === 'detail' ? `${ui(type)} ${index + 1}` : `${roleLabel} ${index + 1}`),
        ...rounded,
        sourceX: contour.sourceX,
        sourceY: contour.sourceY,
        groupId: contour.groupId,
        layer: contour.layer,
        edgeProfiles: contour.suggestedEdgeProfile && contour.suggestedEdgeSide
          ? { [contour.suggestedEdgeSide]: contour.suggestedEdgeProfile }
          : {},
        type,
        shape: inferDxfShape(rounded),
        role,
        parentDetailId: undefined,
        parentDetailSide: undefined,
        elementSide: undefined,
        parentAnchor: 'center',
        elementAnchor: 'center',
      };
    });
    setDxfPreviewCanvasSize(dxfCanvasSize(preview));
    setDxfPreview(preview);
  };

  const updateDxfPreviewItem = (id: string, patch: Partial<DxfPreviewContour>) => {
    setDxfPreview((items) => items?.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };
      if (patch.parentDetailId === '') {
        next.parentDetailId = undefined;
        next.parentDetailSide = undefined;
        next.elementSide = undefined;
        next.parentAnchor = undefined;
        next.elementAnchor = undefined;
      }
      return next;
    }) ?? null);
  };

  const updateDxfEdgeProfiles = (id: string, edgeProfiles: EdgeProfileSelection) => {
    const edgeSides = new Set(Object.keys(edgeProfiles).filter((side) => edgeProfiles[side]));
    setDxfPreview((items) => items?.map((item) => {
      if (item.id === id) return { ...item, edgeProfiles };
      if (
        item.role !== 'detail'
        && item.parentDetailId === id
        && item.parentDetailSide
        && edgeSides.has(item.parentDetailSide)
      ) {
        return {
          ...item,
          parentDetailId: undefined,
          parentDetailSide: undefined,
          elementSide: undefined,
          parentAnchor: undefined,
          elementAnchor: undefined,
        };
      }
      return item;
    }) ?? null);
  };

  const deleteDxfPreviewItem = (id: string) => {
    if (dxfBinding?.parentDetailId === id || dxfBinding?.elementId === id) setDxfBinding(null);
    setDxfPreview((items) => {
      const next = items?.filter((item) => item.id !== id) ?? null;
      return next?.length ? next : null;
    });
  };

  const importDxfPreview = () => {
    if (!visibleDxfPreview.length) return;
    const approvalContext = approvalDxfContext;
    if (approvalContext) {
      updateProjectHeader({
        orderNumber: approvalContext.orderNumber,
        customer: approvalContext.customer,
      });
    }
    const approvalItemsById = new Map(approvalContext?.items.map((item) => [item.id, item]) ?? []);
    const importedIds = new Map(visibleDxfPreview.map((contour) => [contour.id, uid('detail')]));
    const groupOrigins = new Map<string, { x: number; y: number }>();
    visibleDxfPreview.forEach((contour) => {
      const origin = groupOrigins.get(contour.groupId);
      groupOrigins.set(contour.groupId, {
        x: Math.min(origin?.x ?? Infinity, contour.sourceX),
        y: Math.min(origin?.y ?? Infinity, contour.sourceY),
      });
    });
    const imported = visibleDxfPreview.map((contour, index) => {
      const parent = contour.parentDetailId ? visibleDxfPreview.find((item) => item.id === contour.parentDetailId) : undefined;
      const importedParentId = parent ? importedIds.get(parent.id) : undefined;
      const groupOrigin = groupOrigins.get(contour.groupId) ?? { x: 0, y: 0 };
      const approvalItem = approvalItemsById.get(contour.id);
      const label = contour.name.trim() || (contour.role === 'detail'
        ? `${ui(contour.type)} ${index + 1}`
        : `${ui(DXF_ROLE_LABELS[contour.role])} ${parent?.name || ''}`.trim());
      return {
        id: importedIds.get(contour.id) ?? uid('detail'),
        type: contour.type,
        shape: contour.shape,
        quantity: 1,
        thickness: approvalContext?.thickness || detail.thickness,
        label,
        thickening: approvalItem?.thickening,
        fold: approvalItem?.fold,
        importRole: contour.role,
        parentDetailId: importedParentId,
        parentDetailSide: importedParentId ? contour.parentDetailSide : undefined,
        elementSide: importedParentId ? contour.elementSide : undefined,
        parentAnchor: importedParentId ? contour.parentAnchor ?? 'center' : undefined,
        elementAnchor: importedParentId ? contour.elementAnchor ?? 'center' : undefined,
        importGroupId: contour.groupId,
        importOffsetX: contour.sourceX - groupOrigin.x,
        importOffsetY: contour.sourceY - groupOrigin.y,
        edgeProfiles: Object.keys(contour.edgeProfiles).length ? contour.edgeProfiles : approvalItem?.edgeProfiles,
        geometry: {
          width: contour.width,
          height: contour.height,
          customPoints: contour.points,
          customHoles: contour.holes,
          sideSegments: contour.sideSegments,
        },
      } satisfies Detail;
    });
    addDetails(imported);
    closeDxfPreview();
  };

  const dxfPreviewGroups = [...new Set(visibleDxfPreview.map((contour) => contour.groupId))];
  const dxfBindingHint = dxfBinding && {
    detail: 'Клікніть по першому контуру.',
    element: 'Клікніть по другому контуру.',
    detailSide: 'Клікніть по стороні першого контуру.',
    elementSide: 'Клікніть по стороні другого контуру, якою він примикає.',
    detailAnchor: 'Оберіть опорну точку на стороні першого контуру.',
    elementAnchor: 'Оберіть опорну точку на стороні другого контуру для завершення.',
  }[dxfBinding.step];

  const selectDxfBindingContour = (contour: DxfPreviewContour) => {
    if (!dxfBinding) return;
    if (dxfBinding.step === 'detail') {
      setDxfBinding({ step: 'element', parentDetailId: contour.id });
    } else if (dxfBinding.step === 'element' && contour.id !== dxfBinding.parentDetailId) {
      setDxfBinding({ ...dxfBinding, step: 'detailSide', elementId: contour.id });
    }
  };

  const selectDxfBindingSide = (contourId: string, side: string) => {
    if (!dxfBinding) return;
    if (dxfBinding.step === 'detailSide' && contourId === dxfBinding.parentDetailId) {
      setDxfBinding({ ...dxfBinding, parentDetailSide: side, step: 'elementSide' });
    } else if (dxfBinding.step === 'elementSide' && contourId === dxfBinding.elementId) {
      setDxfBinding({ ...dxfBinding, elementSide: side, step: 'detailAnchor' });
    }
  };

  const selectDxfBindingAnchor = (anchor: BindingAnchor) => {
    if (!dxfBinding) return;
    if (dxfBinding.step === 'detailAnchor') {
      setDxfBinding({ ...dxfBinding, parentAnchor: anchor, step: 'elementAnchor' });
      return;
    }
    if (
      dxfBinding.step === 'elementAnchor'
      && dxfBinding.elementId
      && dxfBinding.parentDetailId
      && dxfBinding.parentDetailSide
      && dxfBinding.elementSide
    ) {
      const parent = dxfPreview?.find((contour) => contour.id === dxfBinding.parentDetailId);
      const element = dxfPreview?.find((contour) => contour.id === dxfBinding.elementId);
      const rigidGroupId = parent && element && (parent.role !== 'detail' || element.role === 'detail')
        ? `DXF блок ${Date.now()}`
        : undefined;
      setDxfPreview((items) => items?.map((item) => {
        if (item.id === dxfBinding.elementId) {
          return {
            ...item,
            ...(rigidGroupId ? { groupId: rigidGroupId } : {}),
            parentDetailId: dxfBinding.parentDetailId,
            parentDetailSide: dxfBinding.parentDetailSide,
            elementSide: dxfBinding.elementSide,
            parentAnchor: dxfBinding.parentAnchor ?? 'center',
            elementAnchor: anchor,
          };
        }
        if (rigidGroupId && item.id === dxfBinding.parentDetailId) return { ...item, groupId: rigidGroupId };
        return item;
      }) ?? null);
      if (parent?.edgeProfiles[dxfBinding.parentDetailSide]) {
        const edgeProfiles = { ...parent.edgeProfiles };
        delete edgeProfiles[dxfBinding.parentDetailSide];
        updateDxfPreviewItem(parent.id, { edgeProfiles });
      }
      setDxfBinding(null);
      setDxfNotice('Прив’язку створено.');
    }
  };

  const editDxfBinding = (elementId: string) => {
    const element = dxfPreview?.find((contour) => contour.id === elementId);
    if (!element?.parentDetailId) return;
    setDxfSelectedContourIds([element.parentDetailId, element.id]);
    setDxfBinding({
      step: 'detailSide',
      parentDetailId: element.parentDetailId,
      elementId: element.id,
      parentDetailSide: element.parentDetailSide,
      elementSide: element.elementSide,
      parentAnchor: element.parentAnchor,
    });
  };

  const deleteDxfBinding = (elementId: string) => {
    setDxfPreview((items) => items?.map((item) => item.id === elementId ? {
      ...item,
      parentDetailId: undefined,
      parentDetailSide: undefined,
      elementSide: undefined,
      parentAnchor: undefined,
      elementAnchor: undefined,
    } : item) ?? null);
    setDxfBinding(null);
    setDxfNotice('Прив’язку видалено.');
  };

  const toggleDxfLayer = (layer: string) => {
    setDxfBinding(null);
    setDxfBlockDraft(null);
    setDxfSelectedContourIds([]);
    setDxfPreviewDrag(null);
    setSelectedDxfLayers((current) => current.includes(layer)
      ? current.filter((item) => item !== layer)
      : [...current, layer]);
  };

  const onDxfOverviewWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const viewport = event.currentTarget;
    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const nextZoom = Math.min(6, Math.max(0.01, dxfZoom * (event.deltaY < 0 ? 1.16 : 1 / 1.16)));
    const ratio = nextZoom / dxfZoom;
    const nextLeft = (viewport.scrollLeft + pointerX) * ratio - pointerX;
    const nextTop = (viewport.scrollTop + pointerY) * ratio - pointerY;
    setDxfZoom(nextZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = nextLeft;
      viewport.scrollTop = nextTop;
    });
  };

  const fitDxfPreviewToWindow = () => {
    const viewport = dxfOverviewScrollRef.current;
    const bounds = dxfViewportForContours(visibleDxfPreview);
    if (!viewport || !bounds) return;
    const viewPad = Math.max(180, Math.max(dxfPreviewCanvasSize.width, dxfPreviewCanvasSize.height) * 0.08);
    const availableWidth = Math.max(240, viewport.clientWidth - 36);
    const availableHeight = Math.max(180, viewport.clientHeight - 36);
    const nextZoom = Math.min(6, Math.max(
      0.01,
      Math.min(availableWidth / Math.max(1, bounds.width + 120), availableHeight / Math.max(1, bounds.height + 120)),
    ));
    setDxfZoom(nextZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, (bounds.x + viewPad + bounds.width / 2) * nextZoom - viewport.clientWidth / 2);
      viewport.scrollTop = Math.max(0, (bounds.y + viewPad + bounds.height / 2) * nextZoom - viewport.clientHeight / 2);
    });
  };

  const fitApprovalPreviewToWindow = () => {
    const viewport = approvalOverviewScrollRef.current;
    const bounds = dxfViewportForContours(approvalPreviewContours);
    if (!viewport || !bounds) return;
    const viewPad = Math.max(180, Math.max(approvalPreviewCanvasSize.width, approvalPreviewCanvasSize.height) * 0.08);
    const availableWidth = Math.max(240, viewport.clientWidth - 36);
    const availableHeight = Math.max(180, viewport.clientHeight - 36);
    const nextZoom = Math.min(6, Math.max(
      0.01,
      Math.min(availableWidth / Math.max(1, bounds.width + 120), availableHeight / Math.max(1, bounds.height + 120)),
    ));
    setApprovalZoom(nextZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, (bounds.x + viewPad + bounds.width / 2) * nextZoom - viewport.clientWidth / 2);
      viewport.scrollTop = Math.max(0, (bounds.y + viewPad + bounds.height / 2) * nextZoom - viewport.clientHeight / 2);
    });
  };

  const beginDxfPreviewDrag = (contour: DxfPreviewContour, point: DxfPoint, additive: boolean) => {
    const selected = dxfSelectedContourIds.includes(contour.id)
      ? dxfSelectedContourIds
      : additive ? [...dxfSelectedContourIds, contour.id] : [contour.id];
    const selectedSet = new Set(selected);
    setDxfSelectedContourIds(selected);
    setDxfPreviewDrag({
      startX: point.x,
      startY: point.y,
      contourIds: selected,
      origins: Object.fromEntries((dxfPreview ?? [])
        .filter((item) => selectedSet.has(item.id))
        .map((item) => [item.id, { x: item.sourceX, y: item.sourceY }])),
    });
  };

  const moveDxfPreviewSelection = (point: DxfPoint) => {
    if (!dxfPreviewDrag) return;
    const selectedSet = new Set(dxfPreviewDrag.contourIds);
    const selected = (dxfPreview ?? []).filter((contour) => selectedSet.has(contour.id));
    if (!selected.length) return;
    const minOriginX = Math.min(...selected.map((contour) => dxfPreviewDrag.origins[contour.id]?.x ?? contour.sourceX));
    const minOriginY = Math.min(...selected.map((contour) => dxfPreviewDrag.origins[contour.id]?.y ?? contour.sourceY));
    const maxOriginX = Math.max(...selected.map((contour) => (dxfPreviewDrag.origins[contour.id]?.x ?? contour.sourceX) + contour.width));
    const maxOriginY = Math.max(...selected.map((contour) => (dxfPreviewDrag.origins[contour.id]?.y ?? contour.sourceY) + contour.height));
    const rawDx = point.x - dxfPreviewDrag.startX;
    const rawDy = point.y - dxfPreviewDrag.startY;
    const dx = Math.max(-minOriginX, Math.min(dxfPreviewCanvasSize.width - maxOriginX, rawDx));
    const dy = Math.max(-minOriginY, Math.min(dxfPreviewCanvasSize.height - maxOriginY, rawDy));
    setDxfPreview((items) => items?.map((item) => {
      const origin = dxfPreviewDrag.origins[item.id];
      return origin ? { ...item, sourceX: origin.x + dx, sourceY: origin.y + dy } : item;
    }) ?? null);
  };

  const snapDxfPreviewSelection = (contourIds: string[]) => {
    const selectedSet = new Set(contourIds);
    setDxfPreview((items) => {
      if (!items) return null;
      const selectedBounds = dxfSelectionBounds(items, contourIds);
      const other = items.filter((contour) => !selectedSet.has(contour.id));
      if (!selectedBounds || !other.length) return items;
      const threshold = 20 / Math.max(dxfZoom, 0.35);
      const xCandidates = other
        .filter((contour) => contour.sourceY <= selectedBounds.maxY && contour.sourceY + contour.height >= selectedBounds.minY)
        .flatMap((contour) => [
          contour.sourceX - selectedBounds.maxX,
          contour.sourceX + contour.width - selectedBounds.minX,
        ])
        .filter((offset) => Math.abs(offset) <= threshold);
      const yCandidates = other
        .filter((contour) => contour.sourceX <= selectedBounds.maxX && contour.sourceX + contour.width >= selectedBounds.minX)
        .flatMap((contour) => [
          contour.sourceY - selectedBounds.maxY,
          contour.sourceY + contour.height - selectedBounds.minY,
        ])
        .filter((offset) => Math.abs(offset) <= threshold);
      const dx = xCandidates.sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? 0;
      const dy = yCandidates.sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? 0;
      if (!dx && !dy) return items;
      return items.map((item) => selectedSet.has(item.id)
        ? { ...item, sourceX: item.sourceX + dx, sourceY: item.sourceY + dy }
        : item);
    });
  };

  const finishDxfPreviewDrag = () => {
    if (!dxfPreviewDrag) return;
    snapDxfPreviewSelection(dxfPreviewDrag.contourIds);
    setDxfPreviewDrag(null);
  };

  const rotateDxfPreviewSelection = (contour: DxfPreviewContour) => {
    const contourIds = dxfSelectedContourIds.includes(contour.id) ? dxfSelectedContourIds : [contour.id];
    const bounds = dxfSelectionBounds(dxfPreview ?? [], contourIds);
    if (!bounds) return;
    const selectedSet = new Set(contourIds);
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    setDxfSelectedContourIds(contourIds);
    setDxfPreview((items) => items?.map((item) => selectedSet.has(item.id) ? rotateDxfPreviewContour(item, center) : item) ?? null);
  };

  const beginDxfModalResize = (event: React.MouseEvent<HTMLDivElement>, edge: DxfModalResize['edge']) => {
    event.preventDefault();
    const modal = event.currentTarget.parentElement as HTMLElement;
    const rect = modal.getBoundingClientRect();
    setDxfModalPosition((position) => position ?? { x: rect.left, y: rect.top });
    setDxfModalSize({ width: rect.width, height: rect.height });
    setDxfModalResize({
      edge,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      originWidth: rect.width,
      originHeight: rect.height,
    });
  };

  const finishDxfBlockSelection = () => {
    if (!dxfBlockDraft) return;
    const minX = Math.min(dxfBlockDraft.startX, dxfBlockDraft.currentX);
    const minY = Math.min(dxfBlockDraft.startY, dxfBlockDraft.currentY);
    const maxX = Math.max(dxfBlockDraft.startX, dxfBlockDraft.currentX);
    const maxY = Math.max(dxfBlockDraft.startY, dxfBlockDraft.currentY);
    const selected = visibleDxfPreview.filter((contour) => (
      contour.sourceX >= minX
      && contour.sourceY >= minY
      && contour.sourceX + contour.width <= maxX
      && contour.sourceY + contour.height <= maxY
    ));
    const selectedIds = selected.map((contour) => contour.id);
    setDxfSelectedContourIds(selectedIds);
    if (selected.length > 1) {
      const blockId = `DXF блок ${Date.now()}`;
      const selectedSet = new Set(selectedIds);
      const selectedDetails = selected.filter((item) => item.role === 'detail');
      const inferredBindings = new Map(selected
        .filter((item) => item.role !== 'detail' && !item.parentDetailId)
        .map((item) => {
          const nearest = selectedDetails
            .map((parent) => ({ parent, binding: inferDxfBindingPair(parent, item) }))
            .filter((entry) => Boolean(entry.binding))
            .sort((a, b) => (a.binding?.score ?? Infinity) - (b.binding?.score ?? Infinity))[0];
          return [item.id, nearest] as const;
        })
        .filter((entry) => Boolean(entry[1]?.binding)));
      setDxfPreview((items) => items?.map((item) => {
        if (!selectedSet.has(item.id)) return item;
        const nearest = inferredBindings.get(item.id);
        if (!nearest?.binding) return { ...item, groupId: blockId };
        return {
          ...item,
          groupId: blockId,
          parentDetailId: nearest.parent.id,
          parentDetailSide: nearest.binding.parentDetailSide,
          elementSide: nearest.binding.elementSide,
          parentAnchor: nearest.binding.parentAnchor,
          elementAnchor: nearest.binding.elementAnchor,
        };
      }) ?? null);
      setDxfNotice(
        inferredBindings.size
          ? `Блокову прив’язку створено: ${selected.length} контури, підв’язано елементів: ${inferredBindings.size}.`
          : `Блокову прив’язку створено: ${selected.length} контури.`,
      );
      setDxfBlockEditorIds(selectedIds);
      setDxfSelectedContourIds([]);
    } else {
      setDxfNotice('Для блокової прив’язки обведіть щонайменше два контури.');
    }
    setDxfBlockDraft(null);
    setDxfBlockMode(false);
  };
  const approvalPreviewContours = useMemo(() => approvalPreview?.items.filter(approvalItemHasExtractedGeometry).map(approvalItemToDxfContour) ?? [], [approvalPreview]);
  const approvalPreviewOverlays = useMemo(() => {
    if (!approvalPreview) return [];
    const items = approvalPreview.items.filter(approvalItemHasExtractedGeometry);
    const regularOverlays = [
      ...items.flatMap(approvalFeatureOverlaysForItem),
      ...items.flatMap(approvalEdgeOverlaysForItem),
      ...items.flatMap(approvalJointOverlaysForItem),
    ];
    const toolOverlays = items.flatMap((item) =>
      approvalJointGuideOverlaysForItem(item, approvalJointTool, approvalJointHover, approvalJointDraft)
    );
    return [...regularOverlays, ...toolOverlays];
  }, [approvalPreview, approvalJointTool, approvalJointHover, approvalJointDraft]);

  // ResizeObserver removed to keep stable canvas size based on drawing bounding box

  useEffect(() => {
    if (dxfPreview && dxfPreview.length > 0) {
      const timer = setTimeout(() => {
        fitDxfPreviewToWindow();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [dxfPreview]);

  useEffect(() => {
    if (approvalPreview && approvalPreview.items.length > 0) {
      const timer = setTimeout(() => {
        fitApprovalPreviewToWindow();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [approvalPreview]);

  useEffect(() => {
    if (!approvalOverviewPanDrag || !approvalOverviewScrollRef.current) return;
    const viewport = approvalOverviewScrollRef.current;
    const onMove = (event: globalThis.MouseEvent) => {
      viewport.scrollLeft = approvalOverviewPanDrag.originX - (event.clientX - approvalOverviewPanDrag.startX);
      viewport.scrollTop = approvalOverviewPanDrag.originY - (event.clientY - approvalOverviewPanDrag.startY);
    };
    const onUp = () => setApprovalOverviewPanDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [approvalOverviewPanDrag]);

  const beginApprovalPreviewPan = (event: React.MouseEvent<SVGSVGElement>) => {
    const viewport = approvalOverviewScrollRef.current;
    if (!viewport) return;
    setApprovalOverviewPanDrag({
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.scrollLeft,
      originY: viewport.scrollTop,
      originWidth: 0,
      originHeight: 0,
    });
  };

  const onApprovalOverviewWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const viewport = approvalOverviewScrollRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const step = 0.15;
    const rawNextZoom = event.deltaY < 0 ? approvalZoom * (1 + step) : approvalZoom / (1 + step);
    const nextZoom = Math.max(0.01, Math.min(5, rawNextZoom));
    const ratio = nextZoom / approvalZoom;
    const nextLeft = (viewport.scrollLeft + pointerX) * ratio - pointerX;
    const nextTop = (viewport.scrollTop + pointerY) * ratio - pointerY;
    setApprovalZoom(nextZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = nextLeft;
      viewport.scrollTop = nextTop;
    });
  };

  const beginApprovalPreviewDrag = (contour: DxfPreviewContour, point: DxfPoint, additive: boolean) => {
    const selected = approvalSelectedItemIds.includes(contour.id)
      ? approvalSelectedItemIds
      : additive ? [...approvalSelectedItemIds, contour.id] : [contour.id];
    const selectedSet = new Set(selected);
    setApprovalSelectedItemIds(selected);
    setApprovalPreviewDrag({
      startX: point.x,
      startY: point.y,
      contourIds: selected,
      origins: Object.fromEntries((approvalPreview?.items ?? [])
        .filter((item) => selectedSet.has(item.id))
        .map((item) => [item.id, { x: item.sourceX, y: item.sourceY }])),
    });
  };

  const moveApprovalPreviewSelection = (point: DxfPoint) => {
    if (!approvalPreviewDrag) return;
    const dx = point.x - approvalPreviewDrag.startX;
    const dy = point.y - approvalPreviewDrag.startY;
    setApprovalPreview((prev) => prev ? {
      ...prev,
      items: prev.items.map((item) => {
        const origin = approvalPreviewDrag.origins[item.id];
        return origin ? { ...item, sourceX: origin.x + dx, sourceY: origin.y + dy } : item;
      })
    } : null);
  };

  const finishApprovalPreviewDrag = () => {
    setApprovalPreviewDrag(null);
  };

  const rotateApprovalPreviewSelection = (contour: DxfPreviewContour) => {
    const selectedSet = new Set(approvalSelectedItemIds.includes(contour.id) ? approvalSelectedItemIds : [contour.id]);
    const selectedContours = approvalPreviewContours.filter(c => selectedSet.has(c.id));
    if (!selectedContours.length) return;
    const bounds = dxfSelectionBounds(approvalPreviewContours, Array.from(selectedSet));
    if (!bounds) return;
    const center = { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 };
    setApprovalPreview((prev) => prev ? {
      ...prev,
      items: prev.items.map((item) => {
        if (!selectedSet.has(item.id)) return item;
        const c = approvalPreviewContours.find(c => c.id === item.id);
        if (!c) return item;
        const rotated = rotateDxfPreviewContour(c, center);
        return {
          ...item,
          sourceX: Math.round(rotated.sourceX),
          sourceY: Math.round(rotated.sourceY),
          width: Math.round(rotated.width),
          height: Math.round(rotated.height),
          customPoints: rotated.points,
          customHoles: rotated.holes,
          sideSegments: rotated.sideSegments,
        };
      })
    } : null);
  };

  const finishApprovalBlockSelection = () => {
    if (!approvalBlockDraft) return;
    const minX = Math.min(approvalBlockDraft.startX, approvalBlockDraft.currentX);
    const minY = Math.min(approvalBlockDraft.startY, approvalBlockDraft.currentY);
    const maxX = Math.max(approvalBlockDraft.startX, approvalBlockDraft.currentX);
    const maxY = Math.max(approvalBlockDraft.startY, approvalBlockDraft.currentY);
    const selected = approvalPreviewContours.filter((contour) => (
      contour.sourceX >= minX
      && contour.sourceY >= minY
      && contour.sourceX + contour.width <= maxX
      && contour.sourceY + contour.height <= maxY
    ));
    setApprovalSelectedItemIds(selected.map((contour) => contour.id));
    setApprovalBlockDraft(null);
    setApprovalBlockMode(false);
  };

  return (
    <section className="panel forms-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {(!activeTab || activeTab === 'slabs') && (
          /* Ні рамки, ні заголовка «Слеби»: вкладка вже називається так, і
             підпис над єдиною кнопкою нічого не додавав. Кнопка стоїть
             сама і виглядає як «Додати виріб» — це головна дія вкладки.
             Ручна форма замінена каталогом (інваріант 2.48: рівно один
             рядок переходу), ручного додавання немає з 25.08.2026 — слеб
             має нести артикул, інакше за ним нема чого спитати ціну. */
          <button
            type="button"
            className="primary-action detail-open-button"
            title="Додати слеб із каталогу"
            style={{ background: '#28a745', borderColor: '#28a745', width: compact ? undefined : '100%' }}
            onClick={() => setSlabCatalogOpen(true)}
          >
            {compact ? <Plus className="w-4 h-4" /> : 'Додати слеб'}
          </button>
        )}
        <SlabCatalogModal
          open={slabCatalogOpen}
          onClose={() => setSlabCatalogOpen(false)}
          onPick={addSlabFromCatalog}
          hasContragent={Boolean(project.quoteCalc?.contragentId)}
          /* Контрагент прорахунку — за ним 1С накладає знижку на ціну
             листа. Без нього ціна теж питається, але загальним прайсом. */
          contragentId={project.quoteCalc?.contragentId}
          /* Матеріал і виробник замикаються на першому слебі проєкту:
             у замовлення береться один матеріал і один виробник. */
          lockMaterial={project.slabs[0]?.material}
          lockManufacturer={project.slabs[0]?.manufacturer}
        />
        {(!activeTab || activeTab === 'details') && (
          <div className="detail-launcher form-zone" style={{ margin: 0 }}>
            {!compact && <h3>Деталі</h3>}
            {/* «Додати деталь» (сира деталь повз редактор виробу) — інструмент
                супер-адміна; звичайний менеджер працює через «Додати виріб» */}
            {isAdminUnlocked && (
              <button type="button" className="primary-action detail-open-button" title="Додати деталь (супер-адмін)" onClick={() => { clearEditDetail(); setDetail(createDraft()); setDetailOpen(true); }}>{compact ? <SquarePlus className="w-4 h-4" /> : 'Додати деталь'}</button>
            )}
            <button
              type="button"
              className="primary-action detail-open-button"
              style={{ marginTop: '8px', background: '#28a745', borderColor: '#28a745' }}
              onClick={() => { useUIStore.getState().setProductEditorSession({ subDetails: {}, activeDetailId: null } as any); }}
              title="Додати виріб"
            >
              {compact ? <Plus className="w-4 h-4" /> : 'Додати виріб'}
            </button>
            <button type="button" title="Імпортувати DXF" onClick={() => dxfInputRef.current?.click()}>{compact ? <FileUp className="w-4 h-4" /> : 'Імпортувати DXF'}</button>
            <button type="button" title="Імпортувати бланк погодження" disabled={isImporting} onClick={() => approvalInputRef.current?.click()}>
              {compact
                ? <ClipboardList className={`w-4 h-4 ${isImporting ? 'animate-pulse' : ''}`} />
                : (isImporting ? 'Обробка бланку (OCR)...' : 'Імпортувати бланк погодження')}
            </button>
            {isAdminUnlocked && (
              <button type="button" title="Імпортувати зі SketchUp" onClick={() => sketchupInputRef.current?.click()}>{compact ? <FileBox className="w-4 h-4" /> : 'Імпортувати зі SketchUp'}</button>
            )}
            <button type="button" title="Припуски" onClick={() => setAllowancesOpen(true)}>{compact ? <StretchHorizontal className="w-4 h-4" /> : 'Припуски'}</button>
            <input ref={dxfInputRef} type="file" accept=".dxf,.dwg" hidden onChange={onDxfFile} />
            <input ref={sketchupInputRef} type="file" accept=".json" hidden onChange={onSketchupFile} />
            <input ref={approvalInputRef} type="file" accept=".pdf,.xlsx,.xls,.docx" hidden onChange={onApprovalFile} />
            {!detailOpen && error && (compact
              ? <span title={error} className="flex justify-center text-red-500 py-1"><AlertTriangle className="w-4 h-4" /></span>
              : <div className="error-box" style={{ marginTop: '1rem' }}>{error}</div>)}
          </div>
        )}

      {allowancesOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="detail-modal allowances-modal" role="dialog" aria-modal="true" aria-label="Припуски">
            <div className="detail-modal-header">
              <div>
                <h2>Припуски</h2>
                <p>Технічні параметри припусків для нових розрахунків</p>
              </div>
              <button type="button" className="icon-button" aria-label="Закрити" onClick={() => setAllowancesOpen(false)}>×</button>
            </div>
            <div className="allowances-grid">
              <section className="pdf-section">
                <h3>Деталі</h3>
                <Field label="Припуск по довжині на сторону, мм"><input type="number" value={project.allowances.detailLength} onChange={(event) => updateAllowances({ detailLength: Number(event.target.value) })} /></Field>
                <Field label="Припуск по ширині на сторону, мм"><input type="number" value={project.allowances.detailWidth} onChange={(event) => updateAllowances({ detailWidth: Number(event.target.value) })} /></Field>
                <Field label="Малі внутрішні вирізи до 100 мм"><input type="number" value={project.allowances.detailSmallCutout} onChange={(event) => updateAllowances({ detailSmallCutout: Number(event.target.value) })} /></Field>
                <Field label="Великі внутрішні вирізи понад 100 мм"><input type="number" value={project.allowances.detailLargeCutout} onChange={(event) => updateAllowances({ detailLargeCutout: Number(event.target.value) })} /></Field>
              </section>
              <section className="pdf-section">
                <h3>Елементи</h3>
                <Field label="Припуск по довжині на сторону, мм"><input type="number" value={project.allowances.elementLength} onChange={(event) => updateAllowances({ elementLength: Number(event.target.value) })} /></Field>
                <Field label="Припуск по ширині на сторону, мм"><input type="number" value={project.allowances.elementWidth} onChange={(event) => updateAllowances({ elementWidth: Number(event.target.value) })} /></Field>
                <Field label="Малі внутрішні вирізи до 100 мм"><input type="number" value={project.allowances.elementSmallCutout} onChange={(event) => updateAllowances({ elementSmallCutout: Number(event.target.value) })} /></Field>
                <Field label="Великі внутрішні вирізи понад 100 мм"><input type="number" value={project.allowances.elementLargeCutout} onChange={(event) => updateAllowances({ elementLargeCutout: Number(event.target.value) })} /></Field>
              </section>
            </div>
            <section className="pdf-section allowance-spacing-section">
              {/* FG-10. Поріг короткої сторони. Живе НЕ в припусках проєкту, а в
                  налаштуваннях застосунку: це властивість матеріалу і верстата,
                  однакова для всіх замовлень. Порожнє поле = 150 мм за
                  замовчуванням, 0 = не попереджати взагалі. */}
              <h3>Мінімальна сторона деталі, мм</h3>
              <p className="pdf-hint">
                Попередження, а не заборона: деталь усе одно можна зберегти.
                Порожньо — 150 мм. Нуль — не попереджати.
              </p>
              <div className="allowances-grid">
                {MATERIALS_IN_USE.map((material) => (
                  <Field key={material} label={material}>
                    <input
                      type="number"
                      min={0}
                      placeholder={String(DEFAULT_MIN_SIDE_MM)}
                      value={minSideMm[material] ?? ''}
                      onChange={(event) => setMinSideMm(
                        material,
                        event.target.value === '' ? undefined : Number(event.target.value),
                      )}
                    />
                  </Field>
                ))}
              </div>
            </section>
            <section className="pdf-section allowance-spacing-section">
              <h3>Пропил між деталями</h3>
              <Field label="Відстань між деталями та елементами, мм"><input type="number" value={project.allowances.interPartSpacing} onChange={(event) => updateAllowances({ interPartSpacing: Number(event.target.value) })} /></Field>
            </section>
            <label className="pdf-check allowance-check">
              <input type="checkbox" checked={project.allowances.show} onChange={(event) => updateAllowances({ show: event.target.checked })} />
              Показувати припуски пунктиром
            </label>
            <label className="pdf-check allowance-check">
              <input type="checkbox" checked={project.allowances.applyToImports} onChange={(event) => updateAllowances({ applyToImports: event.target.checked })} />
              Використовувати припуски для імпортованих векторів
            </label>
            <div className="detail-modal-footer">
              <button type="button" className="primary-action" onClick={() => setAllowancesOpen(false)}>Готово</button>
            </div>
          </div>
        </div>
      )}

      {detailOpen && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Додати деталь"
            style={modalPosition ? { position: 'fixed', left: modalPosition.x, top: modalPosition.y, margin: 0 } : undefined}
          >
            <div
              className="detail-modal-header"
              onMouseDown={(event) => {
                if ((event.target as HTMLElement).closest('button, input, select, textarea')) return;
                const rect = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                setModalPosition((position) => position ?? { x: rect.left, y: rect.top });
                setModalDrag({
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: modalPosition?.x ?? rect.left,
                  originY: modalPosition?.y ?? rect.top,
                });
              }}
            >
              <div>
                <h2>{editingDetail ? 'Редагувати деталь' : 'Додати деталь'}</h2>
                <p>Швидкий вибір форми через мініатюри</p>
              </div>
              <button type="button" className="icon-button" aria-label="Закрити" onClick={closeDetailModal}>×</button>
            </div>

            <div className="designer-select-row">
              <Field label="Тип"><select value={detail.type} onChange={(e) => setType(e.target.value as DetailType)}>{visibleDetailTypes(isAdminUnlocked, detail.type).map((type) => <option key={type} value={type}>{ui(type)}</option>)}</select></Field>
              <Field label="Форма"><select value={detail.kind} disabled={isImportedDetailEdit} onChange={(e) => updateDetail({ kind: e.target.value as ShapeKind })}>{designs.map((design) => <option key={design.kind} value={design.kind}>{ui(design.label)}</option>)}</select></Field>
            </div>

            <div className="shape-thumbnails">
              {designs.map((design) => (
                <button
                  key={design.kind}
                  type="button"
                  className={design.kind === detail.kind ? 'shape-thumb active' : 'shape-thumb'}
                  disabled={isImportedDetailEdit}
                  onClick={() => updateDetail({ kind: design.kind })}
                >
                  <ShapeIcon kind={design.kind} />
                  <span>{ui(design.label)}</span>
                </button>
              ))}
            </div>

            <div className="designer-meta">
              <span>{ui('Матеріал:')} {ui(project.slabs[0]?.material ?? slab.material)}</span>
              <span>{ui('Товщина, мм:')} <input type="number" value={detail.thickness} onChange={(e) => updateDetail({ thickness: Number(e.target.value) })} /></span>
            </div>

            {isImportedDetailEdit && editingDetail
              ? <ImportedDetailPreview detail={editingDetail} linkedElements={linkedImportedElements} />
              : <DesignerCanvas detail={detail} updateDetail={updateDetail} language={language} />}

            {showEdges && (
              <EdgeProcessingDesigner
                edgeProfiles={detail.edgeProfiles}
                thickening={detail.thickening}
                fold={detail.fold}
                sides={sides}
                blockedEdgeSides={isImportedDetailEdit ? [...linkedImportedThickeningSides, ...linkedImportedFoldSides] : []}
                linkedThickeningSides={isImportedDetailEdit ? linkedImportedThickeningSides : []}
                linkedFoldSides={isImportedDetailEdit ? linkedImportedFoldSides : []}
                onChange={(patch) => updateDetail(patch)}
              />
            )}

            {error && <div className="error-box">{error}</div>}

            <div className="detail-modal-footer">
              <button type="button" onClick={closeDetailModal}>Закрити</button>
              <button type="button" className="primary-action" onClick={addDetailClick}>{editingDetail ? 'Зберегти' : 'Додати деталь'}</button>
            </div>
          </div>
        </div>
      )}
      {approvalPreview && (
        <div className="modal-backdrop" role="presentation">
          <div className="detail-modal pdf-modal approval-modal" role="dialog" aria-modal="true" aria-label="Попередній перегляд бланку погодження">
            <div className="detail-modal-header">
              <div>
                <h2>Попередній перегляд бланку погодження</h2>
                <p>Перевірте дані замовлення, вироби, кромки та елементи перед імпортом.</p>
              </div>
              <button type="button" className="icon-button" aria-label="Закрити" onClick={closeApprovalPreview}>×</button>
            </div>
            <div className="approval-header-grid">
              <Field label="Номер замовлення">
                <input value={approvalPreview.orderNumber} onChange={(event) => updateApprovalPreview({ orderNumber: event.target.value })} />
              </Field>
              <Field label="Контрагент">
                <input value={approvalPreview.customer} onChange={(event) => updateApprovalPreview({ customer: event.target.value })} />
              </Field>
              <Field label="Матеріал">
                <select value={approvalPreview.material ?? ''} onChange={(event) => updateApprovalPreview({ material: event.target.value ? event.target.value as MaterialType : undefined })}>
                  <option value="">Не визначено</option>
                  {referenceData.materials.map((material) => <option key={material} value={material}>{ui(material)}</option>)}
                </select>
              </Field>
              <Field label="Товщина, мм">
                <input type="number" value={approvalPreview.thickness} onChange={(event) => updateApprovalPreview({ thickness: Number(event.target.value) })} />
              </Field>
              <Field label="Декор">
                <input value={approvalPreview.decor} onChange={(event) => updateApprovalPreview({ decor: event.target.value })} />
              </Field>
            </div>
            <div className="dxf-tool-row approval-tool-row">
              <button
                type="button"
                className="dxf-tool-button"
                onClick={() => setApprovalSelectedItemIds(approvalPreview.items.filter(approvalItemHasExtractedGeometry).map(i => i.id))}
              >
                Виділити все
              </button>
              <button
                type="button"
                className="dxf-tool-button"
                onClick={() => setApprovalSelectedItemIds([])}
              >
                Прибрати все
              </button>
              <button
                type="button"
                className={approvalBlockMode ? 'dxf-tool-button active' : 'dxf-tool-button'}
                aria-pressed={approvalBlockMode}
                onClick={() => {
                  setApprovalBlockDraft(null);
                  setApprovalSelectedItemIds([]);
                  setApprovalBlockMode((current) => !current);
                }}
              >
                Виділити блоком
              </button>
              <button
                type="button"
                className="dxf-tool-button"
                disabled={!approvalSelectedItemIds.length}
                onClick={() => {
                  const selected = approvalPreviewContours.find((contour) => approvalSelectedItemIds.includes(contour.id));
                  if (selected) rotateApprovalPreviewSelection(selected);
                }}
              >
                Повернути 90°
              </button>
              <button
                type="button"
                className="dxf-tool-button"
                onClick={fitApprovalPreviewToWindow}
              >
                Вписати всі
              </button>
              <button type="button" className="dxf-tool-button" disabled={!approvalPreview.items.length} onClick={openApprovalBindingPreview}>
                Стикування
              </button>
              {approvalJointNotice && <span className="dxf-notice approval-joint-notice" role="status">{approvalJointNotice}</span>}
            </div>
            {approvalPreview.warnings.length > 0 && (
              <div className="approval-warning-box">
                {approvalPreview.warnings.slice(0, 6).map((warning, index) => <div key={`approval-warning-${index}`}>{warning}</div>)}
              </div>
            )}
            <div className="approval-preview-workspace">
              <aside className="list-box approval-preview-list">
                {approvalPreview.items.map((item) => (
                  <div key={item.id} className={`list-item approval-preview-row ${(!approvalItemHasExtractedGeometry(item) || item.width === 0 || item.height === 0) ? 'approval-preview-row-error' : ''}`}>
                    <div className="approval-preview-item-head">
                      <strong>{item.name}</strong>
                      <span>
                        {Math.round(item.width)}×{Math.round(item.height)} мм ·{' '}
                        <b className={`approval-status approval-status-${item.importStatus.toLowerCase().replace(/\s+/g, '-')}`}>{item.importStatus}</b>
                        {' '}· рядків: {item.rows.length}
                      </span>
                    </div>
                    <div className="approval-item-crop">
                      <ApprovalItemCrop item={item} />
                    </div>
                    <ApprovalItemEditors item={item} onPatch={(patch) => updateApprovalItem(item.id, patch)}>
                      <div className="dxf-preview-controls">
                        <Field label="Назва">
                          <input value={item.name} onChange={(event) => updateApprovalItem(item.id, { name: event.target.value })} />
                        </Field>
                        <Field label="Тип">
                          <select value={item.type} onChange={(event) => updateApprovalItem(item.id, { type: event.target.value as DetailType })}>
                            {visibleDetailTypes(isAdminUnlocked, item.type).map((type) => <option key={type} value={type}>{ui(type)}</option>)}
                          </select>
                        </Field>
                        <Field label="Форма">
                          <select value={item.shape} onChange={(event) => updateApprovalItem(item.id, { shape: event.target.value as DetailShape })}>
                            {referenceData.detailShapes.map((shape) => <option key={shape} value={shape}>{ui(shape)}</option>)}
                          </select>
                        </Field>
                        <Field label="Ширина">
                          <input type="number" className={item.width === 0 ? 'error-input' : ''} value={item.width} onChange={(event) => updateApprovalItem(item.id, { width: Number(event.target.value) })} />
                        </Field>
                        <Field label="Висота">
                          <input type="number" className={item.height === 0 ? 'error-input' : ''} value={item.height} onChange={(event) => updateApprovalItem(item.id, { height: Number(event.target.value) })} />
                        </Field>
                        <Field label="Кількість">
                          <input type="number" value={item.quantity} onChange={(event) => updateApprovalItem(item.id, { quantity: Number(event.target.value) })} />
                        </Field>
                        <Field label="Стик">
                          <select
                            className={`approval-joint-select ${approvalJointTool?.itemId === item.id ? 'active' : ''}`}
                            value={approvalJointTool?.itemId === item.id ? approvalJointTool.mode : ''}
                            onChange={(event) => {
                              const mode = event.target.value as ApprovalJointToolMode | '';
                              if (mode) {
                                setApprovalJointTool({ itemId: item.id, mode });
                                setApprovalJointDraft(null);
                                setApprovalJointHover(null);
                                setApprovalJointNotice('Оберіть точку на контуру для додавання стику.');
                              } else {
                                setApprovalJointTool(null);
                                setApprovalJointDraft(null);
                                setApprovalJointHover(null);
                                setApprovalJointNotice('');
                              }
                            }}
                          >
                            <option value="">Не вибрано</option>
                            <option value="vertical">Вертикальний</option>
                            <option value="horizontal">Горизонтальний</option>
                            <option value="diagonal45">Під 45°</option>
                            <option value="pointToPoint">Від точки до точки</option>
                          </select>
                        </Field>
                        {(item.joints && item.joints.length > 0) ? (
                          <button
                            type="button"
                            className="danger-button approval-delete-joints-btn"
                            style={{ marginTop: '0.25rem' }}
                            onClick={() => deleteApprovalJoints(item.id)}
                          >
                            Видалити стики
                          </button>
                        ) : null}
                        {(item.joints?.length || item.jointVertical || item.jointHorizontal) ? (
                          <label className="approval-split-check">
                            <input
                              type="checkbox"
                              checked={approvalSplitItemIds.includes(item.id)}
                              onChange={(event) => setApprovalSplitItemIds((current) => (
                                event.target.checked
                                  ? [...new Set([...current, item.id])]
                                  : current.filter((id) => id !== item.id)
                              ))}
                            />
                            <span>Розділити на окремі деталі</span>
                          </label>
                        ) : null}
                        <button type="button" className="danger-button" onClick={() => deleteApprovalItem(item.id)}>Видалити</button>
                      </div>
                    </ApprovalItemEditors>
                  </div>
                ))}
              </aside>
              <section className="dxf-overview-panel">
                <h3>Схема імпорту з бланку</h3>
                <p>Вироби створюються як звичайні деталі конструктора: кромки, потовщення та підвороти збережуться у записі деталі.</p>
                <div ref={approvalOverviewScrollRef} className="approval-overview-scroll" onWheel={onApprovalOverviewWheel}>
                  <DxfOverview
                    contours={approvalPreviewContours}
                    binding={null}
                    blockMode={approvalBlockMode}
                    blockDraft={approvalBlockDraft}
                    selectedContourIds={approvalSelectedItemIds}
                    overlays={approvalPreviewOverlays}
                    canvasSize={approvalPreviewCanvasSize}
                    lockCanvasToSize
                    dragging={Boolean(approvalPreviewDrag)}
                    zoom={approvalZoom}
                    onContourClick={(contour) => setApprovalSelectedItemIds([contour.id])}
                    onContourDragStart={beginApprovalPreviewDrag}
                    onContourDoubleClick={rotateApprovalPreviewSelection}
                    onCanvasDragMove={moveApprovalPreviewSelection}
                    onCanvasDragFinish={finishApprovalPreviewDrag}
                    onCanvasPanStart={beginApprovalPreviewPan}
                    onClearSelection={() => setApprovalSelectedItemIds([])}
                    onSideClick={() => undefined}
                    onAnchorClick={() => undefined}
                    onBlockStart={(point) => setApprovalBlockDraft({
                      startX: point.x,
                      startY: point.y,
                      currentX: point.x,
                      currentY: point.y,
                    })}
                    onBlockMove={(point) => setApprovalBlockDraft((current) => current ? {
                      ...current,
                      currentX: point.x,
                      currentY: point.y,
                    } : current)}
                    onBlockFinish={finishApprovalBlockSelection}
                    jointToolItemId={approvalJointTool?.itemId}
                    onJointHover={(contour, point) => {
                      if (!contour || !point) {
                        setApprovalJointHover(null);
                      } else {
                        updateApprovalJointHover(contour.id, point);
                      }
                    }}
                    onJointPoint={(contour, point) => {
                      createApprovalJointAtPoint(contour.id, point);
                    }}
                  />
                </div>
              </section>
            </div>
            <div className="detail-modal-footer">
              <button type="button" onClick={closeApprovalPreview}>Скасувати</button>
              <button type="button" className="primary-action" disabled={approvalPreview.items.length === 0 || approvalPreview.items.every((item) => !approvalItemHasExtractedGeometry(item) || item.width === 0 || item.height === 0)} onClick={importApprovalPreview}>Імпортувати</button>
            </div>
          </div>
        </div>
      )}
      {dxfPreview && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="detail-modal pdf-modal dxf-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Попередній перегляд DXF"
            style={{
              ...(dxfModalPosition ? { position: 'fixed', left: dxfModalPosition.x, top: dxfModalPosition.y, margin: 0 } : {}),
              ...(dxfModalSize ? { width: dxfModalSize.width, height: dxfModalSize.height } : {}),
            }}
          >
            <div
              className="detail-modal-header"
              onMouseDown={(event) => {
                if ((event.target as HTMLElement).closest('button, input, select, textarea')) return;
                const rect = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                setDxfModalPosition((position) => position ?? { x: rect.left, y: rect.top });
                setDxfModalDrag({
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: dxfModalPosition?.x ?? rect.left,
                  originY: dxfModalPosition?.y ?? rect.top,
                });
              }}
            >
              <div>
                <h2>Попередній перегляд DXF</h2>
                <p>Перевірте контури, призначте роль і тип перед імпортом.</p>
              </div>
              <button type="button" className="icon-button" aria-label="Закрити" onClick={closeDxfPreview}>×</button>
            </div>
            <div className="dxf-tool-row">
              <button
                type="button"
                className={dxfBinding ? 'dxf-tool-button active' : 'dxf-tool-button'}
                aria-pressed={Boolean(dxfBinding)}
                onClick={() => setDxfBinding((current) => current ? null : { step: 'detail' })}
              >
                Прив'язка
              </button>
              <button
                type="button"
                className={dxfBlockMode ? 'dxf-tool-button active' : 'dxf-tool-button'}
                aria-pressed={dxfBlockMode}
                onClick={() => {
                  setDxfBinding(null);
                  setDxfBlockDraft(null);
                  setDxfSelectedContourIds([]);
                  setDxfBlockMode((current) => !current);
                }}
              >
                Прив'язка блоком
              </button>
              <button
                type="button"
                className="dxf-tool-button"
                disabled={!dxfSelectedContourIds.length}
                onClick={() => {
                  const selected = visibleDxfPreview.find((contour) => dxfSelectedContourIds.includes(contour.id));
                  if (selected) rotateDxfPreviewSelection(selected);
                }}
              >
                Повернути 90°
              </button>
              <button
                type="button"
                className="dxf-tool-button"
                onClick={fitDxfPreviewToWindow}
              >
                Вписати всі
              </button>
              <div className="dxf-layers-control">
                <button
                  type="button"
                  className={dxfLayersOpen ? 'dxf-tool-button active' : 'dxf-tool-button'}
                  aria-expanded={dxfLayersOpen}
                  onClick={() => setDxfLayersOpen((current) => !current)}
                >
                  Слої
                </button>
                {dxfLayersOpen && (
                  <div className="dxf-layers-panel">
                    <strong>Слої DXF</strong>
                    <div className="dxf-layers-actions">
                      <button type="button" onClick={() => { setSelectedDxfLayers(dxfLayers); setDxfBinding(null); }}>Виділити все</button>
                      <button type="button" onClick={() => { setSelectedDxfLayers([]); setDxfBinding(null); }}>Прибрати все</button>
                    </div>
                    <div className="dxf-layer-list">
                      {dxfLayers.map((layer) => (
                        <label key={layer}>
                          <input type="checkbox" checked={selectedDxfLayerSet.has(layer)} onChange={() => toggleDxfLayer(layer)} />
                          <span>{layer}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <span className="dxf-zoom-label">Масштаб {Math.round(dxfZoom * 100)}%</span>
              {(dxfBindingHint || dxfBlockMode) && <span>{dxfBindingHint ?? 'Обведіть рамкою контури, які потрібно зв’язати в один блок.'}</span>}
              {dxfNotice && <span className="dxf-notice" role="status">{dxfNotice}</span>}
            </div>
            <div className="dxf-preview-workspace">
              <aside className="list-box dxf-preview-list">
                {visibleDxfPreview.map((contour) => {
                  const edgeEntry = Object.entries(contour.edgeProfiles).find(([, profile]) => Boolean(profile)) as [string, EdgeProfileType] | undefined;
                  return (
                    <div key={contour.id} className="list-item dxf-preview-row">
                      <div className="dxf-preview-item-head">
                        <DxfPreviewShape contour={contour} />
                        <div className="dxf-preview-meta">
                          <strong>{contour.name}</strong>
                          <span>{contour.width}×{contour.height} мм</span>
                          <span>Слой: {contour.layer}</span>
                        </div>
                      </div>
                      <div className="dxf-preview-controls">
                    <Field label="Назва">
                      <input value={contour.name} onChange={(event) => updateDxfPreviewItem(contour.id, { name: event.target.value })} />
                    </Field>
                    <Field label="Група">
                      <select value={contour.groupId} onChange={(event) => updateDxfPreviewItem(contour.id, { groupId: event.target.value })}>
                        {dxfPreviewGroups.map((group) => <option key={group} value={group}>{group}</option>)}
                      </select>
                    </Field>
                    <Field label="Тип">
                      <select value={contour.type} onChange={(event) => updateDxfPreviewItem(contour.id, { type: event.target.value as DetailType })}>
                        {visibleDetailTypes(isAdminUnlocked, contour.type).map((type) => <option key={type} value={type}>{ui(type)}</option>)}
                      </select>
                    </Field>
                    <Field label="Форма">
                      <select value={contour.shape} onChange={(event) => updateDxfPreviewItem(contour.id, { shape: event.target.value as DetailShape })}>
                        {referenceData.detailShapes.map((shape) => <option key={shape} value={shape}>{ui(shape)}</option>)}
                      </select>
                    </Field>
                    <Field label="Роль">
                      <select value={contour.role} onChange={(event) => updateDxfPreviewItem(contour.id, { role: event.target.value as DxfImportRole })}>
                        {(Object.keys(DXF_ROLE_LABELS) as DxfImportRole[]).map((role) => <option key={role} value={role}>{ui(DXF_ROLE_LABELS[role])}</option>)}
                      </select>
                    </Field>
                    <Field label="Сторона кромки">
                      <select
                        value={edgeEntry?.[0] ?? ''}
                        disabled={contour.role !== 'detail'}
                        onChange={(event) => {
                          const side = event.target.value;
                          updateDxfEdgeProfiles(contour.id, {
                            ...(side ? { [side]: edgeEntry?.[1] ?? DEFAULT_EDGE_PROFILE } : {}),
                          });
                        }}
                      >
                        <option value="">Без кромки</option>
                        {allSides.map((side) => <option key={side} value={side}>{side}</option>)}
                      </select>
                    </Field>
                    <Field label="Профіль кромки">
                      <select
                        value={edgeEntry?.[1] ?? DEFAULT_EDGE_PROFILE}
                        disabled={contour.role !== 'detail' || !edgeEntry}
                        onChange={(event) => updateDxfEdgeProfiles(
                          contour.id,
                          edgeEntry ? { [edgeEntry[0]]: event.target.value as EdgeProfileType } : {},
                        )}
                      >
                        {(useProjectStore.getState().project.referenceData?.edgeProfiles ?? []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </Field>
                    <button type="button" className="danger-button" onClick={() => deleteDxfPreviewItem(contour.id)}>Видалити</button>
                  </div>
                </div>
                  );
                })}
              </aside>
              <section className="dxf-overview-panel">
                <h3>Композиція з файлу</h3>
                <p>{dxfBindingHint ?? (dxfBlockMode ? 'Натисніть у полі та обведіть потрібні контури рамкою.' : 'Контури показані в початковому взаємному положенні. Колесо миші змінює масштаб.')}</p>
                <div ref={dxfOverviewScrollRef} className="dxf-overview-scroll" onWheel={onDxfOverviewWheel}>
                  <DxfOverview
                    contours={visibleDxfPreview}
                    binding={dxfBinding}
                    blockMode={dxfBlockMode}
                    blockDraft={dxfBlockDraft}
                    selectedContourIds={dxfSelectedContourIds}
                    canvasSize={dxfPreviewCanvasSize}
                    dragging={Boolean(dxfPreviewDrag)}
                    zoom={dxfZoom}
                    onContourClick={selectDxfBindingContour}
                    onContourDragStart={beginDxfPreviewDrag}
                    onContourDoubleClick={rotateDxfPreviewSelection}
                    onCanvasDragMove={moveDxfPreviewSelection}
                    onCanvasDragFinish={finishDxfPreviewDrag}
                    onClearSelection={() => setDxfSelectedContourIds([])}
                    onSideClick={selectDxfBindingSide}
                    onAnchorClick={selectDxfBindingAnchor}
                    onBlockStart={(point) => setDxfBlockDraft({
                      startX: point.x,
                      startY: point.y,
                      currentX: point.x,
                      currentY: point.y,
                    })}
                    onBlockMove={(point) => setDxfBlockDraft((current) => current ? {
                      ...current,
                      currentX: point.x,
                      currentY: point.y,
                    } : null)}
                    onBlockFinish={finishDxfBlockSelection}
                  />
                </div>
              </section>
            </div>
            <div className="detail-modal-footer">
              <button type="button" onClick={closeDxfPreview}>Скасувати</button>
              <button type="button" className="primary-action" disabled={!visibleDxfPreview.length} onClick={importDxfPreview}>Імпортувати</button>
            </div>
            <div className="dxf-modal-resize-handle right" aria-hidden="true" onMouseDown={(event) => beginDxfModalResize(event, 'right')} />
            <div className="dxf-modal-resize-handle bottom" aria-hidden="true" onMouseDown={(event) => beginDxfModalResize(event, 'bottom')} />
            <div className="dxf-modal-resize-handle corner" aria-hidden="true" onMouseDown={(event) => beginDxfModalResize(event, 'corner')} />
          </div>
        </div>
      )}
      {dxfPreview && dxfBlockEditorIds && (
        <div className="modal-backdrop dxf-block-editor-backdrop" role="presentation">
          <div className="detail-modal dxf-block-editor-modal" role="dialog" aria-modal="true" aria-label="Редагування прив’язки блоку">
            <div className="detail-modal-header">
              <div>
                <h2>Редагування прив’язки блоку</h2>
                <p>Налаштуйте взаємне положення контурів і точні прив’язки між деталями та елементами.</p>
              </div>
              <button type="button" className="icon-button" aria-label="Закрити" onClick={closeDxfBlockEditor}>×</button>
            </div>
            <div className="dxf-block-editor-workspace">
              <aside className="dxf-block-editor-tools">
                <h3>Інструменти</h3>
                <button
                  type="button"
                  className={dxfBinding ? 'dxf-tool-button active' : 'dxf-tool-button'}
                  aria-pressed={Boolean(dxfBinding)}
                  onClick={() => setDxfBinding((current) => current ? null : { step: 'detail' })}
                >
                  Створити прив’язку
                </button>
                <button
                  type="button"
                  className="dxf-tool-button"
                  disabled={!dxfBlockEditorContours.some((contour) => contour.parentDetailId && dxfSelectedContourIds.includes(contour.id))}
                  onClick={() => {
                    const selected = dxfBlockEditorContours.find((contour) => contour.parentDetailId && dxfSelectedContourIds.includes(contour.id));
                    if (selected) editDxfBinding(selected.id);
                  }}
                >
                  Редагувати прив’язку
                </button>
                <button
                  type="button"
                  className="dxf-tool-button"
                  disabled={!dxfSelectedContourIds.length}
                  onClick={() => {
                    const selected = dxfBlockEditorContours.find((contour) => dxfSelectedContourIds.includes(contour.id));
                    if (selected) rotateDxfPreviewSelection(selected);
                  }}
                >
                  Повернути 90°
                </button>
                <h3>Контури блоку</h3>
                <div className="dxf-block-editor-contours">
                  {dxfBlockEditorContours.map((contour) => (
                    <button
                      key={contour.id}
                      type="button"
                      className={dxfSelectedContourIds.includes(contour.id) ? 'active' : ''}
                      onClick={() => setDxfSelectedContourIds([contour.id])}
                    >
                      <strong>{contour.name}</strong>
                      <span>{ui(DXF_ROLE_LABELS[contour.role])} · {Math.round(contour.width)}×{Math.round(contour.height)} мм</span>
                    </button>
                  ))}
                </div>
                <h3>Створені прив’язки</h3>
                <div className="dxf-block-editor-links">
                  {dxfBlockEditorContours.filter((contour) => contour.parentDetailId).map((contour) => {
                    const parent = dxfPreview.find((item) => item.id === contour.parentDetailId);
                    return (
                      <div key={contour.id}>
                        <span>{parent?.name ?? 'Контур'} → {contour.name}</span>
                        <button type="button" onClick={() => editDxfBinding(contour.id)}>Редагувати</button>
                        <button type="button" className="danger-button" onClick={() => deleteDxfBinding(contour.id)}>Видалити</button>
                      </div>
                    );
                  })}
                  {!dxfBlockEditorContours.some((contour) => contour.parentDetailId) && <p>Прив’язок ще немає.</p>}
                </div>
              </aside>
              <section className="dxf-overview-panel dxf-block-editor-canvas">
                <h3>Розміщення контурів</h3>
                <p>{dxfBindingHint ?? 'Переміщуйте й повертайте контури як у DXF-прев’ю. Для точної прив’язки оберіть інструмент зліва.'}</p>
                <div className="dxf-overview-scroll" onWheel={onDxfOverviewWheel}>
                  <DxfOverview
                    contours={dxfBlockEditorContours}
                    binding={dxfBinding}
                    blockMode={false}
                    blockDraft={null}
                    selectedContourIds={dxfSelectedContourIds}
                    canvasSize={dxfPreviewCanvasSize}
                    viewport={dxfBlockEditorViewport}
                    dragging={Boolean(dxfPreviewDrag)}
                    zoom={dxfZoom}
                    onContourClick={selectDxfBindingContour}
                    onContourDragStart={beginDxfPreviewDrag}
                    onContourDoubleClick={rotateDxfPreviewSelection}
                    onCanvasDragMove={moveDxfPreviewSelection}
                    onCanvasDragFinish={finishDxfPreviewDrag}
                    onClearSelection={() => setDxfSelectedContourIds([])}
                    onSideClick={selectDxfBindingSide}
                    onAnchorClick={selectDxfBindingAnchor}
                    onBlockStart={() => undefined}
                    onBlockMove={() => undefined}
                    onBlockFinish={() => undefined}
                  />
                </div>
                <span className="dxf-zoom-label">Масштаб {Math.round(dxfZoom * 100)}%</span>
              </section>
            </div>
            <div className="detail-modal-footer">
              {dxfNotice && <span className="dxf-notice" role="status">{dxfNotice}</span>}
              <button type="button" className="primary-action" onClick={closeDxfBlockEditor}>Готово</button>
            </div>
          </div>
        </div>
      )}
      
      {isImporting && (
        <div className="modal-backdrop" role="presentation" style={{ zIndex: 9999 }}>
          <div className="detail-modal" role="dialog" aria-modal="true" style={{ width: '400px', maxWidth: '90vw', textAlign: 'center', padding: '2.5rem 2rem', margin: 'auto' }}>
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" style={{ margin: '0 auto 1.5rem', display: 'block', color: '#007bff' }} />
            <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem', color: '#1e293b' }}>Обробка бланку...</h2>
            <p style={{ color: '#64748b', margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
              Система розпізнає креслення та отримує дані за допомогою OCR. Будь ласка, зачекайте, це може зайняти до 1 хвилини.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export function DesignerCanvas({ detail, updateDetail, language, onCornerClick, onCutoutClick }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void; language: UiLanguage; onCornerClick?: (id: string, x: number, y: number) => void; onCutoutClick?: (id: string) => void }) {
  const ui = (value: string) => translateStaticUiText(language, value);
  const activeSides = new Set([...detail.thickening.sides, ...detail.fold.sides]);
  const toggleSide = (side: string) => {
    const nextSides = detail.thickening.sides.includes(side)
      ? detail.thickening.sides.filter((item) => item !== side)
      : [...detail.thickening.sides, side];
    updateDetail({ thickening: { ...detail.thickening, enabled: nextSides.length > 0, sides: nextSides } });
  };

  return (
    <section className="designer-card relative">
      <h3>{ui('Розмір')}</h3>
      {detail.kind === 'circle' && <CircleDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} />}
      {detail.kind === 'ellipse' && <EllipseDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} />}
      {detail.kind === 'l' && <LDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} language={language} />}
      {detail.kind === 'u' && <UDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} />}
      {detail.kind === 'rect' && <RectangleDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} language={language} onCornerClick={onCornerClick} onCutoutClick={onCutoutClick} />}
      {(detail.kind === 'sink_rect' || detail.kind === 'sink_slot') && <SinkDesigner detail={detail} updateDetail={updateDetail} />}
      {detail.kind === 'metal_profile' && (
        /* Металопрокат: 2D-креслення профілю не малюємо — розміри
           редагуються в панелі «Профіль металопрокату» праворуч. */
        <div className="p-6 text-sm text-slate-500 text-center">
          Відрізок профілю. Типорозмір і довжина — у панелі властивостей праворуч.
        </div>
      )}
    </section>
  );
}

function sideClass(side: string, className: string, activeSides: Set<string>) {
  return `${className}${activeSides.has(side) ? ' active' : ''}`;
}
