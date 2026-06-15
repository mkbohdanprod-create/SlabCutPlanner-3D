import { MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import type { DetailPart } from '../../domain/types';
import { polygonBounds, pointString } from '../../lib/project';
import { useProjectStore } from '../../store/useProjectStore';

const CANVAS_WIDTH = 1000;
const PADDING = 54;
const GAP = 42;
const BASE_SCALE = 0.13;
const MIN_CANVAS_HEIGHT = 150;

type UnplacedLayoutItem = ReturnType<typeof layoutUnplacedParts>[number];
type BufferDragPreview = {
  item: UnplacedLayoutItem;
  clientX: number;
  clientY: number;
  offsetX: number;
  offsetY: number;
  screenScale: number;
};

function previewLabel(partName: string) {
  return partName.length > 28 ? `${partName.slice(0, 25)}...` : partName;
}

function layoutUnplacedParts(parts: DetailPart[]) {
  let x = PADDING;
  let y = 34;
  let rowHeight = 0;

  return parts.map((part) => {
    const bounds = polygonBounds(part.points);
    const width = Math.max(bounds.maxX - bounds.minX, 1);
    const height = Math.max(bounds.maxY - bounds.minY, 1);
    const scale = Math.min(BASE_SCALE, (CANVAS_WIDTH - PADDING * 2) / width);
    const itemWidth = width * scale;
    const itemHeight = height * scale;

    if (x > PADDING && x + itemWidth > CANVAS_WIDTH - PADDING) {
      x = PADDING;
      y += rowHeight + 34;
      rowHeight = 0;
    }

    const item = {
      part,
      bounds,
      scale,
      x,
      y,
      width: itemWidth,
      height: itemHeight,
    };

    x += itemWidth + GAP;
    rowHeight = Math.max(rowHeight, itemHeight);
    return item;
  });
}

export function UnplacedPartsPanel() {
  const { project, parts, bufferDragPartId, unplacedDropVisible, startBufferDrag } = useProjectStore();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragPreview, setDragPreview] = useState<BufferDragPreview | null>(null);
  const unplacedParts = project.unplacedPartIds
    .map((id) => parts.find((part) => part.id === id))
    .filter(Boolean) as DetailPart[];
  const unplacedReason = Array.from(new Set(
    unplacedParts
      .map((part) => project.unplacedReasons?.[part.id])
      .filter(Boolean) as string[],
  )).slice(0, 2).join('; ');
  const layout = layoutUnplacedParts(unplacedParts);
  const canvasHeight = Math.max(
    MIN_CANVAS_HEIGHT,
    ...layout.map((item) => item.y + item.height + 34),
  );

  useEffect(() => {
    if (!dragPreview) return undefined;
    const onMove = (event: MouseEvent) => {
      setDragPreview((current) => current ? { ...current, clientX: event.clientX, clientY: event.clientY } : current);
    };
    const onUp = () => setDragPreview(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragPreview?.item.part.id]);

  if (!unplacedParts.length && !unplacedDropVisible) return null;

  const svgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return undefined;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(ctm.inverse());
  };

  const beginDrag = (event: ReactMouseEvent<SVGGElement>, item: UnplacedLayoutItem) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const point = svgPoint(event.clientX, event.clientY);
    startBufferDrag(item.part.id);
    setDragPreview({
      item,
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: point ? point.x - item.x : item.width / 2,
      offsetY: point ? point.y - item.y : item.height / 2,
      screenScale: svgRef.current ? svgRef.current.getBoundingClientRect().width / CANVAS_WIDTH : 1,
    });
  };

  return (
    <>
      <section className={`panel unplaced-panel${unplacedDropVisible ? ' drop-target' : ''}`}>
        <div className="toolbar compact">
          <h3>Нерозміщені деталі</h3>
          <span className="muted">{unplacedParts.length} шт.</span>
          {unplacedReason && <span className="muted">Причина: {unplacedReason}</span>}
        </div>
        {unplacedParts.length ? (
          <svg
            ref={svgRef}
            className="unplaced-window"
            viewBox={`0 0 ${CANVAS_WIDTH} ${canvasHeight}`}
            style={{ height: `${canvasHeight}px` }}
            aria-label="Нерозміщені деталі"
          >
            <rect x={0} y={0} width={CANVAS_WIDTH} height={canvasHeight} rx={8} />
            {layout.map((item) => {
              const points = item.part.points.map((point) => ({
                x: item.x + (point.x - item.bounds.minX) * item.scale,
                y: item.y + (point.y - item.bounds.minY) * item.scale,
              }));
              const centerX = item.x + item.width / 2;
              const centerY = item.y + item.height / 2;
              const labelSize = Math.max(8, Math.min(13, Math.min(item.width, item.height) / 7));
              const dimsSize = Math.max(7, labelSize - 1);

              return (
                <g
                  key={item.part.id}
                  className={`unplaced-item${bufferDragPartId === item.part.id ? ' dragging' : ''}`}
                  onMouseDown={(event) => beginDrag(event, item)}
                >
                  <polygon className="unplaced-fill" points={pointString(points)} />
                  <polygon className="unplaced-stroke" points={pointString(points)} />
                  <text x={centerX} y={centerY - labelSize * 0.25} textAnchor="middle" fontSize={labelSize}>{previewLabel(item.part.name)}</text>
                  <text x={centerX} y={centerY + dimsSize} textAnchor="middle" fontSize={dimsSize}>{item.part.dimsLabel} мм</text>
                </g>
              );
            })}
          </svg>
        ) : (
          <div className="unplaced-empty drop-empty">Відпустіть деталь тут, щоб повернути її у нерозміщені</div>
        )}
      </section>
      {dragPreview && (
        <BufferDragGhost preview={dragPreview} />
      )}
    </>
  );
}

function BufferDragGhost({ preview }: { preview: BufferDragPreview }) {
  const { item } = preview;
  const points = item.part.points.map((point) => ({
    x: (point.x - item.bounds.minX) * item.scale,
    y: (point.y - item.bounds.minY) * item.scale,
  }));
  const centerX = item.width / 2;
  const centerY = item.height / 2;
  const labelSize = Math.max(8, Math.min(13, Math.min(item.width, item.height) / 7));
  const dimsSize = Math.max(7, labelSize - 1);

  return (
    <svg
      className="buffer-drag-ghost"
      style={{
        left: preview.clientX - preview.offsetX * preview.screenScale,
        top: preview.clientY - preview.offsetY * preview.screenScale,
        width: item.width * preview.screenScale,
        height: item.height * preview.screenScale,
      }}
      viewBox={`0 0 ${item.width} ${item.height}`}
      aria-hidden="true"
    >
      <polygon className="unplaced-fill" points={pointString(points)} />
      <polygon className="unplaced-stroke" points={pointString(points)} />
      <text x={centerX} y={centerY - labelSize * 0.25} textAnchor="middle" fontSize={labelSize}>{previewLabel(item.part.name)}</text>
      <text x={centerX} y={centerY + dimsSize} textAnchor="middle" fontSize={dimsSize}>{item.part.dimsLabel} мм</text>
    </svg>
  );
}

