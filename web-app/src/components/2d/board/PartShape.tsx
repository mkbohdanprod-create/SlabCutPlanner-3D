import type { DetailPart, Placement } from '../../../domain/types';
import {  pointString } from '../../../lib/project';
import { dxfCanvasSize, dxfSvgPath } from '../../../parsers/dxf';
import { pointsForPlacement, svgPath } from '../canvasUtils';

export function PartShape({ part, placement, scale, viewMode, showAllowance, sawOvercut }: { part: DetailPart; placement: Placement; scale: number; viewMode: 'technical' | 'photo' | 'texture'; showAllowance: boolean; sawOvercut?: number }) {
  const conflict = placement.conflict || placement.outOfBounds;
  const stroke = conflict ? '#d62828' : '#2d4f6c';
  const strokeWidth = conflict ? 3 : 1.5;
  const fill = viewMode === 'photo' ? 'rgba(255,255,255,0.14)' : 'rgba(114,147,171,0.35)';
  const actual = pointsForPlacement(part, placement);
  const actualHoles = (part.holes ?? []).map((hole) => pointsForPlacement(part, placement, hole));
  const nominal = showAllowance && part.nominalPoints?.length ? pointsForPlacement(part, placement, part.nominalPoints) : undefined;
  const nominalHoles = nominal ? (part.nominalHoles ?? []).map((hole) => pointsForPlacement(part, placement, hole)) : [];

  const renderSawLines = (pts: Point[]) => {
    if (!sawOvercut || sawOvercut <= 0 || viewMode !== 'technical') return null;
    const lines = [];
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      if (p1.bulge || p2.bulge) continue;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.1) continue;
      const dirX = dx / len;
      const dirY = dy / len;
      const startX = p1.x - dirX * sawOvercut;
      const startY = p1.y - dirY * sawOvercut;
      const endX = p2.x + dirX * sawOvercut;
      const endY = p2.y + dirY * sawOvercut;
      lines.push(
        <line 
          key={`saw-${i}`}
          x1={startX * scale} y1={startY * scale} 
          x2={endX * scale} y2={endY * scale}
          stroke="rgba(214, 40, 40, 0.5)" 
          strokeWidth={1.5} 
          strokeDasharray="4 4" 
        />
      );
    }
    return lines;
  };

  if (nominal) {
    return (
      <>
        {renderSawLines(nominal)}
        <path d={svgPath(nominal, scale, nominalHoles)} fill={fill} fillRule="evenodd" stroke={stroke} strokeWidth={strokeWidth} />
        <path className="allowance-outline" d={svgPath(actual, scale, actualHoles)} fill="none" fillRule="evenodd" stroke={stroke} />
      </>
    );
  }

  if (actualHoles.length) {
    return <path d={svgPath(actual, scale, actualHoles)} fill={fill} fillRule="evenodd" stroke={stroke} strokeWidth={strokeWidth} />;
  }

  return (
    <>
      {renderSawLines(actual)}
      <polygon points={pointString(actual, scale)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
    </>
  );
}