import { ReactNode, useMemo, useState } from 'react';
import { referenceData, uid } from '../../domain/defaults';
import { ChangeEvent, useEffect, useRef } from 'react';
import type { BindingAnchor, Detail, DetailShape, DetailType, EdgeFeature, EdgeProfileSelection, EdgeProfileType, MaterialType, SlabInstance, UiLanguage } from '../../domain/types';
import { translateStaticUiText } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';
import type { ApprovalImportItem, ApprovalImportPreview } from '../../utils/approvalImport';
import { parseApprovalFile } from '../../utils/approvalImport';
import { DEFAULT_EDGE_PROFILE, EDGE_PROFILE_OPTIONS } from '../../utils/edgeProfiles';
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
import { detailTypes, TYPE_COUNTERTOP, TYPE_WALL_PANEL, TYPE_SINK, TYPE_SUPPORT, SHAPE_RECT, SHAPE_L, SHAPE_U, SHAPE_CIRCLE, SHAPE_ELLIPSE, baseDesigns, sinkDesigns, allSides, curveSides, feature, createDraft, defaultsForKind, cloneFeature, cloneEdgeProfiles, draftFromDetail } from '../forms/utils/draftHelpers';


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
              {element.importRole === 'fold' ? 'Підворот' : 'Потовщення'}: {element.label || 'DXF контур'}
              {element.parentDetailSide ? `, сторона ${element.parentDetailSide}` : ''}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function designsForType(type: DetailType) {
  if (type === TYPE_SINK) return sinkDesigns;
  if (type === TYPE_COUNTERTOP) return baseDesigns;
  return baseDesigns.filter((item) => item.kind === 'rect');
}

function designForKind(kind: ShapeKind) {
  return [...baseDesigns, ...sinkDesigns].find((item) => item.kind === kind) ?? baseDesigns[0];
}

function sideOptionsFor(kind: ShapeKind) {
  if (kind === 'circle' || kind === 'ellipse') return curveSides;
  if (kind === 'u') return allSides;
  if (kind === 'l') return ['A', 'B', 'C', 'D', 'E', 'F'];
  return ['A', 'B', 'C', 'D'];
}

function supportsEdges(type: DetailType) {
  return type === TYPE_COUNTERTOP || type === TYPE_SUPPORT;
}

import { RectangleDesigner } from '../forms/shapes/RectangleDesigner';
import { CircleDesigner } from '../forms/shapes/CircleDesigner';
import { EllipseDesigner } from '../forms/shapes/EllipseDesigner';
import { LDesigner } from '../forms/shapes/LDesigner';
import { UDesigner } from '../forms/shapes/UDesigner';
import { SinkDesigner } from '../forms/shapes/SinkDesigner';
import { FeatureDesigner } from '../forms/editors/FeatureDesigner';
import { EdgeProfileDesigner, EdgeProfileIcon } from '../forms/editors/EdgeProfileDesigner';
import { DxfOverview } from '../forms/import/DxfOverview';
import { ApprovalOverview } from '../forms/import/ApprovalOverview';
export function FormsPanel() {
  const { addSlab, addDetail, addDetails, updateDetailRecord, updateAllowances, updateProjectHeader, project, editingDetailId, clearEditDetail } = useProjectStore();
  const language = project.uiLanguage ?? 'uk';
  const ui = (value: string) => translateStaticUiText(language, value);
  const [error, setError] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [allowancesOpen, setAllowancesOpen] = useState(false);
  const dxfInputRef = useRef<HTMLInputElement | null>(null);
  const approvalInputRef = useRef<HTMLInputElement | null>(null);
  const [approvalPreview, setApprovalPreview] = useState<ApprovalImportPreview | null>(null);
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
  const [slab, setSlab] = useState({
    width: 3200,
    height: 1600,
    thickness: 20,
    material: referenceData.materials[0] as MaterialType,
    decor: '',
    comment: '',
    minMargin: 10,
    serialNumber: 'SL-1',
  });
  const [detail, setDetail] = useState<DetailDraft>(() => createDraft());
  const editingDetail = editingDetailId ? project.details.find((item) => item.id === editingDetailId) : undefined;
  const isImportedDetailEdit = Boolean(editingDetail?.geometry.customPoints?.length);
  const linkedImportedElements = editingDetail
    ? (() => {
      const linkedIds = new Set([editingDetail.id]);
      const result: Detail[] = [];
      let found = true;
      while (found) {
        found = false;
        project.details.forEach((item) => {
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

  const designs = useMemo(() => designsForType(detail.type), [detail.type]);
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
    if (patch.jointVertical) next.jointHorizontal = false;
    if (patch.jointHorizontal) next.jointVertical = false;
    if (patch.jointOmegaVertical) next.jointOmegaHorizontal = false;
    if (patch.jointOmegaHorizontal) next.jointOmegaVertical = false;
    if (patch.jointLambdaVertical) next.jointLambdaHorizontal = false;
    if (patch.jointLambdaHorizontal) next.jointLambdaVertical = false;
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

  const addSlabClick = () => {
    const item: SlabInstance = {
      id: uid('slab'),
      width: slab.width,
      height: slab.height,
      thickness: slab.thickness,
      material: slab.material,
      decor: slab.decor,
      comment: slab.comment,
      minMargin: slab.minMargin,
      serialNumber: slab.serialNumber,
      defects: [],
      textureTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, opacity: 0.85 },
    };
    addSlab(item);
    setSlab((prev) => ({ ...prev, serialNumber: `SL-${Number(prev.serialNumber.match(/\d+/)?.[0] ?? '1') + 1}` }));
  };

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

  const closeApprovalPreview = () => {
    setApprovalPreview(null);
  };

  const openApprovalFixture = async (fixtureFileName = '81-1305719.pdf') => {
    try {
      console.warn('[APPROVAL_IMPORT_V2_REACHED]', {
        fileName: fixtureFileName,
        timestamp: new Date().toISOString(),
        source: 'dev-fixture-button',
      });
      const response = await fetch(`/test-fixtures/approval-forms/${encodeURIComponent(fixtureFileName)}`);
      if (!response.ok) throw new Error(`fixture ${fixtureFileName} is not available (${response.status})`);
      const blob = await response.blob();
      const file = new File([blob], fixtureFileName, { type: 'application/pdf' });
      const parsed = await parseApprovalFile(file);
      if (!parsed.items.length) {
        setError('У бланку погодження не знайдено таблиць виробів для імпорту.');
        return;
      }
      setError('');
      setApprovalPreview(parsed);
    } catch (reason) {
      setError(`Не вдалося прочитати тестовий бланк погодження: ${reason instanceof Error ? reason.message : 'невідома помилка'}`);
    }
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
      const parsed = await parseApprovalFile(file);
      if (!parsed.items.length) {
        setError('У бланку погодження не знайдено таблиць виробів для імпорту.');
        return;
      }
      setError('');
      setApprovalPreview(parsed);
    } catch (reason) {
      setError(`Не вдалося прочитати бланк погодження: ${reason instanceof Error ? reason.message : 'невідома помилка'}`);
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
    setApprovalPreview((current) => current ? {
      ...current,
      items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item),
    } : current);
  };

  const deleteApprovalItem = (id: string) => {
    setApprovalPreview((current) => {
      if (!current) return current;
      const items = current.items.filter((item) => item.id !== id);
      return items.length ? { ...current, items } : null;
    });
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
    const importableItems = approvalPreview.items.filter(approvalItemHasExtractedGeometry);
    if (!importableItems.length) {
      setError('Geometry was not extracted. This product cannot be imported.');
      return;
    }
    updateProjectHeader({
      orderNumber: approvalPreview.orderNumber,
      customer: approvalPreview.customer,
    });
    if (approvalPreview.material) {
      setSlab((current) => ({
        ...current,
        material: approvalPreview.material as MaterialType,
        thickness: approvalPreview.thickness || current.thickness,
        decor: approvalPreview.decor || current.decor,
      }));
    }
    const imported = importableItems.map((item) => ({
      id: uid('detail'),
      type: item.type,
      shape: item.shape,
      quantity: item.quantity,
      thickness: approvalPreview.thickness || detail.thickness,
      label: item.name,
      thickening: item.thickening,
      fold: item.fold,
      edgeProfiles: item.edgeProfiles,
      geometry: approvalItemGeometry(item),
    } satisfies Detail));
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
          wholeDetail: detail.wholeDetail && !detail.jointVertical && !detail.jointHorizontal,
          jointDirection: detail.jointVertical ? 'vertical' : detail.jointHorizontal ? 'horizontal' : undefined,
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
              && !detail.jointOmegaVertical
              && !detail.jointOmegaHorizontal
              && !detail.jointLambdaVertical
              && !detail.jointLambdaHorizontal,
            jointOmegaDirection: detail.jointOmegaVertical ? 'vertical' : detail.jointOmegaHorizontal ? 'horizontal' : undefined,
            jointLambdaDirection: detail.jointLambdaVertical ? 'vertical' : detail.jointLambdaHorizontal ? 'horizontal' : undefined,
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
    const nextDesigns = designsForType(type);
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
      if (approvalContext.material) {
        setSlab((current) => ({
          ...current,
          material: approvalContext.material as MaterialType,
          thickness: approvalContext.thickness || current.thickness,
          decor: approvalContext.decor || current.decor,
        }));
      }
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
    const nextZoom = Math.min(6, Math.max(0.35, dxfZoom * (event.deltaY < 0 ? 1.16 : 1 / 1.16)));
    const ratio = nextZoom / dxfZoom;
    const nextLeft = (viewport.scrollLeft + pointerX) * ratio - pointerX;
    const nextTop = (viewport.scrollTop + pointerY) * ratio - pointerY;
    setDxfZoom(nextZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = nextLeft;
      viewport.scrollTop = nextTop;
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

  return (
    <section className="panel forms-panel">
      <div className="subgrid two-col">
        <div className="form-zone">
          <h3>Додати слеб</h3>
          <div className="preset-row">
            {referenceData.slabSizes.map((s) => (
              <button key={`${s.width}-${s.height}`} type="button" onClick={() => setSlab((p) => ({ ...p, width: s.width, height: s.height }))}>{s.width}×{s.height}</button>
            ))}
          </div>
          <div className="form-grid compact">
            <Field label="Серійний номер"><input value={slab.serialNumber} onChange={(e) => setSlab({ ...slab, serialNumber: e.target.value })} /></Field>
            <Field label="Матеріал"><select value={slab.material} onChange={(e) => setSlab({ ...slab, material: e.target.value as MaterialType })}>{referenceData.materials.map((m) => <option key={m} value={m}>{ui(m)}</option>)}</select></Field>
            <Field label="Ширина"><input type="number" value={slab.width} onChange={(e) => setSlab({ ...slab, width: Number(e.target.value) })} /></Field>
            <Field label="Висота"><input type="number" value={slab.height} onChange={(e) => setSlab({ ...slab, height: Number(e.target.value) })} /></Field>
            <Field label="Товщина"><input type="number" value={slab.thickness} onChange={(e) => setSlab({ ...slab, thickness: Number(e.target.value) })} /></Field>
            <Field label="Мін. відступ"><input type="number" value={slab.minMargin} onChange={(e) => setSlab({ ...slab, minMargin: Number(e.target.value) })} /></Field>
            <Field label="Декор"><input value={slab.decor} onChange={(e) => setSlab({ ...slab, decor: e.target.value })} /></Field>
            <Field label="Коментар"><input value={slab.comment} onChange={(e) => setSlab({ ...slab, comment: e.target.value })} /></Field>
          </div>
          <button type="button" onClick={addSlabClick}>Додати слеб</button>
        </div>
        <div className="detail-launcher form-zone">
          <h3>Деталі</h3>
          <button type="button" className="primary-action detail-open-button" onClick={() => { clearEditDetail(); setDetail(createDraft()); setDetailOpen(true); }}>Додати деталь</button>
          <button type="button" onClick={() => dxfInputRef.current?.click()}>Імпортувати DXF</button>
          <button type="button" onClick={() => approvalInputRef.current?.click()}>Імпортувати бланк погодження</button>
          <button type="button" onClick={() => setAllowancesOpen(true)}>Припуски</button>
          <input ref={dxfInputRef} type="file" accept=".dxf,.dwg" hidden onChange={onDxfFile} />
          <input ref={approvalInputRef} type="file" accept=".pdf,.xlsx,.xls,.docx" hidden onChange={onApprovalFile} />
        </div>
      </div>

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
              <Field label="Тип"><select value={detail.type} onChange={(e) => setType(e.target.value as DetailType)}>{detailTypes.map((type) => <option key={type} value={type}>{ui(type)}</option>)}</select></Field>
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
              <>
                <FeatureDesigner title="Потовщення" feature={detail.thickening} linkedSides={isImportedDetailEdit ? linkedImportedThickeningSides : []} sides={sides} onChange={(value) => updateDetail({ thickening: value })} />
                <FeatureDesigner title="Підворот" feature={detail.fold} linkedSides={isImportedDetailEdit ? linkedImportedFoldSides : []} sides={sides} onChange={(value) => updateDetail({ fold: value })} />
              </>
            )}
            <EdgeProfileDesigner
              title="Кромка"
              profiles={detail.edgeProfiles}
              sides={sides}
              blockedSides={isImportedDetailEdit ? [...linkedImportedThickeningSides, ...linkedImportedFoldSides] : []}
              onChange={(value) => updateDetail({ edgeProfiles: value })}
            />

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
                <p className="approval-pipeline-marker">Approval Import Pipeline: V2 · {approvalPreview.approvalImportBuildId}</p>
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
              <button type="button" className="dxf-tool-button" disabled={!approvalPreview.items.length} onClick={openApprovalBindingPreview}>
                Прив'язка
              </button>
              <button type="button" className="dxf-tool-button" onClick={downloadApprovalDebugJson}>
                Download import debug JSON
              </button>
              <button type="button" className="dxf-tool-button" onClick={copyApprovalDebugSummary}>
                Copy actual UI debug summary
              </button>
              <span>Відкрити контури бланку у вікні прив’язок для ручного зв’язування деталей та елементів.</span>
            </div>
            {approvalPreview.warnings.length > 0 && (
              <div className="approval-warning-box">
                {approvalPreview.warnings.slice(0, 6).map((warning, index) => <div key={`approval-warning-${index}`}>{warning}</div>)}
              </div>
            )}
            <div className="approval-preview-workspace">
              <aside className="list-box approval-preview-list">
                {approvalPreview.items.map((item) => (
                  <div key={item.id} className={`list-item approval-preview-row ${approvalItemHasExtractedGeometry(item) ? '' : 'approval-preview-row-error'}`}>
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
                    <div className="dxf-preview-controls">
                      <Field label="Назва">
                        <input value={item.name} onChange={(event) => updateApprovalItem(item.id, { name: event.target.value })} />
                      </Field>
                      <Field label="Тип">
                        <select value={item.type} onChange={(event) => updateApprovalItem(item.id, { type: event.target.value as DetailType })}>
                          {detailTypes.map((type) => <option key={type} value={type}>{ui(type)}</option>)}
                        </select>
                      </Field>
                      <Field label="Форма">
                        <select value={item.shape} onChange={(event) => updateApprovalItem(item.id, { shape: event.target.value as DetailShape })}>
                          {referenceData.detailShapes.map((shape) => <option key={shape} value={shape}>{ui(shape)}</option>)}
                        </select>
                      </Field>
                      <Field label="Ширина">
                        <input type="number" value={item.width} onChange={(event) => updateApprovalItem(item.id, { width: Number(event.target.value) })} />
                      </Field>
                      <Field label="Висота">
                        <input type="number" value={item.height} onChange={(event) => updateApprovalItem(item.id, { height: Number(event.target.value) })} />
                      </Field>
                      <Field label="Кількість">
                        <input type="number" value={item.quantity} onChange={(event) => updateApprovalItem(item.id, { quantity: Number(event.target.value) })} />
                      </Field>
                      <button type="button" className="danger-button" onClick={() => deleteApprovalItem(item.id)}>Видалити</button>
                    </div>
                    <div className="approval-spec-summary">
                      {item.area ? <span>Площа з бланку: {item.area.toFixed(3)} м²</span> : null}
                      <span>pipeline: {item.pipelineVersion}</span>
                      <span>buildId: {approvalPreview.approvalImportBuildId}</span>
                      <span>geometrySource: {item.geometrySource}</span>
                      <span>shapeMode: {item.shapeMode}</span>
                      <span>contourPointsCount: {item.customPoints?.length ?? 0}</span>
                      <span>finalImportAllowed: {approvalItemHasExtractedGeometry(item) ? 'true' : 'false'}</span>
                      <span>dimensionsSource: {item.dimensionsSource}</span>
                      <span>specSource: {item.specSource}</span>
                      {item.dimensions.length > 0 ? <span>Розміри з креслення: {item.dimensions.map((dimension) => `${dimension.side}=${dimension.value}`).join(', ')}</span> : null}
                      {item.sizeSource === 'drawing' ? <span>Геометрію взято з креслення бланку.</span> : null}
                      {!approvalItemHasExtractedGeometry(item) ? <span className="approval-error-text">Geometry was not extracted. This product cannot be imported.</span> : null}
                      {item.warnings.map((warning, index) => <span key={`${item.id}-warning-${index}`} className="approval-warning-text">{warning}</span>)}
                      {(item.jointVertical || item.jointHorizontal) && <span>Стик: {item.jointVertical ? 'вертикальний' : 'горизонтальний'}</span>}
                      {item.rows.slice(0, 6).map((row, index) => (
                        <span key={`${item.id}-row-${index}`}>{row.side}: {row.elementType} {row.width ? `${row.width} мм` : ''} {row.profile}</span>
                      ))}
                      {!item.rows.length && <span>Без таблиці специфікації у PDF-тексті.</span>}
                      <details className="approval-debug-details">
                        <summary>Діагностика імпорту</summary>
                        <pre>{JSON.stringify(item.debug, null, 2)}</pre>
                      </details>
                    </div>
                  </div>
                ))}
              </aside>
              <section className="dxf-overview-panel">
                <h3>Схема імпорту з бланку</h3>
                <p>Вироби створюються як звичайні деталі конструктора: кромки, потовщення та підвороти збережуться у записі деталі.</p>
                <div className="approval-overview-scroll">
                  <ApprovalOverview items={approvalPreview.items} />
                </div>
              </section>
            </div>
            <div className="detail-modal-footer">
              <button type="button" onClick={closeApprovalPreview}>Скасувати</button>
              <button type="button" className="primary-action" disabled={!approvalPreview.items.some(approvalItemHasExtractedGeometry)} onClick={importApprovalPreview}>Імпортувати</button>
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
                        {detailTypes.map((type) => <option key={type} value={type}>{ui(type)}</option>)}
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
                        {EDGE_PROFILE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
    </section>
  );
}

function DesignerCanvas({ detail, updateDetail, language }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void; language: UiLanguage }) {
  const ui = (value: string) => translateStaticUiText(language, value);
  const activeSides = new Set([...detail.thickening.sides, ...detail.fold.sides]);
  const toggleSide = (side: string) => {
    const nextSides = detail.thickening.sides.includes(side)
      ? detail.thickening.sides.filter((item) => item !== side)
      : [...detail.thickening.sides, side];
    updateDetail({ thickening: { ...detail.thickening, enabled: nextSides.length > 0, sides: nextSides } });
  };

  return (
    <section className="designer-card">
      <h3>{ui('Розмір')}</h3>
      {detail.kind === 'circle' && <CircleDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} />}
      {detail.kind === 'ellipse' && <EllipseDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} />}
      {detail.kind === 'l' && <LDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} language={language} />}
      {detail.kind === 'u' && <UDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} />}
      {detail.kind === 'rect' && <RectangleDesigner detail={detail} updateDetail={updateDetail} activeSides={activeSides} onSideClick={toggleSide} language={language} />}
      {(detail.kind === 'sink_rect' || detail.kind === 'sink_slot') && <SinkDesigner detail={detail} updateDetail={updateDetail} />}
    </section>
  );
}

function sideClass(side: string, className: string, activeSides: Set<string>) {
  return `${className}${activeSides.has(side) ? ' active' : ''}`;
}

import { SvgInput, SvgSide, SvgQuantity, SvgCheck, TemplateInput, TemplateSide, TemplateCheck, ArrowDefs } from '../forms/shapes/SvgComponents';

function DimInput({ value, onChange, className = '' }: { value: number; onChange: (value: number) => void; className?: string }) {
  return <input className={`schema-input ${className}`} type="number" value={Math.round(value)} onChange={(e) => onChange(Number(e.target.value))} />;
}

function QuantityInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="quantity-input">
      <label>Кількість</label>
      <input type="number" min={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function ShapeIcon({ kind }: { kind: ShapeKind }) {
  return (
    <svg viewBox="0 0 80 52" aria-hidden="true">
      {kind === 'rect' && <rect x="17" y="17" width="46" height="24" rx="2" />}
      {kind === 'circle' && <circle cx="40" cy="28" r="14" />}
      {kind === 'ellipse' && <ellipse cx="40" cy="28" rx="20" ry="12" />}
      {kind === 'l' && <path d="M18 14 H56 V26 H42 V39 H18 Z" />}
      {kind === 'u' && <path d="M17 14 H63 V39 H50 V25 H30 V39 H17 Z" />}
      {kind === 'sink_rect' && <><rect x="16" y="13" width="48" height="30" rx="3" /><circle cx="40" cy="28" r="5" /></>}
      {kind === 'sink_slot' && <><rect x="15" y="15" width="50" height="26" rx="3" /><rect x="25" y="24" width="30" height="8" rx="2" /></>}
    </svg>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><label>{label}</label>{children}</div>;
}


