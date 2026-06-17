import { CSSProperties, MouseEvent, Ref, WheelEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Detail, DetailPart, Rotation, SlabInstance, TextureFrame, TextureLayout } from '../../domain/types';
import { translateStaticUiText } from '../../i18n';
import { pointString, rotatePoint, rotatedLocalPoints, rotatedPoints, rotatedSize } from '../../lib/project';
import { useProjectStore } from '../../store/useProjectStore';
import { edgeMarkersForPart, edgeProfileShortLabel } from '../../utils/edgeProfiles';
import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

const Viewer3D = lazy(() => import('../3d/Viewer3D').then(m => ({ default: m.Viewer3D })));

const MIN_TEXTURE_WIDTH = 1000;
const MIN_TEXTURE_HEIGHT = 320;
const MAX_TEXTURE_HEIGHT = 1400;
const TEXTURE_PADDING = 48;

type TextureItem = {
  layout: TextureLayout;
  part: DetailPart;
  slab?: SlabInstance;
  displayX: number;
  displayY: number;
  draggable: boolean;
};

type ViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type FrameDraft = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type FrameDrag =
  | { type: 'move'; id: string; startX: number; startY: number; frame: TextureFrame }
  | { type: 'resize'; id: string; handle: string; startX: number; startY: number; frame: TextureFrame; proportional: boolean };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToGrid(value: number, grid = 10) {
  return Math.round(value / grid) * grid;
}

function getSourceX(layout: TextureLayout) {
  return layout.sourceX ?? layout.x;
}

function getSourceY(layout: TextureLayout) {
  return layout.sourceY ?? layout.y;
}

function getSourceRotation(layout: TextureLayout): Rotation {
  return layout.sourceRotation ?? layout.rotation;
}

function getDefaultScale(slabs: SlabInstance[]) {
  const maxW = Math.max(...slabs.map((slab) => slab.width), 3200);
  const totalHeight = slabs.reduce((sum, slab) => sum + slab.height, 0) + slabs.length * 110;
  return Math.min(1080 / maxW, 940 / Math.max(totalHeight, 1600));
}

function findPart(layout: TextureLayout, parts: DetailPart[]) {
  return parts.find((part) => part.id === layout.partId);
}

function findMainLayout(part: DetailPart, layouts: TextureLayout[], parts: DetailPart[]) {
  return layouts.find((layout) => {
    const candidate = findPart(layout, parts);
    return candidate?.isMain && candidate.detailId === part.detailId && candidate.parentLabel === part.parentLabel;
  });
}

function textureGroupKey(part: DetailPart) {
  if (part.textureGroupLabel?.startsWith('import:')) return part.textureGroupLabel;
  return `${part.detailId}:${part.textureGroupLabel ?? part.parentLabel}`;
}

function textureInteractionKey(part: DetailPart) {
  if (part.textureGroupKind || part.textureGroupLabel?.startsWith('import:')) return textureGroupKey(part);
  return `${part.detailId}:${part.parentLabel}`;
}

function findEdgeThickness(part: DetailPart, parts: DetailPart[]) {
  const thickening = parts.find((candidate) => (
    candidate.detailId === part.detailId
    && candidate.parentLabel === part.parentLabel
    && candidate.edgeSide === part.edgeSide
    && candidate.edgeKind === 'thickening'
  ));
  if (!thickening) return 0;
  const size = rotatedSize(thickening, 0);
  return ['B', 'D', 'F', 'H'].includes(part.edgeSide ?? '') ? size.height : size.width;
}

function sideSegment(part: DetailPart, side: string | undefined, rotation: Rotation) {
  if (!side) return undefined;
  const customSegment = part.sideSegments?.[side];
  if (customSegment) {
    return {
      start: rotatePoint(customSegment.start, rotation, part.width, part.height),
      end: rotatePoint(customSegment.end, rotation, part.width, part.height),
    };
  }
  const resolvedSide = part.sideAliases?.[side] ?? side;
  const segmentIndexes: Record<string, Partial<Record<string, number>>> = {
    'Прямокутна': { B: 0, C: 1, D: 2, A: 3 },
    'Г-подібна': { B: 0, C: 1, D: 2, E: 3, F: 4, A: 5 },
    'П-подібна': { B: 0, C: 1, D: 2, E: 3, F: 4, G: 5, H: 6, A: 7 },
  };
  const index = segmentIndexes[part.shape]?.[resolvedSide];
  if (index === undefined || !part.points[index]) return undefined;
  const rotated = rotatedPoints(part, rotation);
  return { start: rotated[index], end: rotated[(index + 1) % rotated.length] };
}

function pointOnSegment(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }, epsilon = 0.001) {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > epsilon) return false;
  return (
    point.x >= Math.min(a.x, b.x) - epsilon
    && point.x <= Math.max(a.x, b.x) + epsilon
    && point.y >= Math.min(a.y, b.y) - epsilon
    && point.y <= Math.max(a.y, b.y) + epsilon
  );
}

function pointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) {
  if (polygon.some((current, index) => pointOnSegment(point, current, polygon[(index + 1) % polygon.length]))) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

function outwardNormal(segment: { start: { x: number; y: number }; end: { x: number; y: number } }, polygon: Array<{ x: number; y: number }>) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  const midpoint = { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 };
  const candidates = [
    { x: -dy / length, y: dx / length },
    { x: dy / length, y: -dx / length },
  ];
  return candidates.find((normal) => !pointInPolygon({ x: midpoint.x + normal.x * 8, y: midpoint.y + normal.y * 8 }, polygon)) ?? candidates[0];
}

function rotateVector(point: { x: number; y: number }, rotation: Rotation) {
  switch (rotation) {
    case 90: return { x: -point.y, y: point.x };
    case 180: return { x: -point.x, y: -point.y };
    case 270: return { x: point.y, y: -point.x };
    default: return point;
  }
}

function curvedSideDirection(side: string | undefined, rotation: Rotation) {
  const directions: Record<string, { x: number; y: number }> = {
    A: { x: -1, y: -1 },
    B: { x: 1, y: -1 },
    C: { x: 1, y: 1 },
    D: { x: -1, y: 1 },
  };
  const direction = side ? directions[side] : undefined;
  return direction ? rotateVector(direction, rotation) : undefined;
}

function curvedEdgeOffset(part: DetailPart, parts: DetailPart[], rotation: Rotation) {
  if (part.edgeKind !== 'fold') return { width: 0, height: 0 };
  const thickening = parts.find((candidate) => (
    candidate.detailId === part.detailId
    && candidate.parentLabel === part.parentLabel
    && candidate.edgeSide === part.edgeSide
    && candidate.edgeKind === 'thickening'
  ));
  return thickening ? rotatedSize(thickening, rotation) : { width: 0, height: 0 };
}

function attachedCurvedPosition(layout: TextureLayout, part: DetailPart, mainLayout: TextureLayout, mainPart: DetailPart, parts: DetailPart[], clearance = 0) {
  const direction = curvedSideDirection(part.edgeSide, mainLayout.rotation);
  if (!direction) return { displayX: layout.x, displayY: layout.y, draggable: false };
  const mainSize = rotatedSize(mainPart, mainLayout.rotation);
  const itemSize = rotatedSize(part, layout.rotation);
  const offset = curvedEdgeOffset(part, parts, layout.rotation);
  const gap = Math.max(0, clearance);
  return {
    displayX: direction.x < 0
      ? mainLayout.x - offset.width - gap - itemSize.width
      : mainLayout.x + mainSize.width + offset.width + gap,
    displayY: direction.y < 0
      ? mainLayout.y - offset.height - gap - itemSize.height
      : mainLayout.y + mainSize.height + offset.height + gap,
    draggable: false,
  };
}

function attachedDisplayPosition(layout: TextureLayout, part: DetailPart, layouts: TextureLayout[], parts: DetailPart[], clearance = 0) {
  if (part.isMain || !part.edgeSide) return { displayX: layout.x, displayY: layout.y, draggable: true };

  const mainLayout = findMainLayout(part, layouts, parts);
  const mainPart = mainLayout ? findPart(mainLayout, parts) : undefined;
  if (!mainLayout || !mainPart) return { displayX: layout.x, displayY: layout.y, draggable: true };

  const itemSize = rotatedSize(part, layout.rotation);
  const outsideOffset = (part.edgeKind === 'fold' ? findEdgeThickness(part, parts) : 0) + Math.max(0, clearance);
  const segment = sideSegment(mainPart, part.edgeSide, mainLayout.rotation);
  if (!segment) return attachedCurvedPosition(layout, part, mainLayout, mainPart, parts, clearance);
  const normal = outwardNormal(segment, rotatedPoints(mainPart, mainLayout.rotation));
  const minX = Math.min(segment.start.x, segment.end.x);
  const maxX = Math.max(segment.start.x, segment.end.x);
  const minY = Math.min(segment.start.y, segment.end.y);
  const maxY = Math.max(segment.start.y, segment.end.y);
  const horizontal = Math.abs(segment.end.x - segment.start.x) >= Math.abs(segment.end.y - segment.start.y);
  return {
    displayX: horizontal
      ? mainLayout.x + minX + ((maxX - minX) - itemSize.width) / 2
      : normal.x < 0 ? mainLayout.x + minX - outsideOffset - itemSize.width : mainLayout.x + maxX + outsideOffset,
    displayY: horizontal
      ? normal.y < 0 ? mainLayout.y + minY - outsideOffset - itemSize.height : mainLayout.y + maxY + outsideOffset
      : mainLayout.y + minY + ((maxY - minY) - itemSize.height) / 2,
    draggable: false,
  };
}

import { textureCoordinateMatrix } from '../../lib/textureMatrix';

function getTextureItems(
  layouts: TextureLayout[],
  parts: DetailPart[],
  slabs: SlabInstance[],
  showElements: boolean,
  clearance = 0,
): TextureItem[] {
  return layouts
    .map((layout) => {
      const part = findPart(layout, parts);
      if (!part || (!showElements && (!part.isMain || part.textureIrrelevant))) return undefined;
      const position = attachedDisplayPosition(layout, part, layouts, parts, clearance);
      return {
        layout,
        part,
        slab: slabs.find((slab) => slab.id === layout.slabId),
        ...position,
      };
    })
    .filter(Boolean) as TextureItem[];
}

function textureItemBox(item: TextureItem) {
  const size = rotatedSize(item.part, item.layout.rotation);
  return {
    x: item.displayX,
    y: item.displayY,
    width: size.width,
    height: size.height,
  };
}

function textureGroupBox(layoutId: string, items: TextureItem[]) {
  const item = items.find((candidate) => candidate.layout.id === layoutId);
  if (!item) return undefined;
  const key = textureInteractionKey(item.part);
  const boxes = items
    .filter((candidate) => textureInteractionKey(candidate.part) === key)
    .map(textureItemBox);
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { item, box: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}

function clampTextureLayoutPosition(layoutId: string, x: number, y: number, items: TextureItem[], viewBox: ViewBox, scale: number, viewportHeight: number) {
  const group = textureGroupBox(layoutId, items);
  if (!group) return { x, y };
  const maxWidth = viewBox.width / scale;
  const maxHeight = Math.max(viewBox.height, viewportHeight) / scale;
  const dx = x - group.item.displayX;
  const dy = y - group.item.displayY;
  const clampedDx = clamp(dx, -group.box.x, Math.max(-group.box.x, maxWidth - (group.box.x + group.box.width)));
  const clampedDy = clamp(dy, -group.box.y, Math.max(-group.box.y, maxHeight - (group.box.y + group.box.height)));
  return {
    x: x + (clampedDx - dx),
    y: y + (clampedDy - dy),
  };
}

function boxesOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, gap = 18) {
  return (
    a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y
  );
}

function snapTexturePosition(layoutId: string, x: number, y: number, items: TextureItem[], interPartSpacing = 0) {
  const item = items.find((candidate) => candidate.layout.id === layoutId);
  if (!item) return { x, y };
  const sourceKey = textureInteractionKey(item.part);
  const group = textureGroupBox(layoutId, items);
  const groupBox = textureGroupBoundsForKey(sourceKey, items) ?? group?.box ?? textureItemBox(item);
  const dx = x - item.displayX;
  const dy = y - item.displayY;
  const movedBox = { ...groupBox, x: groupBox.x + dx, y: groupBox.y + dy };
  const gap = Math.max(0, interPartSpacing);
  const threshold = gap > 0 ? Math.min(72, Math.max(34, gap + 22)) : 28;
  let snappedX = x;
  let snappedY = y;

  const xTargets = [0];
  const yTargets = [0];
  items.forEach((other) => {
    if (!other.part.isMain || textureInteractionKey(other.part) === sourceKey) return;
    const otherBox = textureItemBox(other);
    xTargets.push(otherBox.x, otherBox.x + otherBox.width, otherBox.x - movedBox.width, otherBox.x + otherBox.width - movedBox.width);
    yTargets.push(otherBox.y, otherBox.y + otherBox.height, otherBox.y - movedBox.height, otherBox.y + otherBox.height - movedBox.height);
    if (gap > 0) {
      xTargets.push(otherBox.x - movedBox.width - gap, otherBox.x + otherBox.width + gap);
      yTargets.push(otherBox.y - movedBox.height - gap, otherBox.y + otherBox.height + gap);
    }
  });

  const bestX = xTargets.reduce((best, target) => Math.abs(target - movedBox.x) < Math.abs(best - movedBox.x) ? target : best, movedBox.x);
  const bestY = yTargets.reduce((best, target) => Math.abs(target - movedBox.y) < Math.abs(best - movedBox.y) ? target : best, movedBox.y);
  if (Math.abs(bestX - movedBox.x) <= threshold) snappedX = x + (bestX - movedBox.x);
  if (Math.abs(bestY - movedBox.y) <= threshold) snappedY = y + (bestY - movedBox.y);
  return { x: snappedX, y: snappedY };
}

function textureMainBoxesForKey(key: string, items: TextureItem[]) {
  return items
    .filter((item) => item.part.isMain && textureInteractionKey(item.part) === key)
    .map(textureItemBox);
}

function textureGroupBoundsForKey(key: string, items: TextureItem[]) {
  const boxes = textureMainBoxesForKey(key, items);
  if (!boxes.length) return undefined;
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function textureBoxOverlapArea(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, gap = 0) {
  const width = Math.min(a.x + a.width + gap, b.x + b.width + gap) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height + gap, b.y + b.height + gap) - Math.max(a.y, b.y);
  return Math.max(0, width) * Math.max(0, height);
}

function constrainTextureGroupPosition(layoutId: string, x: number, y: number, items: TextureItem[], interPartSpacing = 0) {
  const item = items.find((candidate) => candidate.layout.id === layoutId);
  if (!item) return { x, y };
  const key = textureInteractionKey(item.part);
  const sourceBoxes = textureMainBoxesForKey(key, items);
  if (!sourceBoxes.length) return { x, y };
  const blockers = items
    .filter((candidate) => candidate.part.isMain && textureInteractionKey(candidate.part) !== key)
    .map(textureItemBox);
  if (!blockers.length) return { x, y };

  const dx = x - item.displayX;
  const dy = y - item.displayY;
  const movedBoxes = sourceBoxes.map((sourceBox) => ({ ...sourceBox, x: sourceBox.x + dx, y: sourceBox.y + dy }));
  const gap = Math.max(0, interPartSpacing);
  const overlapScore = (boxes: typeof sourceBoxes) => boxes.reduce((sum, box) => (
    sum + blockers.reduce((boxSum, blocker) => boxSum + textureBoxOverlapArea(box, blocker, gap), 0)
  ), 0);
  const sourceScore = overlapScore(sourceBoxes);
  const targetScore = overlapScore(movedBoxes);
  if (targetScore <= 0 || (sourceScore > 0 && targetScore < sourceScore)) return { x, y };
  if (sourceScore > 0) return { x: item.displayX, y: item.displayY };

  let low = 0;
  let high = 1;
  for (let index = 0; index < 18; index += 1) {
    const progress = (low + high) / 2;
    const candidate = sourceBoxes.map((sourceBox) => ({ ...sourceBox, x: sourceBox.x + dx * progress, y: sourceBox.y + dy * progress }));
    if (overlapScore(candidate) <= 0) low = progress;
    else high = progress;
  }
  return {
    x: item.displayX + dx * low,
    y: item.displayY + dy * low,
  };
}

function textureItemsInPaintOrder(items: TextureItem[], activeLayoutId?: string | null) {
  return [...items].sort((a, b) => {
    const rank = (item: TextureItem) => item.part.isMain ? 2 : item.layout.id === activeLayoutId ? 1 : 0;
    return rank(a) - rank(b);
  });
}

function resolveTextureOverlaps(items: TextureItem[]): TextureItem[] {
  const groups = new Map<string, { items: TextureItem[]; index: number }>();
  items.forEach((item, index) => {
    const key = textureInteractionKey(item.part);
    const group = groups.get(key) ?? { items: [], index };
    group.items.push(item);
    groups.set(key, group);
  });

  const placed: Array<{ x: number; y: number; width: number; height: number }> = [];
  const shifted = new Map<string, { x: number; y: number }>();

  [...groups.entries()]
    .sort((a, b) => a[1].index - b[1].index)
    .forEach(([key, group]) => {
      const boxes = group.items.filter((item) => item.part.isMain).map(textureItemBox);
      if (!boxes.length) {
        shifted.set(key, { x: 0, y: 0 });
        return;
      }
      const minX = Math.min(...boxes.map((box) => box.x));
      const minY = Math.min(...boxes.map((box) => box.y));
      const maxX = Math.max(...boxes.map((box) => box.x + box.width));
      const maxY = Math.max(...boxes.map((box) => box.y + box.height));
      const groupBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      let shiftX = groupBox.x < 0 ? Math.abs(groupBox.x) + 20 : 0;
      let shiftY = 0;
      let candidate = { ...groupBox, x: groupBox.x + shiftX };
      for (let guard = 0; guard < 80 && placed.some((box) => boxesOverlap(candidate, box)); guard += 1) {
        const blocker = placed.find((box) => boxesOverlap(candidate, box));
        shiftY = blocker ? blocker.y + blocker.height + 22 - groupBox.y : shiftY + 40;
        candidate = { ...groupBox, x: groupBox.x + shiftX, y: groupBox.y + shiftY };
      }
      shifted.set(key, { x: shiftX, y: shiftY });
      placed.push(candidate);
    });

  return items.map((item) => {
    const key = textureInteractionKey(item.part);
    const shift = shifted.get(key) ?? { x: 0, y: 0 };
    return shift.x || shift.y ? { ...item, displayX: item.displayX + shift.x, displayY: item.displayY + shift.y } : item;
  });
}

function buildViewBox(items: TextureItem[], scale: number, containerWidth: number): ViewBox {
  const width = Math.max(MIN_TEXTURE_WIDTH, containerWidth);
  if (!items.length) return { x: 0, y: 0, width, height: MIN_TEXTURE_HEIGHT };

  const bounds = items.reduce((acc, item) => {
    const size = rotatedSize(item.part, item.layout.rotation);
    const minX = item.displayX * scale;
    const minY = item.displayY * scale;
    const maxX = (item.displayX + size.width) * scale;
    const maxY = (item.displayY + size.height) * scale;
    return {
      minX: Math.min(acc.minX, minX),
      minY: Math.min(acc.minY, minY),
      maxX: Math.max(acc.maxX, maxX),
      maxY: Math.max(acc.maxY, maxY),
    };
  }, { minX: 0, minY: 0, maxX: width, maxY: MIN_TEXTURE_HEIGHT });

  const height = Math.max(MIN_TEXTURE_HEIGHT, bounds.maxY + TEXTURE_PADDING, Math.abs(Math.min(0, bounds.minY)) + MIN_TEXTURE_HEIGHT);
  return { x: 0, y: 0, width, height };
}

function svgPoint(event: MouseEvent<Element>, svg: SVGSVGElement | null, viewBox: ViewBox) {
  const box = svg?.getBoundingClientRect();
  if (!box) return undefined;
  return {
    x: viewBox.x + ((event.clientX - box.left) / box.width) * viewBox.width,
    y: viewBox.y + ((event.clientY - box.top) / box.height) * viewBox.height,
  };
}

function TexturePiece({
  item,
  detail,
  scale,
  clipPrefix,
}: {
  item: TextureItem;
  detail?: Detail;
  scale: number;
  clipPrefix: string;
}) {
  const { layout, part, slab, displayX, displayY } = item;
  const local = rotatedPoints(part, layout.rotation);
  const localPoints = local.map((point) => ({ x: point.x * scale, y: point.y * scale }));
  const localHoles = (part.holes ?? []).map((hole) => rotatedLocalPoints(hole, layout.rotation, part.width, part.height, part.points)
    .map((point) => ({ x: point.x * scale, y: point.y * scale })));
  const sourceX = getSourceX(layout);
  const sourceY = getSourceY(layout);
  const sourceRotation = getSourceRotation(layout);
  const clipId = `${clipPrefix}_clip_${layout.id}`;
  const size = rotatedSize(part, layout.rotation);
  const textureMatrix = textureCoordinateMatrix(part, sourceRotation, layout.rotation, scale);
  const slabTextureTransform = slab?.textureTransform.rotation
    ? `rotate(${slab.textureTransform.rotation}, ${(slab.width / 2 - sourceX) * scale}, ${(slab.height / 2 - sourceY) * scale})`
    : undefined;
  const showLabel = part.isMain && (!part.textureGroupKind || part.textureGroupAnchor);
  const edgeMarkers = edgeMarkersForPart(part, detail?.edgeProfiles, layout.rotation);

  return (
    <g transform={`translate(${displayX * scale}, ${displayY * scale})`}>
      <defs>
        <clipPath id={clipId}><polygon points={pointString(localPoints)} /></clipPath>
      </defs>
      {slab?.photo ? (
        <g clipPath={`url(#${clipId})`}>
          <g transform={textureMatrix}>
            <image
              href={slab.photo}
              x={(slab.textureTransform.offsetX - sourceX) * scale}
              y={(slab.textureTransform.offsetY - sourceY) * scale}
              width={slab.width * scale * slab.textureTransform.scale}
              height={slab.height * scale * slab.textureTransform.scale}
              preserveAspectRatio="none"
              opacity={0.95}
              transform={slabTextureTransform}
            />
          </g>
        </g>
      ) : (
        <polygon points={pointString(localPoints)} fill="rgba(114,147,171,0.25)" />
      )}
      <polygon points={pointString(localPoints)} fill="rgba(255,255,255,0.08)" stroke="#35556b" strokeWidth={1.4} />
      {localHoles.map((hole, index) => (
        <polygon key={index} points={pointString(hole)} fill="#f8fbfd" stroke="#35556b" strokeWidth={1.1} />
      ))}
      {edgeMarkers.length > 0 && (
        <g className="edge-profile-marks" pointerEvents="none">
          {edgeMarkers.map((marker) => (
            <g key={`${marker.side}-${marker.profile}`}>
              <line x1={marker.start.x * scale} y1={marker.start.y * scale} x2={marker.end.x * scale} y2={marker.end.y * scale} />
              <text x={marker.labelPoint.x * scale} y={marker.labelPoint.y * scale - 3} textAnchor="middle">{edgeProfileShortLabel(marker.profile)}</text>
            </g>
          ))}
        </g>
      )}
      {showLabel && (
        <>
          <text x={(size.width * scale) / 2} y={(size.height * scale) / 2 - 4} textAnchor="middle" fontSize={Math.max(10, 12 * Math.min(scale / 0.25, 1.2))} fill="#1f3342">{part.parentLabel}</text>
          <text x={(size.width * scale) / 2} y={(size.height * scale) / 2 + 12} textAnchor="middle" fontSize={Math.max(9, 11 * Math.min(scale / 0.25, 1.1))} fill="#3a596c">{part.dimsLabel}</text>
        </>
      )}
    </g>
  );
}

function TextureScene({
  items,
  frames = [],
  frameDraft,
  activeFrameId,
  activePieceId,
  editingFrameId,
  scale,
  viewBox,
  svgRef,
  className,
  style,
  clipPrefix,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onStartDrag,
  onActivate,
  onRotate,
  onContextMenu,
  onStartFrame,
  onDeleteFrame,
  onFrameContextMenu,
  onStartFrameDrag,
  detailsById,
}: {
  items: TextureItem[];
  frames?: TextureFrame[];
  frameDraft?: FrameDraft | null;
  activeFrameId?: string | null;
  activePieceId?: string | null;
  editingFrameId?: string | null;
  scale: number;
  viewBox: ViewBox;
  svgRef?: Ref<SVGSVGElement>;
  className: string;
  style?: CSSProperties;
  clipPrefix: string;
  onMouseMove?: (event: MouseEvent<SVGSVGElement>) => void;
  onMouseUp?: () => void;
  onMouseLeave?: () => void;
  onStartDrag?: (event: MouseEvent<SVGGElement>, item: TextureItem) => void;
  onActivate?: (item: TextureItem) => void;
  onRotate?: (item: TextureItem) => void;
  onContextMenu?: (event: MouseEvent<SVGGElement>, item: TextureItem) => void;
  onStartFrame?: (event: MouseEvent<SVGSVGElement>) => void;
  onDeleteFrame?: (frameId: string) => void;
  onFrameContextMenu?: (event: MouseEvent<SVGRectElement>, frame: TextureFrame) => void;
  onStartFrameDrag?: (event: MouseEvent<SVGElement>, frame: TextureFrame, handle?: string) => void;
  detailsById: Map<string, Detail>;
}) {
  const draftRect = frameDraft
    ? {
      x: Math.min(frameDraft.startX, frameDraft.currentX),
      y: Math.min(frameDraft.startY, frameDraft.currentY),
      width: Math.abs(frameDraft.currentX - frameDraft.startX),
      height: Math.abs(frameDraft.currentY - frameDraft.startY),
    }
    : undefined;

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      style={style}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onMouseDown={onStartFrame}
    >
      <rect x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} fill="#f8fbfd" rx={10} />
      {frames.map((frame) => (
        <g key={frame.id} className={frame.id === activeFrameId ? 'texture-frame active' : 'texture-frame'}>
          <rect
            x={frame.x * scale}
            y={frame.y * scale}
            width={frame.width * scale}
            height={frame.height * scale}
            rx={8}
            onMouseDown={(event) => onStartFrameDrag?.(event, frame)}
            onContextMenu={(event) => onFrameContextMenu?.(event, frame)}
            onDoubleClick={() => onDeleteFrame?.(frame.id)}
          />
          {frame.id === editingFrameId && ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => {
            const hx = handle.includes('w') ? frame.x : handle.includes('e') ? frame.x + frame.width : frame.x + frame.width / 2;
            const hy = handle.includes('n') ? frame.y : handle.includes('s') ? frame.y + frame.height : frame.y + frame.height / 2;
            return (
              <rect
                key={handle}
                className={`texture-frame-handle handle-${handle}`}
                x={hx * scale - 5}
                y={hy * scale - 5}
                width={10}
                height={10}
                rx={2}
                onMouseDown={(event) => onStartFrameDrag?.(event, frame, handle)}
              />
            );
          })}
        </g>
      ))}
      {draftRect && <rect className="texture-frame-draft" x={draftRect.x} y={draftRect.y} width={draftRect.width} height={draftRect.height} rx={8} />}
      {textureItemsInPaintOrder(items, activePieceId).map((item) => {
        const size = rotatedSize(item.part, item.layout.rotation);
        return (
          <g
            key={item.layout.id}
            className={item.draggable ? 'texture-piece draggable' : 'texture-piece attached'}
            onMouseDown={(event) => {
              onActivate?.(item);
              onStartDrag?.(event, item);
            }}
            onDoubleClick={() => onRotate?.(item)}
            onContextMenu={(event) => onContextMenu?.(event, item)}
          >
            <TexturePiece item={item} detail={detailsById.get(item.part.detailId)} scale={scale} clipPrefix={clipPrefix} />
            <rect x={item.displayX * scale} y={item.displayY * scale} width={size.width * scale} height={size.height * scale} fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
}

export function TextureLayoutPanel() {
  const { project, parts, moveTextureLayout, rotateTextureLayout, setTextureLayoutRotation, addTextureFrame, updateTextureFrame, deleteTextureFrame, pushMovementSnapshot } = useProjectStore();
  const language = project.uiLanguage ?? 'uk';
  const ui = (value: string) => translateStaticUiText(language, value);
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [previewMode, setPreviewMode] = useState<'2d' | '3d'>('2d');
  const [showElements, setShowElements] = useState(false);
  const [customScale, setCustomScale] = useState<number | null>(null);
  const [manualHeight, setManualHeight] = useState<number | null>(null);
  const [resizeDrag, setResizeDrag] = useState<{ startY: number; startHeight: number } | null>(null);
  const [floatingPreviewOpen, setFloatingPreviewOpen] = useState(false);
  const [frameMode, setFrameMode] = useState(false);
  const [frameDraft, setFrameDraft] = useState<FrameDraft | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layoutId: string } | null>(null);
  const [frameMenu, setFrameMenu] = useState<{ x: number; y: number; frameId: string } | null>(null);
  const [frameFormatMenu, setFrameFormatMenu] = useState<{ x: number; y: number; frameId: string } | null>(null);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [activePieceId, setActivePieceId] = useState<string | null>(null);
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [frameDrag, setFrameDrag] = useState<FrameDrag | null>(null);
  const [frameMoveId, setFrameMoveId] = useState<string | null>(null);
  const [framePresetOpen, setFramePresetOpen] = useState(false);
  const [previewPosition, setPreviewPosition] = useState({ x: 18, y: 18 });
  const [previewDrag, setPreviewDrag] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previewWindowRef = useRef<Window | null>(null);
  const [containerWidth, setContainerWidth] = useState(MIN_TEXTURE_WIDTH);

  const defaultScale = useMemo(() => getDefaultScale(project.slabs), [project.slabs]);
  const scale = customScale ?? defaultScale;
  const layouts = useMemo(() => project.textureLayouts.filter((layout) => findPart(layout, parts)), [project.textureLayouts, parts]);
  const interPartSpacing = Math.max(0, project.allowances?.interPartSpacing ?? 0);
  const allItems = useMemo(() => getTextureItems(layouts, parts, project.slabs, true, interPartSpacing), [interPartSpacing, layouts, parts, project.slabs]);
  const items = useMemo(() => showElements
    ? allItems
    : getTextureItems(layouts, parts, project.slabs, false, interPartSpacing), [allItems, interPartSpacing, layouts, parts, project.slabs, showElements]);
  const detailsById = useMemo(() => new Map(project.details.map((detail) => [detail.id, detail])), [project.details]);
  const viewBox = useMemo(() => buildViewBox(items, scale, containerWidth), [containerWidth, items, scale]);
  const textureFrames = project.textureFrames ?? [];
  const frameHeight = textureFrames.reduce((height, frame) => Math.max(height, (frame.y + frame.height) * scale + TEXTURE_PADDING), 0);
  const autoHeight = Math.max(MIN_TEXTURE_HEIGHT, Math.ceil(viewBox.height), Math.ceil(frameHeight));
  const viewportHeight = manualHeight ?? autoHeight;
  const sceneViewBox = useMemo(() => ({ ...viewBox, height: Math.max(viewBox.height, viewportHeight, frameHeight) }), [frameHeight, viewBox, viewportHeight]);

  useEffect(() => {
    setManualHeight((current) => current === null ? autoHeight : Math.max(current, autoHeight));
  }, [autoHeight]);

  useEffect(() => {
    const updateWidth = () => {
      const width = scrollRef.current?.clientWidth ?? MIN_TEXTURE_WIDTH;
      setContainerWidth(Math.max(MIN_TEXTURE_WIDTH, Math.floor(width)));
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    if (!resizeDrag) return;

    const onMove = (event: globalThis.MouseEvent) => {
      setManualHeight(clamp(resizeDrag.startHeight + event.clientY - resizeDrag.startY, MIN_TEXTURE_HEIGHT, MAX_TEXTURE_HEIGHT));
    };
    const onUp = () => setResizeDrag(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizeDrag]);

  useEffect(() => {
    if (!previewDrag) return;

    const onMove = (event: globalThis.MouseEvent) => {
      const width = Math.min(440, window.innerWidth - 36);
      const maxX = Math.max(0, window.innerWidth - width - 8);
      const maxY = Math.max(0, window.innerHeight - 120);
      setPreviewPosition({
        x: clamp(previewDrag.originX + event.clientX - previewDrag.startX, 8, maxX),
        y: clamp(previewDrag.originY + event.clientY - previewDrag.startY, 8, maxY),
      });
    };
    const onUp = () => setPreviewDrag(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [previewDrag]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' || !activeFrameId) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      event.preventDefault();
      deleteTextureFrame(activeFrameId);
      setActiveFrameId(null);
      setEditingFrameId(null);
      setFrameMoveId(null);
      setFrameMenu(null);
      setFrameFormatMenu(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeFrameId, deleteTextureFrame]);

  useEffect(() => {
    const preview = previewWindowRef.current;
    if (!preview || preview.closed || !svgRef.current) return;
    const root = preview.document.getElementById('texture-preview-root');
    if (root) root.innerHTML = svgRef.current.outerHTML;
  }, [activeFrameId, items, scale, sceneViewBox, textureFrames, viewportHeight]);

  if (!project.textureSelectionEnabled) return null;

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.shiftKey) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    setCustomScale((current) => clamp((current ?? defaultScale) * factor, 0.08, 1.4));
  };

  const openPreview = () => {
    const svg = svgRef.current;
    if (!svg) return;
    setFloatingPreviewOpen(true);
    const preview = window.open('', 'SlabCutPlannerTexturePreview', 'width=1180,height=620');
    if (!preview) return;
    previewWindowRef.current = preview;
    preview.document.open();
    preview.document.write(`<!doctype html><html lang="${language}"><head><meta charset="utf-8" /><title>${ui('Прев’ю підбору текстури')}</title><style>body{margin:0;background:#eaf0f4;font-family:Inter,Arial,sans-serif;color:#1f2d3a}.preview-header{position:sticky;top:0;background:#dfe8ee;border-bottom:1px solid #c6d3dd;padding:10px 14px;font-weight:700}.preview-wrap{padding:14px;overflow:auto}svg{background:#f7fbfe;border:1px solid rgba(127,152,173,.35);border-radius:10px;max-width:none}.texture-frame rect{fill:rgba(31,120,180,.05);stroke:#1f78b4;stroke-width:2;stroke-dasharray:10 7;vector-effect:non-scaling-stroke}.texture-frame.active rect{fill:rgba(31,120,180,.08)}.texture-frame-handle{fill:#f8fbfd;stroke:#1f78b4;stroke-width:1.4;vector-effect:non-scaling-stroke}.texture-frame-draft{fill:rgba(31,120,180,.12);stroke:#1f78b4;stroke-width:1.6;stroke-dasharray:8 5;vector-effect:non-scaling-stroke}.edge-profile-marks line{stroke:#1f5f87;stroke-width:1.15;stroke-dasharray:8 5;vector-effect:non-scaling-stroke}.edge-profile-marks text{fill:#1f5f87;font-size:9px;font-weight:700;paint-order:stroke;stroke:rgba(248,251,253,.82);stroke-width:3px}</style></head><body><div class="preview-header">${ui('Прев’ю зони підбору текстури')}</div><div id="texture-preview-root" class="preview-wrap">${svg.outerHTML}</div></body></html>`);
    preview.document.close();
    preview.focus();
  };

  const startTextureDrag = (event: MouseEvent<SVGGElement>, item: TextureItem) => {
    if (!item.draggable) return;
    event.stopPropagation();
    const point = svgPoint(event, svgRef.current, sceneViewBox);
    if (!point) return;
    setContextMenu(null);
    setFrameFormatMenu(null);
    pushMovementSnapshot();
    setDrag({
      id: item.layout.id,
      offsetX: point.x - item.displayX * scale,
      offsetY: point.y - item.displayY * scale,
    });
  };

  const startFrameDraw = (event: MouseEvent<SVGSVGElement>) => {
    setContextMenu(null);
    setFrameMenu(null);
    setFrameFormatMenu(null);
    if (!frameMode) {
      setFrameMoveId(null);
      setActiveFrameId(null);
      setEditingFrameId(null);
      return;
    }
    const point = svgPoint(event, svgRef.current, sceneViewBox);
    if (!point) return;
    setFrameDraft({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y });
  };

  const moveFrameDraw = (event: MouseEvent<SVGSVGElement>) => {
    if (!frameDraft) return;
    const point = svgPoint(event, svgRef.current, sceneViewBox);
    if (!point) return;
    setFrameDraft((current) => current ? { ...current, currentX: point.x, currentY: point.y } : current);
  };

  const finishFrameDraw = () => {
    if (!frameDraft) return;
    const x = Math.min(frameDraft.startX, frameDraft.currentX) / scale;
    const y = Math.min(frameDraft.startY, frameDraft.currentY) / scale;
    const width = Math.abs(frameDraft.currentX - frameDraft.startX) / scale;
    const height = Math.abs(frameDraft.currentY - frameDraft.startY) / scale;
    if (width > 40 && height > 40) addTextureFrame({ x, y, width, height });
    setFrameDraft(null);
    setFrameMode(false);
  };

  const startFrameDrag = (event: MouseEvent<SVGElement>, frame: TextureFrame, handle?: string) => {
    event.preventDefault();
    event.stopPropagation();
    const point = svgPoint(event, svgRef.current, sceneViewBox);
    if (!point) return;
    setContextMenu(null);
    setFrameMenu(null);
    setFrameFormatMenu(null);
    setActiveFrameId(frame.id);
    if (handle) {
      if (editingFrameId !== frame.id) return;
      setFrameDrag({ type: 'resize', id: frame.id, handle, startX: point.x, startY: point.y, frame, proportional: event.shiftKey });
      return;
    }
    if (frameMoveId === frame.id) {
      setFrameDrag({ type: 'move', id: frame.id, startX: point.x, startY: point.y, frame });
    }
  };

  const updateDraggedFrame = (event: MouseEvent<SVGSVGElement>) => {
    if (!frameDrag) return;
    const point = svgPoint(event, svgRef.current, sceneViewBox);
    if (!point) return;
    const dx = (point.x - frameDrag.startX) / scale;
    const dy = (point.y - frameDrag.startY) / scale;
    if (frameDrag.type === 'move') {
      updateTextureFrame(frameDrag.id, {
        x: Math.max(0, roundToGrid(frameDrag.frame.x + dx)),
        y: Math.max(0, roundToGrid(frameDrag.frame.y + dy)),
      });
      return;
    }

    const minSize = 120;
    const next = { ...frameDrag.frame };
    if (frameDrag.handle.includes('e')) next.width = Math.max(minSize, frameDrag.frame.width + dx);
    if (frameDrag.handle.includes('s')) next.height = Math.max(minSize, frameDrag.frame.height + dy);
    if (frameDrag.handle.includes('w')) {
      const width = Math.max(minSize, frameDrag.frame.width - dx);
      next.x = frameDrag.frame.x + (frameDrag.frame.width - width);
      next.width = width;
    }
    if (frameDrag.handle.includes('n')) {
      const height = Math.max(minSize, frameDrag.frame.height - dy);
      next.y = frameDrag.frame.y + (frameDrag.frame.height - height);
      next.height = height;
    }

    if (frameDrag.proportional && frameDrag.handle.length === 2) {
      const ratio = frameDrag.frame.width / Math.max(frameDrag.frame.height, 1);
      if (Math.abs(dx) >= Math.abs(dy)) next.height = Math.max(minSize, next.width / ratio);
      else next.width = Math.max(minSize, next.height * ratio);
      if (frameDrag.handle.includes('w')) next.x = frameDrag.frame.x + frameDrag.frame.width - next.width;
      if (frameDrag.handle.includes('n')) next.y = frameDrag.frame.y + frameDrag.frame.height - next.height;
    }

    updateTextureFrame(frameDrag.id, {
      x: Math.max(0, roundToGrid(next.x)),
      y: Math.max(0, roundToGrid(next.y)),
      width: roundToGrid(next.width),
      height: roundToGrid(next.height),
    });
  };

  const openFrameContext = (event: MouseEvent<SVGRectElement>, frame: TextureFrame) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    setFrameFormatMenu(null);
    setActiveFrameId(frame.id);
    setFrameMenu({ x: event.clientX, y: event.clientY, frameId: frame.id });
  };

  const applyFrameRatio = (frameId: string, ratio: number) => {
    const frame = textureFrames.find((item) => item.id === frameId);
    if (!frame) return;
    const safeRatio = Math.max(ratio, 0.01);
    const area = Math.max(frame.width * frame.height, 120 * 120);
    const nextWidth = Math.max(120, Math.sqrt(area * safeRatio));
    const nextHeight = Math.max(120, nextWidth / safeRatio);
    const centerX = frame.x + frame.width / 2;
    const centerY = frame.y + frame.height / 2;
    updateTextureFrame(frame.id, {
      x: Math.max(0, roundToGrid(centerX - nextWidth / 2)),
      y: Math.max(0, roundToGrid(centerY - nextHeight / 2)),
      width: roundToGrid(nextWidth),
      height: roundToGrid(nextHeight),
    });
    setFrameFormatMenu(null);
  };

  const addFrameGrid = (columns: number, rows: number) => {
    const paddingPx = 28;
    const gapPx = 18;
    const widthPx = Math.max(180, (sceneViewBox.width - paddingPx * 2 - gapPx * (columns - 1)) / columns);
    const targetHeightPx = columns === 1 ? Math.max(240, widthPx * 0.44) : Math.max(180, widthPx * 0.92);
    const availableHeightPx = Math.max(viewportHeight, MIN_TEXTURE_HEIGHT) - paddingPx * 2 - gapPx * (rows - 1);
    const heightPx = Math.max(targetHeightPx, availableHeightPx / Math.max(rows, 1));
    const startX = paddingPx / scale;
    const startY = paddingPx / scale;
    const gap = gapPx / scale;
    const width = widthPx / scale;
    const height = heightPx / scale;
    textureFrames.forEach((frame) => deleteTextureFrame(frame.id));
    Array.from({ length: columns * rows }).forEach((_, index) => {
      addTextureFrame({
        x: startX + (index % columns) * (width + gap),
        y: startY + Math.floor(index / columns) * (height + gap),
        width,
        height,
      });
    });
    const requiredHeight = Math.ceil((startY + rows * height + (rows - 1) * gap + paddingPx / scale) * scale);
    setManualHeight((current) => Math.max(current ?? viewportHeight, requiredHeight));
    setActiveFrameId(null);
    setEditingFrameId(null);
    setFrameMoveId(null);
    setFramePresetOpen(false);
  };

  const openTextureContext = (event: MouseEvent<SVGGElement>, item: TextureItem) => {
    event.preventDefault();
    event.stopPropagation();
    setActivePieceId(item.layout.id);
    setFrameMenu(null);
    setFrameFormatMenu(null);
    setContextMenu({ x: event.clientX, y: event.clientY, layoutId: item.layout.id });
  };

  const setExactTextureAngle = () => {
    if (!contextMenu) return;
    const layout = project.textureLayouts.find((item) => item.id === contextMenu.layoutId);
    const value = window.prompt(ui('Кут'), String(layout?.rotation ?? 0));
    if (value !== null) {
      const angle = Number(value.replace(',', '.'));
      if (Number.isFinite(angle)) setTextureLayoutRotation(contextMenu.layoutId, angle);
    }
    setContextMenu(null);
  };

  return (
    <section className="panel texture-panel">
      <div className="toolbar texture-toolbar">
        <div>
          <h3>{ui('Зона підбору текстури')}</h3>
          <span className="muted">{ui('Колесо миші прокручує, Shift + колесо масштабує цю зону')}</span>
        </div>
        <div className="texture-actions">
          <div className="texture-frame-create">
            <button className={frameMode ? 'chip active' : 'chip'} onClick={() => { setFrameMode((value) => !value); setFrameDraft(null); setFramePresetOpen(false); }}>{ui('Створити рамку')}</button>
            <button className="chip texture-frame-arrow" onClick={() => setFramePresetOpen((value) => !value)}>▼</button>
            {framePresetOpen && (
              <div className="split-menu texture-frame-menu">
                <button onClick={() => addFrameGrid(1, 1)}>1</button>
                <button onClick={() => addFrameGrid(1, 2)}>2</button>
                <button onClick={() => addFrameGrid(1, 3)}>3</button>
                <button onClick={() => addFrameGrid(1, 2)}>1×2</button>
                <button onClick={() => addFrameGrid(1, 3)}>1×3</button>
                <button onClick={() => addFrameGrid(1, 4)}>1×4</button>
                <button onClick={() => addFrameGrid(2, 2)}>2×2</button>
                <button onClick={() => addFrameGrid(2, 3)}>2×3</button>
                <button onClick={() => addFrameGrid(3, 2)}>3×2</button>
                <button onClick={() => addFrameGrid(2, 4)}>2×4</button>
                <button onClick={() => addFrameGrid(3, 3)}>3×3</button>
              </div>
            )}
          </div>
          <button className={showElements ? 'chip active' : 'chip'} onClick={() => setShowElements((value) => !value)}>{ui('Показати елементи')}</button>
          <button onClick={() => setCustomScale(null)}>{ui('Масштаб')} 1:1</button>
          <button onClick={openPreview}>{ui('Відкрити прев’ю')}</button>
        </div>
      </div>
      <div className="texture-canvas-shell">
        <div
          ref={scrollRef}
          className="texture-canvas-scroll"
          onWheel={onWheel}
          style={{
            height: `${viewportHeight}px`,
            overflowY: sceneViewBox.height > viewportHeight + 1 ? 'auto' : 'hidden',
            overflowX: 'hidden',
          }}
        >
          <TextureScene
            items={items}
            frames={textureFrames}
            frameDraft={frameDraft}
            activeFrameId={activeFrameId}
            activePieceId={activePieceId}
            editingFrameId={editingFrameId}
            scale={scale}
            viewBox={sceneViewBox}
            svgRef={svgRef}
            className="texture-svg"
            style={{ width: '100%', height: `${sceneViewBox.height}px` }}
            clipPrefix="main_texture"
            detailsById={detailsById}
            onMouseMove={(event) => {
              if (frameDraft) {
                moveFrameDraw(event);
                return;
              }
              if (frameDrag) {
                updateDraggedFrame(event);
                return;
              }
              if (!drag) return;
              const point = svgPoint(event, svgRef.current, sceneViewBox);
              if (!point) return;
              const rawX = roundToGrid((point.x - drag.offsetX) / scale);
              const rawY = roundToGrid((point.y - drag.offsetY) / scale);
              const snapped = snapTexturePosition(drag.id, rawX, rawY, items, interPartSpacing);
              const constrained = constrainTextureGroupPosition(drag.id, snapped.x, Math.max(0, snapped.y), allItems, interPartSpacing);
              const next = clampTextureLayoutPosition(drag.id, constrained.x, constrained.y, allItems, sceneViewBox, scale, viewportHeight);
              moveTextureLayout(drag.id, next.x, next.y);
            }}
            onMouseUp={() => {
              finishFrameDraw();
              setFrameDrag(null);
              setDrag(null);
            }}
            onMouseLeave={() => {
              setFrameDraft(null);
              setFrameDrag(null);
              setDrag(null);
            }}
            onStartDrag={startTextureDrag}
            onActivate={(item) => setActivePieceId(item.layout.id)}
            onRotate={(item) => item.draggable && rotateTextureLayout(item.layout.id)}
            onContextMenu={openTextureContext}
            onStartFrame={startFrameDraw}
            onDeleteFrame={deleteTextureFrame}
            onFrameContextMenu={openFrameContext}
            onStartFrameDrag={startFrameDrag}
          />
        </div>
        <div
          className="texture-resize-handle"
          onMouseDown={(event) => setResizeDrag({ startY: event.clientY, startHeight: viewportHeight })}
          onDoubleClick={() => setManualHeight(null)}
          title={ui('Потягніть, щоб змінити висоту зони')}
        >
          <span />
        </div>
      </div>
      {contextMenu && (
        <div className="canvas-context-menu texture-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button onClick={setExactTextureAngle}>{ui('Кут')}</button>
          <button onClick={() => { rotateTextureLayout(contextMenu.layoutId); setContextMenu(null); }}>{ui('Повернути 90°')}</button>
        </div>
      )}
      {frameMenu && (
        <div className="canvas-context-menu texture-context-menu" style={{ left: frameMenu.x, top: frameMenu.y }}>
          <button onClick={() => { setFrameMoveId(frameMenu.frameId); setActiveFrameId(frameMenu.frameId); setEditingFrameId(null); setFrameMenu(null); }}>{ui('Перемістити')}</button>
          <button onClick={() => { setActiveFrameId(frameMenu.frameId); setEditingFrameId(frameMenu.frameId); setFrameMoveId(null); setFrameMenu(null); }}>{ui('Редагувати')}</button>
          <button onClick={() => {
            setFrameFormatMenu({ x: frameMenu.x + 178, y: frameMenu.y, frameId: frameMenu.frameId });
            setFrameMenu(null);
          }}>{ui('Формат')}</button>
          <button onClick={() => { deleteTextureFrame(frameMenu.frameId); setFrameMenu(null); setEditingFrameId((id) => id === frameMenu.frameId ? null : id); }}>{ui('Видалити')}</button>
        </div>
      )}
      {frameFormatMenu && (
        <div className="canvas-context-menu texture-context-menu texture-format-menu" style={{ left: frameFormatMenu.x, top: frameFormatMenu.y }}>
          {[
            ['1×1', 1],
            ['2×3', 2 / 3],
            ['3×2', 3 / 2],
            ['4×3', 4 / 3],
            ['3×4', 3 / 4],
            ['16×9', 16 / 9],
            ['9×16', 9 / 16],
          ].map(([label, ratio]) => (
            <button key={label} onClick={() => applyFrameRatio(frameFormatMenu.frameId, Number(ratio))}>{label}</button>
          ))}
        </div>
      )}
      {floatingPreviewOpen && (
        <aside
          className="texture-preview-floating"
          style={{ left: `${previewPosition.x}px`, top: `${previewPosition.y}px`, right: 'auto', bottom: 'auto' }}
        >
          <div
            className="texture-preview-header"
            onMouseDown={(event) => setPreviewDrag({
              startX: event.clientX,
              startY: event.clientY,
              originX: previewPosition.x,
              originY: previewPosition.y,
            })}
          >
            <strong>{ui('Прев’ю підбору текстури')}</strong>
            <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto', marginRight: '16px' }}>
              <button 
                className={previewMode === '2d' ? 'chip active' : 'chip'} 
                onClick={() => setPreviewMode('2d')}
              >
                2D
              </button>
              <button 
                className={previewMode === '3d' ? 'chip active' : 'chip'} 
                onClick={() => setPreviewMode('3d')}
              >
                3D
              </button>
            </div>
            <button onClick={() => setFloatingPreviewOpen(false)}>{ui('Закрити')}</button>
          </div>
          <div className="texture-preview-body" onWheel={previewMode === '2d' ? onWheel : undefined} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {previewMode === '2d' ? (
              <TextureScene
                items={items}
                frames={textureFrames}
                activeFrameId={activeFrameId}
                activePieceId={activePieceId}
                scale={scale}
                viewBox={sceneViewBox}
                className="texture-preview-svg"
                clipPrefix="floating_texture_preview"
                detailsById={detailsById}
              />
            ) : (
              <Suspense fallback={
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-500 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="font-medium text-sm">Завантаження 3D-движка...</span>
                </div>
              }>
                <Viewer3D className="w-full h-full bg-slate-900 overflow-hidden relative" />
              </Suspense>
            )}
          </div>
        </aside>
      )}
    </section>
  );
}

