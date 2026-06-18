import { jsPDF } from 'jspdf';
import type {
  Detail,
  DetailPart,
  Placement,
  Point,
  Project,
  Rotation,
  SlabInstance,
  TextureFrame,
  TextureLayout,
} from '../domain/types';
import { SIDE_SEGMENT_INDEXES } from '../domain/constants';
import { getStatusLabel, placementPolygon, pointString, rotatePoint, rotatedLocalPoints, rotatedPoints, rotatedSize } from '../lib/project';
import { edgeMarkersForPart, edgeProfileShortLabel } from './edgeProfiles';
import {
  attachedCurvedPosition,
  attachedDisplayPosition,
  curvedEdgeOffset,
  curvedSideDirection,
  findEdgeThickness,
  findMainLayout,
  findPart,
  frameIntersectsItem,
  getSourceRotation,
  getSourceX,
  getSourceY,
  getTextureItems,
  localHoles,
  outwardNormal,
  pathFromPolygons,
  placementHoles,
  pointInPolygon,
  pointOnSegment,
  pointsBounds,
  resolveTextureOverlaps,
  rotateVector,
  sideSegment,
  textureBox,
  textureBoxesOverlap,
} from './export/pdfGeometry';
import type {
  Bounds,
  PageSize,
  PdfExportOptions,
  PdfOrientation,
  PdfPageFormat,
  PdfScaleMode,
  PdfSlabLayout,
  PdfSlabMode,
  Slot,
  TextureItem,
} from './export/pdfTypes';
import { defaultPdfExportOptions } from './export/pdfTypes';
import {
  PAGE_FONT,
  PAGE_MARGIN,
  PAGE_TITLE_Y,
  calculateTotalArea,
  clampText,
  detailDimensions,
  detailName,
  downloadBytes,
  escapeXml,
  exportStamp,
  formatDate,
  generatedLabel,
  pageSvg,
  pageSize,
  partParentLabel,
  projectBaseName,
  projectText,
  safeFilePart,
  svgStringToPngData,
  svgToDataUrl,
  text,
  textMiddle,
  uiText,
  uniqueText,
  unitText,
} from './export/pdfUtils';
import { dataUrlBytes, zipStore } from './export/zipArchive';





import {
  renderTitlePage,
  renderOverviewPage,
  renderDetailsPages,
  renderUnplacedPages,
  renderSlabPages,
  renderTextureZonePages,
  render3dPhotosPages,
  renderSlabSvg
} from './export/pdfPages';

export async function exportProjectPng(project: Project, parts: DetailPart[]) {
  if (!project.slabs.length) return;
  const entries = await Promise.all(project.slabs.map(async (slab, index) => {
    const mode = slab.photo ? 'photo' : 'technical';
    const svg = renderSlabSvg(project, parts, slab, mode);
    const png = await svgStringToPngData(svg);
    const name = `${String(index + 1).padStart(2, '0')}_${safeFilePart(slab.serialNumber, `slab-${index + 1}`)}.png`;
    return { name, bytes: dataUrlBytes(png) };
  }));
  downloadBytes(`${projectBaseName(project)}_PNG.zip`, zipStore(entries), 'application/zip');
}

export async function exportProjectPdf(project: Project, parts: DetailPart[], options: PdfExportOptions = defaultPdfExportOptions, snapshots3D?: string[]) {
  const size = pageSize(options);
  const pages: string[] = [];

  if (options.includeTitle || options.includeDetails || options.includeUnplaced) {
    const overview = renderOverviewPage(project, parts, options, size);
    pages.push(overview.svg);
    if (options.includeDetails && !overview.detailsIncluded) pages.push(...renderDetailsPages(project, parts, options, size));
    if (options.includeUnplaced && !overview.unplacedIncluded) pages.push(...renderUnplacedPages(project, parts, size));
  }
  if (options.includeTechnical) pages.push(...renderSlabPages(project, parts, options, size, 'technical'));
  if (options.includePhoto) pages.push(...renderSlabPages(project, parts, options, size, 'photo'));
  if (options.includeTexture) pages.push(...renderSlabPages(project, parts, options, size, 'texture'));
  if (options.includeTextureZone && project.textureSelectionEnabled) pages.push(...renderTextureZonePages(project, parts, size));
  if (options.include3d) pages.push(...render3dPhotosPages(project, size, snapshots3D ?? []));
  if (!pages.length) pages.push(renderTitlePage(project, parts, options, size));

  const doc = new jsPDF({ orientation: options.orientation, unit: 'mm', format: options.format });
  for (let index = 0; index < pages.length; index += 1) {
    if (index > 0) doc.addPage(options.format, options.orientation);
    const png = await svgStringToPngData(pages[index]);
    doc.addImage(png, 'PNG', 0, 0, size.widthMm, size.heightMm);
  }
  doc.save(`${projectBaseName(project)}.pdf`);
}

