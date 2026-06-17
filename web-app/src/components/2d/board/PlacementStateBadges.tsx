import React from 'react';
import type { Placement } from '../../../domain/types';

export function PlacementStateBadges({ placement, x, y }: { placement: Placement; x: number; y: number }) {
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