import React from 'react';
import type { SelectionBox } from '../canvasUtils';
import { normalizeRect } from '../canvasUtils';

export function SelectionRect({ box, scale }: { box: SelectionBox; scale: number }) {
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