import type { Detail, DetailPart, Project } from '../../domain/types';
import { localeForLanguage, translateStaticUiText } from '../../i18n';
import { round } from '../math';
import { PageSize, PdfExportOptions } from './pdfTypes';

export const PAGE_MARGIN = 54;
export const PAGE_TITLE_Y = 56;
export const PAGE_FONT = "Arial, 'Noto Sans', 'DejaVu Sans', sans-serif";

export function calculateTotalArea(parts: DetailPart[]): number {
  return round(parts.reduce((sum, part) => sum + part.area, 0), 3);
}

export function pageSize(options: PdfExportOptions): PageSize {
  const base = options.format === 'a3'
    ? { width: 297, height: 420 }
    : { width: 210, height: 297 };
  const widthMm = options.orientation === 'landscape' ? base.height : base.width;
  const heightMm = options.orientation === 'landscape' ? base.width : base.height;
  const widthPx = options.orientation === 'landscape' ? 1600 : 1200;
  const heightPx = Math.round(widthPx * (heightMm / widthMm));
  return { widthMm, heightMm, widthPx, heightPx };
}

export function escapeXml(value: string | number | undefined | null) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function text(
  x: number,
  y: number,
  content: string | number,
  size = 22,
  color = '#1f2d3a',
  weight = 400,
  anchor: 'start' | 'middle' | 'end' = 'start',
) {
  return `<text x="${x}" y="${y}" font-family="${PAGE_FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}">${escapeXml(content)}</text>`;
}

export function textMiddle(
  x: number,
  y: number,
  content: string | number,
  size = 22,
  color = '#1f2d3a',
  weight = 400,
  anchor: 'start' | 'middle' | 'end' = 'start',
) {
  return `<text x="${x}" y="${y}" font-family="${PAGE_FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="middle" fill="${color}">${escapeXml(content)}</text>`;
}

export function pageSvg(size: PageSize, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.widthPx}" height="${size.heightPx}" viewBox="0 0 ${size.widthPx} ${size.heightPx}">
    <rect width="${size.widthPx}" height="${size.heightPx}" fill="#ffffff"/>
    <style>
      text { font-family: ${PAGE_FONT}; }
      .muted { fill: #617789; }
      .table-head { fill: #dfe8ee; stroke: #bdd0dd; stroke-width: 1; }
      .table-row { fill: #f7fbfd; stroke: #d8e3eb; stroke-width: 1; }
      .table-row-alt { fill: #eef4f8; stroke: #d8e3eb; stroke-width: 1; }
    </style>
    ${body}
  </svg>`;
}

export function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function clampText(value: string | undefined, max = 34) {
  const textValue = value?.trim() || '-';
  return textValue.length > max ? `${textValue.slice(0, Math.max(0, max - 1))}…` : textValue;
}

export function uiText(language: Project['uiLanguage'] | undefined, value: string | number | undefined | null) {
  return translateStaticUiText(language, String(value ?? ''));
}

export function projectText(project: Project, value: string | number | undefined | null) {
  return uiText(project.uiLanguage, value);
}

export function unitText(project: Project, value: 'мм' | 'м²') {
  return projectText(project, value);
}

const generatedLabelFragments = [
  'Стінова панель',
  'Стільниця',
  'Потовщення',
  'Підворот',
  'DXF контур',
  'стільниці',
  'сторони',
  'сторона',
  'Мийка',
  'Фасад',
  'Опора',
].sort((a, b) => b.length - a.length);

export function generatedLabel(language: Project['uiLanguage'] | undefined, value: string) {
  return generatedLabelFragments.reduce((result, fragment) => (
    result.split(fragment).join(uiText(language, fragment))
  ), value);
}

export function partParentLabel(project: Project, part: DetailPart) {
  const detail = project.details.find((item) => item.id === part.detailId);
  return detail?.label?.trim() ? part.parentLabel : generatedLabel(project.uiLanguage, part.parentLabel);
}

export function formatDate(value?: string, language?: Project['uiLanguage']) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(localeForLanguage(language));
}

export function uniqueText(values: Array<string | undefined>) {
  const list = Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
  return list.length ? list.join(', ') : '-';
}

export function detailName(detail: Detail, index: number, language?: Project['uiLanguage']) {
  return detail.label?.trim() || `${uiText(language, detail.type)} ${index + 1}`;
}

export function detailDimensions(detail: Detail, language?: Project['uiLanguage']) {
  const g = detail.geometry;
  switch (detail.shape) {
    case 'Кругла':
      return g.diameter ? `Ø${g.diameter}` : g.width ? `Ø${g.width}` : '-';
    case 'Овальна':
      return `${g.ellipseWidth ?? g.width ?? 0}×${g.ellipseHeight ?? g.height ?? 0}`;
    case 'Г-подібна':
      return `${g.outerWidth ?? g.width ?? 0}×${g.outerHeight ?? g.height ?? 0}; ${uiText(language, 'виріз')} ${g.innerHorizontal ?? g.innerCutWidth ?? 0}×${g.innerVertical ?? g.innerCutDepth ?? 0}`;
    case 'П-подібна':
      return `${g.outerWidth ?? g.width ?? 0}×${g.outerHeight ?? g.height ?? 0}; ${uiText(language, 'виріз')} ${g.innerCutWidth ?? 0}×${g.innerCutDepth ?? 0}`;
    default:
      return `${g.width ?? 0}×${g.height ?? 0}`;
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function svgStringToPngData(svg: string): Promise<string> {
  const img = await loadImage(svgToDataUrl(svg));
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export function safeFilePart(value: string | undefined | null, fallback: string) {
  const clean = (value ?? '').trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ');
  return clean || fallback;
}

export function exportStamp(project: Project) {
  const createdAt = project.versions?.[0]?.timestamp ?? project.updatedAt;
  const date = createdAt ? new Date(createdAt) : new Date();
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return validDate.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}

export function projectBaseName(project: Project) {
  return `${safeFilePart(project.orderNumber, 'без номера')}_${safeFilePart(project.customer, 'без контрагента')}_${exportStamp(project)}`;
}

export function downloadBytes(filename: string, bytes: Uint8Array, type: string) {
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy.buffer], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
