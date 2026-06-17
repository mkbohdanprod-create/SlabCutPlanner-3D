import React, { useState, useEffect, useRef, MouseEvent as ReactMouseEvent } from 'react';
import type { SlabInstance, Placement, DetailPart, ManualDimension, UiLanguage } from '../../../domain/types';
import type { CanvasDrag } from '../canvasUtils';
import { placementPolygon, pointString, polygonBounds } from '../../../lib/project';
import { clampNumber, polygonCentroid, defectPoints, pointsForPlacement } from '../canvasUtils';
import { t } from '../../../i18n';
import { SlabLayer } from './SlabLayer';
import { PartShape } from './PartShape';

export function ManualDimensions({
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

export function SlabDimensionHints({ slab, placements, parts, scale }: { slab: SlabInstance; placements: Placement[]; parts: DetailPart[]; scale: number }) {
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

export function SlabMagnifierWindow({
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

