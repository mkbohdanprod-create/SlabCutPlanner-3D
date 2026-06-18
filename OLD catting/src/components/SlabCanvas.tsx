import { ChangeEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { referenceData, uid } from '../domain/defaults';
import { CutAllowances, DetailPart, DefectZone, EdgeProfileSelection, ManualDimension, MaterialType, Placement, Point, SlabInstance, UiLanguage } from '../domain/types';
import { t, translateStaticUiText } from '../i18n';
import { normalizeRotation, placementPolygon, pointString, polygonBounds, rotatedLocalPoints, rotatedPoints, rotatedSize, translatePoints } from '../lib/project';
import { useProjectStore } from '../store/useProjectStore';
import { edgeMarkersForPart, edgeProfileShortLabel } from '../utils/edgeProfiles';
import { readFileAsDataUrl } from '../utils/file';

type CanvasDrag =
  | {
    type: 'placement';
    id: string;
    partId: string;
    slabId: string;
    offsetX: number;
    offsetY: number;
    rotation: Placement['rotation'];
    clientX: number;
    clientY: number;
    ghostClientX?: number;
    ghostClientY?: number;
    ghostX?: number;
    ghostY?: number;
    ghostSlabId?: string;
    angleSnap?: { key: string; startedAt: number; rotation: Placement['rotation'] };
    groupIds?: string[];
    groupStart?: Record<string, { x: number; y: number; slabId: string; partId: string; rotation: Placement['rotation'] }>;
  }
  | { type: 'defect'; id: string; slabId: string; offsetX: number; offsetY: number };

type SelectionBox = {
  slabId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type LocalRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type CanvasContextMenu =
  | { kind: 'part'; x: number; y: number; slabId: string; localX: number; localY: number; placementId: string; partId: string }
  | { kind: 'slab'; x: number; y: number; slabId: string; localX: number; localY: number };

type AngleEditorState = { x: number; y: number; placementIds: string[]; pivotSlabId: string; pivotX: number; pivotY: number; value: string; baseRotation: number };
type SlabEditorDraft = Pick<SlabInstance, 'width' | 'height' | 'thickness' | 'material' | 'decor' | 'comment' | 'minMargin' | 'serialNumber'>;

function defaultDefectPolygon(x: number, y: number, width: number, height: number) {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

function normalizeRect(startX: number, startY: number, currentX: number, currentY: number): LocalRect {
  return {
    minX: Math.min(startX, currentX),
    minY: Math.min(startY, currentY),
    maxX: Math.max(startX, currentX),
    maxY: Math.max(startY, currentY),
  };
}

function polygonInsideRect(points: Array<{ x: number; y: number }>, rect: LocalRect) {
  return points.every((point) => (
    point.x >= rect.minX
    && point.x <= rect.maxX
    && point.y >= rect.minY
    && point.y <= rect.maxY
  ));
}

function pointsForPlacement(part: DetailPart, placement: Placement, points = part.points) {
  return translatePoints(rotatedLocalPoints(points, placement.rotation, part.width, part.height, part.points), placement.x, placement.y);
}

function closestPointOnSegment(point: Point, start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return start;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  return { x: start.x + dx * t, y: start.y + dy * t };
}

function manualPointDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function manualDimensionSegments(points: Point[]) {
  return points.map((start, index) => ({ start, end: points[(index + 1) % points.length] }));
}

function assemblyGroupKey(part: DetailPart) {
  if (part.textureGroupLabel?.startsWith('import:')) return part.textureGroupLabel;
  return `${part.detailId}:${part.textureGroupLabel ?? part.parentLabel}`;
}

function svgPath(points: Array<{ x: number; y: number }>, scale: number, holes: Array<Array<{ x: number; y: number }>> = []) {
  const pathFor = (items: Array<{ x: number; y: number }>) => items
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x * scale} ${point.y * scale}`)
    .join(' ');
  return `${pathFor(points)} Z ${holes.map((hole) => `${pathFor(hole)} Z`).join(' ')}`;
}

function snapValue(target: number, candidates: number[], threshold = 25) {
  let best = target; let bestDistance = Infinity;
  candidates.forEach((candidate) => {
    const distance = Math.abs(candidate - target);
    if (distance < bestDistance && distance <= threshold) { best = candidate; bestDistance = distance; }
  });
  return best;
}

function findSnap(placement: Placement, desiredX: number, desiredY: number, slab: SlabInstance, placements: Placement[], parts: DetailPart[], allowances?: CutAllowances) {
  const part = parts.find((p) => p.id === placement.partId);
  if (!part) return { x: desiredX, y: desiredY };
  const size = rotatedSize(part, placement.rotation);
  const interPartSpacing = Math.max(0, allowances?.interPartSpacing ?? 0);
  const rightLimit = slab.width - slab.minMargin;
  const bottomLimit = slab.height - slab.minMargin;
  const xCandidates = [
    slab.minMargin,
    rightLimit - size.width,
    slab.width / 2 - size.width / 2,
  ];
  const yCandidates = [
    slab.minMargin,
    bottomLimit - size.height,
    slab.height / 2 - size.height / 2,
  ];
  const xSpacingCandidates: number[] = [];
  const ySpacingCandidates: number[] = [];
  placements.forEach((other) => {
    if (other.id === placement.id || other.slabId !== placement.slabId) return;
    const otherPart = parts.find((p) => p.id === other.partId); if (!otherPart) return;
    const os = rotatedSize(otherPart, other.rotation);
    const otherCenterX = other.x + os.width / 2;
    const otherCenterY = other.y + os.height / 2;
    xCandidates.push(
      other.x,
      other.x + os.width,
      other.x - size.width,
      other.x + os.width - size.width,
      otherCenterX - size.width / 2,
      other.x - size.width - slab.minMargin,
      other.x + os.width + slab.minMargin,
    );
    if (interPartSpacing > 0) {
      xSpacingCandidates.push(
        other.x - size.width - interPartSpacing,
        other.x + os.width + interPartSpacing,
      );
    }
    yCandidates.push(
      other.y,
      other.y + os.height,
      other.y - size.height,
      other.y + os.height - size.height,
      otherCenterY - size.height / 2,
      other.y - size.height - slab.minMargin,
      other.y + os.height + slab.minMargin,
    );
    if (interPartSpacing > 0) {
      ySpacingCandidates.push(
        other.y - size.height - interPartSpacing,
        other.y + os.height + interPartSpacing,
      );
    }
  });
  const xBySpacing = interPartSpacing > 0 ? snapValue(desiredX, xSpacingCandidates, Math.min(90, Math.max(42, interPartSpacing + 28))) : desiredX;
  const yBySpacing = interPartSpacing > 0 ? snapValue(desiredY, ySpacingCandidates, Math.min(90, Math.max(42, interPartSpacing + 28))) : desiredY;
  return {
    x: snapValue(xBySpacing, xCandidates, xBySpacing === desiredX ? 34 : 16),
    y: snapValue(yBySpacing, yCandidates, yBySpacing === desiredY ? 34 : 16),
  };
}

type EdgeSegment = { start: { x: number; y: number }; end: { x: number; y: number }; angle: number; length: number; key: string; index: number };
type AngleSnapCandidate = { key: string; rotation: number; score: number; sourceIndex: number; target: EdgeSegment };

function segmentAngle(start: { x: number; y: number }, end: { x: number; y: number }) {
  const raw = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  return ((raw % 180) + 180) % 180;
}

function angleDelta(from: number, to: number) {
  return ((to - from + 90 + 180) % 180) - 90;
}

function pointToSegmentDistance(point: { x: number; y: number }, segment: EdgeSegment) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return Math.hypot(point.x - segment.start.x, point.y - segment.start.y);
  const t = Math.max(0, Math.min(1, ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSq));
  const x = segment.start.x + dx * t;
  const y = segment.start.y + dy * t;
  return Math.hypot(point.x - x, point.y - y);
}

function segmentDistance(a: EdgeSegment, b: EdgeSegment) {
  const aMid = { x: (a.start.x + a.end.x) / 2, y: (a.start.y + a.end.y) / 2 };
  const bMid = { x: (b.start.x + b.end.x) / 2, y: (b.start.y + b.end.y) / 2 };
  const endpointDistance = Math.min(
    pointToSegmentDistance(aMid, b),
    pointToSegmentDistance(bMid, a),
    pointToSegmentDistance(a.start, b),
    pointToSegmentDistance(a.end, b),
    pointToSegmentDistance(b.start, a),
    pointToSegmentDistance(b.end, a),
  );
  const ux = (b.end.x - b.start.x) / Math.max(b.length, 0.0001);
  const uy = (b.end.y - b.start.y) / Math.max(b.length, 0.0001);
  const nx = -uy;
  const ny = ux;
  const axis = (point: { x: number; y: number }) => (point.x - b.start.x) * ux + (point.y - b.start.y) * uy;
  const normal = (point: { x: number; y: number }) => (point.x - b.start.x) * nx + (point.y - b.start.y) * ny;
  const a1 = axis(a.start);
  const a2 = axis(a.end);
  const minA = Math.min(a1, a2);
  const maxA = Math.max(a1, a2);
  const gap = Math.max(0, Math.max(minA - b.length, -maxA));
  const lineDistance = (Math.abs(normal(a.start)) + Math.abs(normal(a.end))) / 2;
  return Math.min(endpointDistance, Math.hypot(gap, lineDistance));
}

function polygonSegments(points: Array<{ x: number; y: number }>, keyPrefix: string) {
  return points
    .map((start, index) => {
      const end = points[(index + 1) % points.length];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      return { start, end, length, angle: segmentAngle(start, end), key: `${keyPrefix}:${index}`, index };
    })
    .filter((segment) => segment.length >= 40);
}

function alignPlacementSegmentToTarget(part: DetailPart, placement: Placement, sourceIndex: number, target: EdgeSegment): Placement {
  const source = polygonSegments(placementPolygon(part, placement), `moving:${placement.id}`).find((segment) => segment.index === sourceIndex);
  if (!source) return placement;
  const sourceMid = { x: (source.start.x + source.end.x) / 2, y: (source.start.y + source.end.y) / 2 };
  const dx = target.end.x - target.start.x;
  const dy = target.end.y - target.start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return placement;
  const t = ((sourceMid.x - target.start.x) * dx + (sourceMid.y - target.start.y) * dy) / lengthSq;
  const projected = { x: target.start.x + dx * t, y: target.start.y + dy * t };
  return {
    ...placement,
    x: placement.x + projected.x - sourceMid.x,
    y: placement.y + projected.y - sourceMid.y,
  };
}

function findAngledSideSnap(part: DetailPart, placement: Placement, slab: SlabInstance, placements: Placement[], parts: DetailPart[], includeAligned = false) {
  const moving = polygonSegments(placementPolygon(part, placement), `moving:${placement.id}`);
  if (!moving.length) return undefined;
  const margin = Math.max(0, slab.minMargin);
  const slabEdges = polygonSegments([
    { x: margin, y: margin },
    { x: slab.width - margin, y: margin },
    { x: slab.width - margin, y: slab.height - margin },
    { x: margin, y: slab.height - margin },
  ], `slab:${slab.id}`);
  const otherEdges = placements.flatMap((other) => {
    if (other.id === placement.id || other.slabId !== placement.slabId) return [];
    const otherPart = parts.find((item) => item.id === other.partId);
    return otherPart ? polygonSegments(placementPolygon(otherPart, other), `placement:${other.id}`) : [];
  });
  const targetEdges = [...slabEdges, ...otherEdges];
  let best: AngleSnapCandidate | undefined;

  moving.forEach((source) => {
    targetEdges.forEach((target) => {
      const diff = angleDelta(source.angle, target.angle);
      const absDiff = Math.abs(diff);
      if ((includeAligned ? absDiff > 12 : absDiff < 1 || absDiff > 12)) return;
      const distance = segmentDistance(source, target);
      if (distance > 110) return;
      const score = distance + absDiff * 4;
      if (!best || score < best.score) {
        best = {
          key: `${source.key}->${target.key}`,
          rotation: normalizeRotation(placement.rotation + diff),
          sourceIndex: source.index,
          target,
          score,
        };
      }
    });
  });
  return best;
}

function polygonCentroid(points: Array<{ x: number; y: number }>) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area) < 0.01) {
    const bounds = polygonBounds(points);
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

function rotateCoordinateAround(point: { x: number; y: number }, pivot: { x: number; y: number }, degrees: number) {
  const angle = degrees * Math.PI / 180;
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: pivot.y + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

function rigidRotatePlacementMove(part: DetailPart, placement: Placement, pivot: { x: number; y: number }, degrees: number) {
  const nextRotation = normalizeRotation(placement.rotation + degrees);
  const before = placementPolygon(part, placement).map((point) => rotateCoordinateAround(point, pivot, degrees));
  const afterLocal = rotatedPoints(part, nextRotation);
  const anchor = afterLocal.reduce((acc, point, index) => {
    const target = before[index] ?? before[0];
    return { x: acc.x + target.x - point.x, y: acc.y + target.y - point.y };
  }, { x: 0, y: 0 });
  const count = Math.max(afterLocal.length, 1);
  return {
    placementId: placement.id,
    x: anchor.x / count,
    y: anchor.y / count,
    slabId: placement.slabId,
    rotation: nextRotation,
  };
}

function fitLabel(text: string, dimsText: string, width: number, height: number, side?: string) {
  const safeWidth = Math.max(width * 0.78, 18);
  const safeHeight = Math.max(height * 0.32, 10);
  const singleLine = height < 30 && width > height * 1.8;
  const baseText = singleLine ? `${text} ${dimsText}` : text;
  const fullSize = Math.min(15, Math.max(7, safeHeight * 0.5));
  const fittedSize = Math.max(7, Math.min(fullSize, safeWidth / Math.max(baseText.length * 0.56, 1)));
  const maxChars = Math.max(3, Math.floor(safeWidth / Math.max(fittedSize * 0.58, 1)));
  const display = baseText.length > maxChars ? (side ?? `${baseText.slice(0, Math.max(2, maxChars - 1))}…`) : baseText;
  const dimsSize = Math.max(7, Math.min(12, fittedSize - 1));
  const textWidth = display.length * fittedSize * 0.58;
  const dimsWidth = singleLine ? 0 : dimsText.length * dimsSize * 0.55;
  return {
    text: display,
    fontSize: fittedSize,
    dimsSize,
    singleLine,
    zoneWidth: Math.min(width * 0.88, Math.max(34, Math.max(textWidth, dimsWidth) + 12)),
    zoneHeight: singleLine ? Math.max(18, fittedSize * 1.8) : Math.max(22, fittedSize * 2.4),
  };
}

function elementLabel(part: DetailPart) {
  if (part.isMain || !part.edgeKind || !part.edgeSide) return undefined;
  return {
    title: part.edgeKind === 'fold' ? 'Підв.' : 'Пот.',
    side: `Сторона ${part.edgeSide.toUpperCase()}`,
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampToSlab(part: DetailPart, placement: Placement, x: number, y: number, slab: SlabInstance) {
  const size = rotatedSize(part, placement.rotation);
  return {
    x: Math.max(slab.minMargin, Math.min(x, slab.width - slab.minMargin - size.width)),
    y: Math.max(slab.minMargin, Math.min(y, slab.height - slab.minMargin - size.height)),
  };
}

function resolveSnappedPlacement(part: DetailPart, placement: Placement, slab: SlabInstance, placements: Placement[], parts: DetailPart[], allowances?: CutAllowances) {
  const clamped = clampToSlab(part, placement, placement.x, placement.y, slab);
  const snapped = findSnap(placement, clamped.x, clamped.y, slab, placements, parts, allowances);
  return clampToSlab(part, placement, snapped.x, snapped.y, slab);
}

function defectPoints(defect: DefectZone) {
  if (defect.shapeType === 'circle') {
    const r = defect.width / 2;
    const cx = defect.x + r; const cy = defect.y + defect.height / 2;
    return Array.from({ length: 28 }, (_, i) => { const a = Math.PI * 2 * i / 28; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * defect.height / 2 }; });
  }
  if (defect.shapeType === 'triangle') return [{ x: defect.x + defect.width / 2, y: defect.y }, { x: defect.x + defect.width, y: defect.y + defect.height }, { x: defect.x, y: defect.y + defect.height }];
  if (defect.shapeType === 'polygon' && defect.points?.length) return defect.points;
  return [{ x: defect.x, y: defect.y }, { x: defect.x + defect.width, y: defect.y }, { x: defect.x + defect.width, y: defect.y + defect.height }, { x: defect.x, y: defect.y + defect.height }];
}

export function SlabCanvas() {
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

function SlabMagnifierWindow({
  slabs,
  selectedSlabId,
  placements,
  parts,
  viewMode,
  showAllowance,
  language,
  drag,
  onClose,
}: {
  slabs: SlabInstance[];
  selectedSlabId?: string;
  placements: Placement[];
  parts: DetailPart[];
  viewMode: 'technical' | 'photo' | 'texture';
  showAllowance: boolean;
  language: UiLanguage;
  drag?: Extract<CanvasDrag, { type: 'placement' }>;
  onClose: () => void;
}) {
  const slab = slabs.find((item) => item.id === selectedSlabId) ?? slabs[0];
  const [zoom, setZoom] = useState(2);
  const [position, setPosition] = useState({ x: 48, y: 190 });
  const [windowDrag, setWindowDrag] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [mapDrag, setMapDrag] = useState(false);
  const [center, setCenter] = useState<{ slabId: string; x: number; y: number } | null>(null);
  const mapRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!slab) return;
    setCenter((current) => current?.slabId === slab.id ? current : { slabId: slab.id, x: slab.width / 2, y: slab.height / 2 });
  }, [slab]);

  useEffect(() => {
    if (!windowDrag) return undefined;
    const onMove = (event: globalThis.MouseEvent) => {
      const width = Math.min(560, window.innerWidth - 36);
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - 260);
      setPosition({
        x: clampNumber(windowDrag.originX + event.clientX - windowDrag.startX, 8, maxX),
        y: clampNumber(windowDrag.originY + event.clientY - windowDrag.startY, 8, maxY),
      });
    };
    const onUp = () => setWindowDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [windowDrag]);

  if (!slab) return null;

  const dragPreviewPlacements = (() => {
    if (!drag || drag.ghostSlabId === undefined || drag.ghostX === undefined || drag.ghostY === undefined) return [] as Placement[];
    const ids = drag.groupIds?.length ? drag.groupIds : [drag.id];
    const origin = drag.groupStart?.[drag.id] ?? placements.find((placement) => placement.id === drag.id);
    if (!origin) return [] as Placement[];
    const dx = drag.ghostX - origin.x;
    const dy = drag.ghostY - origin.y;
    return ids
      .map((id) => {
        const start = drag.groupStart?.[id] ?? placements.find((placement) => placement.id === id);
        if (!start) return undefined;
        const current = placements.find((placement) => placement.id === id);
        return {
          ...(current ?? {}),
          id,
          partId: start.partId,
          slabId: drag.ghostSlabId ?? start.slabId,
          x: start.x + dx,
          y: start.y + dy,
          rotation: start.rotation,
          manualLocked: current?.manualLocked ?? false,
          pinnedToSlab: current?.pinnedToSlab,
          pinnedSlabId: current?.pinnedSlabId,
          pinMode: current?.pinMode,
          conflict: current?.conflict,
          outOfBounds: current?.outOfBounds,
        } as Placement;
      })
      .filter(Boolean) as Placement[];
  })();
  const draggedIds = new Set(dragPreviewPlacements.map((placement) => placement.id));
  const slabPlacements = [
    ...placements.filter((placement) => placement.slabId === slab.id && !draggedIds.has(placement.id)),
    ...dragPreviewPlacements.filter((placement) => placement.slabId === slab.id),
  ];
  const viewportWidth = slab.width / zoom;
  const viewportHeight = slab.height / zoom;
  const clampCenter = (value: number, viewportSize: number, totalSize: number) => (
    totalSize <= viewportSize ? totalSize / 2 : clampNumber(value, viewportSize / 2, totalSize - viewportSize / 2)
  );
  const centerX = clampCenter(center?.x ?? slab.width / 2, viewportWidth, slab.width);
  const centerY = clampCenter(center?.y ?? slab.height / 2, viewportHeight, slab.height);
  const viewX = centerX - viewportWidth / 2;
  const viewY = centerY - viewportHeight / 2;
  const miniWidth = 180;
  const miniHeight = Math.max(70, Math.min(150, miniWidth * slab.height / Math.max(slab.width, 1)));

  const updateCenterFromMap = (event: ReactMouseEvent<SVGSVGElement>) => {
    const svg = mapRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());
    setCenter({
      slabId: slab.id,
      x: clampCenter(local.x, viewportWidth, slab.width),
      y: clampCenter(local.y, viewportHeight, slab.height),
    });
  };

  return (
    <aside className="slab-magnifier-window" style={{ left: position.x, top: position.y }}>
      <div
        className="slab-magnifier-header"
        onMouseDown={(event) => setWindowDrag({
          startX: event.clientX,
          startY: event.clientY,
          originX: position.x,
          originY: position.y,
        })}
      >
        <strong>{t(language, 'magnifier')}</strong>
        <button onClick={onClose}>×</button>
      </div>
      <div className="slab-magnifier-zoom">
        {Array.from({ length: 9 }, (_, index) => index + 2).map((value) => (
          <button key={value} className={zoom === value ? 'active' : ''} onClick={() => setZoom(value)}>x{value}</button>
        ))}
      </div>
      <div className="slab-magnifier-body">
        <svg className="slab-magnifier-view" viewBox={`${viewX} ${viewY} ${viewportWidth} ${viewportHeight}`}>
          <SlabLayer slab={slab} scale={1} viewMode={viewMode} />
          {slabPlacements.map((placement) => {
            const part = parts.find((item) => item.id === placement.partId);
            if (!part) return null;
            const centroid = polygonCentroid(placementPolygon(part, placement));
            return (
              <g key={placement.id} className="slab-magnifier-part">
                <PartShape part={part} placement={placement} scale={1} viewMode={viewMode} showAllowance={showAllowance} />
                <text x={centroid.x} y={centroid.y} textAnchor="middle">{part.isMain ? part.parentLabel : part.name}</text>
              </g>
            );
          })}
          {slab.defects.map((defect) => (
            <polygon key={defect.id} points={pointString(defectPoints(defect), 1)} fill="rgba(214,40,40,0.12)" stroke="#d62828" strokeWidth={2} />
          ))}
        </svg>
        <div className="slab-magnifier-map">
          <svg
            ref={mapRef}
            viewBox={`0 0 ${slab.width} ${slab.height}`}
            style={{ width: miniWidth, height: miniHeight }}
            onMouseDown={(event) => {
              setMapDrag(true);
              updateCenterFromMap(event);
            }}
            onMouseMove={(event) => {
              if (mapDrag) updateCenterFromMap(event);
            }}
            onMouseUp={() => setMapDrag(false)}
            onMouseLeave={() => setMapDrag(false)}
          >
            <SlabLayer slab={slab} scale={1} viewMode={viewMode} />
            {slabPlacements.map((placement) => {
              const part = parts.find((item) => item.id === placement.partId);
              return part ? <polygon key={placement.id} points={pointString(pointsForPlacement(part, placement), 1)} /> : null;
            })}
            <rect className="slab-magnifier-map-window" x={viewX} y={viewY} width={viewportWidth} height={viewportHeight} />
          </svg>
        </div>
      </div>
    </aside>
  );
}

function SelectionRect({ box, scale }: { box: SelectionBox; scale: number }) {
  const rect = normalizeRect(box.startX, box.startY, box.currentX, box.currentY);
  return (
    <rect
      className="selection-rect"
      x={rect.minX * scale}
      y={rect.minY * scale}
      width={(rect.maxX - rect.minX) * scale}
      height={(rect.maxY - rect.minY) * scale}
    />
  );
}

function PlacementStateBadges({ placement, x, y }: { placement: Placement; x: number; y: number }) {
  const badges = [
    placement.pinnedToSlab ? { key: 'pin', label: 'P' } : undefined,
    placement.manualLocked ? { key: 'lock', label: 'L' } : undefined,
  ].filter(Boolean) as Array<{ key: string; label: string }>;
  if (!badges.length) return null;
  return (
    <g className="placement-state-badges">
      {badges.map((badge, index) => (
        <g key={badge.key} transform={`translate(${x},${y + index * 16})`}>
          <rect x={0} y={0} width={14} height={14} rx={4} />
          <text x={7} y={10} textAnchor="middle">{badge.label}</text>
        </g>
      ))}
    </g>
  );
}

function PartShape({ part, placement, scale, viewMode, showAllowance }: { part: DetailPart; placement: Placement; scale: number; viewMode: 'technical' | 'photo' | 'texture'; showAllowance: boolean }) {
  const conflict = placement.conflict || placement.outOfBounds;
  const stroke = conflict ? '#d62828' : '#2d4f6c';
  const strokeWidth = conflict ? 3 : 1.5;
  const fill = viewMode === 'photo' ? 'rgba(255,255,255,0.14)' : 'rgba(114,147,171,0.35)';
  const actual = pointsForPlacement(part, placement);
  const actualHoles = (part.holes ?? []).map((hole) => pointsForPlacement(part, placement, hole));
  const nominal = showAllowance && part.nominalPoints?.length ? pointsForPlacement(part, placement, part.nominalPoints) : undefined;
  const nominalHoles = nominal ? (part.nominalHoles ?? []).map((hole) => pointsForPlacement(part, placement, hole)) : [];

  if (nominal) {
    return (
      <>
        <path d={svgPath(nominal, scale, nominalHoles)} fill={fill} fillRule="evenodd" stroke={stroke} strokeWidth={strokeWidth} />
        <path className="allowance-outline" d={svgPath(actual, scale, actualHoles)} fill="none" fillRule="evenodd" stroke={stroke} />
      </>
    );
  }

  if (actualHoles.length) {
    return <path d={svgPath(actual, scale, actualHoles)} fill={fill} fillRule="evenodd" stroke={stroke} strokeWidth={strokeWidth} />;
  }

  return <polygon points={pointString(actual, scale)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
}

function EdgeProfileMarks({ part, placement, profiles, scale }: { part: DetailPart; placement: Placement; profiles?: EdgeProfileSelection; scale: number }) {
  const markers = edgeMarkersForPart(part, profiles, placement.rotation);
  if (!markers.length) return null;
  return (
    <g className="edge-profile-marks" pointerEvents="none">
      {markers.map((marker) => {
        const x1 = (placement.x + marker.start.x) * scale;
        const y1 = (placement.y + marker.start.y) * scale;
        const x2 = (placement.x + marker.end.x) * scale;
        const y2 = (placement.y + marker.end.y) * scale;
        const labelX = (placement.x + marker.labelPoint.x) * scale;
        const labelY = (placement.y + marker.labelPoint.y) * scale;
        return (
          <g key={`${part.id}-${marker.side}-${marker.profile}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} />
            <text x={labelX} y={labelY - 3} textAnchor="middle">{edgeProfileShortLabel(marker.profile)}</text>
          </g>
        );
      })}
    </g>
  );
}

function GroupDragPreview({ drag, parts, scale }: { drag: Extract<CanvasDrag, { type: 'placement' }>; parts: DetailPart[]; scale: number }) {
  const origin = drag.groupStart?.[drag.id];
  if (!origin || drag.ghostX === undefined || drag.ghostY === undefined || !drag.groupIds?.length) return null;
  const dx = drag.ghostX - origin.x;
  const dy = drag.ghostY - origin.y;

  return (
    <g className="group-drag-preview">
      {drag.groupIds.map((id) => {
        const start = drag.groupStart?.[id];
        const part = start ? parts.find((candidate) => candidate.id === start.partId) : undefined;
        if (!start || !part) return null;
        const placement: Placement = {
          id,
          partId: part.id,
          slabId: drag.ghostSlabId ?? start.slabId,
          x: start.x + dx,
          y: start.y + dy,
          rotation: start.rotation,
          manualLocked: true,
        };
        return <polygon key={id} points={pointString(pointsForPlacement(part, placement), scale)} />;
      })}
    </g>
  );
}

function PlacementDragGhost({ drag, part, scale, screenScale }: { drag: Extract<CanvasDrag, { type: 'placement' }>; part?: DetailPart; scale: number; screenScale: number }) {
  if (!part) return null;
  const points = rotatedPoints(part, drag.rotation);
  const bounds = polygonBounds(points);
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const displayScale = scale * screenScale;
  const clientX = drag.ghostClientX ?? drag.clientX;
  const clientY = drag.ghostClientY ?? drag.clientY;
  const left = clientX - (drag.offsetX - bounds.minX) * displayScale;
  const top = clientY - (drag.offsetY - bounds.minY) * displayScale;
  const labelX = (bounds.minX + bounds.maxX) / 2;
  const labelY = (bounds.minY + bounds.maxY) / 2;

  return (
    <svg
      className="placement-drag-ghost"
      style={{ left, top, width: width * displayScale, height: height * displayScale }}
      viewBox={`${bounds.minX} ${bounds.minY} ${width} ${height}`}
      aria-hidden="true"
    >
      <polygon points={pointString(points)} />
      <text x={labelX} y={labelY - 8} textAnchor="middle">{part.parentLabel}</text>
      <text x={labelX} y={labelY + 18} textAnchor="middle">{part.dimsLabel}</text>
    </svg>
  );
}

function ManualDimensions({
  dimensions,
  scale,
  selectedId,
  onSelect,
}: {
  dimensions: ManualDimension[];
  scale: number;
  selectedId?: string;
  onSelect: (dimensionId: string) => void;
}) {
  if (!dimensions.length) return null;
  return (
    <g className="slab-dimensions manual-dimensions">
      {dimensions.map((dimension) => {
        const dx = dimension.end.x - dimension.start.x;
        const dy = dimension.end.y - dimension.start.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const midX = (dimension.start.x + dimension.end.x) * scale / 2;
        const midY = (dimension.start.y + dimension.end.y) * scale / 2;
        const labelX = midX + (-dy / length) * 12;
        const labelY = midY + (dx / length) * 12;
        const markerId = `manual-dim-arrow-${dimension.id}`;
        return (
          <g
            key={dimension.id}
            className={`manual-dimension${selectedId === dimension.id ? ' selected' : ''}`}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect(dimension.id);
            }}
          >
            <defs>
              <marker id={markerId} markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M0 0 L8 4 L0 8 z" />
              </marker>
            </defs>
            <line
              className="manual-dimension-hitbox"
              x1={dimension.start.x * scale}
              y1={dimension.start.y * scale}
              x2={dimension.end.x * scale}
              y2={dimension.end.y * scale}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelect(dimension.id);
              }}
            />
            <line
              className="dimension-arrow"
              x1={dimension.start.x * scale}
              y1={dimension.start.y * scale}
              x2={dimension.end.x * scale}
              y2={dimension.end.y * scale}
              markerStart={`url(#${markerId})`}
              markerEnd={`url(#${markerId})`}
            />
            <text x={labelX} y={labelY} textAnchor="middle">{Math.round(length)} мм</text>
          </g>
        );
      })}
    </g>
  );
}

function SlabDimensionHints({ slab, placements, parts, scale }: { slab: SlabInstance; placements: Placement[]; parts: DetailPart[]; scale: number }) {
  const boxes = placements
    .map((placement) => {
      const part = parts.find((item) => item.id === placement.partId);
      return part ? polygonBounds(placementPolygon(part, placement)) : undefined;
    })
    .filter(Boolean) as ReturnType<typeof polygonBounds>[];
  if (!boxes.length) {
    return <text className="slab-dimension-hint" x={slab.width * scale / 2} y={slab.height * scale - 12} textAnchor="middle">{slab.width}×{slab.height}</text>;
  }
  const minX = Math.min(...boxes.map((box) => box.minX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const maxY = Math.max(...boxes.map((box) => box.maxY));
  const right = Math.max(0, slab.width - maxX);
  const bottom = Math.max(0, slab.height - maxY);
  const left = Math.max(0, minX);
  const top = Math.max(0, minY);
  const arrowId = `dim-arrow-${slab.id}`;
  const centerX = slab.width * scale / 2;
  const centerY = slab.height * scale / 2;
  return (
    <g className="slab-dimensions">
      <defs>
        <marker id={arrowId} markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0 0 L8 4 L0 8 z" />
        </marker>
      </defs>
      {left > 40 && (
        <g>
          <line className="dimension-guide" x1={minX * scale} y1={0} x2={minX * scale} y2={slab.height * scale} />
          <line className="dimension-arrow" x1={(left / 2) * scale} y1={centerY} x2={0} y2={centerY} markerEnd={`url(#${arrowId})`} />
          <line className="dimension-arrow" x1={(left / 2) * scale} y1={centerY} x2={minX * scale} y2={centerY} markerEnd={`url(#${arrowId})`} />
          <text x={(left / 2) * scale} y={centerY - 8} textAnchor="middle">{Math.round(left)} мм</text>
        </g>
      )}
      {right > 40 && (
        <g>
          <line className="dimension-guide" x1={maxX * scale} y1={0} x2={maxX * scale} y2={slab.height * scale} />
          <line className="dimension-arrow" x1={(maxX + right / 2) * scale} y1={centerY} x2={maxX * scale} y2={centerY} markerEnd={`url(#${arrowId})`} />
          <line className="dimension-arrow" x1={(maxX + right / 2) * scale} y1={centerY} x2={slab.width * scale} y2={centerY} markerEnd={`url(#${arrowId})`} />
          <text x={(maxX + right / 2) * scale} y={centerY - 8} textAnchor="middle">{Math.round(right)} мм</text>
        </g>
      )}
      {top > 40 && (
        <g>
          <line className="dimension-guide" x1={0} y1={minY * scale} x2={slab.width * scale} y2={minY * scale} />
          <line className="dimension-arrow" x1={centerX} y1={(top / 2) * scale} x2={centerX} y2={0} markerEnd={`url(#${arrowId})`} />
          <line className="dimension-arrow" x1={centerX} y1={(top / 2) * scale} x2={centerX} y2={minY * scale} markerEnd={`url(#${arrowId})`} />
          <text x={centerX + 8} y={(top / 2) * scale + 4} textAnchor="start">{Math.round(top)} мм</text>
        </g>
      )}
      {bottom > 40 && (
        <g>
          <line className="dimension-guide" x1={0} y1={maxY * scale} x2={slab.width * scale} y2={maxY * scale} />
          <line className="dimension-arrow" x1={centerX} y1={(maxY + bottom / 2) * scale} x2={centerX} y2={maxY * scale} markerEnd={`url(#${arrowId})`} />
          <line className="dimension-arrow" x1={centerX} y1={(maxY + bottom / 2) * scale} x2={centerX} y2={slab.height * scale} markerEnd={`url(#${arrowId})`} />
          <text x={centerX + 8} y={(maxY + bottom / 2) * scale + 4} textAnchor="start">{Math.round(bottom)} мм</text>
        </g>
      )}
    </g>
  );
}

function SlabLayer({ slab, scale, viewMode }: { slab: SlabInstance; scale: number; viewMode: 'technical' | 'photo' | 'texture' }) {
  return <g><rect width={slab.width * scale} height={slab.height * scale} fill="#f3f7fa" stroke="#7f98ad" strokeWidth={2} rx={4} />{viewMode !== 'technical' && slab.photo && <image href={slab.photo} x={slab.textureTransform.offsetX * scale} y={slab.textureTransform.offsetY * scale} width={slab.width * scale * slab.textureTransform.scale} height={slab.height * scale * slab.textureTransform.scale} opacity={slab.textureTransform.opacity} preserveAspectRatio="none" transform={slab.textureTransform.rotation ? `rotate(${slab.textureTransform.rotation}, ${slab.width * scale / 2}, ${slab.height * scale / 2})` : undefined} />}
  <rect x={slab.minMargin * scale} y={slab.minMargin * scale} width={(slab.width - slab.minMargin * 2) * scale} height={(slab.height - slab.minMargin * 2) * scale} fill="none" stroke="#94aab9" strokeDasharray="8 6" /></g>;
}
