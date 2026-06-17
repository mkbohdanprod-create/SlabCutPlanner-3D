import { ChangeEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { referenceData, uid } from '../../domain/defaults';
import type { CutAllowances, DetailPart, DefectZone, EdgeProfileSelection, ManualDimension, MaterialType, Placement, Point, SlabInstance, UiLanguage } from '../../domain/types';
import { t, translateStaticUiText } from '../../i18n';
import { normalizeRotation, placementPolygon, pointString, polygonBounds, rotatedLocalPoints, rotatedPoints, rotatedSize, translatePoints } from '../../lib/project';
import { useProjectStore } from '../../store/useProjectStore';
import { edgeMarkersForPart, edgeProfileShortLabel } from '../../utils/edgeProfiles';
import { readFileAsDataUrl } from '../../utils/file';
import {
  defaultDefectPolygon, normalizeRect, polygonInsideRect, pointsForPlacement,
  closestPointOnSegment, manualPointDistance, manualDimensionSegments,
  assemblyGroupKey, svgPath, fitLabel, elementLabel, clampNumber,
  defectPoints, snapValue, clampToSlab, findSnap, resolveSnappedPlacement,
  segmentAngle, angleDelta, polygonSegments, alignPlacementSegmentToTarget,
  findAngledSideSnap, polygonCentroid, rotateCoordinateAround, rigidRotatePlacementMove,
  type LocalRect, type EdgeSegment, type AngleSnapCandidate,
} from './canvasUtils';
import { SlabLayer } from "./board/SlabLayer";
import { PartShape } from "./board/PartShape";
import { PlacementStateBadges } from "./board/PlacementStateBadges";
import { EdgeProfileMarks } from "./board/EdgeProfileMarks";
import { SelectionRect } from "./board/SelectionRect";
import { GroupDragPreview, PlacementDragGhost } from "./board/DragPreviews";
import { ManualDimensions, SlabDimensionHints, SlabMagnifierWindow } from "./board/BoardOverlays";

export function SlabBoard() {
  const {
    project,
    parts,
    viewMode,
    bufferDragPartId,
    setViewMode,
    movePlacement,
    placeUnplacedPart,
    unplacePart,
    unplaceParts,
    rotatePlacement,
    previewTextureSource,
    setSelectedSlabId,
    selectedSlabId,
    updateDefect,
    addDefect,
    addManualDimension,
    deleteManualDimension,
    clearManualDimensionsForSlab,
    updateSlab,
    runPacking,
    addDetail,
    startEditDetail,
    deleteDetail,
    clearBufferDrag,
    startPlacementDrag,
    clearPlacementDrag,
    showUnplacedDropZone,
    hideUnplacedDropZone,
    renamePartFamily,
    movePlacements,
    togglePlacementPin,
    togglePlacementLock,
    setPlacementLocks,
    pushMovementSnapshot,
  } = useProjectStore();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const unplacedRevealTimer = useRef<number | undefined>(undefined);
  const unplacedRevealPoint = useRef<{ x: number; y: number } | undefined>(undefined);
  const labelHoverTimer = useRef<number | undefined>(undefined);
  const labelHoverPoint = useRef<{ partId: string; x: number; y: number } | undefined>(undefined);
  const angleSnapTimer = useRef<number | undefined>(undefined);
  const angleSnapKey = useRef<string | undefined>(undefined);
  const slabPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const slabPhotoTargetId = useRef<string | undefined>(undefined);
  const slabShellRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<CanvasDrag | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [showDimensions, setShowDimensions] = useState(true);
  const [magnifierOpen, setMagnifierOpen] = useState(false);
  const [selectedPlacementIds, setSelectedPlacementIds] = useState<string[]>([]);
  const [selectedManualDimensionId, setSelectedManualDimensionId] = useState<string | undefined>(undefined);
  const [expandedLabelPartId, setExpandedLabelPartId] = useState<string | undefined>(undefined);
  const [contextMenu, setContextMenu] = useState<CanvasContextMenu | null>(null);
  const [angleEditor, setAngleEditor] = useState<AngleEditorState | null>(null);
  const [dimensionDraft, setDimensionDraft] = useState<{ slabId: string; start?: Point } | null>(null);
  const [slabEditor, setSlabEditor] = useState<{ id: string; draft: SlabEditorDraft } | null>(null);
  const [manualSlabHeight, setManualSlabHeight] = useState<number | null>(null);
  const [defaultSlabHeight, setDefaultSlabHeight] = useState<number | null>(null);
  const [slabResizeDrag, setSlabResizeDrag] = useState<{ startY: number; startHeight: number } | null>(null);
  const maxW = Math.max(...project.slabs.map((s) => s.width), 3200);
  const scale = Math.min(1080 / maxW, 0.34);

  const slabOffsets = useMemo(() => {
    let y = 20;
    return project.slabs.map((slab) => { const v = { slabId: slab.id, x: 36, y }; y += slab.height * scale + 54; return v; });
  }, [project.slabs, scale]);
  const canvasHeight = useMemo(() => {
    if (!project.slabs.length) return 320;
    const last = project.slabs[project.slabs.length - 1];
    const lastOffset = slabOffsets[slabOffsets.length - 1]?.y ?? 20;
    return Math.max(lastOffset + last.height * scale + 54, 320);
  }, [project.slabs, scale, slabOffsets]);
  const slabShellHeight = manualSlabHeight ?? defaultSlabHeight;
  const activeSlabId = selectedSlabId ?? project.slabs[0]?.id;
  const activeSlabManualDimensionCount = (project.manualDimensions ?? []).filter((dimension) => dimension.slabId === activeSlabId).length;

  useEffect(() => {
    if (defaultSlabHeight !== null || !slabShellRef.current) return;
    setDefaultSlabHeight(slabShellRef.current.clientHeight);
  }, [defaultSlabHeight]);
  const svgMatrix = svgRef.current?.getScreenCTM();
  const svgCssScale = svgMatrix ? Math.hypot(svgMatrix.a, svgMatrix.b) : 1;

  const openSlabEditor = useCallback((slabId: string) => {
    const slab = project.slabs.find((item) => item.id === slabId);
    if (!slab) return;
    setSelectedSlabId(slabId);
    setSlabEditor({
      id: slabId,
      draft: {
        width: slab.width,
        height: slab.height,
        thickness: slab.thickness,
        material: slab.material,
        decor: slab.decor,
        comment: slab.comment,
        minMargin: slab.minMargin,
        serialNumber: slab.serialNumber,
      },
    });
    setContextMenu(null);
  }, [project.slabs, setSelectedSlabId]);

  const updateSlabEditorDraft = (patch: Partial<SlabEditorDraft>) => {
    setSlabEditor((current) => current ? { ...current, draft: { ...current.draft, ...patch } } : current);
  };

  const saveSlabEditor = () => {
    if (!slabEditor) return;
    updateSlab(slabEditor.id, slabEditor.draft);
    setSlabEditor(null);
  };

  const clientToSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return undefined;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(ctm.inverse());
  }, []);

  const findSlabAtClientPoint = useCallback((clientX: number, clientY: number) => {
    const point = clientToSvgPoint(clientX, clientY);
    if (!point) return undefined;

    for (const off of slabOffsets) {
      const slab = project.slabs.find((item) => item.id === off.slabId);
      if (!slab) continue;
      const localX = (point.x - off.x) / scale;
      const localY = (point.y - off.y) / scale;
      if (localX >= 0 && localX <= slab.width && localY >= 0 && localY <= slab.height) {
        return { slab, localX, localY };
      }
    }

    return undefined;
  }, [clientToSvgPoint, project.slabs, scale, slabOffsets]);

  const clientToSlabPoint = useCallback((slabId: string, clientX: number, clientY: number) => {
    const point = clientToSvgPoint(clientX, clientY);
    const off = slabOffsets.find((item) => item.slabId === slabId);
    if (!point || !off) return undefined;
    return {
      x: (point.x - off.x) / scale,
      y: (point.y - off.y) / scale,
    };
  }, [clientToSvgPoint, scale, slabOffsets]);

  const placementClientPoint = useCallback((slabId: string, x: number, y: number, offsetX: number, offsetY: number) => {
    const svg = svgRef.current;
    const off = slabOffsets.find((item) => item.slabId === slabId);
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm || !off) return undefined;
    const point = svg.createSVGPoint();
    point.x = off.x + (x + offsetX) * scale;
    point.y = off.y + (y + offsetY) * scale;
    const screen = point.matrixTransform(ctm);
    return {
      clientX: screen.x,
      clientY: screen.y,
    };
  }, [scale, slabOffsets]);

  const clearUnplacedReveal = useCallback(() => {
    if (unplacedRevealTimer.current) window.clearTimeout(unplacedRevealTimer.current);
    unplacedRevealTimer.current = undefined;
    unplacedRevealPoint.current = undefined;
  }, []);

  const clearLabelHover = useCallback(() => {
    if (labelHoverTimer.current) window.clearTimeout(labelHoverTimer.current);
    labelHoverTimer.current = undefined;
    labelHoverPoint.current = undefined;
    setExpandedLabelPartId(undefined);
  }, []);

  const clearAngleSnap = useCallback(() => {
    if (angleSnapTimer.current) window.clearTimeout(angleSnapTimer.current);
    angleSnapTimer.current = undefined;
    angleSnapKey.current = undefined;
  }, []);

  const armAngleSnap = useCallback((dragState: Extract<CanvasDrag, { type: 'placement' }>, candidate: AngleSnapCandidate) => {
    if (angleSnapKey.current === candidate.key) return;
    clearAngleSnap();
    angleSnapKey.current = candidate.key;
    angleSnapTimer.current = window.setTimeout(() => {
      setDrag((current) => {
        if (current?.type !== 'placement' || current.id !== dragState.id || (current.groupIds && current.groupIds.length > 1)) return current;
        const part = parts.find((item) => item.id === current.partId);
        const target = findSlabAtClientPoint(current.clientX, current.clientY);
        if (!part || !target) return current;

        const targetPlacement: Placement = {
          id: current.id,
          slabId: target.slab.id,
          partId: current.partId,
          x: target.localX - current.offsetX,
          y: target.localY - current.offsetY,
          rotation: current.rotation,
          manualLocked: true,
        };
        const snapped = resolveSnappedPlacement(part, targetPlacement, target.slab, project.placements, parts, project.allowances);
        const freshCandidate = findAngledSideSnap(part, { ...targetPlacement, x: snapped.x, y: snapped.y }, target.slab, project.placements, parts);
        const activeCandidate = freshCandidate?.key === candidate.key ? freshCandidate : undefined;
        if (!activeCandidate) return current;

        const rotatedPlacement = { ...targetPlacement, x: snapped.x, y: snapped.y, rotation: activeCandidate.rotation };
        const alignedPlacement = alignPlacementSegmentToTarget(part, rotatedPlacement, activeCandidate.sourceIndex, activeCandidate.target);
        const finalPosition = clampToSlab(part, alignedPlacement, alignedPlacement.x, alignedPlacement.y, target.slab);
        const client = placementClientPoint(target.slab.id, finalPosition.x, finalPosition.y, current.offsetX, current.offsetY);
        previewTextureSource(part.id, target.slab.id, finalPosition.x, finalPosition.y, activeCandidate.rotation);
        angleSnapTimer.current = undefined;
        angleSnapKey.current = undefined;
        return {
          ...current,
          rotation: activeCandidate.rotation,
          angleSnap: undefined,
          ghostX: finalPosition.x,
          ghostY: finalPosition.y,
          ghostSlabId: target.slab.id,
          ghostClientX: client?.clientX,
          ghostClientY: client?.clientY,
        };
      });
    }, 650);
  }, [clearAngleSnap, findSlabAtClientPoint, parts, placementClientPoint, previewTextureSource, project.placements]);

  const applyPlacementAngleSnap = useCallback((placementId: string) => {
    const placement = project.placements.find((item) => item.id === placementId);
    const part = placement ? parts.find((item) => item.id === placement.partId) : undefined;
    const slab = placement ? project.slabs.find((item) => item.id === placement.slabId) : undefined;
    if (!placement || !part || !slab) return false;
    const candidate = findAngledSideSnap(part, placement, slab, project.placements, parts, true);
    if (!candidate) return false;
    const rotatedPlacement = { ...placement, rotation: candidate.rotation };
    const alignedPlacement = alignPlacementSegmentToTarget(part, rotatedPlacement, candidate.sourceIndex, candidate.target);
    const finalPosition = clampToSlab(part, alignedPlacement, alignedPlacement.x, alignedPlacement.y, slab);
    pushMovementSnapshot();
    movePlacement(placement.id, finalPosition.x, finalPosition.y, slab.id, candidate.rotation);
    return true;
  }, [movePlacement, parts, project.placements, project.slabs, pushMovementSnapshot]);

  const rotatePlacementGroup = useCallback((placementIds: string[], slabId: string, pivotX: number, pivotY: number, delta: number) => {
    const uniqueIds = [...new Set(placementIds)];
    const moves = project.placements
      .filter((placement) => uniqueIds.includes(placement.id) && placement.slabId === slabId)
      .map((placement) => {
        const part = parts.find((item) => item.id === placement.partId);
        return part ? rigidRotatePlacementMove(part, placement, { x: pivotX, y: pivotY }, delta) : undefined;
      })
      .filter(Boolean) as Array<{ placementId: string; x: number; y: number; slabId?: string; rotation?: Placement['rotation'] }>;
    if (!moves.length) return;
    pushMovementSnapshot();
    movePlacements(moves);
  }, [movePlacements, parts, project.placements, pushMovementSnapshot]);

  const setExactPlacementAngle = useCallback((editor: AngleEditorState, rawAngle: string) => {
    const angle = Number(rawAngle.replace(',', '.').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(angle)) return;
    const delta = normalizeRotation(angle - editor.baseRotation);
    rotatePlacementGroup(editor.placementIds, editor.pivotSlabId, editor.pivotX, editor.pivotY, delta);
  }, [rotatePlacementGroup]);

  const addDefectAt = useCallback((slabId: string, localX: number, localY: number) => {
    const width = 180;
    const height = 100;
    const defectX = Math.max(0, localX - width / 2);
    const defectY = Math.max(0, localY - height / 2);
    addDefect(slabId, {
      id: uid('defect'),
      shapeType: 'rect',
      x: defectX,
      y: defectY,
      width,
      height,
      comment: 'Дефект',
      points: defaultDefectPolygon(defectX, defectY, width, height),
    });
  }, [addDefect]);

  const snapManualDimensionPoint = useCallback((slab: SlabInstance, point: Point) => {
    const segments = [
      { start: { x: 0, y: 0 }, end: { x: slab.width, y: 0 } },
      { start: { x: slab.width, y: 0 }, end: { x: slab.width, y: slab.height } },
      { start: { x: slab.width, y: slab.height }, end: { x: 0, y: slab.height } },
      { start: { x: 0, y: slab.height }, end: { x: 0, y: 0 } },
    ];
    project.placements
      .filter((placement) => placement.slabId === slab.id)
      .forEach((placement) => {
        const part = parts.find((item) => item.id === placement.partId);
        if (!part) return;
        segments.push(...manualDimensionSegments(pointsForPlacement(part, placement)));
        (part.holes ?? []).forEach((hole) => {
          segments.push(...manualDimensionSegments(pointsForPlacement(part, placement, hole)));
        });
      });

    const clamped = {
      x: Math.max(0, Math.min(slab.width, point.x)),
      y: Math.max(0, Math.min(slab.height, point.y)),
    };
    let best = { point: clamped, distance: Infinity };
    segments.forEach((segment) => {
      const candidate = closestPointOnSegment(point, segment.start, segment.end);
      const distance = manualPointDistance(point, candidate);
      if (distance < best.distance) best = { point: candidate, distance };
    });
    return best.distance <= 55 ? best.point : clamped;
  }, [parts, project.placements]);

  const addManualDimensionPoint = useCallback((slab: SlabInstance, event: ReactMouseEvent<SVGGElement>) => {
    if (event.button !== 0) return;
    const point = clientToSlabPoint(slab.id, event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    const snapped = snapManualDimensionPoint(slab, point);
    if (!dimensionDraft?.start || dimensionDraft.slabId !== slab.id) {
      setDimensionDraft({ slabId: slab.id, start: snapped });
      return;
    }
    addManualDimension({
      id: uid('manual_dimension'),
      slabId: slab.id,
      start: dimensionDraft.start,
      end: snapped,
    });
    setDimensionDraft(null);
  }, [addManualDimension, clientToSlabPoint, dimensionDraft, snapManualDimensionPoint]);

  const duplicateDetailForPart = useCallback((partId: string) => {
    const part = parts.find((item) => item.id === partId);
    const detail = part ? project.details.find((item) => item.id === part.detailId) : undefined;
    if (!part || !detail) return;
    addDetail({
      ...detail,
      id: uid('detail'),
      quantity: 1,
      label: `${detail.label ?? part.parentLabel} копія`,
    });
  }, [addDetail, parts, project.details]);

  const onSlabPhotoSelected = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const slabId = slabPhotoTargetId.current;
    event.target.value = '';
    if (!file || !slabId) return;
    const photo = await readFileAsDataUrl(file);
    updateSlab(slabId, { photo });
    slabPhotoTargetId.current = undefined;
  }, [updateSlab]);

  const armLabelHover = useCallback((partId: string, event: ReactMouseEvent<SVGGElement>) => {
    if (labelHoverTimer.current) window.clearTimeout(labelHoverTimer.current);
    labelHoverPoint.current = { partId, x: event.clientX, y: event.clientY };
    labelHoverTimer.current = window.setTimeout(() => {
      setExpandedLabelPartId(partId);
    }, 700);
  }, []);

  const keepLabelHoverStill = useCallback((partId: string, event: ReactMouseEvent<SVGGElement>) => {
    if (expandedLabelPartId === partId) return;
    const anchor = labelHoverPoint.current;
    if (!anchor || anchor.partId !== partId) {
      armLabelHover(partId, event);
      return;
    }
    if (Math.hypot(anchor.x - event.clientX, anchor.y - event.clientY) > 6) {
      armLabelHover(partId, event);
    }
  }, [armLabelHover, expandedLabelPartId]);

  const startSelectionBox = useCallback((slab: SlabInstance, event: ReactMouseEvent<SVGGElement>) => {
    if (event.button !== 0 || drag || bufferDragPartId) return;
    if (dimensionDraft) {
      addManualDimensionPoint(slab, event);
      return;
    }
    setSelectedManualDimensionId(undefined);
    const target = event.target as Element;
    if (target.closest('.part-group, .defect-shape, .detail-label-popover')) return;
    const point = clientToSlabPoint(slab.id, event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    setSelectedSlabId(slab.id);
    setSelectionBox({
      slabId: slab.id,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
  }, [addManualDimensionPoint, bufferDragPartId, clientToSlabPoint, dimensionDraft, drag, setSelectedSlabId]);

  const openSlabContextMenu = useCallback((slab: SlabInstance, event: ReactMouseEvent<SVGGElement>) => {
    const target = event.target as Element;
    if (target.closest('.part-group, .defect-shape, .detail-label-popover')) return;
    const point = clientToSlabPoint(slab.id, event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedSlabId(slab.id);
    setAngleEditor(null);
    setContextMenu({ kind: 'slab', x: event.clientX, y: event.clientY, slabId: slab.id, localX: point.x, localY: point.y });
  }, [clientToSlabPoint, setSelectedSlabId]);

  const openPartContextMenu = useCallback((slab: SlabInstance, placement: Placement, part: DetailPart, event: ReactMouseEvent<SVGGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    clearAngleSnap();
    const localPoint = clientToSlabPoint(slab.id, event.clientX, event.clientY);
    setSelectedSlabId(slab.id);
    setSelectedManualDimensionId(undefined);
    const groupIds = selectedPlacementIds.includes(placement.id) ? selectedPlacementIds : [placement.id];
    setSelectedPlacementIds(groupIds);
    setAngleEditor(null);
    setContextMenu({
      kind: 'part',
      x: event.clientX,
      y: event.clientY,
      slabId: slab.id,
      localX: localPoint?.x ?? placement.x,
      localY: localPoint?.y ?? placement.y,
      placementId: placement.id,
      partId: part.id,
    });
  }, [clearAngleSnap, clientToSlabPoint, selectedPlacementIds, setSelectedSlabId]);

  const isCursorAboveTopSlab = useCallback((clientX: number, clientY: number) => {
    const firstSlab = project.slabs[0];
    const firstOff = firstSlab ? slabOffsets.find((item) => item.slabId === firstSlab.id) : undefined;
    const point = clientToSvgPoint(clientX, clientY);
    if (!firstSlab || !firstOff || !point) return false;
    const localX = (point.x - firstOff.x) / scale;
    const localY = (point.y - firstOff.y) / scale;
    return localY < 0 && localX >= -firstSlab.minMargin * 4 && localX <= firstSlab.width + firstSlab.minMargin * 4;
  }, [clientToSvgPoint, project.slabs, scale, slabOffsets]);

  useEffect(() => {
    if (!selectedPlacementIds.length) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const arrowDelta: Record<string, { x: number; y: number }> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const direction = arrowDelta[event.key];
      if (direction) {
        const selected = project.placements.filter((placement) => selectedPlacementIds.includes(placement.id));
        if (!selected.length) return;
        const step = event.ctrlKey ? 10 : 1;
        event.preventDefault();
        pushMovementSnapshot();
        movePlacements(selected.map((placement) => ({
          placementId: placement.id,
          x: placement.x + direction.x * step,
          y: placement.y + direction.y * step,
          slabId: placement.slabId,
          rotation: placement.rotation,
        })));
        return;
      }
      if (event.key !== 'Delete') return;
      const partIds = project.placements
        .filter((placement) => selectedPlacementIds.includes(placement.id))
        .map((placement) => placement.partId);
      if (!partIds.length) return;
      event.preventDefault();
      pushMovementSnapshot();
      unplaceParts(partIds);
      setSelectedPlacementIds([]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [movePlacements, project.placements, pushMovementSnapshot, selectedPlacementIds, unplaceParts]);

  useEffect(() => {
    if (!selectedManualDimensionId) return;
    if (!(project.manualDimensions ?? []).some((dimension) => dimension.id === selectedManualDimensionId)) {
      setSelectedManualDimensionId(undefined);
    }
  }, [project.manualDimensions, selectedManualDimensionId]);

  useEffect(() => {
    if (!selectedManualDimensionId) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key !== 'Delete') return;
      event.preventDefault();
      deleteManualDimension(selectedManualDimensionId);
      setSelectedManualDimensionId(undefined);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteManualDimension, selectedManualDimensionId]);

  useEffect(() => {
    if (!contextMenu && !angleEditor) return undefined;
    const close = () => {
      setContextMenu(null);
      setAngleEditor(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [angleEditor, contextMenu]);

  useEffect(() => {
    if (!bufferDragPartId) return undefined;
    const onMouseUp = (event: MouseEvent) => {
      const target = findSlabAtClientPoint(event.clientX, event.clientY);
      const part = parts.find((item) => item.id === bufferDragPartId);
      if (target && part) {
        const virtualPlacement: Placement = {
          id: `buffer-${part.id}`,
          slabId: target.slab.id,
          partId: part.id,
          x: target.localX - part.width / 2,
          y: target.localY - part.height / 2,
          rotation: part.rotation,
          manualLocked: true,
        };
        const snapped = resolveSnappedPlacement(part, virtualPlacement, target.slab, project.placements, parts, project.allowances);
        pushMovementSnapshot();
        placeUnplacedPart(part.id, target.slab.id, snapped.x, snapped.y);
      } else {
        clearBufferDrag();
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [bufferDragPartId, clearBufferDrag, findSlabAtClientPoint, parts, placeUnplacedPart, project.placements, pushMovementSnapshot]);

  useEffect(() => {
    if (!selectionBox) return undefined;
    const onMouseMove = (event: MouseEvent) => {
      const point = clientToSlabPoint(selectionBox.slabId, event.clientX, event.clientY);
      if (!point) return;
      setSelectionBox((current) => current && current.slabId === selectionBox.slabId
        ? { ...current, currentX: point.x, currentY: point.y }
        : current);
    };
    const onMouseUp = (event: MouseEvent) => {
      const point = clientToSlabPoint(selectionBox.slabId, event.clientX, event.clientY);
      const current = point ? { ...selectionBox, currentX: point.x, currentY: point.y } : selectionBox;
      const rect = normalizeRect(current.startX, current.startY, current.currentX, current.currentY);
      const selected = project.placements
        .filter((placement) => placement.slabId === selectionBox.slabId)
        .filter((placement) => {
          const part = parts.find((item) => item.id === placement.partId);
          return part ? polygonInsideRect(placementPolygon(part, placement), rect) : false;
        })
        .map((placement) => placement.id);
      setSelectedPlacementIds(selected);
      setSelectionBox(null);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [clientToSlabPoint, parts, project.placements, selectionBox]);

  useEffect(() => {
    if (!slabResizeDrag) return undefined;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    const onMove = (event: MouseEvent) => {
      setManualSlabHeight(clampNumber(slabResizeDrag.startHeight + event.clientY - slabResizeDrag.startY, 360, 1800));
    };
    const onUp = () => setSlabResizeDrag(null);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    window.addEventListener('blur', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      window.removeEventListener('blur', onUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [slabResizeDrag]);

  useEffect(() => {
    if (!drag) return undefined;
    const onMouseMove = (event: MouseEvent) => {
      if (drag.type === 'placement') {
        const part = parts.find((item) => item.id === drag.partId);
        const target = findSlabAtClientPoint(event.clientX, event.clientY);
        let ghostClientX: number | undefined;
        let ghostClientY: number | undefined;
        let ghostX: number | undefined;
        let ghostY: number | undefined;
        let ghostSlabId: string | undefined;
        let nextRotation = drag.rotation;
        let nextAngleSnap: Extract<CanvasDrag, { type: 'placement' }>['angleSnap'] | undefined;

        if (target && part) {
          const targetPlacement: Placement = {
            id: drag.id,
            slabId: target.slab.id,
            partId: drag.partId,
            x: target.localX - drag.offsetX,
            y: target.localY - drag.offsetY,
            rotation: nextRotation,
            manualLocked: true,
          };
          let snapped = resolveSnappedPlacement(part, targetPlacement, target.slab, project.placements, parts, project.allowances);
          if (!drag.groupIds || drag.groupIds.length <= 1) {
            const candidate = findAngledSideSnap(part, { ...targetPlacement, x: snapped.x, y: snapped.y }, target.slab, project.placements, parts);
            if (candidate) {
              armAngleSnap(drag, candidate);
              nextAngleSnap = {
                key: candidate.key,
                rotation: candidate.rotation,
                startedAt: drag.angleSnap?.key === candidate.key ? drag.angleSnap.startedAt : performance.now(),
              };
            } else {
              clearAngleSnap();
            }
          } else {
            clearAngleSnap();
          }
          ghostX = snapped.x;
          ghostY = snapped.y;
          ghostSlabId = target.slab.id;
          if (drag.groupIds && drag.groupIds.length > 1 && drag.groupStart?.[drag.id]) {
            const origin = drag.groupStart[drag.id];
            const dx = snapped.x - origin.x;
            const dy = snapped.y - origin.y;
            drag.groupIds.forEach((id) => {
              const start = drag.groupStart?.[id];
              if (start) previewTextureSource(start.partId, target.slab.id, start.x + dx, start.y + dy, start.rotation);
            });
          } else {
            previewTextureSource(part.id, target.slab.id, snapped.x, snapped.y, nextRotation);
          }
          const client = placementClientPoint(target.slab.id, snapped.x, snapped.y, drag.offsetX, drag.offsetY);
          ghostClientX = client?.clientX;
          ghostClientY = client?.clientY;
        } else {
          clearAngleSnap();
        }

        if (part && isCursorAboveTopSlab(event.clientX, event.clientY)) {
          const anchor = unplacedRevealPoint.current;
          const moved = anchor ? Math.hypot(anchor.x - event.clientX, anchor.y - event.clientY) : Infinity;
          if (!anchor || moved > 8) {
            clearUnplacedReveal();
            unplacedRevealPoint.current = { x: event.clientX, y: event.clientY };
            unplacedRevealTimer.current = window.setTimeout(() => {
              showUnplacedDropZone();
            }, 700);
          }
        } else {
          clearUnplacedReveal();
          hideUnplacedDropZone();
        }

        setDrag((current) => current?.type === 'placement'
          ? { ...current, clientX: event.clientX, clientY: event.clientY, rotation: nextRotation, angleSnap: nextAngleSnap, ghostClientX, ghostClientY, ghostX, ghostY, ghostSlabId }
          : current);
        return;
      }

      const point = clientToSvgPoint(event.clientX, event.clientY);
      const off = slabOffsets.find((item) => item.slabId === drag.slabId);
      if (!point || !off) return;
      const x = Math.max(0, point.x - off.x - drag.offsetX * scale) / scale;
      const y = Math.max(0, point.y - off.y - drag.offsetY * scale) / scale;
      updateDefect(drag.slabId, drag.id, { x, y });
    };
    const onMouseUp = (event: MouseEvent) => {
      if (drag.type === 'placement') {
        const dropTarget = document.querySelector('.unplaced-panel')?.getBoundingClientRect();
        if (
          dropTarget &&
          event.clientX >= dropTarget.left &&
          event.clientX <= dropTarget.right &&
          event.clientY >= dropTarget.top &&
          event.clientY <= dropTarget.bottom
        ) {
          unplacePart(drag.partId);
        } else {
          const target = findSlabAtClientPoint(event.clientX, event.clientY);
          if (target) {
            const part = parts.find((item) => item.id === drag.partId);
            if (part) {
              const targetPlacement: Placement = {
                id: drag.id,
                slabId: target.slab.id,
                partId: drag.partId,
                x: target.localX - drag.offsetX,
                y: target.localY - drag.offsetY,
                rotation: drag.rotation,
                manualLocked: true,
              };
              const snapped = drag.ghostSlabId === target.slab.id && drag.ghostX !== undefined && drag.ghostY !== undefined
                ? { x: drag.ghostX, y: drag.ghostY }
                : resolveSnappedPlacement(part, targetPlacement, target.slab, project.placements, parts, project.allowances);
              if (drag.groupIds && drag.groupIds.length > 1 && drag.groupStart?.[drag.id]) {
                const origin = drag.groupStart[drag.id];
                const dx = snapped.x - origin.x;
                const dy = snapped.y - origin.y;
                movePlacements(drag.groupIds.map((id) => {
                  const start = drag.groupStart?.[id];
                  return start ? { placementId: id, x: start.x + dx, y: start.y + dy, slabId: target.slab.id } : undefined;
                }).filter(Boolean) as Array<{ placementId: string; x: number; y: number; slabId?: string }>);
              } else {
                const dropPlacement = { ...targetPlacement, x: snapped.x, y: snapped.y, rotation: drag.rotation };
                const candidate = findAngledSideSnap(part, dropPlacement, target.slab, project.placements, parts);
                if (candidate) {
                  const rotatedPlacement = { ...dropPlacement, rotation: candidate.rotation };
                  const alignedPlacement = alignPlacementSegmentToTarget(part, rotatedPlacement, candidate.sourceIndex, candidate.target);
                  const finalPosition = clampToSlab(part, alignedPlacement, alignedPlacement.x, alignedPlacement.y, target.slab);
                  movePlacement(drag.id, finalPosition.x, finalPosition.y, target.slab.id, candidate.rotation);
                } else {
                  movePlacement(drag.id, snapped.x, snapped.y, target.slab.id, drag.rotation);
                }
              }
            }
          }
        }
      }
      clearAngleSnap();
      clearUnplacedReveal();
      hideUnplacedDropZone();
      clearPlacementDrag();
      setDrag(null);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [armAngleSnap, clearAngleSnap, clearPlacementDrag, clearUnplacedReveal, clientToSvgPoint, drag, findSlabAtClientPoint, hideUnplacedDropZone, isCursorAboveTopSlab, movePlacement, movePlacements, parts, placementClientPoint, previewTextureSource, project.placements, scale, showUnplacedDropZone, slabOffsets, unplacePart, updateDefect]);

  const contextPlacement = contextMenu?.kind === 'part'
    ? project.placements.find((item) => item.id === contextMenu.placementId)
    : undefined;
  const contextSelectionIds = contextMenu?.kind === 'part'
    ? (selectedPlacementIds.includes(contextMenu.placementId) ? selectedPlacementIds : [contextMenu.placementId])
    : [];
  const contextAssemblyPlacementIds = (() => {
    if (contextMenu?.kind !== 'part' || !contextPlacement) return [];
    const contextPart = parts.find((part) => part.id === contextPlacement.partId);
    if (!contextPart) return [];
    const key = assemblyGroupKey(contextPart);
    const groupPartIds = new Set(parts.filter((part) => assemblyGroupKey(part) === key).map((part) => part.id));
    return project.placements.filter((placement) => groupPartIds.has(placement.partId)).map((placement) => placement.id);
  })();
  const contextAssemblyLocked = contextAssemblyPlacementIds.length > 0
    && contextAssemblyPlacementIds.every((id) => project.placements.find((placement) => placement.id === id)?.manualLocked);
  const language = project.uiLanguage ?? 'uk';
  const ui = (value: string) => translateStaticUiText(language, value);

  return (
    <section className="panel canvas-panel">
      <div className="toolbar">
        <div className="segmented">
          <button className={viewMode === 'technical' ? 'active' : ''} onClick={() => setViewMode('technical')}>{t(language, 'technical')}</button>
          <button className={viewMode === 'photo' ? 'active' : ''} onClick={() => setViewMode('photo')}>{t(language, 'photoSurface')}</button>
          <button className={viewMode === 'texture' ? 'active' : ''} onClick={() => setViewMode('texture')}>{t(language, 'textureMode')}</button>
          <button className={showDimensions ? 'active' : ''} onClick={() => setShowDimensions((value) => !value)}>{t(language, 'dimensions')}</button>
          <button
            disabled={!activeSlabId || !activeSlabManualDimensionCount}
            onClick={() => {
              if (!activeSlabId) return;
              clearManualDimensionsForSlab(activeSlabId);
              setSelectedManualDimensionId(undefined);
            }}
          >
            {t(language, 'clearManualDimensions')}
          </button>
          <button
            disabled={!selectedManualDimensionId}
            onClick={() => {
              if (!selectedManualDimensionId) return;
              deleteManualDimension(selectedManualDimensionId);
              setSelectedManualDimensionId(undefined);
            }}
          >
            {t(language, 'deleteManualDimension')}
          </button>
          <button className={magnifierOpen ? 'active' : ''} onClick={() => setMagnifierOpen((value) => !value)}>{t(language, 'magnifier')}</button>
        </div>
      </div>
      <div ref={slabShellRef} className="slab-scroll-shell" style={slabShellHeight ? { height: `${slabShellHeight}px` } : undefined}>
      <svg id="main-svg" ref={svgRef} className={`slab-svg${bufferDragPartId ? ' slab-svg-drop-active' : ''}`} viewBox={`0 0 ${maxW * scale + 80} ${canvasHeight}`} style={{ height: `${canvasHeight}px` }}>
        {project.slabs.map((slab) => {
          const off = slabOffsets.find((item) => item.slabId === slab.id)!;
          const placements = project.placements.filter((p) => p.slabId === slab.id);
          return (
            <g key={slab.id} transform={`translate(${off.x},${off.y})`} onMouseDown={(event) => startSelectionBox(slab, event)} onContextMenu={(event) => openSlabContextMenu(slab, event)}>
              <rect x={-8} y={-22} width={slab.width * scale + 16} height={slab.height * scale + 30} fill={selectedSlabId === slab.id ? 'rgba(186,208,224,0.18)' : 'transparent'} rx={12} />
              <SlabLayer slab={slab} scale={scale} viewMode={viewMode} />
              {placements.map((placement) => {
                const part = parts.find((p) => p.id === placement.partId); if (!part) return null;
                const detail = project.details.find((item) => item.id === part.detailId);
                const poly = placementPolygon(part, placement);
                const bounds = polygonBounds(poly);
                const labelPoint = polygonCentroid(poly);
                const labelX = labelPoint.x * scale;
                const labelY = labelPoint.y * scale;
                const displayName = part.isMain ? part.parentLabel : part.name;
                const label = fitLabel(displayName, showDimensions ? part.dimsLabel : '', (bounds.maxX - bounds.minX) * scale, (bounds.maxY - bounds.minY) * scale, part.isMain ? undefined : part.edgeSide);
                const elementText = elementLabel(part);
                const elementFontSize = elementText ? Math.max(7, Math.min(10, Math.min((bounds.maxX - bounds.minX) * scale, (bounds.maxY - bounds.minY) * scale) / 3.2)) : 0;
                return (
                  <g key={placement.id} className={`part-group${selectedPlacementIds.includes(placement.id) ? ' selected' : ''}${placement.conflict || placement.outOfBounds ? ' conflicted' : ''}${drag?.type === 'placement' && drag.id === placement.id ? ' dragging-source' : ''}`} onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const groupIds = selectedPlacementIds.includes(placement.id) ? selectedPlacementIds : [placement.id];
                    if (groupIds.length > 1) {
                      const point = clientToSlabPoint(slab.id, event.clientX, event.clientY);
                      rotatePlacementGroup(groupIds, slab.id, point?.x ?? placement.x, point?.y ?? placement.y, 90);
                    } else {
                      rotatePlacement(placement.id);
                    }
                  }} onContextMenu={(event) => openPartContextMenu(slab, placement, part, event)} onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    if (dimensionDraft) {
                      addManualDimensionPoint(slab, e);
                      return;
                    }
                    const point = clientToSvgPoint(e.clientX, e.clientY); if (!point) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedManualDimensionId(undefined);
                    if (e.ctrlKey) {
                      setSelectedPlacementIds((ids) => ids.includes(placement.id)
                        ? ids.filter((id) => id !== placement.id)
                        : [...ids, placement.id]);
                      return;
                    }
                    clearUnplacedReveal();
                    clearLabelHover();
                    hideUnplacedDropZone();
                    startPlacementDrag(part.id);
                    pushMovementSnapshot();
                    const groupIds = selectedPlacementIds.includes(placement.id) ? selectedPlacementIds : [placement.id];
                    const groupStart = Object.fromEntries(project.placements
                      .filter((item) => groupIds.includes(item.id))
                      .map((item) => [item.id, { x: item.x, y: item.y, slabId: item.slabId, partId: item.partId, rotation: item.rotation }]));
                    setSelectedPlacementIds(groupIds);
                    setDrag({
                      type: 'placement',
                      id: placement.id,
                      partId: part.id,
                      slabId: slab.id,
                      offsetX: (point.x - off.x) / scale - placement.x,
                      offsetY: (point.y - off.y) / scale - placement.y,
                      rotation: placement.rotation,
                      clientX: e.clientX,
                      clientY: e.clientY,
                      groupIds,
                      groupStart,
                    });
                  }}>
                    <PartShape part={part} placement={placement} scale={scale} viewMode={viewMode} showAllowance={project.allowances.show} />
                    <EdgeProfileMarks part={part} placement={placement} profiles={detail?.edgeProfiles} scale={scale} />
                    <g
                      className="part-label-hit"
                      onMouseEnter={(event) => armLabelHover(part.id, event)}
                      onMouseMove={(event) => keepLabelHoverStill(part.id, event)}
                      onMouseLeave={() => {
                        if (expandedLabelPartId !== part.id) clearLabelHover();
                      }}
                    >
                      <rect
                        className="label-hover-zone"
                        x={labelX - label.zoneWidth / 2}
                        y={labelY - label.zoneHeight / 2}
                        width={label.zoneWidth}
                        height={label.zoneHeight}
                        rx={6}
                      />
                      {expandedLabelPartId !== part.id && (
                        <g className="detail-label">
                          {elementText ? (
                            <>
                              <text className="detail-label-text" x={labelX} y={labelY - 2} fontSize={elementFontSize} textAnchor="middle">{elementText.title}</text>
                              <text className="detail-dims-text" x={labelX} y={labelY + elementFontSize + 1} fontSize={Math.max(7, elementFontSize - 1)} textAnchor="middle">{elementText.side}</text>
                            </>
                          ) : label.singleLine ? (
                            <text className="detail-label-text" x={labelX} y={labelY + label.fontSize * 0.35} fontSize={label.fontSize} textAnchor="middle">{label.text}</text>
                          ) : (
                            <>
                              <text className="detail-label-text" x={labelX} y={labelY - 3} fontSize={label.fontSize} textAnchor="middle">{label.text}</text>
                              {showDimensions && <text className="detail-dims-text" x={labelX} y={labelY + label.dimsSize + 1} fontSize={label.dimsSize} textAnchor="middle">{part.dimsLabel}</text>}
                            </>
                          )}
                        </g>
                      )}
                    </g>
                    <PlacementStateBadges
                      placement={placement}
                      x={labelX + label.zoneWidth / 2 + 8}
                      y={labelY - label.zoneHeight / 2}
                    />
                  </g>
                );
              })}
              {showDimensions && <SlabDimensionHints slab={slab} placements={placements} parts={parts} scale={scale} />}
              {showDimensions && (
                <ManualDimensions
                  dimensions={(project.manualDimensions ?? []).filter((dimension) => dimension.slabId === slab.id)}
                  scale={scale}
                  selectedId={selectedManualDimensionId}
                  onSelect={(dimensionId) => {
                    setSelectedManualDimensionId(dimensionId);
                    setSelectedPlacementIds([]);
                    setSelectedSlabId(slab.id);
                  }}
                />
              )}
              {showDimensions && dimensionDraft?.slabId === slab.id && dimensionDraft.start && (
                <circle className="manual-dimension-anchor" cx={dimensionDraft.start.x * scale} cy={dimensionDraft.start.y * scale} r={5} />
              )}
              {slab.defects.map((defect) => {
                const pts = defectPoints(defect);
                return <g key={defect.id} className="defect-shape" onMouseDown={(e) => { const point = clientToSvgPoint(e.clientX, e.clientY); if (!point) return; e.preventDefault(); e.stopPropagation(); setDrag({ type: 'defect', id: defect.id, slabId: slab.id, offsetX: (point.x - off.x) / scale - defect.x, offsetY: (point.y - off.y) / scale - defect.y }); }}><polygon points={pointString(pts, scale)} fill="rgba(214,40,40,0.12)" stroke="#d62828" strokeWidth={2} /><circle cx={(defect.x + defect.width) * scale} cy={(defect.y + defect.height) * scale} r={4} fill="#d62828" /></g>;
              })}
              {selectionBox?.slabId === slab.id && (
                <SelectionRect box={selectionBox} scale={scale} />
              )}
              {drag?.type === 'placement' && drag.ghostSlabId === slab.id && drag.groupIds && drag.groupIds.length > 1 && (
                <GroupDragPreview drag={drag} parts={parts} scale={scale} />
              )}
              {placements.map((placement) => {
                const part = parts.find((p) => p.id === placement.partId);
                if (!part || expandedLabelPartId !== part.id) return null;
                const poly = placementPolygon(part, placement);
                const labelPoint = polygonCentroid(poly);
                const labelX = labelPoint.x * scale;
                const labelY = labelPoint.y * scale;
                const displayName = part.isMain ? part.parentLabel : part.name;
                const stateText = [
                  placement.pinnedToSlab ? 'прив’язана до слеба' : '',
                  placement.manualLocked ? 'зафіксована' : '',
                ].filter(Boolean).join(' • ');
                const fullText = `${displayName} ${part.dimsLabel}${stateText ? ` • ${stateText}` : ''}`;
                const width = Math.max(90, fullText.length * 7.2 + 20);
                return (
                  <g
                    key={`${placement.id}-label-popover`}
                    className="detail-label-popover"
                    onMouseEnter={() => setExpandedLabelPartId(part.id)}
                    onMouseLeave={clearLabelHover}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      const nextLabel = window.prompt('Нова назва деталі', part.parentLabel);
                      if (nextLabel) renamePartFamily(part.id, nextLabel);
                    }}
                  >
                    <rect x={labelX - width / 2} y={labelY - 18} width={width} height={34} rx={7} />
                    <text x={labelX} y={labelY + 4} textAnchor="middle">{fullText}</text>
                  </g>
                );
              })}
              <text x={0} y={-6} fontSize={13} fill="#2d4f6c">{slab.serialNumber} • {ui(slab.material)} • {slab.decor || ui('без декору')}</text>
            </g>
          );
        })}
      </svg>
      </div>
      {magnifierOpen && (
        <SlabMagnifierWindow
          slabs={project.slabs}
          selectedSlabId={selectedSlabId}
          placements={project.placements}
          parts={parts}
          viewMode={viewMode}
          showAllowance={project.allowances.show}
          language={language}
          drag={drag?.type === 'placement' ? drag : undefined}
          onClose={() => setMagnifierOpen(false)}
        />
      )}
      <div
        className="slab-resize-handle"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setSlabResizeDrag({ startY: event.clientY, startHeight: slabShellRef.current?.clientHeight ?? manualSlabHeight ?? 520 });
        }}
        onDoubleClick={() => setManualSlabHeight(null)}
        title="Потягніть, щоб змінити висоту зони слебів"
      >
        <span />
      </div>
      {drag?.type === 'placement' && (!drag.groupIds || drag.groupIds.length <= 1) && (
        <PlacementDragGhost drag={drag} part={parts.find((part) => part.id === drag.partId)} scale={scale} screenScale={svgCssScale} />
      )}
      <input
        ref={slabPhotoInputRef}
        className="hidden-file-input"
        type="file"
        accept="image/*"
        onChange={onSlabPhotoSelected}
      />
      {contextMenu && (
        <div
          className="canvas-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === 'part' ? (
            <>
              <button onClick={() => {
                const placement = project.placements.find((item) => item.id === contextMenu.placementId);
                setAngleEditor({
                  x: contextMenu.x,
                  y: contextMenu.y,
                  placementIds: contextSelectionIds,
                  pivotSlabId: contextMenu.slabId,
                  pivotX: contextMenu.localX,
                  pivotY: contextMenu.localY,
                  value: String(Math.round(placement?.rotation ?? 0)),
                  baseRotation: placement?.rotation ?? 0,
                });
                setContextMenu(null);
              }}>{t(language, 'angle')}</button>
              <button onClick={() => {
                contextSelectionIds.forEach((id) => togglePlacementPin(id));
                setContextMenu(null);
              }}>{contextPlacement?.pinnedToSlab ? t(language, 'unpinFromSlab') : t(language, 'pinToSlab')}</button>
              <button onClick={() => {
                contextSelectionIds.forEach((id) => togglePlacementLock(id));
                setContextMenu(null);
              }}>{contextPlacement?.manualLocked ? t(language, 'unlockPlacement') : t(language, 'lockPlacement')}</button>
              <button onClick={() => {
                setPlacementLocks(contextAssemblyPlacementIds, !contextAssemblyLocked);
                setContextMenu(null);
              }}>{contextAssemblyLocked ? t(language, 'unlockAssembly') : t(language, 'lockAssembly')}</button>
              <button onClick={() => {
                const detailIds = [...new Set(contextSelectionIds
                  .map((id) => project.placements.find((placement) => placement.id === id))
                  .map((placement) => placement ? parts.find((item) => item.id === placement.partId)?.detailId : undefined)
                  .filter(Boolean) as string[])];
                if (detailIds.length === 1) startEditDetail(detailIds[0]);
                else if (detailIds.length > 1) window.alert('Вибрано декілька деталей');
                setContextMenu(null);
              }}>{t(language, 'edit')}</button>
              <button onClick={() => {
                const detailIds = new Set<string>();
                contextSelectionIds.forEach((id) => {
                  const placement = project.placements.find((item) => item.id === id);
                  const part = placement ? parts.find((item) => item.id === placement.partId) : undefined;
                  if (part && !detailIds.has(part.detailId)) {
                    detailIds.add(part.detailId);
                    duplicateDetailForPart(part.id);
                  }
                });
                setContextMenu(null);
              }}>{t(language, 'copy')}</button>
              <button className="danger-menu-item" onClick={() => {
                const detailIds = new Set<string>();
                contextSelectionIds.forEach((id) => {
                  const placement = project.placements.find((item) => item.id === id);
                  const part = placement ? parts.find((item) => item.id === placement.partId) : undefined;
                  if (part) detailIds.add(part.detailId);
                });
                detailIds.forEach((detailId) => deleteDetail(detailId));
                setContextMenu(null);
              }}>{t(language, 'delete')}</button>
            </>
          ) : (
            <>
              <button onClick={() => { runPacking(); setContextMenu(null); }}>{t(language, 'recalcSlab')}</button>
              <button onClick={() => {
                slabPhotoTargetId.current = contextMenu.slabId;
                slabPhotoInputRef.current?.click();
                setContextMenu(null);
              }}>{t(language, 'addPhoto')}</button>
              <button onClick={() => { addDefectAt(contextMenu.slabId, contextMenu.localX, contextMenu.localY); setContextMenu(null); }}>{t(language, 'addDefect')}</button>
              <button onClick={() => { setShowDimensions((value) => !value); setContextMenu(null); }}>{t(language, 'dimensions')}</button>
              <button onClick={() => { setDimensionDraft({ slabId: contextMenu.slabId }); setContextMenu(null); }}>{t(language, 'additionalDimension')}</button>
              <button onClick={() => openSlabEditor(contextMenu.slabId)}>{t(language, 'editSlab')}</button>
            </>
          )}
        </div>
      )}
      {slabEditor && (
        <div className="modal-backdrop" role="presentation">
          <div className="detail-modal slab-edit-modal" role="dialog" aria-modal="true" aria-label={t(language, 'editSlab')}>
            <div className="detail-modal-header">
              <div>
                <h2>{t(language, 'editSlab')}</h2>
                <p>{ui('Змінюються тільки параметри слеба. Розкладка, фото і дефекти залишаються на місці.')}</p>
              </div>
              <button type="button" className="icon-button" aria-label={ui('Закрити')} onClick={() => setSlabEditor(null)}>×</button>
            </div>
            <div className="form-grid compact slab-edit-grid">
              <label><span>{ui('Серійний номер')}</span><input value={slabEditor.draft.serialNumber} onChange={(event) => updateSlabEditorDraft({ serialNumber: event.target.value })} /></label>
              <label><span>{ui('Матеріал')}</span><select value={slabEditor.draft.material} onChange={(event) => updateSlabEditorDraft({ material: event.target.value as MaterialType })}>{referenceData.materials.map((material) => <option key={material} value={material}>{ui(material)}</option>)}</select></label>
              <label><span>{ui('Ширина')}</span><input type="number" value={slabEditor.draft.width} onChange={(event) => updateSlabEditorDraft({ width: Number(event.target.value) })} /></label>
              <label><span>{ui('Висота')}</span><input type="number" value={slabEditor.draft.height} onChange={(event) => updateSlabEditorDraft({ height: Number(event.target.value) })} /></label>
              <label><span>{ui('Товщина')}</span><input type="number" value={slabEditor.draft.thickness} onChange={(event) => updateSlabEditorDraft({ thickness: Number(event.target.value) })} /></label>
              <label><span>{ui('Мін. відступ')}</span><input type="number" value={slabEditor.draft.minMargin} onChange={(event) => updateSlabEditorDraft({ minMargin: Number(event.target.value) })} /></label>
              <label><span>{ui('Декор')}</span><input value={slabEditor.draft.decor} onChange={(event) => updateSlabEditorDraft({ decor: event.target.value })} /></label>
              <label><span>{ui('Коментар')}</span><input value={slabEditor.draft.comment} onChange={(event) => updateSlabEditorDraft({ comment: event.target.value })} /></label>
            </div>
            <div className="detail-modal-footer">
              <button type="button" onClick={() => setSlabEditor(null)}>{ui('Закрити')}</button>
              <button type="button" className="primary-action" onClick={saveSlabEditor}>{ui('Зберегти')}</button>
            </div>
          </div>
        </div>
      )}
      {angleEditor && (
        <form
          className="angle-editor-popover"
          style={{ left: angleEditor.x, top: angleEditor.y }}
          onClick={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault();
            setExactPlacementAngle(angleEditor, angleEditor.value);
            setAngleEditor(null);
          }}
        >
          <label>{t(language, 'angle')}</label>
          <div>
            <input
              autoFocus
              value={angleEditor.value}
              onChange={(event) => setAngleEditor((current) => current ? { ...current, value: event.target.value } : current)}
              placeholder="17°"
            />
            <button type="submit">OK</button>
          </div>
        </form>
      )}
    </section>
  );
}
