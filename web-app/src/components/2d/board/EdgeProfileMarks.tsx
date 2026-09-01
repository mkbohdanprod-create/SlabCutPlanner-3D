import type { DetailPart, Placement, EdgeProfileSelection } from '../../../domain/types';
import { edgeMarkersForPart } from '../../../utils/edgeProfiles';
import { useProjectStore } from '../../../store/useProjectStore';

/** Відступ підпису крайки від її лінії всередину деталі, мм. */
const LABEL_INSET_MM = 26;

export function EdgeProfileMarks({ part, placement, profiles, scale }: { part: DetailPart; placement: Placement; profiles?: EdgeProfileSelection; scale: number }) {
  const project = useProjectStore(s => s.project);
  const getShortLabel = (pId: string) => project.referenceData?.edgeProfiles?.find(p => p.id === pId)?.shortLabel ?? pId;

  // Крок 3.4: якщо деталь лягла дзеркально, позначка має піти за фізичним
  // ребром, а не за буквою — інакше цех фрезерує протилежний торець.
  const markers = edgeMarkersForPart(part, profiles, placement.rotation, 16, Boolean(placement.mirror));
  if (!markers.length) return null;
  return (
    <g className="edge-profile-marks" pointerEvents="none">
      {markers.map((marker) => {
        const x1 = (placement.x + marker.start.x) * scale;
        const y1 = (placement.y + marker.start.y) * scale;
        const x2 = (placement.x + marker.end.x) * scale;
        const y2 = (placement.y + marker.end.y) * scale;
        /* Підпис крайки — ВСЕРЕДИНІ деталі (28.08, задача власника).
           Зсув по внутрішній нормалі сторони; старий «−3 px по вертикалі»
           на верхньому ребрі виносив текст за контур, на нижньому заводив
           усередину — одна крайка підписувалась двома способами. */
        const labelX = (placement.x + marker.labelPoint.x + marker.labelInward.x * LABEL_INSET_MM) * scale;
        const labelY = (placement.y + marker.labelPoint.y + marker.labelInward.y * LABEL_INSET_MM) * scale;
        return (
          <g key={`${part.id}-${marker.side}-${marker.profiles.join('-')}`}>
            {marker.points && marker.points.length > 0 ? (
              <polyline 
                points={marker.points.map(p => `${(placement.x + p.x) * scale},${(placement.y + p.y) * scale}`).join(' ')} 
                fill="none" 
              />
            ) : (
              <line x1={x1} y1={y1} x2={x2} y2={y2} />
            )}
            <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle">{marker.profiles.map(getShortLabel).join(' / ')}</text>
          </g>
        );
      })}
    </g>
  );
}