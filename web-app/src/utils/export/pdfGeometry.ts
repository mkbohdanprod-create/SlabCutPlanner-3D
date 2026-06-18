import type { DetailPart, Placement, Point, Project, Rotation, SlabInstance, TextureLayout, TextureFrame } from '../../domain/types';
import { rotatedLocalPoints, rotatedPoints, rotatedSize } from '../../lib/project';
import { SIDE_SEGMENT_INDEXES } from '../../domain/constants';
import type { Bounds, TextureItem } from './pdfTypes';
import { pointInPolygonStrict as pointInPolygon, pointOnSegment, outwardNormal, pointsBounds } from '../../engines/geometryUtils';



export function pathFromPolygons(polygons: Point[][], scale = 1, offsetX = 0, offsetY = 0) {
  return polygons
    .filter((polygon) => polygon.length)
    .map((polygon) => `M ${polygon.map((point) => `${offsetX + point.x * scale} ${offsetY + point.y * scale}`).join(' L ')} Z`)
    .join(' ');
}

export function localHoles(part: DetailPart, rotation: Rotation) {
  return (part.holes ?? []).map((hole) => rotatedLocalPoints(hole, rotation, part.width, part.height, part.points));
}

export function placementHoles(part: DetailPart, placement: Placement) {
  return localHoles(part, placement.rotation).map((hole) => hole.map((point) => ({
    x: point.x + placement.x,
    y: point.y + placement.y,
  })));
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
  const index = SIDE_SEGMENT_INDEXES[part.shape]?.[side];
  if (index === undefined || !part.points[index]) return undefined;
  const rotated = rotatedPoints(part, rotation);
  return { start: rotated[index], end: rotated[(index + 1) % rotated.length] };
}





export function rotateVector(point: Point, rotation: Rotation): Point {
  switch (rotation) {
    case 90: return { x: -point.y, y: point.x };
    case 180: return { x: -point.x, y: -point.y };
    case 270: return { x: point.y, y: -point.x };
    default: return point;
  }
}

export function curvedSideDirection(side: string | undefined, rotation: Rotation) {
  const directions: Record<string, Point> = {
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

export function attachedCurvedPosition(layout: TextureLayout, part: DetailPart, mainLayout: TextureLayout, mainPart: DetailPart, parts: DetailPart[]) {
  const direction = curvedSideDirection(part.edgeSide, mainLayout.rotation);
  if (!direction) return { displayX: layout.x, displayY: layout.y };
  const mainSize = rotatedSize(mainPart, mainLayout.rotation);
  const itemSize = rotatedSize(part, layout.rotation);
  const offset = curvedEdgeOffset(part, parts, layout.rotation);
  return {
    displayX: direction.x < 0
      ? mainLayout.x - offset.width - itemSize.width
      : mainLayout.x + mainSize.width + offset.width,
    displayY: direction.y < 0
      ? mainLayout.y - offset.height - itemSize.height
      : mainLayout.y + mainSize.height + offset.height,
  };
}

export function attachedDisplayPosition(layout: TextureLayout, part: DetailPart, layouts: TextureLayout[], parts: DetailPart[]) {
  if (part.isMain || !part.edgeSide) return { displayX: layout.x, displayY: layout.y };

  const mainLayout = findMainLayout(part, layouts, parts);
  const mainPart = mainLayout ? findPart(mainLayout, parts) : undefined;
  if (!mainLayout || !mainPart) return { displayX: layout.x, displayY: layout.y };

  const itemSize = rotatedSize(part, layout.rotation);
  const outsideOffset = part.edgeKind === 'fold' ? findEdgeThickness(part, parts) : 0;
  const segment = sideSegment(mainPart, part.edgeSide, mainLayout.rotation);
  if (!segment) return attachedCurvedPosition(layout, part, mainLayout, mainPart, parts);
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
  };
}

export function getSourceX(layout: TextureLayout) {
  return layout.sourceX ?? layout.x;
}

export function getSourceY(layout: TextureLayout) {
  return layout.sourceY ?? layout.y;
}

export function getSourceRotation(layout: TextureLayout): Rotation {
  return layout.sourceRotation ?? layout.rotation;
}

export function getTextureItems(project: Project, parts: DetailPart[], includeIrrelevant = false) {
  return project.textureLayouts
    .map((layout) => {
      const part = findPart(layout, parts);
      if (!part || (!includeIrrelevant && part.textureIrrelevant)) return undefined;
      const position = attachedDisplayPosition(layout, part, project.textureLayouts, parts);
      return {
        layout,
        part,
        slab: project.slabs.find((slab) => slab.id === layout.slabId),
        ...position,
      };
    })
    .filter(Boolean) as TextureItem[];
}

export function textureBox(item: TextureItem) {
  const size = rotatedSize(item.part, item.layout.rotation);
  return { x: item.displayX, y: item.displayY, width: size.width, height: size.height };
}

export function frameIntersectsItem(frame: TextureFrame, item: TextureItem) {
  const box = textureBox(item);
  return box.x < frame.x + frame.width
    && box.x + box.width > frame.x
    && box.y < frame.y + frame.height
    && box.y + box.height > frame.y;
}

export function textureBoxesOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, gap = 18) {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

export function resolveTextureOverlaps(items: TextureItem[]) {
  const groups = new Map<string, { items: TextureItem[]; index: number }>();
  items.forEach((item, index) => {
    const key = `${item.part.detailId}:${item.part.parentLabel}`;
    const group = groups.get(key) ?? { items: [], index };
    group.items.push(item);
    groups.set(key, group);
  });
  const placed: ReturnType<typeof textureBox>[] = [];
  const shifts = new Map<string, { x: number; y: number }>();
  [...groups.entries()].sort((a, b) => a[1].index - b[1].index).forEach(([key, group]) => {
    const boxes = group.items.map(textureBox);
    const minX = Math.min(...boxes.map((box) => box.x));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxX = Math.max(...boxes.map((box) => box.x + box.width));
    const maxY = Math.max(...boxes.map((box) => box.y + box.height));
    const groupBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    const shiftX = groupBox.x < 0 ? Math.abs(groupBox.x) + 20 : 0;
    let shiftY = 0;
    let candidate = { ...groupBox, x: groupBox.x + shiftX };
    for (let guard = 0; guard < 80 && placed.some((box) => textureBoxesOverlap(candidate, box)); guard += 1) {
      const blocker = placed.find((box) => textureBoxesOverlap(candidate, box));
      shiftY = blocker ? blocker.y + blocker.height + 22 - groupBox.y : shiftY + 40;
      candidate = { ...groupBox, x: groupBox.x + shiftX, y: groupBox.y + shiftY };
    }
    shifts.set(key, { x: shiftX, y: shiftY });
    placed.push(candidate);
  });
  return items.map((item) => {
    const shift = shifts.get(`${item.part.detailId}:${item.part.parentLabel}`) ?? { x: 0, y: 0 };
    return shift.x || shift.y ? { ...item, displayX: item.displayX + shift.x, displayY: item.displayY + shift.y } : item;
  });
}
