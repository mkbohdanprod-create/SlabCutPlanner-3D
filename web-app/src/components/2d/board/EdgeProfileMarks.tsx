import React from 'react';
import type { DetailPart, Placement, EdgeProfileSelection } from '../../../domain/types';
import { edgeMarkersForPart, edgeProfileShortLabel } from '../../../utils/edgeProfiles';

export function EdgeProfileMarks({ part, placement, profiles, scale }: { part: DetailPart; placement: Placement; profiles?: EdgeProfileSelection; scale: number }) {
  const markers = edgeMarkersForPart(part, profiles, placement.rotation);
  if (!markers.length) return null;
  return (
    <g className="edge-profile-marks" pointerEvents="none">
      {markers.map((marker) => {
        const x1 = (placement.x + marker.start.x) * scale;
        const y1 = (placement.y + marker.start.y) * scale;
        const x2 = (placement.x + marker.end.x) * scale;
        const y2 = (placement.y + marker.end.y) * scale;
        const labelX = (placement.x + marker.labelPoint.x) * scale;
        const labelY = (placement.y + marker.labelPoint.y) * scale;
        return (
          <g key={`${part.id}-${marker.side}-${marker.profile}`}>
            {marker.points && marker.points.length > 0 ? (
              <polyline 
                points={marker.points.map(p => `${(placement.x + p.x) * scale},${(placement.y + p.y) * scale}`).join(' ')} 
                fill="none" 
              />
            ) : (
              <line x1={x1} y1={y1} x2={x2} y2={y2} />
            )}
            <text x={labelX} y={labelY - 3} textAnchor="middle">{edgeProfileShortLabel(marker.profile)}</text>
          </g>
        );
      })}
    </g>
  );
}