import React from 'react';
import type { DetailPart, Placement } from '../../../domain/types';
import type { CanvasDrag } from '../canvasUtils';
import { placementPolygon, pointString, rotatedPoints, polygonBounds } from '../../../lib/project';
import { pointsForPlacement } from '../canvasUtils';

export function GroupDragPreview({ drag, parts, scale }: { drag: Extract<CanvasDrag, { type: 'placement' }>; parts: DetailPart[]; scale: number }) {
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

export function PlacementDragGhost({ drag, part, scale, screenScale }: { drag: Extract<CanvasDrag, { type: 'placement' }>; part?: DetailPart; scale: number; screenScale: number }) {
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