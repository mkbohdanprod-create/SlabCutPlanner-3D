import { jsPDF } from 'jspdf';
import type { DetailPart, Project } from '../domain/types';
import type { PdfExportOptions } from './export/pdfTypes';
import { defaultPdfExportOptions } from './export/pdfTypes';
import {
  downloadBytes,
  projectBaseName,
  safeFilePart,
  svgStringToPngData,
  pageSize
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

export { defaultPdfExportOptions } from './export/pdfTypes';
export type { PdfExportOptions, PdfOrientation, PdfPageFormat, PdfScaleMode, PdfSlabLayout, PdfSlabMode } from './export/pdfTypes';
export { calculateTotalArea } from './export/pdfUtils';

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
