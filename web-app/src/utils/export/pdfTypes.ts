import type { DetailPart, SlabInstance, TextureLayout } from '../../domain/types';

export type PdfPageFormat = 'a4' | 'a3';
export type PdfOrientation = 'portrait' | 'landscape';
export type PdfSlabLayout = 'one' | 'two' | 'multi' | 'auto';
export type PdfScaleMode = 'auto' | '100' | '75' | '50';
export type PdfSlabMode = 'technical' | 'photo' | 'texture';

export interface PdfExportOptions {
  format: PdfPageFormat;
  orientation: PdfOrientation;
  scaleMode: PdfScaleMode;
  slabLayout: PdfSlabLayout;
  includeTitle: boolean;
  includeDetails: boolean;
  includeUnplaced: boolean;
  includeTechnical: boolean;
  includePhoto: boolean;
  includeTexture: boolean;
  includeTextureZone: boolean;
  include3d: boolean;
  showDimensions: boolean;
  includeDefects: boolean;
  includeComments: boolean;
  author: string;
}

export const defaultPdfExportOptions: PdfExportOptions = {
  format: 'a4',
  orientation: 'landscape',
  scaleMode: 'auto',
  slabLayout: 'one',
  includeTitle: true,
  includeDetails: true,
  includeUnplaced: true,
  includeTechnical: true,
  includePhoto: true,
  includeTexture: true,
  includeTextureZone: true,
  include3d: false,
  showDimensions: true,
  includeDefects: true,
  includeComments: true,
  author: '',
};

export type PageSize = {
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
};

export type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type Slot = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TextureItem = {
  layout: TextureLayout;
  part: DetailPart;
  slab?: SlabInstance;
  displayX: number;
  displayY: number;
};
