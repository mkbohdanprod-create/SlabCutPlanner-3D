import type { DetailPart, Rotation, SlabInstance, TextureLayout } from '../domain/types';
import { rotatedSize, rotatedPoints, rotatePoint } from '../lib/project';
import { SIDE_SEGMENT_INDEXES } from '../domain/constants';
import { outwardNormal } from './geometryUtils';

export type TextureItem = {
  layout: TextureLayout;
  part: DetailPart;
  slab?: SlabInstance;
  displayX: number;
  displayY: number;
  draggable: boolean;
};

export type ViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function findPart(layout: TextureLayout, parts: DetailPart[]) {
  return parts.find((part) => part.id === layout.partId);
}

export function findMainLayout(part: DetailPart, layouts: TextureLayout[], parts: DetailPart[]) {
  return layouts.find((layout) => {
    const candidate = findPart(layout, parts);
    return candidate?.isMain && candidate.detailId === part.detailId && candidate.parentLabel === part.parentLabel;
  });
}

export function textureGroupKey(part: DetailPart) {
  if (part.textureGroupLabel?.startsWith('import:')) return part.textureGroupLabel;
  return `${part.detailId}:${part.textureGroupLabel ?? part.parentLabel}`;
}

export function textureInteractionKey(part: DetailPart) {
  if (part.textureGroupKind || part.textureGroupLabel?.startsWith('import:')) return textureGroupKey(part);
  return `${part.detailId}:${part.parentLabel}`;
}

export function findEdgeThickness(part: DetailPart, parts: DetailPart[]) {
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

export function sideSegment(part: DetailPart, side: string | undefined, rotation: Rotation) {
  if (!side) return undefined;
  const customSegment = part.sideSegments?.[side];
  if (customSegment) {
    return {
      start: rotatePoint(customSegment.start, rotation, part.width, part.height),
      end: rotatePoint(customSegment.end, rotation, part.width, part.height),
    };
  }
  const resolvedSide = part.sideAliases?.[side] ?? side;
  const index = SIDE_SEGMENT_INDEXES[part.shape]?.[resolvedSide];
  if (index === undefined || !part.points[index]) return undefined;
  const rotated = rotatedPoints(part, rotation);
  return { start: rotated[index], end: rotated[(index + 1) % rotated.length] };
}

export function rotateVector(point: { x: number; y: number }, rotation: Rotation) {
  switch (rotation) {
    case 90: return { x: -point.y, y: point.x };
    case 180: return { x: -point.x, y: -point.y };
    case 270: return { x: point.y, y: -point.x };
    default: return point;
  }
}

export function curvedSideDirection(side: string | undefined, rotation: Rotation) {
  const directions: Record<string, { x: number; y: number }> = {
    A: { x: -1, y: -1 },
    B: { x: 1, y: -1 },
    C: { x: 1, y: 1 },
    D: { x: -1, y: 1 },
  };
  const direction = side ? directions[side] : undefined;
  return direction ? rotateVector(direction, rotation) : undefined;
}

export function curvedEdgeOffset(part: DetailPart, parts: DetailPart[], rotation: Rotation) {
  if (part.edgeKind !== 'fold') return { width: 0, height: 0 };
  const thickening = parts.find((candidate) => (
    candidate.detailId === part.detailId
    && candidate.parentLabel === part.parentLabel
    && candidate.edgeSide === part.edgeSide
    && candidate.edgeKind === 'thickening'
  ));
  return thickening ? rotatedSize(thickening, rotation) : { width: 0, height: 0 };
}

export function attachedCurvedPosition(layout: TextureLayout, part: DetailPart, mainLayout: TextureLayout, mainPart: DetailPart, parts: DetailPart[], clearance = 0) {
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

export function attachedDisplayPosition(layout: TextureLayout, part: DetailPart, layouts: TextureLayout[], parts: DetailPart[], clearance = 0) {
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

export function getTextureItems(
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

export function textureItemBox(item: TextureItem) {
  const size = rotatedSize(item.part, item.layout.rotation);
  return {
    x: item.displayX,
    y: item.displayY,
    width: size.width,
    height: size.height,
  };
}

export function textureGroupBox(layoutId: string, items: TextureItem[]) {
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

export function clampTextureLayoutPosition(layoutId: string, x: number, y: number, items: TextureItem[], viewBox: ViewBox, scale: number, viewportHeight: number) {
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

export function boxesOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, gap = 18) {
  return (
    a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y
  );
}

export function snapTexturePosition(layoutId: string, x: number, y: number, items: TextureItem[], interPartSpacing = 0) {
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

export function textureMainBoxesForKey(key: string, items: TextureItem[]) {
  return items
    .filter((item) => item.part.isMain && textureInteractionKey(item.part) === key)
    .map(textureItemBox);
}

export function textureGroupBoundsForKey(key: string, items: TextureItem[]) {
  const boxes = textureMainBoxesForKey(key, items);
  if (!boxes.length) return undefined;
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function textureBoxOverlapArea(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, gap = 0) {
  const width = Math.min(a.x + a.width + gap, b.x + b.width + gap) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height + gap, b.y + b.height + gap) - Math.max(a.y, b.y);
  return Math.max(0, width) * Math.max(0, height);
}

export function constrainTextureGroupPosition(layoutId: string, x: number, y: number, items: TextureItem[], interPartSpacing = 0) {
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

export function textureItemsInPaintOrder(items: TextureItem[], activeLayoutId?: string | null) {
  return [...items].sort((a, b) => {
    const rank = (item: TextureItem) => item.part.isMain ? 2 : item.layout.id === activeLayoutId ? 1 : 0;
    return rank(a) - rank(b);
  });
}

export function resolveTextureOverlaps(items: TextureItem[]): TextureItem[] {
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
