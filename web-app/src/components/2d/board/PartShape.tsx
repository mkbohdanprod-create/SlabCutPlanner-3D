import React from 'react';
import type { DetailPart, Placement } from '../../../domain/types';
import { placementPolygon, pointString } from '../../../lib/project';
import { dxfCanvasSize, dxfSvgPath } from '../../../parsers/dxf';

export function PartShape({ part, placement, scale, viewMode, showAllowance }: { part: DetailPart; placement: Placement; scale: number; viewMode: 'technical' | 'photo' | 'texture'; showAllowance: boolean }) {
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