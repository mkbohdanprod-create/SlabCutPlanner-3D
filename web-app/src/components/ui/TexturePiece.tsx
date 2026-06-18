import type { Detail } from '../../domain/types';
import type { TextureItem } from '../../engines/textureLayout';
import { pointString, rotatedLocalPoints, rotatedPoints, rotatedSize } from '../../lib/project';
import { textureCoordinateMatrix } from '../../lib/textureMatrix';
import { edgeMarkersForPart, edgeProfileShortLabel } from '../../utils/edgeProfiles';
import { getSourceX, getSourceY, getSourceRotation } from '../../engines/textureLayout';

export function TexturePiece({
  item,
  detail,
  scale,
  clipPrefix,
}: {
  item: TextureItem;
  detail?: Detail;
  scale: number;
  clipPrefix: string;
}) {
  const { layout, part, slab, displayX, displayY } = item;
  const local = rotatedPoints(part, layout.rotation);
  const localPoints = local.map((point) => ({ x: point.x * scale, y: point.y * scale }));
  const localHoles = (part.holes ?? []).map((hole) => rotatedLocalPoints(hole, layout.rotation, part.width, part.height, part.points)
    .map((point) => ({ x: point.x * scale, y: point.y * scale })));
  const sourceX = getSourceX(layout);
  const sourceY = getSourceY(layout);
  const sourceRotation = getSourceRotation(layout);
  const clipId = `${clipPrefix}_clip_${layout.id}`;
  const size = rotatedSize(part, layout.rotation);
  const textureMatrix = textureCoordinateMatrix(part, sourceRotation, layout.rotation, scale);
  const slabTextureTransform = slab?.textureTransform.rotation
    ? `rotate(${slab.textureTransform.rotation}, ${(slab.width / 2 - sourceX) * scale}, ${(slab.height / 2 - sourceY) * scale})`
    : undefined;
  const showLabel = part.isMain && (!part.textureGroupKind || part.textureGroupAnchor);
  const edgeMarkers = edgeMarkersForPart(part, detail?.edgeProfiles, layout.rotation);

  return (
    <g transform={`translate(${displayX * scale}, ${displayY * scale})`}>
      <defs>
        <clipPath id={clipId}><polygon points={pointString(localPoints)} /></clipPath>
      </defs>
      {slab?.photo ? (
        <g clipPath={`url(#${clipId})`}>
          <g transform={textureMatrix}>
            <image
              href={slab.photo}
              x={(slab.textureTransform.offsetX - sourceX) * scale}
              y={(slab.textureTransform.offsetY - sourceY) * scale}
              width={slab.width * scale * slab.textureTransform.scale}
              height={slab.height * scale * slab.textureTransform.scale}
              preserveAspectRatio="none"
              opacity={0.95}
              transform={slabTextureTransform}
            />
          </g>
        </g>
      ) : (
        <polygon points={pointString(localPoints)} fill="rgba(114,147,171,0.25)" />
      )}
      <polygon points={pointString(localPoints)} fill="rgba(255,255,255,0.08)" stroke="#35556b" strokeWidth={1.4} />
      {localHoles.map((hole, index) => (
        <polygon key={index} points={pointString(hole)} fill="#f8fbfd" stroke="#35556b" strokeWidth={1.1} />
      ))}
      {edgeMarkers.length > 0 && (
        <g className="edge-profile-marks" pointerEvents="none">
          {edgeMarkers.map((marker) => (
            <g key={`${marker.side}-${marker.profile}`}>
              <line x1={marker.start.x * scale} y1={marker.start.y * scale} x2={marker.end.x * scale} y2={marker.end.y * scale} />
              <text x={marker.labelPoint.x * scale} y={marker.labelPoint.y * scale - 3} textAnchor="middle">{edgeProfileShortLabel(marker.profile)}</text>
            </g>
          ))}
        </g>
      )}
      {showLabel && (
        <>
          <text x={(size.width * scale) / 2} y={(size.height * scale) / 2 - 4} textAnchor="middle" fontSize={Math.max(10, 12 * Math.min(scale / 0.25, 1.2))} fill="#1f3342">{part.parentLabel}</text>
          <text x={(size.width * scale) / 2} y={(size.height * scale) / 2 + 12} textAnchor="middle" fontSize={Math.max(9, 11 * Math.min(scale / 0.25, 1.1))} fill="#3a596c">{part.dimsLabel}</text>
        </>
      )}
    </g>
  );
}
