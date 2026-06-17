import React from 'react';
import type { SlabInstance } from '../../../domain/types';

export function SlabLayer({ slab, scale, viewMode }: { slab: SlabInstance; scale: number; viewMode: 'technical' | 'photo' | 'texture' }) {
  return <g><rect width={slab.width * scale} height={slab.height * scale} fill="#f3f7fa" stroke="#7f98ad" strokeWidth={2} rx={4} />{viewMode !== 'technical' && slab.photo && <image href={slab.photo} x={slab.textureTransform.offsetX * scale} y={slab.textureTransform.offsetY * scale} width={slab.width * scale * slab.textureTransform.scale} height={slab.height * scale * slab.textureTransform.scale} opacity={slab.textureTransform.opacity} preserveAspectRatio="none" transform={slab.textureTransform.rotation ? `rotate(${slab.textureTransform.rotation}, ${slab.width * scale / 2}, ${slab.height * scale / 2})` : undefined} />}
  <rect x={slab.minMargin * scale} y={slab.minMargin * scale} width={(slab.width - slab.minMargin * 2) * scale} height={(slab.height - slab.minMargin * 2) * scale} fill="none" stroke="#94aab9" strokeDasharray="8 6" /></g>;
}